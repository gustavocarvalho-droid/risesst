const https = require("https");

function callAnthropic(query, qtd, filtro, existingCnpjs, tentativa = 1) {
  return new Promise((resolve, reject) => {
    const exclusao = existingCnpjs.length > 0
      ? ` Ignore estes CNPJs: ${existingCnpjs.slice(0, 15).join(", ")}.`
      : "";

    const filtroStr = filtro === "ativa" ? "somente Ativa"
      : filtro === "mei" ? "somente MEI"
      : filtro === "epp" ? "somente ME/EPP"
      : "qualquer situação";

    const systemPrompt = `Agente de busca de empresas brasileiras com CNPJ e dados de contato. Retorne APENAS JSON puro.

OBJETIVO: Encontrar ${qtd} empresas com CNPJ verificado E dados de contato reais.
Filtro: ${filtroStr}.${exclusao}

PARA CADA EMPRESA, faça OBRIGATORIAMENTE estas buscas em sequência:
1. Busque o CNPJ em: casadosdados.com.br, cnpj.biz, receitaws.economicos.com.br
2. Busque telefone e WhatsApp: pesquise "[nome empresa] [cidade] telefone whatsapp" no Google
3. Busque email: pesquise "[nome empresa] [cidade] email contato" ou acesse o site da empresa
4. Se não achar email/telefone diretamente, busque empresas do MESMO SETOR/CIDADE que tenham esses dados

META DE QUALIDADE:
- Telefone: tente encontrar para 90% das empresas
- Email: tente encontrar para 70% das empresas
- Se a empresa específica não tiver, busque o contato do setor/franquia/rede

EXCLUIR OBRIGATORIAMENTE:
- Órgãos públicos, prefeituras, autarquias, câmaras, secretarias
- Hospitais públicos, UBSs, postos de saúde SUS
- Bancos (Bradesco, Itaú, CEF, BB, Santander, Nubank etc.)
- Igrejas, templos, partidos políticos, sindicatos
- Times e clubes de futebol

JSON de resposta (sem markdown, APENAS o JSON):
{
  "query": "string",
  "total": N,
  "empresas": [{
    "nome": "razão social",
    "nome_fantasia": "nome fantasia ou null",
    "cnpj": "XX.XXX.XXX/XXXX-XX",
    "situacao": "Ativa|null",
    "porte": "MEI|ME|EPP|Grande|null",
    "municipio": "cidade - UF",
    "atividade": "descrição da atividade",
    "telefone": "número com DDD ex: (11) 99999-9999 ou null",
    "whatsapp": "número somente dígitos ex: 5511999999999 ou null",
    "email": "email@empresa.com.br ou null",
    "site": "https://site.com.br ou null",
    "cnpj_fonte": "URL de onde verificou o CNPJ",
    "contato_fonte": "URL de onde achou telefone/email",
    "obs": "observação relevante ou null"
  }]
}`;

    const requestBody = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: systemPrompt,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: `Busque ${qtd} empresas com CNPJ verificado E telefone/email para: ${query}` }],
    });

    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      timeout: 120000,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
        "Content-Length": Buffer.byteLength(requestBody, "utf8"),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed?.error?.type === "rate_limit_error") {
            const espera = tentativa <= 3 ? 65000 : 0;
            if (espera) {
              setTimeout(() => callAnthropic(query, qtd, filtro, existingCnpjs, tentativa + 1).then(resolve).catch(reject), espera);
            } else {
              reject(new Error("Rate limit: tente novamente em 1 minuto"));
            }
            return;
          }
          resolve(parsed);
        } catch (e) {
          reject(new Error("JSON inválido: " + data.substring(0, 150)));
        }
      });
    });
    req.on("error", (e) => reject(e));
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.write(requestBody);
    req.end();
  });
}

function extrairJSON(raw) {
  if (!raw) return null;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(raw.substring(start, end + 1)); } catch { return null; }
}

const EXCLUIR = [
  /prefeitura/i,/secretaria/i,/câmara/i,/camara/i,/autarquia/i,
  /fundação pública/i,/governo/i,/municipal/i,/estadual/i,
  /ministério/i,/ministerio/i,/policia/i,/polícia/i,
  /hospital.*público/i,/\bubs\b/i,/posto de saude/i,/\bsus\b/i,
  /futebol clube/i,/esporte clube/i,/clube atletico/i,
  /\bbradesco\b/i,/\bitaú\b/i,/\bitau\b/i,/caixa economica/i,
  /\bbndes\b/i,/cooperativa de credito/i,
  /\bigreja\b/i,/\btemplo\b/i,/paróquia/i,/paroquia/i,
  /partido politico/i,/\bsindicato\b/i,
];

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method === "GET") {
    const key = process.env.ANTHROPIC_API_KEY;
    res.status(200).json({ status: "ok", key: key ? "configurada" : "FALTANDO" });
    return;
  }
  if (req.method !== "POST") { res.status(405).end(); return; }

  let body = "";
  await new Promise((resolve) => { req.on("data", chunk => body += chunk); req.on("end", resolve); });

  let payload = {};
  try { payload = JSON.parse(body); } catch(e) { res.status(400).json({ error: "Body inválido" }); return; }

  const { query, qtd, filtro } = payload;
  const existingCnpjs = Array.isArray(payload.existingCnpjs) ? payload.existingCnpjs : [];

  if (!query) { res.status(400).json({ error: "Campo query obrigatório" }); return; }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(200).json({ query, total: 0, empresas: [], obs: "ANTHROPIC_API_KEY não configurada" });
    return;
  }

  try {
    const apiResponse = await callAnthropic(query, qtd || 5, filtro || "todos", existingCnpjs);

    if (apiResponse.type === "error" || apiResponse.error) {
      res.status(200).json({ query, total: 0, empresas: [], obs: apiResponse.error?.message || "Erro" });
      return;
    }

    const textBlock = apiResponse.content?.find(b => b.type === "text");
    const raw = textBlock?.text || "";
    const result = extrairJSON(raw) || { query, total: 0, empresas: [] };

    if (Array.isArray(result.empresas)) {
      const existingSet = new Set(existingCnpjs.map(c => c.replace(/\D/g, "")));
      result.empresas = result.empresas.filter(e => {
        if (!e.cnpj || e.cnpj === "null") return false;
        const digits = e.cnpj.replace(/\D/g, "");
        if (digits.length < 14) return false;
        if (existingSet.has(digits)) return false;
        const nome = (e.nome || "") + " " + (e.nome_fantasia || "") + " " + (e.atividade || "");
        if (EXCLUIR.some(rx => rx.test(nome))) return false;
        existingSet.add(digits);
        return true;
      });
      result.total = result.empresas.length;
    }

    res.status(200).json(result);
  } catch (e) {
    res.status(200).json({ query, total: 0, empresas: [], obs: e.message });
  }
};
