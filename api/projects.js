async function getSql() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
  if (!url) throw new Error("DATABASE_URL não encontrada na Vercel.");
  const mod = await import("@neondatabase/serverless");
  return mod.neon(url);
}

async function ensureTables(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS swg_projects (
      id TEXT PRIMARY KEY,
      empresa TEXT NOT NULL,
      nicho TEXT,
      estilo TEXT,
      descricao TEXT,
      status TEXT,
      data_inicio TEXT,
      data_fim TEXT,
      link_site TEXT,
      servicos JSONB DEFAULT '[]'::jsonb,
      refs JSONB DEFAULT '[]'::jsonb,
      generated_html TEXT,
      last_action TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

export default async function handler(req, res) {
  try {
    const sql = await getSql();
    await ensureTables(sql);

    if (req.method === "GET") {
      const rows = await sql`SELECT * FROM swg_projects ORDER BY updated_at DESC LIMIT 100`;
      return res.status(200).json({ success: true, projects: rows });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ success: false, error: "Método não permitido." });
    }

    const body = req.body || {};
    const project = body.project || {};
    const html = body.html || "";
    const action = body.action || "updated";

    if (!project.id || !project.empresa) {
      return res.status(400).json({ success: false, error: "ID e empresa são obrigatórios." });
    }

    const rows = await sql`
      INSERT INTO swg_projects (
        id, empresa, nicho, estilo, descricao, status, data_inicio, data_fim,
        link_site, servicos, refs, generated_html, last_action, updated_at
      )
      VALUES (
        ${String(project.id)}, ${String(project.empresa || "")}, ${String(project.nicho || "")},
        ${String(project.estilo || "")}, ${String(project.descricao || "")},
        ${String(project.status || "desenvolvimento")}, ${String(project.dataInicio || "")},
        ${project.dataFim ? String(project.dataFim) : null}, ${String(project.linkSite || "")},
        ${JSON.stringify(project.servicos || [])}::jsonb, ${JSON.stringify(project.refs || [])}::jsonb,
        ${String(html || "")}, ${String(action)}, NOW()
      )
      ON CONFLICT (id)
      DO UPDATE SET
        empresa=EXCLUDED.empresa, nicho=EXCLUDED.nicho, estilo=EXCLUDED.estilo,
        descricao=EXCLUDED.descricao, status=EXCLUDED.status, data_inicio=EXCLUDED.data_inicio,
        data_fim=EXCLUDED.data_fim, link_site=EXCLUDED.link_site, servicos=EXCLUDED.servicos,
        refs=EXCLUDED.refs,
        generated_html=CASE WHEN EXCLUDED.generated_html <> '' THEN EXCLUDED.generated_html ELSE swg_projects.generated_html END,
        last_action=EXCLUDED.last_action,
        updated_at=NOW()
      RETURNING *
    `;

    return res.status(200).json({ success: true, message: "Projeto salvo no Neon.", project: rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || "Erro no Neon." });
  }
}
