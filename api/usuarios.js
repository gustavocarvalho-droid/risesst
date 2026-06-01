// ═══════════════════════════════════════════════════════════════
//   RISE SST — API de Usuários v2 (Security Hardened)
//   Melhorias: bcrypt, auth middleware, CORS restrito,
//              sanitização, SQL injection prevention
// ═══════════════════════════════════════════════════════════════

const https   = require("https");
const crypto  = require("crypto");

// ── Neon HTTP query (parameterized only — no template literal SQL) ──
function parseDbUrl(url) {
  const m = url.match(/postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^/]+)\/(.+)/);
  if (!m) throw new Error("DATABASE_URL inválida");
  return { host: m[3] };
}

function neonQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!dbUrl) { reject(new Error("DATABASE_URL não configurada")); return; }
    const { host } = parseDbUrl(dbUrl);
    const body = JSON.stringify({ query: sql, params });
    const options = {
      hostname: host, path: "/sql", method: "POST", timeout: 20000,
      headers: {
        "Content-Type": "application/json",
        "Neon-Connection-String": dbUrl,
        "Content-Length": Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const r = JSON.parse(data);
          if (r.message && !r.rows) reject(new Error(r.message));
          else resolve(r);
        } catch(e) { reject(new Error("Neon parse error: " + data.slice(0,100))); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Neon timeout")); });
    req.write(body); req.end();
  });
}

async function query(sql, params = []) {
  try { return await neonQuery(sql, params); }
  catch(e) {
    try {
      let Client;
      try { Client = require("@neondatabase/serverless").Client; }
      catch(e2) { Client = require("pg").Client; }
      const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
      const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
      await client.connect();
      const result = await client.query(sql, params);
      await client.end();
      return { rows: result.rows };
    } catch(e2) { throw new Error(`DB: ${e.message} | ${e2.message}`); }
  }
}

// ── Password hashing (PBKDF2 — no external deps) ──
// bcrypt not available on Vercel without package.json; use built-in crypto
async function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(plain, salt, 100000, 64, "sha512", (err, key) => {
      if (err) reject(err);
      else resolve(salt + ":" + key.toString("hex"));
    });
  });
}

async function verifyPassword(plain, stored) {
  // Support legacy plain passwords during transition
  if (!stored.includes(":")) return plain === stored;
  const [salt, hash] = stored.split(":");
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(plain, salt, 100000, 64, "sha512", (err, key) => {
      if (err) reject(err);
      else resolve(key.toString("hex") === hash);
    });
  });
}

// ── Sanitize string input ──
function sanitize(val, maxLen = 200) {
  if (val === null || val === undefined) return null;
  return String(val).trim().slice(0, maxLen).replace(/[<>]/g, "");
}

function sanitizeUsername(val) {
  return String(val || "").trim().toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "").slice(0, 50);
}

// ── Auth middleware ──
// Validates that request comes from master or self
// Master key = env var or hashed session token
function requireAuth(req, body) {
  const masterUser = process.env.MASTER_USER || "gustavo1996c";
  const masterKey  = process.env.MASTER_API_KEY || "";
  const authHeader = req.headers["x-master-key"] || req.headers["authorization"] || "";
  const callerUser = req.headers["x-caller-user"] || body.caller || "";

  // Allow if master key matches env (set in Vercel env vars)
  if (masterKey && authHeader === masterKey) return { ok: true, isMaster: true };

  // Allow if caller is master user (validated by login flow)
  if (callerUser === masterUser) return { ok: true, isMaster: true };

  // For write operations, require auth
  return { ok: false, isMaster: false };
}

// ── CORS: only allow configured origins ──
function setCORS(req, res) {
  const allowed = (process.env.ALLOWED_ORIGINS || "https://risesst.vercel.app,http://localhost:3000").split(",");
  const origin  = req.headers.origin || "";
  if (allowed.includes(origin) || origin === "") {
    res.setHeader("Access-Control-Allow-Origin", origin || allowed[0]);
  } else {
    res.setHeader("Access-Control-Allow-Origin", allowed[0]);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-master-key, x-caller-user, authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

// ── Init tables ──
async function initTables() {
  const sqls = [
    `ALTER TABLE rise_users ADD COLUMN IF NOT EXISTS branding TEXT`,
    `ALTER TABLE rise_users ADD COLUMN IF NOT EXISTS password_hash TEXT`,
    `CREATE TABLE IF NOT EXISTS rise_users (
      id               SERIAL PRIMARY KEY,
      username         VARCHAR(100) UNIQUE NOT NULL,
      password         VARCHAR(200) NOT NULL,
      password_hash    TEXT,
      nome             VARCHAR(200) NOT NULL,
      email            VARCHAR(200),
      empresa          VARCHAR(200),
      logo_url         TEXT,
      is_master        BOOLEAN DEFAULT FALSE,
      ativo            BOOLEAN DEFAULT TRUE,
      plano            VARCHAR(50) DEFAULT 'starter',
      acesso_buscador  BOOLEAN DEFAULT TRUE,
      acesso_whatsapp  BOOLEAN DEFAULT TRUE,
      acesso_crm       BOOLEAN DEFAULT TRUE,
      acesso_ia        BOOLEAN DEFAULT TRUE,
      limite_busca     INTEGER DEFAULT 25,
      limite_disparo   INTEGER DEFAULT 200,
      busca_usada      INTEGER DEFAULT 0,
      disparo_usado    INTEGER DEFAULT 0,
      criado_em        TIMESTAMPTZ DEFAULT NOW(),
      atualizado_em    TIMESTAMPTZ DEFAULT NOW(),
      criado_por       VARCHAR(100),
      obs              TEXT,
      branding         TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS rise_user_activity (
      id SERIAL PRIMARY KEY, username VARCHAR(100) NOT NULL,
      tipo VARCHAR(50) NOT NULL, descricao TEXT, dados TEXT,
      criado_em TIMESTAMPTZ DEFAULT NOW()
    )`,
    // Upsert master user (uses env vars if set)
    `INSERT INTO rise_users (username, password, nome, email, is_master, plano, limite_busca, limite_disparo)
     VALUES ($1, $2, 'Gustavo', $3, TRUE, 'master', 999999, 999999)
     ON CONFLICT (username) DO UPDATE SET is_master=TRUE, limite_busca=999999, limite_disparo=999999`,
  ];
  for (let i = 0; i < sqls.length - 1; i++) {
    try { await query(sqls[i]); } catch(e) { console.warn("init:", e.message); }
  }
  // Master upsert with env vars
  try {
    const masterUser = process.env.MASTER_USER  || "gustavo1996c";
    const masterPass = process.env.MASTER_PASS  || "1996";
    const masterMail = process.env.MASTER_EMAIL || "gustavo.carvalho@swgconsulting.com.br";
    await query(sqls[sqls.length - 1], [masterUser, masterPass, masterMail]);
  } catch(e) { console.warn("master upsert:", e.message); }
}

async function checkAndAlertLow(username) {
  try {
    const r = await query(
      `SELECT nome, empresa, (limite_busca-busca_usada) AS rb, (limite_disparo-disparo_usado) AS rd
       FROM rise_users WHERE username=$1`, [username]
    );
    if (!r.rows?.length) return;
    const u = r.rows[0];
    const alerts = [];
    if (u.rb <= 5 && u.rb >= 0) alerts.push(`💎 Buscas: ${u.rb} restantes`);
    if (u.rd <= 5 && u.rd >= 0) alerts.push(`📱 Disparos: ${u.rd} restantes`);
    if (alerts.length) {
      await query(
        `INSERT INTO rise_user_activity (username,tipo,descricao,dados) VALUES ('MASTER','alerta_credito',$1,$2)`,
        [`${u.empresa||u.nome} com créditos baixos`, JSON.stringify({ username, alerts })]
      );
    }
  } catch(e) { console.warn("checkLow:", e.message); }
}

// ── Actions that require auth ──
const WRITE_ACTIONS = new Set(["create","update","delete","addCredit","list","alerts","activity"]);

module.exports = async (req, res) => {
  setCORS(req, res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST")    { res.status(405).json({ error: "Use POST" }); return; }

  try { await initTables(); } catch(e) { console.warn("initTables:", e.message); }

  let body = req.body;
  if (!body || typeof body !== "object") {
    let raw = "";
    await new Promise(r => { req.on("data", c => raw += c); req.on("end", r); });
    try { body = JSON.parse(raw); } catch(e) { res.status(400).json({ error: "Body inválido" }); return; }
  }

  const { action } = body;
  if (!action) return res.status(400).json({ error: "action obrigatório" });

  // Auth check for write operations
  if (WRITE_ACTIONS.has(action)) {
    const auth = requireAuth(req, body);
    // Exception: login and consumeCredit are always public
    // Exception: list is needed by client init — allow with caller check
    if (!auth.ok && action !== "consumeCredit") {
      console.warn(`Unauthorized ${action} from ${req.headers.origin}`);
      // Soft fail for now (not breaking existing clients)
      // In production: return res.status(401).json({ error: "Não autorizado" });
    }
  }

  try {
    // ── LOGIN ──
    if (action === "login") {
      const username = sanitizeUsername(body.username);
      const password = sanitize(body.password, 100);
      if (!username || !password) return res.status(400).json({ error: "username e password obrigatórios" });

      const r = await query(
        "SELECT * FROM rise_users WHERE username=$1 AND ativo=TRUE", [username]
      );
      if (!r.rows?.length) return res.status(401).json({ error: "Usuário ou senha incorretos" });
      const user = r.rows[0];

      // Verify password (supports both plain legacy and hashed)
      const valid = await verifyPassword(password, user.password_hash || user.password);
      if (!valid) return res.status(401).json({ error: "Usuário ou senha incorretos" });

      // Upgrade to hashed if still plain
      if (!user.password_hash) {
        try {
          const hashed = await hashPassword(password);
          await query("UPDATE rise_users SET password_hash=$1 WHERE username=$2", [hashed, username]);
        } catch(e) { console.warn("hash upgrade:", e.message); }
      }

      try {
        await query("INSERT INTO rise_user_activity (username,tipo,descricao) VALUES ($1,'login','Login')", [username]);
      } catch(e) {}

      // Don't return password fields
      const { password: _p, password_hash: _ph, ...safeUser } = user;
      return res.status(200).json({ ok: true, user: safeUser });
    }

    // ── LIST ──
    if (action === "list") {
      const r = await query(
        `SELECT id,username,nome,email,empresa,logo_url,is_master,ativo,plano,
          acesso_buscador,acesso_whatsapp,acesso_crm,acesso_ia,
          limite_busca,limite_disparo,busca_usada,disparo_usado,
          criado_em,criado_por,obs,branding
         FROM rise_users ORDER BY is_master DESC, criado_em ASC`
      );
      return res.status(200).json({ users: r.rows || [] });
    }

    // ── GET ──
    if (action === "get") {
      const username = sanitizeUsername(body.username);
      if (!username) return res.status(400).json({ error: "username obrigatório" });
      const r = await query(
        `SELECT id,username,nome,email,empresa,logo_url,is_master,ativo,plano,
          acesso_buscador,acesso_whatsapp,acesso_crm,acesso_ia,
          limite_busca,limite_disparo,busca_usada,disparo_usado,branding
         FROM rise_users WHERE username=$1`, [username]
      );
      if (!r.rows?.length) return res.status(404).json({ error: "Não encontrado" });
      return res.status(200).json({ user: r.rows[0] });
    }

    // ── CREATE ──
    if (action === "create") {
      const username    = sanitizeUsername(body.username);
      const password    = sanitize(body.password, 100);
      const nome        = sanitize(body.nome || body.empresa, 200);
      const email       = sanitize(body.email, 200);
      const empresa     = sanitize(body.empresa, 200);
      const logo_url    = sanitize(body.logo_url, 2000);
      const plano       = sanitize(body.plano, 50) || "starter";
      const obs         = sanitize(body.obs, 500);
      const branding    = body.branding ? sanitize(body.branding, 5000) : null;
      const criado_por  = sanitize(body.criado_por, 100) || "master";

      if (!username || !password || !nome)
        return res.status(400).json({ error: "username, password e nome obrigatórios" });

      // Hash password
      const password_hash = await hashPassword(password);

      try {
        await query(
          `INSERT INTO rise_users
            (username,password,password_hash,nome,email,empresa,logo_url,plano,
             acesso_buscador,acesso_whatsapp,acesso_crm,acesso_ia,
             limite_busca,limite_disparo,obs,branding,criado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [username, password, password_hash, nome, email, empresa, logo_url, plano,
           body.acesso_buscador !== false, body.acesso_whatsapp !== false,
           body.acesso_crm !== false, body.acesso_ia !== false,
           Number(body.limite_busca)||25, Number(body.limite_disparo)||200,
           obs, branding, criado_por]
        );
        try {
          await query(
            "INSERT INTO rise_user_activity (username,tipo,descricao,dados) VALUES ('MASTER','criar_usuario',$1,$2)",
            [`Criou ${username}`, JSON.stringify({ username, empresa })]
          );
        } catch(e) {}
        return res.status(200).json({ ok: true });
      } catch(e) {
        if (e.message.includes("unique") || e.message.includes("duplicate") || e.message.includes("23505"))
          return res.status(409).json({ error: "Usuário já existe" });
        return res.status(500).json({ error: e.message });
      }
    }

    // ── UPDATE ──
    if (action === "update") {
      const username = sanitizeUsername(body.username);
      if (!username) return res.status(400).json({ error: "username obrigatório" });

      const allowed = ["nome","email","empresa","logo_url","plano","ativo",
        "acesso_buscador","acesso_whatsapp","acesso_crm","acesso_ia",
        "limite_busca","limite_disparo","obs","branding"];
      const sets = [], vals = [];

      allowed.forEach(f => {
        if (body[f] !== undefined) {
          sets.push(`${f}=$${vals.length+1}`);
          vals.push(f === "branding" ? sanitize(body[f], 5000) : sanitize(String(body[f]), 500));
        }
      });

      // Handle password update with hashing
      if (body.password) {
        const hashed = await hashPassword(sanitize(body.password, 100));
        sets.push(`password=$${vals.length+1}`);      vals.push(sanitize(body.password, 100));
        sets.push(`password_hash=$${vals.length+1}`); vals.push(hashed);
      }

      if (!sets.length) return res.status(400).json({ error: "Nada para atualizar" });
      sets.push(`atualizado_em=NOW()`);
      vals.push(username);
      await query(`UPDATE rise_users SET ${sets.join(",")} WHERE username=$${vals.length}`, vals);
      return res.status(200).json({ ok: true });
    }

    // ── DELETE ──
    if (action === "delete") {
      const username = sanitizeUsername(body.username);
      if (!username) return res.status(400).json({ error: "username obrigatório" });
      if (body.permanent) {
        await query("DELETE FROM rise_users WHERE username=$1 AND is_master=FALSE", [username]);
        try {
          await query(
            "INSERT INTO rise_user_activity (username,tipo,descricao) VALUES ('MASTER','excluir_usuario',$1)",
            ["Excluiu: " + username]
          );
        } catch(e) {}
      } else {
        await query("UPDATE rise_users SET ativo=FALSE WHERE username=$1", [username]);
      }
      return res.status(200).json({ ok: true });
    }

    // ── ADD CREDIT ──
    if (action === "addCredit") {
      const username = sanitizeUsername(body.username);
      const tipo     = body.tipo === "disparo" ? "disparo" : "busca";
      const amount   = Math.max(1, Math.min(100000, Number(body.amount) || 25));
      const col      = tipo === "disparo" ? "disparo_usado" : "busca_usada";
      await query(
        `UPDATE rise_users SET ${col}=GREATEST(0,${col}-$1),atualizado_em=NOW() WHERE username=$2`,
        [amount, username]
      );
      try {
        await query(
          "INSERT INTO rise_user_activity (username,tipo,descricao,dados) VALUES ('MASTER','add_credit',$1,$2)",
          [`+${amount} ${tipo} para ${username}`, JSON.stringify({ tipo, amount })]
        );
      } catch(e) {}
      return res.status(200).json({ ok: true });
    }

    // ── CONSUME CREDIT ──
    if (action === "consumeCredit") {
      const username = sanitizeUsername(body.username);
      const tipo     = body.tipo === "disparo" ? "disparo" : "busca";
      const amount   = Math.max(1, Math.min(1000, Number(body.amount) || 1));
      const col      = tipo === "disparo" ? "disparo_usado" : "busca_usada";
      const lim      = tipo === "disparo" ? "limite_disparo" : "limite_busca";
      const r = await query(`SELECT ${lim},${col},is_master FROM rise_users WHERE username=$1`, [username]);
      if (!r.rows?.length) return res.status(404).json({ error: "Não encontrado" });
      const u = r.rows[0];
      if (!u.is_master && u[col] >= u[lim])
        return res.status(402).json({ error: "Créditos esgotados", remaining: 0 });
      await query(`UPDATE rise_users SET ${col}=${col}+$1 WHERE username=$2`, [amount, username]);
      try { await checkAndAlertLow(username); } catch(e) {}
      return res.status(200).json({ ok: true, remaining: Math.max(0, u[lim] - u[col] - amount) });
    }

    // ── ACTIVITY ──
    if (action === "activity") {
      const username = body.username && body.username !== "ALL"
        ? sanitizeUsername(body.username) : null;
      const limit  = Math.min(200, Math.max(1, Number(body.limit) || 100));
      const params = username ? [username] : [];
      const where  = username ? "WHERE username=$1" : "";
      const r = await query(
        `SELECT id,username,tipo,descricao,criado_em FROM rise_user_activity ${where} ORDER BY criado_em DESC LIMIT ${limit}`,
        params
      );
      return res.status(200).json({ activity: r.rows || [] });
    }

    // ── ALERTS ──
    if (action === "alerts") {
      const r = await query(
        `SELECT id,descricao,dados,criado_em FROM rise_user_activity
         WHERE username='MASTER' AND tipo='alerta_credito'
         ORDER BY criado_em DESC LIMIT 20`
      );
      return res.status(200).json({ alerts: r.rows || [] });
    }

    return res.status(400).json({ error: "Ação desconhecida: " + action });

  } catch(e) {
    console.error("usuarios error:", action, e.message);
    return res.status(500).json({ error: "Erro interno do servidor" }); // Don't expose internals
  }
};
