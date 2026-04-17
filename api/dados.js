// Serverless API: persiste dados do WA module via Vercel KV (ou fallback em memória)
// Para produção: configure VERCEL_KV no painel da Vercel

let memCache = {}; // fallback in-memory (perde ao reiniciar — use KV em produção)

async function getKV(key) {
  try {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const { kv } = await import('@vercel/kv');
      return await kv.get(key);
    }
  } catch(e) {}
  return memCache[key] || null;
}

async function setKV(key, value) {
  try {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const { kv } = await import('@vercel/kv');
      await kv.set(key, value);
      return;
    }
  } catch(e) {}
  memCache[key] = value;
}

async function delKV(key) {
  try {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const { kv } = await import('@vercel/kv');
      await kv.del(key);
      return;
    }
  } catch(e) {}
  delete memCache[key];
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-user-key");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  const userKey = req.headers['x-user-key'] || 'shared';
  const storeKey = `rise_wa_${userKey}`;

  if (req.method === "GET") {
    const data = await getKV(storeKey);
    res.status(200).json(data || {
      contacts: [], listas: [], logs: [], crm: [],
      fila: [], agendamentos: [], savedmsg: '', config: {}
    });
    return;
  }

  if (req.method === "POST") {
    await setKV(storeKey, req.body);
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === "DELETE") {
    await delKV(storeKey);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
};
