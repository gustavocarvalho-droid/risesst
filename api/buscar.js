const https = require("https");
module.exports.config = { maxDuration: 60 };

// ══════════════════════════════════════════════════════════════════════════
//  VALIDAÇÃO DE CONTATOS
// ══════════════════════════════════════════════════════════════════════════
function isMasked(v) {
  if (!v) return true;
  const t = String(v).toLowerCase().trim();
  return (
    t.includes("*") || t.includes("•") || /x{3,}/.test(t) ||
    t.includes("não informado") || t.includes("nao informado") ||
    t.includes("não disponível") || t.includes("nao disponivel") ||
    t.includes("indisponível") || t.includes("indisponivel") ||
    t === "-" || t === "null" || t === "undefined" || t === "n/a" || t === ""
  );
}
function isValidEmail(e) {
  if (!e || isMasked(e)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e).trim());
}
function isValidPhone(p) {
  if (!p || isMasked(p)) return false;
  const d = String(p).replace(/\D/g, "");
  return [10, 11, 12, 13].includes(d.length);
}
function cleanContacts(e) {
  return {
    ...e,
    email:    isValidEmail(e.email)    ? String(e.email).trim()    : "",
    telefone: isValidPhone(e.telefone) ? String(e.telefone).trim() : "",
    whatsapp: isValidPhone(e.whatsapp) ? String(e.whatsapp).trim() : "",
  };
}

// ══════════════════════════════════════════════════════════════════════════
//  DEDUPLICAÇÃO
// ══════════════════════════════════════════════════════════════════════════
function getKey(e) {
  const cnpj = (e.cnpj || "").replace(/\D/g, "");
  if (cnpj.length >= 14) return cnpj;
  return `${e.nome || ""}:${e.municipio || ""}`.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// ══════════════════════════════════════════════════════════════════════════
//  FILTROS
// ══════════════════════════════════════════════════════════════════════════
const EXCLUIR = [
  /prefeitura/i, /secretaria.*municipal/i, /câmara.*vereadores/i,
  /\bpolicia\b/i, /\bpolícia\b/i, /\bubs\b/i,
  /futebol clube/i, /esporte clube/i,
  /\bbradesco\b/i, /\bitaú\b/i, /caixa economica federal/i,
  /\bigreja\b/i, /\bsindicato\b/i,
];
function passaFiltro(e) {
  const txt = `${e.nome || ""} ${e.atividade || ""}`;
  return !EXCLUIR.some(rx => rx.test(txt));
}

// ══════════════════════════════════════════════════════════════════════════
//  EXTRAÇÃO DO JSON DA RESPOSTA
// ══════════════════════════════════════════════════════════════════════════
function extrairEmpresas(text, seenSet) {
  const found = [];

  // Tentar JSON completo primeiro
  const s = text.indexOf("{"), ef = text.lastIndexOf("}");
  if (s !== -1 && ef !== -1) {
    try {
      const obj = JSON.parse(text.substring(s, ef + 1));
      const arr = obj.empresas || obj.results || (Array.isArray(obj) ? obj : []);
      for (const e of arr) {
        if (!e.nome && !e.cnpj) continue;
        if (!passaFiltro(e)) continue;
        const k = getKey(e);
        if (k && seenSet.has(k)) continue;
        const limpa = cleanContacts(e);
        if (k) seenSet.add(k);
        found.push(limpa);
      }
      if (found.length > 0) return found;
    } catch {}
  }

  // Fallback: extrair objetos individuais
  const matches = [...text.matchAll(/\{[^{}]{30,}\}/g)];
  for (const m of matches) {
    try {
      const e = JSON.parse(m[0]);
      if (!e.nome && !e.cnpj) continue;
      if (!passaFiltro(e)) continue;
      const k = getKey(e);
      if (k && seenSet.has(k)) continue;
      const limpa = cleanContacts(e);
      if (k) seenSet.add(k);
      found.push(limpa);
    } catch {}
  }
  return found;
}

// ══════════════════════════════════════════════════════════════════════════
//  PROMPTS — enxutos e eficientes
// ══════════════════════════════════════════════════════════════════════════
const CONTACT_RULE = `Regra de contato: inclua telefone OU e-mail quando disponível. Se não achar, deixe o campo vazio — não invente. Nunca retorne dados mascarados com *.`;

function buildPrompt(tipoBusca, qtd, query, cidade, estado, segs, exclusao) {
  const local = cidade && estado ? `${cidade} ${estado}` : cidade || estado || "Brasil";
  const segsStr = segs.length ? segs.join(", ") : "Construção Civil, Indústria, Transporte";

  if (tipoBusca === "oportunidade") {
    return {
      system: `Você é consultor de prospecção SST. Retorne APENAS JSON puro.
${CONTACT_RULE}
Score 0-100: 90+=recém-aberta alto risco, 75-89=setor prioritário, 50-74=médio, <50=baixo.`,
      user: `Encontre ${qtd} empresas em ${local} dos segmentos ${segsStr} com potencial de contratar serviços SST.${exclusao}
Priorize: recém-abertas, construção civil, indústria, transporte, metalurgia.
Confirme o CNPJ de cada empresa. Pesquise telefone e e-mail quando possível.
JSON: {"empresas":[{"nome":"...","cnpj":"XX.XXX.XXX/XXXX-XX","municipio":"Cidade - UF","atividade":"...","telefone":"...","whatsapp":"...","email":"...","porte":"...","situacao":"Ativa","score":87,"justificativa":"..."}]}`
    };
  }

  if (tipoBusca === "ampla_brasil") {
    return {
      system: `Você é especialista em prospecção SST no Brasil. Retorne APENAS JSON puro.
${CONTACT_RULE}`,
      user: `Encontre ${qtd} empresas brasileiras recém-abertas ou em crescimento com alto potencial SST.${exclusao}
${estado ? `Priorize o estado ${estado}.` : "Busca em todo o Brasil."}
Segmentos: ${segsStr}.
Confirme o CNPJ. Inclua data de abertura quando disponível.
JSON: {"empresas":[{"nome":"...","cnpj":"XX.XXX.XXX/XXXX-XX","municipio":"Cidade - UF","atividade":"...","data_abertura":"YYYY-MM-DD","telefone":"...","whatsapp":"...","email":"...","porte":"...","situacao":"Ativa","score":90,"justificativa":"..."}]}`
    };
  }

  // filtrada
  return {
    system: `Você é um buscador de empresas brasileiras. Retorne APENAS JSON puro.
${CONTACT_RULE}`,
    user: `Encontre ${qtd} empresas para: ${query || local}.${exclusao}
Confirme o CNPJ. Inclua telefone e e-mail quando disponível.
JSON: {"empresas":[{"nome":"...","cnpj":"XX.XXX.XXX/XXXX-XX","municipio":"Cidade - UF","atividade":"...","telefone":"...","whatsapp":"...","email":"...","porte":"...","situacao":"Ativa","nome_fantasia":"...","site":"..."}]}`
  };
}

// ══════════════════════════════════════════════════════════════════════════
//  CHAMADA ANTHROPIC — SEM STREAMING INTERNO, RESPOSTA COMPLETA
//  Mais confiável: aguarda a resposta inteira antes de processar
// ══════════════════════════════════════════════════════════════════════════
function callAnthropic(system, user) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
      system,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: user }],
    });

    const opts = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      timeout: 50000, // timeout no socket
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
        "Content-Length": Buffer.byteLength(body, "utf8"),
      },
    };

    let data = "";
    const req = https.request(opts, (res) => {
      res.setEncoding("utf8");
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);

          // Checar erro explícito da API
          if (parsed.error) {
            reject(new Error(`API error: ${parsed.error.type} — ${parsed.error.message}`));
            return;
          }

          // Extrair texto das content blocks
          const textBlock = (parsed.content || []).find(b => b.type === "text");
          resolve(textBlock?.text || "");
        } catch (e) {
          reject(new Error("JSON inválido da API: " + data.slice(0, 200)));
        }
      });
    });

    req.on("error", (e) => reject(new Error("HTTP error: " + e.message)));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout: API demorou mais de 50s"));
    });

    req.write(body);
    req.end();
  });
}

// ══════════════════════════════════════════════════════════════════════════
//  HANDLER PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════
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

  // Ler body
  let rawBody = "";
  await new Promise(r => { req.on("data", c => rawBody += c); req.on("end", r); });

  let payload = {};
  try { payload = JSON.parse(rawBody); }
  catch { res.status(400).json({ error: "Body inválido" }); return; }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(200).json({ query: "", total: 0, empresas: [], obs: "ANTHROPIC_API_KEY não configurada" });
    return;
  }

  const {
    query      = "",
    qtd        = 5,
    filtro     = "todos",
    tipoBusca  = "filtrada",
    cidade     = "",
    estado     = "",
    segmentos  = [],
    existingCnpjs = [],
  } = payload;

  const qtdN     = Math.max(1, Math.min(parseInt(qtd) || 5, 20));
  const segsArr  = Array.isArray(segmentos) && segmentos.length ? segmentos : [];
  const seenSet  = new Set(existingCnpjs.map(c => c.replace(/\D/g, "")).filter(d => d.length >= 14));
  const exclusao = seenSet.size ? ` Não repita: ${[...seenSet].slice(0,6).join(", ")}.` : "";

  // Construir prompt único — UMA chamada, sem loop
  const { system, user } = buildPrompt(tipoBusca, qtdN, query, cidade, estado, segsArr, exclusao);

  // ── Streaming NDJSON para o frontend (frontend espera este formato) ───────
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("X-Accel-Buffering", "no");
  res.status(200);

  const write = (obj) => {
    try { res.write(JSON.stringify(obj) + "\n"); } catch {}
  };

  write({ type: "status", msg: tipoBusca === "ampla_brasil" ? "🚀 Buscando no Brasil..." : `🔍 Buscando ${cidade || ""}${estado ? " "+estado : ""}...` });

  try {
    const text = await callAnthropic(system, user);
    const empresas = extrairEmpresas(text, seenSet);

    if (empresas.length === 0) {
      write({ type: "error", msg: "Nenhuma empresa encontrada. Tente outra cidade, segmento ou palavra-chave." });
    } else {
      for (const e of empresas) {
        write({ type: "empresa", data: e });
      }
      if (empresas.length < qtdN) {
        write({ type: "aviso", msg: `Encontradas ${empresas.length} de ${qtdN} solicitadas. Use "Buscar Mais" para continuar.` });
      }
    }

  } catch (err) {
    const msg = String(err.message || err);
    if (msg.includes("rate_limit") || msg.includes("529")) {
      write({ type: "error", msg: "Rate limit da API — aguarde 60s e tente novamente." });
    } else if (msg.includes("Timeout")) {
      write({ type: "error", msg: "Busca demorou demais. Tente incluir a cidade + UF para ser mais específico." });
    } else {
      write({ type: "error", msg: "Erro na busca: " + msg.slice(0, 150) });
    }
  }

  write({ type: "done", total: 0 });
  res.end();
};
