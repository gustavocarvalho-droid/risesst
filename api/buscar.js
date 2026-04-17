const https = require("https");

// ─── Read raw POST body ───
function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", chunk => data += chunk);
    req.on("end", () => {
      try { resolve(JSON.parse(data)); }
      catch(e) { resolve({}); }
    });
    req.on("error", () => resolve({}));
  });
}

// ─── Call Anthropic API ───
function callAnthropic(query, qtd, filtro, existingCnpjs, tentativa = 1) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      reject(new Error("ANTHROPIC_API_KEY não configurada. Vá em Vercel → Settings → Environment Variables."));
      return;
    }

    const exclusao = existingCnpjs.length > 0
      ? ` Ignore estes CNPJs: ${existingCnpjs.slice(0, 10).join(", ")}.`
      : "";

    const filtroStr = filtro === "ativa" ? "somente Ativa"
      : filtro === "mei" ? "somente MEI"
      : filtro === "epp" ? "somente ME/EPP"
      : "qualquer situação";

    const systemPrompt = `Agente de busca de CNPJs de empresas brasileiras. Retorne APENAS JSON puro sem texto antes ou depois.

Busque ${qtd} empresas com CNPJ confirmado via web search (casadosdados.com.br, cnpj.biz, jusbrasil.com.br).
Filtro: ${filtroStr}.${exclusao}
Inclua APENAS empresas cujo CNPJ foi verificado. Se não encontrar o CNPJ, descarte.

EXCLUIR: órgãos públicos, prefeituras, hospitais públicos, bancos, igrejas, partidos, sindicatos.
Busque APENAS empresas privadas do setor produtivo/comercial/serviços.

JSON de resposta (sem markdown, sem texto extra):
{"query":"string","total":N,"empresas":[{"nome":"string","nome_fantasia":"string|null","cnpj":"XX.XXX.XXX/XXXX-XX","situacao":"Ativa|null","porte":"MEI|ME|EPP|Grande|null","municipio":"string|null","atividade":"string|null","email":"string|null","site":"string|null","telefone":"string|null","fonte_cnpj":"string","obs":"string|null"}]}`;

    const body = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
      system: systemPrompt,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: `Busque ${qtd} empresas com CNPJ para: ${query}` }],
    });

    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      timeout: 115000,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
        "Content-Length": Buffer.byteLength(body, "utf8"),
      },
    };

    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.error?.type === "rate_limit_error" && tentativa <= 3) {
            setTimeout(() =>
              callAnthropic(query, qtd, filtro, existingCnpjs, tentativa + 1)
                .then(resolve).catch(reject),
              65000
            );
            return;
          }
          resolve(parsed);
        } catch(e) {
          reject(new Error("Resposta inválida da API: " + raw.slice(0, 200)));
        }
      });
    });

    req.on("error", e => reject(e));
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout — tente novamente")); });
    req.write(body);
    req.end();
  });
}

// ─── Extract JSON from response ───
function extrairJSON(raw) {
  if (!raw) return null;
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s === -1 || e === -1) return null;
  try { return JSON.parse(raw.substring(s, e + 1)); } catch { return null; }
}

const EXCLUIR = [
  /prefeitura/i, /secretaria/i, /câmara/i, /camara/i, /autarquia/i,
  /fundação/i, /fundacao/i, /municipal/i, /estadual/i, /federal/i,
  /ministério/i, /ministerio/i, /hospital/i, /ubs\b/i, /sus\b/i,
  /futebol clube/i, /esporte clube/i,
  /\bbanco\b/i, /\bcaixa economica\b/i, /bradesco/i, /itaú/i, /itau/i,
  /santander/i, /\bigreja\b/i, /\btemplo\b/i, /partido\b/i, /sindicato/i,
];

// ─── Vercel Serverless Handler ───
module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  // Parse body — handle both auto-parsed (Express) and raw
  let payload = req.body;
  if (!payload || typeof payload !== "object") {
    payload = await readBody(req);
  }

  const { query, qtd = 5, filtro = "todos", existingCnpjs = [] } = payload;

  if (!query || !query.trim()) {
    res.status(400).json({ error: "Campo 'query' obrigatório" });
    return;
  }

  console.log(`[RISE SST] Buscando: "${query}" | qtd=${qtd} | filtro=${filtro}`);

  try {
    const apiResponse = await callAnthropic(query.trim(), qtd, filtro, existingCnpjs);

    if (apiResponse.error) {
      console.error("[RISE SST] API error:", apiResponse.error);
      res.status(200).json({ query, total: 0, empresas: [], obs: apiResponse.error.message });
      return;
    }

    const textBlock = apiResponse.content?.find(b => b.type === "text");
    const result = extrairJSON(textBlock?.text || "") || { query, total: 0, empresas: [] };

    if (Array.isArray(result.empresas)) {
      const seen = new Set(existingCnpjs.map(c => c.replace(/\D/g, "")));
      result.empresas = result.empresas.filter(e => {
        if (!e.cnpj || e.cnpj === "null") return false;
        const digits = e.cnpj.replace(/\D/g, "");
        if (digits.length < 14) return false;
        if (seen.has(digits)) return false;
        const nome = `${e.nome || ""} ${e.nome_fantasia || ""} ${e.atividade || ""}`;
        if (EXCLUIR.some(rx => rx.test(nome))) return false;
        seen.add(digits);
        return true;
      });
      result.total = result.empresas.length;
    }

    console.log(`[RISE SST] OK: ${result.total} empresas`);
    res.status(200).json(result);

  } catch(e) {
    console.error("[RISE SST] Erro:", e.message);
    res.status(200).json({ query, total: 0, empresas: [], obs: e.message });
  }
};
