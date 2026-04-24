// ═══════════════════════════════════════════════════════════════
//   RISE SST — API de Usuários Multi-Tenant
//   POST /api/usuarios  { action, ...payload }
//   Ações: list, get, create, update, delete, addCredit
// ═══════════════════════════════════════════════════════════════

const https = require("https");

// ── Neon DB query helper ──
function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!dbUrl) { reject(new Error("DATABASE_URL não configurada")); return; }
    let Client;
    try { Client = require("@neondatabase/serverless").Client; }
    catch(e) { Client = require("pg").Client; }
    const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    client.connect().then(() => {
      return client.query(sql, params);
    }).then(result => {
      client.end();
      resolve({ rows: result.rows });
    }).catch(err => {
      client.end().catch(()=>{});
      reject(err);
    });
  });
}

// ── Init tables ──
async function initTables() {
  const sqls = [
    // Users table
    `CREATE TABLE IF NOT EXISTS rise_users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(200) NOT NULL,
      nome VARCHAR(200) NOT NULL,
      email VARCHAR(200),
      empresa VARCHAR(200),
      logo_url TEXT,
      is_master BOOLEAN DEFAULT FALSE,
      ativo BOOLEAN DEFAULT TRUE,
      plano VARCHAR(50) DEFAULT 'starter',
      -- Products access
      acesso_buscador BOOLEAN DEFAULT TRUE,
      acesso_whatsapp BOOLEAN DEFAULT TRUE,
      acesso_crm BOOLEAN DEFAULT TRUE,
      acesso_ia BOOLEAN DEFAULT TRUE,
      -- Credit limits
      limite_busca INTEGER DEFAULT 25,
      limite_disparo INTEGER DEFAULT 200,
      busca_usada INTEGER DEFAULT 0,
      disparo_usado INTEGER DEFAULT 0,
      busca_reset_at TIMESTAMPTZ DEFAULT NOW(),
      disparo_reset_at TIMESTAMPTZ DEFAULT NOW(),
      -- Metadata
      criado_em TIMESTAMPTZ DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ DEFAULT NOW(),
      criado_por VARCHAR(100),
      obs TEXT
    )`,
    // Activity log
    `CREATE TABLE IF NOT EXISTS rise_user_activity (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) NOT NULL,
      tipo VARCHAR(50) NOT NULL,
      descricao TEXT,
      dados JSONB,
      criado_em TIMESTAMPTZ DEFAULT NOW()
    )`,
    // Insert master user if not exists
    `INSERT INTO rise_users (username, password, nome, email, is_master, plano,
      limite_busca, limite_disparo, acesso_buscador, acesso_whatsapp, acesso_crm, acesso_ia)
     VALUES ('gustavo1996c', '1996', 'Gustavo', 'gustavo.carvalho@swgconsulting.com.br',
       TRUE, 'master', 999999, 999999, TRUE, TRUE, TRUE, TRUE)
     ON CONFLICT (username) DO UPDATE SET is_master = TRUE, limite_busca = 999999, limite_disparo = 999999`,
  ];
  for (const sql of sqls) {
    try { await query(sql); } catch(e) { console.warn("init:", e.message); }
  }
}

// ── Notify master when user is low on credits ──
async function checkLowCredits(username) {
  try {
    const r = await query(
      `SELECT u.username, u.nome, u.empresa,
        (u.limite_busca - u.busca_usada) AS busca_restante,
        (u.limite_disparo - u.disparo_usado) AS disparo_restante
       FROM rise_users u WHERE u.username = $1`,
      [username]
    );
    if (!r.rows.length) return;
    const u = r.rows[0];
    const alerts = [];
    if (u.busca_restante <= 5 && u.busca_restante >= 0) {
      alerts.push(`💎 Buscas: ${u.busca_restante} restantes`);
    }
    if (u.disparo_restante <= 5 && u.disparo_restante >= 0) {
      alerts.push(`📱 Disparos: ${u.disparo_restante} restantes`);
    }
    if (alerts.length > 0) {
      // Store alert for master
      await query(
        `INSERT INTO rise_user_activity (username, tipo, descricao, dados)
         VALUES ('MASTER', 'alerta_credito', $1, $2)`,
        [
          `${u.empresa || u.nome} está com créditos baixos`,
          JSON.stringify({ user: username, nome: u.nome, empresa: u.empresa, alerts })
        ]
      );
    }
  } catch(e) { console.warn("checkLowCredits:", e.message); }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-master-key");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  try { await initTables(); } catch(e) { console.warn("initTables:", e.message); }

  // Parse body
  let body = req.body;
  if (!body || typeof body !== "object") {
    let raw = "";
    await new Promise(r => { req.on("data", c => raw += c); req.on("end", r); });
    try { body = JSON.parse(raw); } catch(e) { res.status(400).json({ error: "Body inválido" }); return; }
  }

  const { action } = body;

  // ── LIST users ──
  if (action === "list") {
    const r = await query(
      `SELECT id, username, nome, email, empresa, logo_url, is_master, ativo, plano,
        acesso_buscador, acesso_whatsapp, acesso_crm, acesso_ia,
        limite_busca, limite_disparo, busca_usada, disparo_usado,
        criado_em, criado_por, obs
       FROM rise_users ORDER BY is_master DESC, criado_em ASC`
    );
    res.status(200).json({ users: r.rows });
    return;
  }

  // ── GET single user ──
  if (action === "get") {
    const { username } = body;
    const r = await query("SELECT * FROM rise_users WHERE username = $1", [username]);
    if (!r.rows.length) { res.status(404).json({ error: "Usuário não encontrado" }); return; }
    res.status(200).json({ user: r.rows[0] });
    return;
  }

  // ── LOGIN ──
  if (action === "login") {
    const { username, password } = body;
    const r = await query(
      "SELECT * FROM rise_users WHERE username = $1 AND password = $2 AND ativo = TRUE",
      [username, password]
    );
    if (!r.rows.length) { res.status(401).json({ error: "Usuário ou senha incorretos" }); return; }
    const user = r.rows[0];
    // Log activity
    await query(
      "INSERT INTO rise_user_activity (username, tipo, descricao) VALUES ($1, 'login', 'Login realizado')",
      [username]
    );
    res.status(200).json({ ok: true, user });
    return;
  }

  // ── CREATE user ──
  if (action === "create") {
    const { username, password, nome, email, empresa, logo_url, plano,
      acesso_buscador, acesso_whatsapp, acesso_crm, acesso_ia,
      limite_busca, limite_disparo, obs, criado_por } = body;

    if (!username || !password || !nome) {
      res.status(400).json({ error: "username, password e nome são obrigatórios" }); return;
    }

    try {
      await query(
        `INSERT INTO rise_users
          (username, password, nome, email, empresa, logo_url, plano,
           acesso_buscador, acesso_whatsapp, acesso_crm, acesso_ia,
           limite_busca, limite_disparo, obs, criado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [username, password, nome, email||null, empresa||null, logo_url||null,
         plano||'starter',
         acesso_buscador !== false, acesso_whatsapp !== false,
         acesso_crm !== false, acesso_ia !== false,
         limite_busca||25, limite_disparo||200, obs||null, criado_por||'master']
      );
      await query(
        "INSERT INTO rise_user_activity (username, tipo, descricao, dados) VALUES ($1,$2,$3,$4)",
        ['MASTER', 'criar_usuario', `Usuário ${username} criado`, JSON.stringify({ username, nome, empresa })]
      );
      res.status(200).json({ ok: true });
    } catch(e) {
      if (e.message.includes('unique') || e.message.includes('duplicate')) {
        res.status(409).json({ error: "Nome de usuário já existe" });
      } else {
        res.status(500).json({ error: e.message });
      }
    }
    return;
  }

  // ── UPDATE user ──
  if (action === "update") {
    const { username } = body;
    if (!username) { res.status(400).json({ error: "username obrigatório" }); return; }
    const fields = ['nome','email','empresa','logo_url','plano','ativo',
      'acesso_buscador','acesso_whatsapp','acesso_crm','acesso_ia',
      'limite_busca','limite_disparo','obs'];
    const updates = [];
    const vals = [];
    fields.forEach(f => {
      if (body[f] !== undefined) { updates.push(`${f} = $${vals.length+1}`); vals.push(body[f]); }
    });
    if (body.password) { updates.push(`password = $${vals.length+1}`); vals.push(body.password); }
    if (!updates.length) { res.status(400).json({ error: "Nada para atualizar" }); return; }
    updates.push(`atualizado_em = NOW()`);
    vals.push(username);
    await query(`UPDATE rise_users SET ${updates.join(',')} WHERE username = $${vals.length}`, vals);
    res.status(200).json({ ok: true });
    return;
  }

  // ── DELETE user ──
  if (action === "delete") {
    const { username } = body;
    if (!username) { res.status(400).json({ error: "username obrigatório" }); return; }
    await query("UPDATE rise_users SET ativo = FALSE WHERE username = $1", [username]);
    res.status(200).json({ ok: true });
    return;
  }

  // ── CONSUME credit ──
  if (action === "consumeCredit") {
    const { username, tipo, amount } = body; // tipo: 'busca' | 'disparo'
    const n = amount || 1;
    const col = tipo === 'disparo' ? 'disparo_usado' : 'busca_usada';
    const lim = tipo === 'disparo' ? 'limite_disparo' : 'limite_busca';
    const r = await query(`SELECT ${lim}, ${col} FROM rise_users WHERE username = $1`, [username]);
    if (!r.rows.length) { res.status(404).json({ error: "Usuário não encontrado" }); return; }
    const { [lim]: limite, [col]: usado } = r.rows[0];
    const isMaster = r.rows[0].is_master;
    if (!isMaster && usado >= limite) {
      res.status(402).json({ error: "Créditos esgotados", remaining: 0 });
      return;
    }
    await query(`UPDATE rise_users SET ${col} = ${col} + $1 WHERE username = $2`, [n, username]);
    const remaining = Math.max(0, limite - usado - n);
    await checkLowCredits(username);
    res.status(200).json({ ok: true, remaining });
    return;
  }

  // ── ADD credit ──
  if (action === "addCredit") {
    const { username, tipo, amount } = body;
    const col = tipo === 'disparo' ? 'disparo_usado' : 'busca_usada';
    // Decrease used (add credit back)
    await query(`UPDATE rise_users SET ${col} = GREATEST(0, ${col} - $1) WHERE username = $2`, [amount||25, username]);
    await query(
      "INSERT INTO rise_user_activity (username, tipo, descricao, dados) VALUES ($1,$2,$3,$4)",
      ['MASTER', 'add_credit', `Crédito adicionado para ${username}`, JSON.stringify({ tipo, amount })]
    );
    res.status(200).json({ ok: true });
    return;
  }

  // ── ACTIVITY LOG ──
  if (action === "activity") {
    const { username, limit: lim } = body;
    let sql = "SELECT * FROM rise_user_activity";
    const params = [];
    if (username && username !== 'ALL') {
      sql += " WHERE username = $1";
      params.push(username);
    }
    sql += ` ORDER BY criado_em DESC LIMIT ${lim || 100}`;
    const r = await query(sql, params);
    res.status(200).json({ activity: r.rows });
    return;
  }

  // ── ALERTS for master ──
  if (action === "alerts") {
    const r = await query(
      `SELECT * FROM rise_user_activity 
       WHERE username = 'MASTER' AND tipo = 'alerta_credito' 
       ORDER BY criado_em DESC LIMIT 20`
    );
    res.status(200).json({ alerts: r.rows });
    return;
  }

  res.status(400).json({ error: "Ação não reconhecida: " + action });
};
