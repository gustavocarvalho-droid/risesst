const https = require("https");
module.exports.config = { maxDuration: 60 };

// ══════════════════════════════════════════════════════════════════════════
//  VALIDAÇÃO DE CONTATOS
// ══════════════════════════════════════════════════════════════════════════
function isMasked(v) {
  if (!v) return true;
  const t = String(v).toLowerCase().trim();
  return t.includes("*") || t.includes("•") || /x{3,}/.test(t) ||
    t.includes("não informado") || t.includes("nao informado") ||
    t.includes("não disponível") || t.includes("nao disponivel") ||
    t.includes("indisponível") || t.includes("indisponivel") ||
    t === "-" || t === "null" || t === "undefined" || t === "n/a" || t === "";
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
  return { ...e,
    email:    isValidEmail(e.email)    ? String(e.email).trim()    : "",
    telefone: isValidPhone(e.telefone) ? String(e.telefone).trim() : "",
    whatsapp: isValidPhone(e.whatsapp) ? String(e.whatsapp).trim() : "",
  };
}

// ══════════════════════════════════════════════════════════════════════════
//  DEDUPLICAÇÃO E FILTROS
// ══════════════════════════════════════════════════════════════════════════
function getKey(e) {
  const cnpj = (e.cnpj || "").replace(/\D/g, "");
  if (cnpj.length >= 14) return cnpj;
  return `${e.nome || ""}:${e.municipio || ""}`.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}
const EXCLUIR = [
  /prefeitura/i, /secretaria.*municipal/i, /câmara.*vereadores/i,
  /\bpolicia\b/i, /\bpolícia\b/i, /\bubs\b/i,
  /futebol clube/i, /esporte clube/i,
  /\bbradesco\b/i, /\bitaú\b/i, /caixa economica federal/i,
  /\bigreja\b/i, /\bsindicato\b/i,
];
function passaFiltro(e) {
  return !EXCLUIR.some(rx => rx.test(`${e.nome || ""} ${e.atividade || ""}`));
}
function extrairEmpresas(text, seenSet) {
  const found = [];
  // Tenta JSON completo
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
        if (k) seenSet.add(k);
        found.push(cleanContacts(e));
      }
      if (found.length > 0) return found;
    } catch {}
  }
  // Fallback: regex
  for (const m of text.matchAll(/\{[^{}]{30,}\}/g)) {
    try {
      const e = JSON.parse(m[0]);
      if (!e.nome && !e.cnpj) continue;
      if (!passaFiltro(e)) continue;
      const k = getKey(e);
      if (k && seenSet.has(k)) continue;
      if (k) seenSet.add(k);
      found.push(cleanContacts(e));
    } catch {}
  }
  return found;
}

// ══════════════════════════════════════════════════════════════════════════
//  PROMPTS
// ══════════════════════════════════════════════════════════════════════════
const CONTACT_RULE = `Regra de contato: inclua telefone OU e-mail quando disponível. Nunca retorne dados mascarados com *.`;

function buildPrompt(tipoBusca, qtd, query, cidade, estado, segs, exclusao) {
  const local  = cidade && estado ? `${cidade} ${estado}` : cidade || estado || "Brasil";
  const segsStr = segs.length ? segs.join(", ") : "Construção Civil, Indústria, Transporte";
  if (tipoBusca === "oportunidade") {
    return {
      system: `Você é consultor de prospecção SST. Retorne APENAS JSON puro.\n${CONTACT_RULE}\nScore 0-100: 90+=alto risco recente, 75-89=prioritário, 50-74=médio, <50=baixo.`,
      user:   `Encontre ${qtd} empresas em ${local} nos segmentos ${segsStr} com potencial SST.${exclusao}\nConfirme o CNPJ de cada empresa.\nJSON: {"empresas":[{"nome":"...","cnpj":"XX.XXX.XXX/XXXX-XX","municipio":"Cidade - UF","atividade":"...","telefone":"...","whatsapp":"...","email":"...","porte":"...","situacao":"Ativa","score":87,"justificativa":"..."}]}`
    };
  }
  if (tipoBusca === "ampla_brasil") {
    return {
      system: `Você é especialista em prospecção SST. Retorne APENAS JSON puro.\n${CONTACT_RULE}`,
      user:   `Encontre ${qtd} empresas brasileiras recém-abertas com alto potencial SST.${exclusao}\n${estado ? `Foco em ${estado}.` : "Todo Brasil."} Segmentos: ${segsStr}.\nJSON: {"empresas":[{"nome":"...","cnpj":"XX.XXX.XXX/XXXX-XX","municipio":"Cidade - UF","atividade":"...","data_abertura":"YYYY-MM-DD","telefone":"...","whatsapp":"...","email":"...","porte":"...","situacao":"Ativa","score":90,"justificativa":"..."}]}`
    };
  }
  return {
    system: `Você é um buscador de empresas brasileiras. Retorne APENAS JSON puro.\n${CONTACT_RULE}`,
    user:   `Encontre ${qtd} empresas para: ${query || local}.${exclusao}\nConfirme o CNPJ. Inclua telefone e e-mail quando disponível.\nJSON: {"empresas":[{"nome":"...","cnpj":"XX.XXX.XXX/XXXX-XX","municipio":"Cidade - UF","atividade":"...","telefone":"...","whatsapp":"...","email":"...","porte":"...","situacao":"Ativa","nome_fantasia":"...","site":"..."}]}`
  };
}

// ══════════════════════════════════════════════════════════════════════════
//  ANTHROPIC COM STREAMING SSE
//  Usando stream: true para que os chunks cheguem em <2s
//  e sejam repassados ao cliente antes do timeout do Vercel
// ══════════════════════════════════════════════════════════════════════════
function callAnthropicStream(body, onText, onToolUse) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify({ ...body, stream: true });
    const req = https.request({
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      timeout: 55000,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
        "Content-Length": Buffer.byteLength(bodyStr, "utf8"),
      },
    }, (res) => {
      // ── Erro HTTP (401/404/400/etc): a Anthropic NÃO retorna SSE neste caso,
      //    retorna um JSON de erro puro. Sem este check, o erro era engolido
      //    silenciosamente e a busca aparecia como "vazia" para o usuário. ──
      if (res.statusCode < 200 || res.statusCode >= 300) {
        let errBuf = "";
        res.on("data", chunk => { errBuf += chunk.toString(); });
        res.on("end", () => {
          let apiMsg = `HTTP ${res.statusCode}`;
          try {
            const parsed = JSON.parse(errBuf);
            apiMsg = parsed.error?.message || parsed.message || apiMsg;
          } catch {}
          if (res.statusCode === 401) reject(new Error(`auth_error: ${apiMsg}`));
          else if (res.statusCode === 404) reject(new Error(`model_not_found: ${apiMsg}`));
          else if (res.statusCode === 429) reject(new Error(`rate_limit: ${apiMsg}`));
          else if (res.statusCode === 529) reject(new Error(`529: ${apiMsg}`));
          else reject(new Error(`api_error_${res.statusCode}: ${apiMsg}`));
        });
        return;
      }

      let buf = "";
      let fullText = "";
      res.on("data", chunk => {
        buf += chunk.toString();
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;
          try {
            const ev = JSON.parse(payload);
            if (ev.type === "error") {
              // Erro vindo dentro do próprio stream SSE (ex: overloaded_error)
              if (onText) {} // no-op, será tratado via reject abaixo
              reject(new Error(`stream_error: ${ev.error?.message || "erro desconhecido"}`));
              return;
            }
            if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
              fullText += ev.delta.text || "";
              if (onText) onText(ev.delta.text || "");
            }
            if (ev.type === "content_block_start" && ev.content_block?.type === "tool_use") {
              if (onToolUse) onToolUse(ev.content_block.name || "web_search");
            }
          } catch {}
        }
      });
      res.on("end", () => resolve(fullText));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout na Anthropic API")); });
    req.write(bodyStr);
    req.end();
  });
}

// ══════════════════════════════════════════════════════════════════════════
//  HANDLER PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin",  process.env.ALLOWED_ORIGINS || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method === "GET") {
    res.status(200).json({ status: "ok", key: process.env.ANTHROPIC_API_KEY ? "ok" : "FALTANDO" });
    return;
  }
  if (req.method !== "POST") { res.status(405).end(); return; }

  let rawBody = "";
  await new Promise(r => { req.on("data", c => rawBody += c); req.on("end", r); });
  let payload = {};
  try { payload = JSON.parse(rawBody); }
  catch { res.status(400).json({ error: "Body inválido" }); return; }

  if (!process.env.ANTHROPIC_API_KEY) {
    // Retornar NDJSON mesmo no erro para consistência
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.status(200);
    res.write(JSON.stringify({ type: "error", msg: "ANTHROPIC_API_KEY não configurada no servidor." }) + "\n");
    res.write(JSON.stringify({ type: "done", total: 0 }) + "\n");
    res.end();
    return;
  }

  const { query = "", qtd = 5, filtro = "todos", tipoBusca = "filtrada",
          cidade = "", estado = "", segmentos = [], existingCnpjs = [] } = payload;

  const qtdN    = Math.max(1, Math.min(parseInt(qtd) || 5, 20));
  const segsArr = Array.isArray(segmentos) && segmentos.length ? segmentos : [];
  const seenSet = new Set(existingCnpjs.map(c => c.replace(/\D/g, "")).filter(d => d.length >= 14));
  const exclusao = seenSet.size ? ` Não repita: ${[...seenSet].slice(0,6).join(", ")}.` : "";

  const { system, user } = buildPrompt(tipoBusca, qtdN, query, cidade, estado, segsArr, exclusao);

  // ── Sempre NDJSON — o frontend espera este formato ──────────────────
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Cache-Control", "no-cache");
  res.status(200);

  const write = (obj) => { try { res.write(JSON.stringify(obj) + "\n"); } catch {} };

  write({ type: "status", msg: `🔍 Iniciando busca: ${query || cidade || estado}...` });

  const emitted  = new Set(seenSet);
  let emitCount  = 0;
  let accText    = "";
  let lastFlush  = Date.now();

  // Tentar emitir empresas conforme o texto chega (incremental)
  const tryFlushIncremental = () => {
    if (Date.now() - lastFlush < 1500) return;
    const empresas = extrairEmpresas(accText, emitted);
    for (const e of empresas) {
      write({ type: "empresa", data: e });
      emitCount++;
    }
    if (empresas.length) { lastFlush = Date.now(); }
  };

  try {
    const fullText = await callAnthropicStream(
      { model: "claude-sonnet-4-6", max_tokens: 3000, system,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: user }] },
      (textChunk) => {
        accText += textChunk;
        tryFlushIncremental();
      },
      (toolName) => {
        write({ type: "status", msg: `🌐 Pesquisando na web...` });
      }
    );

    // Flush final — garante que todo o JSON acumulado é processado
    const final = extrairEmpresas(fullText, emitted);
    for (const e of final) {
      write({ type: "empresa", data: e });
      emitCount++;
    }

    if (emitCount === 0) {
      const msgVazio = tipoBusca === "ampla_brasil"
        ? "Nenhuma empresa encontrada para este estado/segmento. Tente outro estado, segmento ou aumente a quantidade."
        : tipoBusca === "oportunidade"
          ? "Nenhuma oportunidade encontrada. Tente outro segmento, cidade ou estado."
          : "Nenhuma empresa encontrada. Tente outra cidade, segmento ou palavra-chave.";
      write({ type: "error", msg: msgVazio });
    } else if (emitCount < qtdN) {
      write({ type: "aviso", msg: `Encontradas ${emitCount} de ${qtdN} solicitadas. Use "Buscar Mais" para continuar.` });
    }

  } catch (err) {
    const msg = String(err.message || err);
    if (msg.startsWith("auth_error")) {
      write({ type: "error", msg: "Erro de autenticação com a IA. Verifique a chave da API (ANTHROPIC_API_KEY) nas configurações do servidor." });
    } else if (msg.startsWith("model_not_found")) {
      write({ type: "error", msg: "O modelo de IA configurado não está mais disponível. Atualize o modelo no servidor." });
    } else if (msg.includes("rate_limit") || msg.includes("529")) {
      write({ type: "error", msg: "Rate limit da API — aguarde 60s e tente novamente." });
    } else if (msg.includes("credit") || msg.includes("insufficient_quota") || msg.includes("billing")) {
      write({ type: "error", msg: "Créditos insuficientes na conta da API de IA. Verifique o saldo/billing da Anthropic." });
    } else if (msg.includes("Timeout")) {
      write({ type: "error", msg: "Busca demorou demais. Tente incluir a cidade + UF para refinar." });
    } else {
      write({ type: "error", msg: "Erro: " + msg.slice(0, 200) });
    }
  }

  write({ type: "done", total: emitCount });
  res.end();
};
