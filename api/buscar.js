const https = require("https");
module.exports.config = { maxDuration: 60 };

// ══════════════════════════════════════════════════════════════════════════
//  VALIDAÇÃO DE CONTATOS
// ══════════════════════════════════════════════════════════════════════════
function isMasked(v) {
  if (!v) return true;
  const t = String(v).toLowerCase().trim();
  return (
    t.includes("*") || t.includes("•") || /x{2,}/.test(t) ||
    t.includes("não informado") || t.includes("nao informado") ||
    t.includes("não disponível") || t.includes("nao disponivel") ||
    t.includes("indisponível") || t.includes("indisponivel") ||
    t.includes("oculto") || t.includes("privado") || t.includes("sigiloso") ||
    t === "-" || t === "null" || t === "undefined" || t === "n/a" || t === ""
  );
}
function isValidEmail(e) {
  if (!e || isMasked(e)) return false;
  const c = String(e).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c)) return false;
  const [, domain] = c.split("@");
  return domain && !domain.includes("*") && !domain.startsWith(".") && !domain.endsWith(".");
}
function isValidPhone(p) {
  if (!p || isMasked(p)) return false;
  const d = String(p).replace(/\D/g, "");
  return [10, 11, 12, 13].includes(d.length);
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
  return !!(e.email || e.telefone || e.whatsapp);
}

// ══════════════════════════════════════════════════════════════════════════
//  DEDUPLICAÇÃO
// ══════════════════════════════════════════════════════════════════════════
function getKey(e) {
  const cnpj = (e.cnpj || "").replace(/\D/g, "");
  if (cnpj.length >= 14) return cnpj;
  return `${e.nome || e.nome_fantasia || ""}-${e.municipio || ""}`
    .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function dedup(arr, seen = new Set()) {
  const out = [];
  for (const e of arr) {
    const k = getKey(e);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════════════
//  FILTROS DE EXCLUSÃO
// ══════════════════════════════════════════════════════════════════════════
const EXCLUIR = [
  /prefeitura/i, /secretaria/i, /câmara/i, /camara/i, /autarquia/i,
  /\bpolicia\b/i, /\bpolícia\b/i, /\bubs\b/i, /\bsus\b/i,
  /futebol clube/i, /esporte clube/i,
  /\bbradesco\b/i, /\bitaú\b/i, /\bitau\b/i, /caixa economica/i,
  /\bigreja\b/i, /\btemplo\b/i, /paróquia/i, /paroquia/i, /\bsindicato\b/i,
];
function isExcluded(e) {
  const txt = `${e.nome || ""} ${e.atividade || ""}`;
  return EXCLUIR.some(rx => rx.test(txt));
}
function isValidCNPJ(cnpj) {
  const d = (cnpj || "").replace(/\D/g, "");
  return d.length === 14;
}

// ══════════════════════════════════════════════════════════════════════════
//  PROMPTS
// ══════════════════════════════════════════════════════════════════════════
const CONTACT_RULES = `
REGRAS ABSOLUTAS DE CONTATO:
- Retorne SOMENTE empresas com telefone, WhatsApp OU e-mail completo e real.
- NUNCA retorne contatos mascarados (ex: (11) 5539-****, c***@***.com). Descarte a empresa.
- Telefone: DDD + número completo, 10 ou 11 dígitos. Ex: (11) 99999-9999.
- E-mail: formato completo usuario@dominio.extensao. Sem parciais.
- WhatsApp: código país + DDD + número, ex: 5511999999999.
- Se não achar contato real, descarte e busque outra empresa.
- NUNCA invente dados.`;

function promptFiltrada(qtd, local, filtroStr, exclusao) {
  return `Você é um buscador de empresas brasileiras. Retorne APENAS JSON puro, sem markdown.
Encontre EXATAMENTE ${qtd} empresas (${filtroStr}) em ${local}.${exclusao}
Exclua: órgãos públicos, bancos, igrejas, sindicatos, times de futebol.
${CONTACT_RULES}
Para cada empresa: confirme CNPJ, pesquise contato completo. Se não tiver contato, substitua por outra.

JSON (array com EXATAMENTE ${qtd} itens):
{"empresas":[{"nome":"Razão Social Ltda","nome_fantasia":"Nome","cnpj":"XX.XXX.XXX/XXXX-XX","situacao":"Ativa","porte":"MEI","municipio":"Cidade - UF","atividade":"descrição","telefone":"(11) 9999-9999","whatsapp":"5511999999999","email":"contato@empresa.com.br","site":"https://site.com"}]}`;
}

function promptOportunidade(qtd, local, segs, exclusao) {
  return `Você é consultor especialista em prospecção de serviços SST (Segurança e Saúde do Trabalho).
Encontre EXATAMENTE ${qtd} oportunidades em ${local} — segmentos: ${segs}.${exclusao}

PRIORIDADE: recém-abertas (<3 anos), alto risco (construção, metal, química, transporte), >5 funcionários sem SST visível.
${CONTACT_RULES}
Score 0-100: 90-100=alta necessidade, 75-89=setor prioritário, 50-74=médio, <50=baixo.

JSON (${qtd} itens):
{"empresas":[{"nome":"Razão Social","nome_fantasia":"Nome","cnpj":"XX.XXX.XXX/XXXX-XX","situacao":"Ativa","porte":"ME","municipio":"Cidade - UF","atividade":"construção","telefone":"(11) 9999-9999","whatsapp":"5511999999999","email":"email@empresa.com","site":"https://site.com","score":87,"justificativa":"Empresa de construção aberta em 2023, 12 funcionários. Necessita PGR, PCMSO, NRs."}]}`;
}

function promptAmplaBrasil(qtd, estado, segs, exclusao) {
  const localStr = estado ? `priorizando ${estado}, mas pode expandir para outros estados` : "em todo o Brasil";
  return `Você é especialista em prospecção comercial de SST. Busque empresas brasileiras recém-abertas ou em crescimento com alto potencial de contratar serviços de SST.
Busca ${localStr}. Segmentos prioritários: ${segs}.${exclusao}

PRIORIZE:
- Empresas abertas nos últimos 3 anos (data de abertura recente)
- Setores de alto risco: construção civil, metalurgia, mineração, química, transporte, indústria
- Empresas com >5 funcionários sem fornecedor SST visível
- Em expansão ou com múltiplas unidades
${CONTACT_RULES}
Retorne EXATAMENTE ${qtd} empresas. Inclua data de abertura quando disponível.
Score 0-100 de oportunidade SST.

JSON (${qtd} itens):
{"empresas":[{"nome":"Razão Social","nome_fantasia":"Nome","cnpj":"XX.XXX.XXX/XXXX-XX","situacao":"Ativa","porte":"ME","municipio":"Cidade - UF","atividade":"construção","data_abertura":"2022-03-15","telefone":"(11) 9999-9999","whatsapp":"5511999999999","email":"email@empresa.com","site":"https://site.com","score":91,"justificativa":"Empresa de construção aberta em 2022. Alto risco. Sem SST identificado."}]}`;
}

// ══════════════════════════════════════════════════════════════════════════
//  REGIÕES DE EXPANSÃO
// ══════════════════════════════════════════════════════════════════════════
function getRegioes(cidade, estado) {
  if (!cidade) return [estado || "Brasil"];
  return [
    cidade + (estado ? ` ${estado}` : ""),
    `região metropolitana de ${cidade}` + (estado ? ` ${estado}` : ""),
    `cidades próximas de ${cidade}` + (estado ? ` no estado de ${estado}` : ""),
    estado || "Brasil",
  ];
}

// ══════════════════════════════════════════════════════════════════════════
//  EXTRAÇÃO DE EMPRESAS DO TEXTO
// ══════════════════════════════════════════════════════════════════════════
function extrairEmpresas(text, existingSet) {
  const found = [];

  // 1. Tentar JSON completo
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s !== -1 && e !== -1) {
    try {
      const obj = JSON.parse(text.substring(s, e + 1));
      const arr = obj.empresas || obj.results || (Array.isArray(obj) ? obj : []);
      for (const emp of arr) {
        if (!isValidCNPJ(emp.cnpj) || isExcluded(emp)) continue;
        const k = getKey(emp);
        if (!k || existingSet.has(k)) continue;
        const limpa = cleanCompany(emp);
        if (!hasValidContact(limpa)) continue;
        existingSet.add(k);
        found.push(limpa);
      }
      if (found.length) return found;
    } catch {}
  }

  // 2. Extração incremental por objeto
  const matches = [...text.matchAll(/\{[^{}]{50,}?"cnpj"\s*:\s*"[^"]+[^{}]*\}/g)];
  for (const m of matches) {
    try {
      let obj = m[0];
      const op = (obj.match(/\{/g) || []).length;
      const cl = (obj.match(/\}/g) || []).length;
      if (op > cl) obj += "}".repeat(op - cl);
      const emp = JSON.parse(obj);
      if (!isValidCNPJ(emp.cnpj) || isExcluded(emp)) continue;
      const k = getKey(emp);
      if (!k || existingSet.has(k)) continue;
      const limpa = cleanCompany(emp);
      if (!hasValidContact(limpa)) continue;
      existingSet.add(k);
      found.push(limpa);
    } catch {}
  }
  return found;
}

// ══════════════════════════════════════════════════════════════════════════
//  CHAMADA ANTHROPIC — STREAMING SSE
// ══════════════════════════════════════════════════════════════════════════
function callAnthropic(systemPrompt, userMsg) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3500,
      stream: true,
      system: systemPrompt,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: userMsg }],
    });
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
        "Content-Length": Buffer.byteLength(body, "utf8"),
      },
    };
    let fullText = "";
    let buffer   = "";
    const req = https.request(opts, (res) => {
      res.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const p = line.slice(6).trim();
          if (p === "[DONE]") continue;
          try {
            const ev = JSON.parse(p);
            if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
              fullText += ev.delta.text || "";
            }
          } catch {}
        }
      });
      res.on("end", () => resolve(fullText));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.write(body);
    req.end();
  });
}

// ══════════════════════════════════════════════════════════════════════════
//  HANDLER
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

  let rawBody = "";
  await new Promise(r => { req.on("data", c => rawBody += c); req.on("end", r); });
  let payload = {};
  try { payload = JSON.parse(rawBody); } catch { res.status(400).json({ error: "Body inválido" }); return; }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(200).json({ query: payload.query || "", total: 0, empresas: [], obs: "API key não configurada" });
    return;
  }

  const {
    query    = "",
    qtd      = 5,
    filtro   = "todos",
    tipoBusca = "filtrada",
    cidade   = "",
    estado   = "",
    segmentos = [],
    existingCnpjs = [],
  } = payload;

  // Quantidade solicitada — respeitar sempre
  const qtdSolicitada = Math.max(1, Math.min(parseInt(qtd) || 5, 20));
  const filtroStr = { ativa: "Ativas", mei: "MEI", epp: "ME/EPP" }[filtro] || "qualquer porte";
  const segsStr   = Array.isArray(segmentos) && segmentos.length
    ? segmentos.join(", ")
    : "Construção Civil, Indústria, Transporte, Metalurgia";

  // Conjunto de CNPJs já existentes (para "buscar mais")
  const existingSet = new Set(existingCnpjs.map(c => c.replace(/\D/g, "")).filter(Boolean));

  // Streaming para o frontend
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("X-Accel-Buffering", "no");
  res.status(200);

  const emitted = new Set(existingSet); // CNPJs já enviados (inclui os existentes)
  const collected = [];                 // empresas coletadas nesta sessão

  const emit = (arr) => {
    for (const e of arr) {
      const k = getKey(e);
      if (!k || emitted.has(k)) continue;
      emitted.add(k);
      collected.push(e);
      res.write(JSON.stringify({ type: "empresa", data: e }) + "\n");
    }
  };

  const sendStatus = (msg) => res.write(JSON.stringify({ type: "status", msg }) + "\n");
  const sendError  = (msg) => res.write(JSON.stringify({ type: "error",  msg }) + "\n");

  try {
    // ── Estratégia de expansão geográfica ────────────────────────────────
    const regioes = tipoBusca === "ampla_brasil"
      ? [estado || "Brasil", "Sul do Brasil", "Nordeste do Brasil", "Brasil inteiro"]
      : getRegioes(cidade, estado);

    let tentativa = 0;

    for (const regiao of regioes) {
      if (collected.length >= qtdSolicitada) break;
      tentativa++;

      const faltam = qtdSolicitada - collected.length;
      // Pedir 2× o faltante para compensar filtragem
      const pedirQtd = Math.min(faltam * 2, 20);

      const exclusaoStr = existingCnpjs.length
        ? ` Não repita CNPJs: ${[...emitted].slice(0, 8).join(", ")}.`
        : "";

      // Montar prompt e mensagem
      let systemPrompt, userMsg;
      if (tipoBusca === "oportunidade") {
        systemPrompt = promptOportunidade(pedirQtd, regiao, segsStr, exclusaoStr);
        userMsg      = `Encontre ${pedirQtd} oportunidades SST com contato completo em: ${regiao}`;
      } else if (tipoBusca === "ampla_brasil") {
        systemPrompt = promptAmplaBrasil(pedirQtd, regiao === "Brasil" ? "" : regiao, segsStr, exclusaoStr);
        userMsg      = `Encontre ${pedirQtd} empresas recém-abertas com alto potencial SST. ${regiao !== "Brasil" ? `Foque em ${regiao}.` : "Busca Brasil."} Contato obrigatório.`;
      } else {
        const localStr = query || [cidade, estado].filter(Boolean).join(" ") || "Brasil";
        systemPrompt   = promptFiltrada(pedirQtd, regiao, filtroStr, exclusaoStr);
        userMsg        = `Busque ${pedirQtd} empresas com contato completo para: ${localStr}`;
      }

      if (tentativa === 1) {
        sendStatus(`🔍 Buscando em ${regiao}...`);
      } else {
        sendStatus(`🌐 Expandindo para ${regiao} (${collected.length}/${qtdSolicitada} encontradas)...`);
      }

      try {
        const text = await callAnthropic(systemPrompt, userMsg);
        const novas = extrairEmpresas(text, emitted);
        emit(novas);

        if (collected.length < qtdSolicitada && tentativa < regioes.length) {
          sendStatus(`📍 ${collected.length}/${qtdSolicitada} — expandindo região...`);
        }
      } catch (e) {
        if (e.message?.includes("Timeout") && tentativa === 1) {
          sendError("Timeout na primeira tentativa — tente com menos resultados ou query mais específica");
          break;
        }
        // Se timeout em tentativa subsequente, continua com o que tem
      }
    }

    // ── Resultado final ──────────────────────────────────────────────────
    if (collected.length === 0) {
      sendError("Nenhuma empresa com contato válido encontrada — tente outro segmento ou região");
    } else if (collected.length < qtdSolicitada) {
      res.write(JSON.stringify({
        type: "aviso",
        msg:  `Encontradas ${collected.length} de ${qtdSolicitada} solicitadas — não há mais empresas válidas com contato para esta região/segmento.`
      }) + "\n");
    }

  } catch (err) {
    const msg = err.message || "Erro desconhecido";
    if (msg.includes("429") || msg.includes("rate_limit")) {
      sendError("Rate limit da API — aguarde 60s e tente novamente");
    } else {
      sendError(msg);
    }
  }

  res.write(JSON.stringify({ type: "done", total: collected.length }) + "\n");
  res.end();
};
