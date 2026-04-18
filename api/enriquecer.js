const https = require("https");

function callAnthropic(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: `Você é um agente que busca dados de empresas brasileiras no Google e Google Meu Negócio.
Retorne APENAS JSON puro sem texto antes ou depois, sem markdown.
JSON esperado:
{
  "gmb_nome": "nome no Google Meu Negócio ou null",
  "gmb_telefone": "telefone encontrado ou null",
  "gmb_email": "email encontrado ou null",
  "gmb_site": "site encontrado ou null",
  "gmb_endereco": "endereço completo ou null",
  "gmb_cidade": "cidade/estado ou null",
  "gmb_rating": "nota ex: 4.5 ou null",
  "gmb_reviews": "número de avaliações ou null",
  "gmb_horario": "horário de funcionamento resumido ou null",
  "gmb_categoria": "categoria do negócio ou null"
}`,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: prompt }],
    });

    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      timeout: 60000,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
        "Content-Length": Buffer.byteLength(body, "utf8"),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error("Resposta inválida")); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.write(body);
    req.end();
  });
}

function extrairJSON(raw) {
  if (!raw) return null;
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s === -1 || e === -1) return null;
  try { return JSON.parse(raw.substring(s, e + 1)); } catch { return null; }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).end(); return; }

  // Parse body
  let body = "";
  await new Promise(r => { req.on("data", c => body += c); req.on("end", r); });
  let payload = {};
  try { payload = JSON.parse(body); } catch(e) { res.status(400).json({ error: "Body inválido" }); return; }

  const { nome, cnpj, cidade, atividade } = payload;
  if (!nome && !cnpj) { res.status(400).json({ error: "nome ou cnpj obrigatório" }); return; }

  const prompt = `Busque no Google e Google Meu Negócio dados desta empresa brasileira:
Nome: ${nome || ''}
CNPJ: ${cnpj || ''}
Cidade: ${cidade || ''}
Atividade: ${atividade || ''}

Pesquise especificamente:
1. "${nome} ${cidade} telefone site email" no Google
2. "${nome} ${cidade}" no Google Meu Negócio
3. CNPJ ${cnpj} para confirmar dados

Retorne os dados encontrados em JSON puro.`;

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(200).json({ error: "ANTHROPIC_API_KEY não configurada" });
    return;
  }

  try {
    const apiResp = await callAnthropic(prompt);
    const textBlock = apiResp.content?.find(b => b.type === "text");
    const result = extrairJSON(textBlock?.text || "") || {};
    res.status(200).json(result);
  } catch(e) {
    res.status(200).json({ error: e.message });
  }
};
