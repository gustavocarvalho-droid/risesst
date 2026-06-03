const https = require("https");

// ── Chamada Anthropic com web_search ──────────────────────────────────────────
function callAnthropic(body) {
  return new Promise((resolve, reject) => {
    const raw = JSON.stringify(body);
    const opts = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      timeout: 55000, // Vercel Hobby = 60s max — mantemos margem
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
        "Content-Length": Buffer.byteLength(raw, "utf8"),
      },
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("Parse error: " + data.slice(0, 120))); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout na API")); });
    req.write(raw);
    req.end();
  });
}

// ── Extrair JSON de texto livre ───────────────────────────────────────────────
function extrairJSON(raw) {
  if (!raw) return null;
  // Tentar encontrar array de empresas diretamente
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
  if (s === -1 || e === -1) return null;
  try { return JSON.parse(raw.substring(s, e + 1)); } catch {
    // Tentar extrair só o array
    const as = raw.indexOf("["), ae = raw.lastIndexOf("]");
    if (as !== -1 && ae !== -1) {
      try { return { empresas: JSON.parse(raw.substring(as, ae + 1)) }; } catch {}
    }
    return null;
  }
}

// ── Filtros de exclusão ───────────────────────────────────────────────────────
const EXCLUIR = [
  /prefeitura/i, /secretaria/i, /câmara/i, /camara/i, /autarquia/i,
  /fundação pública/i, /governo/i, /\bminicipal\b/i, /\bestatual\b/i,
  /ministério/i, /ministerio/i, /\bpolicia\b/i, /\bpolícia\b/i,
  /hospital.*público/i, /\bubs\b/i, /\bsus\b/i,
  /futebol clube/i, /esporte clube/i,
  /\bbradesco\b/i, /\bitaú\b/i, /\bitau\b/i, /caixa economica/i,
  /\bigreja\b/i, /\btemplo\b/i, /paróquia/i, /paroquia/i,
  /\bsindicato\b/i,
];

function filtrar(empresas, existingSet) {
  return empresas.filter((e) => {
    const cnpj = (e.cnpj || "").replace(/\D/g, "");
    if (!cnpj || cnpj.length < 14) return false;
    if (existingSet.has(cnpj)) return false;
    const txt = `${e.nome || ""} ${e.nome_fantasia || ""} ${e.atividade || ""}`;
    if (EXCLUIR.some((rx) => rx.test(txt))) return false;
    existingSet.add(cnpj);
    return true;
  });
}

// ── Handler principal ─────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method === "GET") {
    res.status(200).json({ status: "ok", key: process.env.ANTHROPIC_API_KEY ? "ok" : "FALTANDO" });
    return;
  }
  if (req.method !== "POST") { res.status(405).end(); return; }

  // Ler body
  let body = "";
  await new Promise((r) => { req.on("data", (c) => (body += c)); req.on("end", r); });
  let payload = {};
  try { payload = JSON.parse(body); } catch { res.status(400).json({ error: "Body inválido" }); return; }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(200).json({ query: payload.query, total: 0, empresas: [], obs: "API key não configurada" });
    return;
  }

  const { query, qtd = 5, filtro = "todos" } = payload;
  if (!query) { res.status(400).json({ error: "query obrigatória" }); return; }

  const existingCnpjs = Array.isArray(payload.existingCnpjs) ? payload.existingCnpjs : [];
  const existingSet = new Set(existingCnpjs.map((c) => c.replace(/\D/g, "")));

  const filtroStr = { ativa: "Ativas", mei: "MEI", epp: "ME/EPP" }[filtro] || "qualquer porte";
  const exclusaoStr = existingCnpjs.length
    ? ` Não repita: ${existingCnpjs.slice(0, 10).join(", ")}.`
    : "";

  // ── Prompt ENXUTO — apenas CNPJ + contato básico ─────────────────────────
  // Focado em velocidade: 1-2 buscas por empresa, sem profundidade excessiva
  const systemPrompt = `Você é um buscador de empresas brasileiras. Retorne APENAS JSON puro, sem markdown.

Busque ${qtd} empresas (${filtroStr}) para a query do usuário.
${exclusaoStr}

Para cada empresa:
1. Confirme o CNPJ em uma fonte (casadosdados.com.br ou cnpj.biz)
2. Busque telefone/WhatsApp rapidamente (1 pesquisa: "[empresa] [cidade] telefone whatsapp")
3. Pegue o email se aparecer na mesma busca

NÃO faça buscas extras por empresa — velocidade é prioridade.
Exclua: órgãos públicos, bancos, igrejas, sindicatos, times de futebol.

JSON de resposta:
{
  "empresas": [
    {
      "nome": "Razão Social LTDA",
      "nome_fantasia": "Nome Fantasia",
      "cnpj": "XX.XXX.XXX/XXXX-XX",
      "situacao": "Ativa",
      "porte": "MEI|ME|EPP|Grande",
      "municipio": "Cidade - UF",
      "atividade": "Descrição da atividade principal",
      "telefone": "(11) 99999-9999 ou null",
      "whatsapp": "5511999999999 ou null",
      "email": "email@empresa.com ou null",
      "site": "https://site.com ou null"
    }
  ]
}`;

  try {
    const apiResp = await callAnthropic({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: systemPrompt,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: `Busque ${qtd} empresas para: ${query}` }],
    });

    // Checar erro de rate limit
    if (apiResp?.error?.type === "rate_limit_error") {
      res.status(429).json({ query, total: 0, empresas: [], obs: "Rate limit — tente em 60 segundos" });
      return;
    }

    // Extrair texto da resposta
    const textBlock = (apiResp.content || []).find((b) => b.type === "text");
    const raw = textBlock?.text || "";
    const parsed = extrairJSON(raw);

    if (!parsed || !Array.isArray(parsed.empresas)) {
      res.status(200).json({ query, total: 0, empresas: [], obs: "Sem resultados para esta busca" });
      return;
    }

    const empresas = filtrar(parsed.empresas, existingSet);
    res.status(200).json({ query, total: empresas.length, empresas });

  } catch (err) {
    const msg = err.message || "Erro desconhecido";
    // Timeout específico — orientar o usuário
    if (msg.includes("Timeout")) {
      res.status(200).json({ query, total: 0, empresas: [], obs: "Busca demorou demais — tente uma query mais específica (ex: adicione a cidade)" });
    } else {
      res.status(200).json({ query, total: 0, empresas: [], obs: msg });
    }
  }
};
