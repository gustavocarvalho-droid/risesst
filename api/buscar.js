const https = require("https");
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
        buffer = lines.pop();
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

// ── Filtros ───────────────────────────────────────────────────────────────────
const EXCLUIR = [
  /prefeitura/i, /secretaria/i, /câmara/i, /camara/i, /autarquia/i,
  /fundação pública/i, /\bpolicia\b/i, /\bpolícia\b/i,
  /hospital.*público/i, /\bubs\b/i, /\bsus\b/i,
  /futebol clube/i, /esporte clube/i,
  /\bbradesco\b/i, /\bitaú\b/i, /\bitau\b/i, /caixa economica/i,
  /\bigreja\b/i, /\btemplo\b/i, /paróquia/i, /paroquia/i, /\bsindicato\b/i,
];

function passaFiltro(e, existingSet) {
  const cnpj = (e.cnpj || "").replace(/\D/g, "");
  if (!cnpj || cnpj.length < 14) return false;
  if (existingSet.has(cnpj)) return false;
  const txt = `${e.nome||""} ${e.atividade||""}`;
  if (EXCLUIR.some(rx => rx.test(txt))) return false;
  existingSet.add(cnpj);
  return true;
}

function extrairObjetos(text, existingSet) {
  const matches = [...text.matchAll(/\{[^{}]*"cnpj"\s*:\s*"[^"]+[^{}]*\}/g)];
  const found = [];
  for (const m of matches) {
    try {
      let obj = m[0];
      const op = (obj.match(/\{/g)||[]).length;
      const cl = (obj.match(/\}/g)||[]).length;
      if (op > cl) obj += "}".repeat(op - cl);
      const e = JSON.parse(obj);
      if (passaFiltro(e, existingSet)) found.push(e);
    } catch {}
  }
  return found;
}

function extrairJSON(text, existingSet) {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s === -1 || e === -1) return [];
  try {
    const obj = JSON.parse(text.substring(s, e + 1));
    const arr = obj.empresas || obj.results || (Array.isArray(obj) ? obj : []);
    return arr.filter(e => passaFiltro(e, existingSet));
  } catch { return []; }
}

// ── Prompt: Busca Filtrada ─────────────────────────────────────────────────
function promptFiltrada(qtd, filtroStr, exclusaoStr) {
  return `Você é um buscador de empresas brasileiras. Retorne APENAS JSON puro, sem markdown.

Encontre ${qtd} empresas (${filtroStr}) para a query do usuário.${exclusaoStr}
Exclua: órgãos públicos, bancos, igrejas, sindicatos, times de futebol.
Para cada empresa: confirme o CNPJ em cnpj.biz ou casadosdados.com.br, busque telefone/WhatsApp/email em 1 pesquisa rápida.

JSON:
{"empresas":[{"nome":"Razão Social Ltda","nome_fantasia":"Nome Fantasia","cnpj":"XX.XXX.XXX/XXXX-XX","situacao":"Ativa","porte":"MEI","municipio":"Cidade - UF","atividade":"descrição","telefone":"(11)9999-9999","whatsapp":"5511999999999","email":"email@empresa.com","site":"https://site.com"}]}`;
}

// ── Prompt: Oportunidades Comerciais SST ─────────────────────────────────────
function promptOportunidade(qtd, cidade, estado, segmentos, exclusaoStr) {
  const localStr = [cidade, estado].filter(Boolean).join(", ") || "Brasil";
  const segStr   = segmentos && segmentos.length ? segmentos.join(", ") : "Construção Civil, Indústria, Transporte";
  return `Você é um consultor especialista em prospecção comercial de serviços de SST (Segurança e Saúde do Trabalho).

Encontre ${qtd} empresas em ${localStr} dos segmentos: ${segStr}.
${exclusaoStr}

CRITÉRIOS DE PRIORIDADE (ordene por maior oportunidade primeiro):
1. Empresas recém-abertas (menos de 3 anos) — alta necessidade de PGR, PCMSO, ASO
2. Empresas em crescimento com múltiplos funcionários
3. Setores de ALTO RISCO: construção civil, metalurgia, mineração, química, transporte
4. Empresas SEM fornecedor SST visível (sem citação de parceiro SST nas redes)
5. Indústrias com mais de 5 funcionários

SERVIÇOS SST a associar: PGR, PCMSO, LTCAT, Laudo de Insalubridade, Laudo de Periculosidade, ASO, Treinamentos NR, CIPA, PPP, e-Social SST.

Para cada empresa, calcule um SCORE DE OPORTUNIDADE (0-100):
- 90-100: alta necessidade confirmada (recém-aberta, setor alto risco, muitos funcionários)
- 75-89:  setor prioritário, bom potencial
- 50-74:  potencial médio
- <50:    baixo potencial

Para cada empresa: confirme CNPJ, busque telefone/WhatsApp/email, identifique porte/funcionários.

Retorne APENAS este JSON:
{"empresas":[{
  "nome":"Razão Social Ltda",
  "nome_fantasia":"Nome Fantasia",
  "cnpj":"XX.XXX.XXX/XXXX-XX",
  "situacao":"Ativa",
  "porte":"MEI",
  "municipio":"Cidade - UF",
  "atividade":"construção civil",
  "telefone":"(11)9999-9999",
  "whatsapp":"5511999999999",
  "email":"email@empresa.com",
  "site":"https://site.com",
  "score":87,
  "justificativa":"Empresa de construção civil aberta em 2023, com 12 funcionários. Setor de alto risco (Grau 3). Sem fornecedor SST identificado. Necessita PGR, PCMSO, Treinamentos NR obrigatórios."
}]}`;
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

  const {
    query, qtd = 5, filtro = "todos",
    tipoBusca = "filtrada",
    cidade = "", estado = "",
    segmentos = [],
  } = payload;
  if (!query) { res.status(400).json({ error: "query obrigatória" }); return; }

  const existingCnpjs = Array.isArray(payload.existingCnpjs) ? payload.existingCnpjs : [];
  const existingSet   = new Set(existingCnpjs.map(c => c.replace(/\D/g, "")));
  const filtroStr     = { ativa: "Ativas", mei: "MEI", epp: "ME/EPP" }[filtro] || "qualquer porte";
  const exclusaoStr   = existingCnpjs.length ? ` Não repita CNPJs: ${existingCnpjs.slice(0,6).join(", ")}.` : "";

  // Selecionar prompt conforme tipoBusca
  const systemPrompt = tipoBusca === "oportunidade"
    ? promptOportunidade(qtd, cidade, estado, segmentos, exclusaoStr)
    : promptFiltrada(qtd, filtroStr, exclusaoStr);

  // Mensagem do usuário
  const userMsg = tipoBusca === "oportunidade"
    ? `Encontre ${qtd} oportunidades comerciais SST para: ${query}`
    : `Busque ${qtd} empresas para: ${query}`;

  // Streaming NDJSON
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("X-Accel-Buffering", "no");
  res.status(200);

  let fullText = "";
  let emitted  = new Set();
  let lastFlush = Date.now();

  const flush = (arr) => {
    for (const e of arr) {
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
      max_tokens: tipoBusca === "oportunidade" ? 3000 : 2000,
      system: systemPrompt,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: userMsg }],
    }, (event) => {
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        fullText += event.delta.text || "";
        if (Date.now() - lastFlush > 2000) {
          flush(extrairObjetos(fullText, existingSet));
        }
      }
      if (event.type === "message_start") {
        res.write(JSON.stringify({ type: "status", msg: tipoBusca === "oportunidade" ? "🎯 Analisando oportunidades SST..." : "🔍 Buscando empresas..." }) + "\n");
      }
      if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
        res.write(JSON.stringify({ type: "status", msg: "🌐 Pesquisando na web..." }) + "\n");
      }
    });

    flush(extrairJSON(fullText, existingSet));

    if (emitted.size === 0) {
      res.write(JSON.stringify({ type: "error", msg: "Nenhum resultado encontrado — tente uma busca mais específica" }) + "\n");
    }
  } catch (err) {
    const msg = err.message || "Erro";
    if (msg.includes("rate_limit") || msg.includes("429")) {
      res.write(JSON.stringify({ type: "error", msg: "Rate limit — aguarde 60s e tente novamente" }) + "\n");
    } else if (msg.includes("Timeout")) {
      res.write(JSON.stringify({ type: "error", msg: "Tempo esgotado — tente adicionar cidade/estado para refinar" }) + "\n");
    } else {
      res.write(JSON.stringify({ type: "error", msg }) + "\n");
    }
  }

  res.write(JSON.stringify({ type: "done", total: emitted.size }) + "\n");
  res.end();
};
