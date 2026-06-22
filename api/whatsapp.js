// ═══════════════════════════════════════════════════════════════
//   RISE SST — Proxy interno para WhatsApp (Evolution API)
//   Centraliza chamadas externas no backend. O frontend nunca mais
//   faz fetch() direto para o domínio da Evolution API — só chama
//   estas rotas internas, que tratam erro e normalizam a resposta.
//
//   NOTA DE ARQUITETURA: a URL/API key/instância da Evolution API
//   são configuradas POR USUÁRIO/CLIENTE da plataforma (cada cliente
//   final tem sua própria instância de WhatsApp), não são segredos
//   globais do servidor RISE SST. Por isso continuam sendo enviadas
//   no corpo da requisição (vindas do localStorage do usuário, já
//   configuradas em Configurações) em vez de variáveis de ambiente
//   fixas — diferente de ANTHROPIC_API_KEY/DATABASE_URL, que são
//   segredos únicos do servidor. O que este proxy resolve é: (1) o
//   navegador do cliente final nunca abre conexão direta com o
//   domínio da Evolution API, e (2) erros 404/401/timeout são
//   normalizados em respostas consistentes e logadas no servidor.
// ═══════════════════════════════════════════════════════════════

const https = require("https");
const http = require("http");

function callEvolutionAPI(baseUrl, path, apiKey, body) {
  return new Promise((resolve, reject) => {
    let target;
    try { target = new URL(baseUrl.replace(/\/$/, "") + path); }
    catch { reject(new Error("invalid_url")); return; }

    const mod = target.protocol === "http:" ? http : https;
    const bodyStr = JSON.stringify(body || {});
    const startedAt = Date.now();

    const req = mod.request({
      hostname: target.hostname,
      port: target.port || (target.protocol === "http:" ? 80 : 443),
      path: target.pathname + (target.search || ""),
      method: "POST",
      timeout: 20000,
      headers: {
        "Content-Type": "application/json",
        "apikey": apiKey,
        "Content-Length": Buffer.byteLength(bodyStr, "utf8"),
      },
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        const elapsedMs = Date.now() - startedAt;
        let parsed = null;
        try { parsed = JSON.parse(data); } catch {}
        resolve({ statusCode: res.statusCode, body: parsed, raw: data, elapsedMs });
      });
    });
    req.on("error", (e) => reject(e));
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.write(bodyStr);
    req.end();
  });
}

// ── Normaliza o resultado da Evolution API em algo previsível para o frontend ──
function normalizeResult(result, context) {
  const { statusCode, body } = result;
  const baseLog = { ...context, statusHttp: statusCode, tempoMs: result.elapsedMs, dataHora: new Date().toISOString() };

  if (statusCode === 401 || statusCode === 403) {
    console.log("[WA_PROXY]", JSON.stringify({ ...baseLog, resultado: "erro_auth" }));
    return { ok: false, errorType: "auth", status: 401, error: "Erro de autenticação com a API de WhatsApp. Verifique o token nas configurações." };
  }
  if (statusCode === 404) {
    console.log("[WA_PROXY]", JSON.stringify({ ...baseLog, resultado: "instancia_nao_encontrada" }));
    return { ok: false, errorType: "instance_not_found", status: 404, error: `Instância WhatsApp não encontrada ou inativa: ${context.instance}.` };
  }
  if (statusCode >= 500) {
    console.log("[WA_PROXY]", JSON.stringify({ ...baseLog, resultado: "erro_servidor_evolution" }));
    return { ok: false, errorType: "upstream_error", status: 502, error: "Falha ao conectar com o serviço de WhatsApp. Tente novamente em alguns instantes." };
  }
  if (statusCode < 200 || statusCode >= 300) {
    console.log("[WA_PROXY]", JSON.stringify({ ...baseLog, resultado: "erro_desconhecido" }));
    return { ok: false, errorType: "unknown", status: statusCode, error: "Não foi possível concluir a busca. Verifique a conexão com a API ou tente novamente." };
  }
  console.log("[WA_PROXY]", JSON.stringify({ ...baseLog, resultado: "sucesso" }));
  return { ok: true, data: body };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Use POST" }); return; }

  let body = req.body;
  if (!body || typeof body !== "object") {
    let raw = "";
    await new Promise(r => { req.on("data", c => raw += c); req.on("end", r); });
    try { body = JSON.parse(raw); } catch { res.status(400).json({ error: "Body inválido" }); return; }
  }

  const { action, apiUrl, apiKey, instance, clientId, chatId, remoteJid, page, limit, startDate, endDate, search } = body;

  if (!apiUrl || !apiKey || !instance) {
    res.status(400).json({ ok: false, errorType: "config_missing", error: "Configuração de WhatsApp incompleta. Verifique URL, token e instância em Configurações." });
    return;
  }

  const context = { instance, clientId: clientId || null, action };

  try {
    if (action === "test") {
      // ── Teste de conexão completo: API responde + instância existe + endpoints básicos ──
      const r = await callEvolutionAPI(apiUrl, "/instance/fetchInstances", apiKey, {});
      if (r.statusCode === 401 || r.statusCode === 403) {
        res.status(200).json({ ok: false, errorType: "auth", error: "Erro de autenticação com a API de WhatsApp. Verifique o token nas configurações." });
        return;
      }
      if (r.statusCode < 200 || r.statusCode >= 300) {
        res.status(200).json({ ok: false, errorType: "unknown", error: "Falha ao conectar com o serviço de WhatsApp. Tente novamente em alguns instantes." });
        return;
      }
      const arr = Array.isArray(r.body) ? r.body : [r.body];
      const found = arr.find(i => (i?.instance?.instanceName || i?.instanceName || i?.name) === instance);
      if (!found) {
        res.status(200).json({ ok: false, errorType: "instance_not_found", error: `Instância WhatsApp não encontrada ou inativa: ${instance}.`, instancesFound: arr.length });
        return;
      }
      const state = found.instance?.state || found.connectionStatus || found.state || "";
      res.status(200).json({ ok: true, instanceFound: true, state, instancesFound: arr.length });
      return;
    }

    if (action === "chats") {
      const payload = search ? { where: { pushName: search } } : {};
      const result = await callEvolutionAPI(apiUrl, `/chat/findChats/${instance}`, apiKey, payload);
      const normalized = normalizeResult(result, context);
      if (!normalized.ok) { res.status(200).json(normalized); return; }
      const rawList = Array.isArray(normalized.data) ? normalized.data : (normalized.data?.chats || normalized.data?.data || []);
      const chats = rawList
        .filter(c => !(c.id || c.remoteJid || "").includes("@g.us"))
        .map(c => ({
          id: c.id || c.remoteJid || "",
          name: c.pushName || c.name || "",
          phone: (c.id || c.remoteJid || "").replace(/@s\.whatsapp\.net|@c\.us/g, ""),
          lastMessageAt: c.updatedAt || null,
        }));
      res.status(200).json({ ok: true, chats });
      return;
    }

    if (action === "messages") {
      const where = {};
      if (remoteJid || chatId) where.key = { remoteJid: remoteJid || chatId };
      const result = await callEvolutionAPI(apiUrl, `/chat/findMessages/${instance}`, apiKey, {
        where, limit: limit || 200,
      });
      const normalized = normalizeResult(result, context);
      if (!normalized.ok) { res.status(200).json(normalized); return; }
      const rawList = Array.isArray(normalized.data) ? normalized.data : (normalized.data?.messages?.records || normalized.data?.messages || []);
      let messages = rawList.map(m => ({
        id: m.key?.id || "",
        fromMe: !!m.key?.fromMe,
        text: m.message?.conversation || m.message?.extendedTextMessage?.text || "",
        timestamp: m.messageTimestamp || null,
      }));
      if (startDate) { const s = new Date(startDate).getTime() / 1000; messages = messages.filter(m => !m.timestamp || m.timestamp >= s); }
      if (endDate)   { const e = new Date(endDate).getTime() / 1000;   messages = messages.filter(m => !m.timestamp || m.timestamp <= e); }
      res.status(200).json({ ok: true, messages, empty: messages.length === 0 });
      return;
    }

    res.status(400).json({ ok: false, error: "Ação desconhecida: " + action });
  } catch (err) {
    const msg = String(err.message || err);
    console.log("[WA_PROXY] erro de rede:", JSON.stringify({ ...context, erro: msg, dataHora: new Date().toISOString() }));
    if (msg === "timeout") {
      res.status(200).json({ ok: false, errorType: "network", error: "Falha ao conectar com o serviço de WhatsApp. Tente novamente em alguns instantes." });
    } else if (msg === "invalid_url") {
      res.status(200).json({ ok: false, errorType: "config_missing", error: "URL da API de WhatsApp configurada é inválida. Verifique em Configurações." });
    } else {
      res.status(200).json({ ok: false, errorType: "network", error: "Falha ao conectar com o serviço de WhatsApp. Tente novamente em alguns instantes." });
    }
  }
};
