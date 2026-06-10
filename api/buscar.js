const https = require("https");
module.exports.config = { maxDuration: 60 };

// ══════════════════════════════════════════════════════════════
//  VALIDAÇÃO DE CONTATOS
// ══════════════════════════════════════════════════════════════
function isMasked(value) {
  if (!value) return true;
  const t = String(value).toLowerCase().trim();
  return (
    t.includes("*") ||
    t.includes("•") ||
    t.includes("xxx") ||
    t.includes("xxxx") ||
    /x{2,}/.test(t) ||
    t.includes("não informado") ||
    t.includes("nao informado") ||
    t.includes("não disponível") ||
    t.includes("nao disponivel") ||
    t.includes("indisponível") ||
    t.includes("indisponivel") ||
    t.includes("oculto") ||
    t.includes("sigiloso") ||
    t.includes("privado") ||
    t.includes("n/a") ||
    t === "-" ||
    t === "null" ||
    t === "undefined"
  );
}

function isValidEmail(email) {
  if (!email || isMasked(email)) return false;
  const clean = String(email).trim().toLowerCase();
  // Deve ter formato usuario@dominio.extensao
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) return false;
  // Domínio não pode ter asterisco, ponto duplo, etc.
  const [, domain] = clean.split("@");
  if (!domain || domain.includes("*") || domain.startsWith(".") || domain.endsWith(".")) return false;
  return true;
}

function isValidPhone(phone) {
  if (!phone || isMasked(phone)) return false;
  const digits = String(phone).replace(/\D/g, "");
  // Brasil: DDD(2) + número(8 ou 9) = 10 ou 11
  // Com código país 55: 12 ou 13
  return [10, 11, 12, 13].includes(digits.length);
}

function cleanCompany(e) {
  return {
    ...e,
    email:    isValidEmail(e.email)    ? String(e.email).trim()    : "",
    telefone: isValidPhone(e.telefone) ? String(e.telefone).trim() : "",
    whatsapp: isValidPhone(e.whatsapp) ? String(e.whatsapp).trim() : "",
  };
}

function hasValidContact(e) {
  return Boolean(e.email || e.telefone || e.whatsapp);
}

// ══════════════════════════════════════════════════════════════
//  FILTROS DE EXCLUSÃO (órgãos públicos, bancos, etc.)
// ══════════════════════════════════════════════════════════════
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
  const txt = `${e.nome || ""} ${e.atividade || ""}`;
  if (EXCLUIR.some(rx => rx.test(txt))) return false;
  existingSet.add(cnpj);
  return true;
}

// ── Processar empresa: limpar + validar contato + filtrar duplicata ──────────
function processarEmpresa(e, existingSet) {
  if (!passaFiltro(e, existingSet)) return null;
  const limpa = cleanCompany(e);
  if (!hasValidContact(limpa)) return null; // descarta sem contato válido
  return limpa;
}

// ══════════════════════════════════════════════════════════════
//  EXTRAÇÃO INCREMENTAL E FINAL DO JSON
// ══════════════════════════════════════════════════════════════
function extrairObjetos(text, existingSet) {
  const matches = [...text.matchAll(/\{[^{}]*"cnpj"\s*:\s*"[^"]+[^{}]*\}/g)];
  const found = [];
  for (const m of matches) {
    try {
      let obj = m[0];
      const op = (obj.match(/\{/g) || []).length;
      const cl = (obj.match(/\}/g) || []).length;
      if (op > cl) obj += "}".repeat(op - cl);
      const e = JSON.parse(obj);
      const r = processarEmpresa(e, existingSet);
      if (r) found.push(r);
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
    return arr.map(e => processarEmpresa(e, existingSet)).filter(Boolean);
  } catch { return []; }
}

// ══════════════════════════════════════════════════════════════
//  PROMPTS
// ══════════════════════════════════════════════════════════════
function promptFiltrada(qtd, filtroStr, exclusaoStr) {
  return `Você é um buscador de empresas brasileiras. Retorne APENAS JSON puro, sem markdown.

Encontre ${qtd} empresas (${filtroStr}) para a query do usuário.${exclusaoStr}
Exclua: órgãos públicos, bancos, igrejas, sindicatos, times de futebol.

REGRAS OBRIGATÓRIAS PARA CONTATOS:
- Retorne SOMENTE empresas que tenham pelo menos um contato real e completo: telefone, WhatsApp OU e-mail.
- NUNCA retorne contatos mascarados, ocultos, parciais ou com asteriscos (ex: (11) 5539-****, c****@****.com).
- Se não encontrar o contato completo, descarte a empresa e busque outra.
- Telefone deve ter DDD + número completo (10 ou 11 dígitos). Ex: (11) 99999-9999 ou 11999999999.
- E-mail deve ter formato completo: usuario@dominio.com. Nunca retorne e-mails parciais.
- WhatsApp: retorne apenas o número completo com código do país. Ex: 5511999999999.

Para cada empresa: confirme o CNPJ, então pesquise "[nome empresa] [cidade] telefone contato site". Se não achar contato, descarte e busque próxima empresa.

JSON:
{"empresas":[{"nome":"Razão Social Ltda","nome_fantasia":"Nome","cnpj":"XX.XXX.XXX/XXXX-XX","situacao":"Ativa","porte":"MEI","municipio":"Cidade - UF","atividade":"descrição","telefone":"(11) 9999-9999","whatsapp":"5511999999999","email":"contato@empresa.com.br","site":"https://site.com"}]}`;
}

function promptOportunidade(qtd, cidade, estado, segmentos, exclusaoStr) {
  const localStr = [cidade, estado].filter(Boolean).join(", ") || "Brasil";
  const segStr   = segmentos && segmentos.length ? segmentos.join(", ") : "Construção Civil, Indústria, Transporte";
  return `Você é consultor especialista em prospecção de serviços SST (Segurança e Saúde do Trabalho).

Encontre ${qtd} oportunidades comerciais em ${localStr} — segmentos: ${segStr}.${exclusaoStr}

CRITÉRIOS DE PRIORIDADE:
1. Empresas recém-abertas (< 3 anos) — alta necessidade de PGR, PCMSO, ASO
2. Setores de ALTO RISCO: construção civil, metalurgia, mineração, química, transporte
3. Empresas com > 5 funcionários sem fornecedor SST visível
4. Em crescimento ou com múltiplas unidades

REGRAS OBRIGATÓRIAS PARA CONTATOS:
- Retorne SOMENTE empresas com pelo menos um contato real: telefone, WhatsApp ou e-mail completo.
- NUNCA retorne contatos mascarados ou parciais (ex: (11) 5539-****, c****@****.com.br).
- Telefone completo: DDD + número (10 ou 11 dígitos). Ex: (11) 99999-9999.
- E-mail completo: usuario@dominio.extensao. Nada de e-mails parciais.
- Se não encontrar contato completo, descarte a empresa e busque outra no lugar.

Score 0-100: 90-100=alta necessidade confirmada, 75-89=setor prioritário, 50-74=médio, <50=baixo.

JSON:
{"empresas":[{"nome":"Razão Social Ltda","nome_fantasia":"Nome","cnpj":"XX.XXX.XXX/XXXX-XX","situacao":"Ativa","porte":"ME","municipio":"Cidade - UF","atividade":"construção civil","telefone":"(11) 9999-9999","whatsapp":"5511999999999","email":"contato@empresa.com.br","site":"https://site.com","score":87,"justificativa":"Empresa de construção aberta em 2023, 12 funcionários. Alto risco. Necessita PGR, PCMSO, NR obrigatórios."}]}`;
}

// ══════════════════════════════════════════════════════════════
//  STREAMING ANTHROPIC
// ══════════════════════════════════════════════════════════════
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
            const p = line.slice(6).trim();
            if (p === "[DONE]") continue;
            try { onEvent(JSON.parse(p)); } catch {}
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

// ══════════════════════════════════════════════════════════════
//  HANDLER PRINCIPAL
// ══════════════════════════════════════════════════════════════
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
  const exclusaoStr   = existingCnpjs.length ? ` Não repita: ${existingCnpjs.slice(0, 6).join(", ")}.` : "";

  const systemPrompt = tipoBusca === "oportunidade"
    ? promptOportunidade(qtd, cidade, estado, segmentos, exclusaoStr)
    : promptFiltrada(qtd, filtroStr, exclusaoStr);

  const userMsg = tipoBusca === "oportunidade"
    ? `Encontre ${qtd} oportunidades SST com contato completo para: ${query}`
    : `Busque ${qtd} empresas com contato completo para: ${query}`;

  // Streaming NDJSON
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("X-Accel-Buffering", "no");
  res.status(200);

  let fullText  = "";
  let emitted   = new Set();
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
        res.write(JSON.stringify({ type: "status", msg: "🌐 Pesquisando contatos na web..." }) + "\n");
      }
    });

    // Extração final completa
    flush(extrairJSON(fullText, existingSet));

    if (emitted.size === 0) {
      res.write(JSON.stringify({ type: "error", msg: "Nenhuma empresa encontrada com contato completo — tente incluir cidade/estado ou outro setor" }) + "\n");
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
