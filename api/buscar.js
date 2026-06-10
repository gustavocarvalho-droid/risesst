const https = require("https");

// ── Vercel config: máximo de duração ─────────────────────────────────────────
module.exports.config = { maxDuration: 60 };

// ── Chamada Anthropic com streaming ──────────────────────────────────────────
function callAnthropicStream(body, onEvent) {
  return new Promise((resolve, reject) => {
    const raw = JSON.stringify({ ...body, stream: true });
    const opts = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      timeout: 55000,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
        "Content-Length": Buffer.byteLength(raw, "utf8"),
      },
    };

    const req = https.request(opts, (res) => {
      let buffer = "";
      res.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop(); // último pode estar incompleto
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") continue;
            try { onEvent(JSON.parse(payload)); } catch {}
          }
        }
      });
      res.on("end", () => resolve());
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.write(raw);
    req.end();
  });
}

// ── Extrai empresas de texto parcial ou completo ──────────────────────────────
const EXCLUIR = [
  /prefeitura/i, /secretaria/i, /câmara/i, /camara/i, /autarquia/i,
  /fundação pública/i, /\bpolicia\b/i, /\bpolícia\b/i,
  /hospital.*público/i, /\bubs\b/i, /\bsus\b/i,
  /futebol clube/i, /esporte clube/i,
  /\bbradesco\b/i, /\bitaú\b/i, /\bitau\b/i, /caixa economica/i,
  /\bigreja\b/i, /\btemplo\b/i, /paróquia/i, /paroquia/i, /\bsindicato\b/i,
];

function extrairEmpresas(text, existingSet) {
  // Tenta extrair array de objetos empresa do texto acumulado
  const matches = [...text.matchAll(/\{[^{}]*"cnpj"\s*:\s*"[^"]+[^{}]*\}/g)];
  const found = [];
  for (const m of matches) {
    try {
      // Completar objeto se necessário
      let obj = m[0];
      // Fechar chaves se incompleto
      const opens = (obj.match(/\{/g)||[]).length;
      const closes = (obj.match(/\}/g)||[]).length;
      if (opens > closes) obj += "}".repeat(opens - closes);
      const e = JSON.parse(obj);
      if (!e.cnpj) continue;
      const cnpj = e.cnpj.replace(/\D/g, "");
      if (cnpj.length < 14) continue;
      if (existingSet.has(cnpj)) continue;
      const txt = `${e.nome||""} ${e.nome_fantasia||""} ${e.atividade||""}`;
      if (EXCLUIR.some(rx => rx.test(txt))) continue;
      existingSet.add(cnpj);
      found.push(e);
    } catch {}
  }
  return found;
}

function extrairJSONCompleto(text, existingSet) {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s === -1 || e === -1) return [];
  try {
    const obj = JSON.parse(text.substring(s, e + 1));
    const arr = obj.empresas || obj.results || (Array.isArray(obj) ? obj : []);
    return arr.filter(e => {
      const cnpj = (e.cnpj||"").replace(/\D/g,"");
      if (cnpj.length < 14 || existingSet.has(cnpj)) return false;
      const txt = `${e.nome||""} ${e.atividade||""}`;
      if (EXCLUIR.some(rx => rx.test(txt))) return false;
      existingSet.add(cnpj);
      return true;
    });
  } catch { return []; }
}

// ── Handler principal ─────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGINS || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method === "GET") {
    res.status(200).json({ status: "ok", key: process.env.ANTHROPIC_API_KEY ? "ok" : "FALTANDO" });
    return;
  }
  if (req.method !== "POST") { res.status(405).end(); return; }

  let body = "";
  await new Promise(r => { req.on("data", c => body += c); req.on("end", r); });
  let payload = {};
  try { payload = JSON.parse(body); } catch { res.status(400).json({ error: "Body inválido" }); return; }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(200).json({ query: payload.query, total: 0, empresas: [], obs: "API key não configurada" });
    return;
  }

  const { query, qtd = 5, filtro = "todos" } = payload;
  if (!query) { res.status(400).json({ error: "query obrigatória" }); return; }

  const existingCnpjs = Array.isArray(payload.existingCnpjs) ? payload.existingCnpjs : [];
  const existingSet = new Set(existingCnpjs.map(c => c.replace(/\D/g, "")));
  const filtroStr = { ativa: "Ativas", mei: "MEI", epp: "ME/EPP" }[filtro] || "qualquer porte";
  const exclusaoStr = existingCnpjs.length ? ` Não repita: ${existingCnpjs.slice(0,8).join(", ")}.` : "";

  const systemPrompt = `Você é um buscador de empresas brasileiras. Retorne APENAS JSON puro, sem markdown.

Encontre ${qtd} empresas (${filtroStr}) para a query.${exclusaoStr}
Exclua: órgãos públicos, bancos, igrejas, sindicatos, times de futebol.

Para cada empresa: confirme o CNPJ (cnpj.biz ou casadosdados.com.br) e busque telefone/contato em 1 pesquisa.

Responda com este JSON exato:
{"empresas":[{"nome":"Razão Social","nome_fantasia":"Nome","cnpj":"XX.XXX.XXX/XXXX-XX","situacao":"Ativa","porte":"MEI","municipio":"Cidade - UF","atividade":"atividade","telefone":"(11)9999-9999","whatsapp":"5511999999999","email":"email@empresa.com","site":"https://site.com"}]}`;

  // ── Streaming: envia NDJSON ao frontend conforme IA processa ──────────────
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("X-Accel-Buffering", "no"); // desabilita buffering no nginx/vercel
  res.status(200);

  let fullText = "";
  let emitted = new Set(); // CNPJs já enviados
  let lastFlush = Date.now();

  const flush = (empresas) => {
    for (const e of empresas) {
      const cnpj = (e.cnpj || "").replace(/\D/g, "");
      if (!cnpj || emitted.has(cnpj)) continue;
      emitted.add(cnpj);
      res.write(JSON.stringify({ type: "empresa", data: e }) + "\n");
    }
    lastFlush = Date.now();
  };

  try {
    await callAnthropicStream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: systemPrompt,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: `Busque ${qtd} empresas: ${query}` }],
    }, (event) => {
      // Acumular texto da resposta
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        fullText += event.delta.text || "";
        // A cada 3s ou a cada empresa encontrada, tentar extrair e enviar
        if (Date.now() - lastFlush > 2000) {
          const parcial = extrairEmpresas(fullText, existingSet);
          if (parcial.length) flush(parcial);
        }
      }
      // Progresso: informar ao frontend
      if (event.type === "message_start") {
        res.write(JSON.stringify({ type: "status", msg: "IA iniciou a busca..." }) + "\n");
      }
      if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
        res.write(JSON.stringify({ type: "status", msg: `🔍 Pesquisando: ${event.content_block.name || "web"}...` }) + "\n");
      }
    });

    // Extrair tudo do texto final (garante completude)
    const final = extrairJSONCompleto(fullText, existingSet);
    flush(final);

    // Se não encontrou nada via regex incremental, tentar uma última vez
    if (emitted.size === 0) {
      res.write(JSON.stringify({ type: "error", msg: "Sem resultados — tente uma busca mais específica (ex: inclua a cidade)" }) + "\n");
    }

  } catch (err) {
    const msg = err.message || "Erro";
    if (msg.includes("rate_limit") || msg.includes("429")) {
      res.write(JSON.stringify({ type: "error", msg: "Rate limit — aguarde 60s e tente novamente" }) + "\n");
    } else if (msg.includes("Timeout")) {
      res.write(JSON.stringify({ type: "error", msg: "Tempo esgotado — tente busca mais específica (ex: 'construtoras Campinas SP')" }) + "\n");
    } else {
      res.write(JSON.stringify({ type: "error", msg }) + "\n");
    }
  }

  res.write(JSON.stringify({ type: "done", total: emitted.size }) + "\n");
  res.end();
};
