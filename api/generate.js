function esc(v) {
  return String(v || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function templateHtml({ empresa, nicho, estilo, descricao, servicos }) {
  empresa = empresa || "SWG Consulting";
  nicho = nicho || "Medicina e Segurança do Trabalho";
  estilo = estilo || "One Page";
  descricao = descricao || "Soluções profissionais em saúde ocupacional, segurança do trabalho e conformidade para empresas.";

  const list = Array.isArray(servicos) && servicos.length ? servicos : ["PGR", "PCMSO", "LTCAT", "Treinamentos", "Gestão de SST", "Consultoria Técnica"];

  const cards = list.map(s => `
      <article class="card">
        <span>✓</span>
        <h3>${esc(s)}</h3>
        <p>Serviço técnico com atendimento consultivo, documentação organizada e foco na segurança da sua operação.</p>
      </article>`).join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${esc(empresa)} | ${esc(nicho)}</title>
<style>
:root{--primary:#0a2342;--secondary:#1565c0;--accent:#00bcd4;--green:#43a047;--light:#f4f8fb;--white:#fff;--gray:#6b7280;--text:#1a2332}
*{box-sizing:border-box;margin:0;padding:0}html{scroll-behavior:smooth}body{font-family:Segoe UI,Arial,sans-serif;color:var(--text);background:#fff;overflow-x:hidden}
nav{position:fixed;top:0;left:0;right:0;height:70px;background:rgba(10,35,66,.97);backdrop-filter:blur(10px);z-index:10;display:flex;align-items:center;justify-content:space-between;padding:0 6%;box-shadow:0 2px 24px rgba(10,35,66,.18)}
.logo{font-weight:900;color:white;font-size:20px}.logo span{color:var(--accent)}nav a{color:white;text-decoration:none;margin-left:24px;font-size:14px}.nav-cta{background:linear-gradient(90deg,var(--accent),var(--secondary));padding:10px 18px;border-radius:9px;font-weight:800}
.hero{min-height:100vh;display:grid;place-items:center;padding:100px 24px 60px;background:linear-gradient(135deg,#0a2342,#0d3060 55%,#0a4080);color:white;position:relative;overflow:hidden}
.hero:before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 15% 20%,rgba(0,188,212,.22),transparent 28%),radial-gradient(circle at 85% 75%,rgba(67,160,71,.18),transparent 26%)}
.hero-inner{position:relative;z-index:1;max-width:1120px;width:100%;display:grid;grid-template-columns:1.1fr .9fr;gap:60px;align-items:center}
.badge{display:inline-block;background:rgba(0,188,212,.14);border:1px solid rgba(0,188,212,.35);color:var(--accent);padding:8px 16px;border-radius:999px;font-weight:800;font-size:13px;margin-bottom:22px}
h1{font-size:clamp(38px,6vw,76px);line-height:1.05;letter-spacing:-.05em;margin-bottom:22px}h1 span{color:var(--accent)}
.lead{font-size:19px;line-height:1.75;color:rgba(255,255,255,.78);max-width:680px}
.btns{display:flex;gap:14px;flex-wrap:wrap;margin-top:32px}.btn{display:inline-flex;padding:15px 24px;border-radius:12px;text-decoration:none;font-weight:900}.primary{background:linear-gradient(90deg,var(--accent),var(--secondary));color:white}.secondary{border:2px solid rgba(255,255,255,.3);color:white}
.hero-card{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:26px;padding:34px;box-shadow:0 20px 70px rgba(0,0,0,.28)}.hero-card h3{font-size:24px;margin-bottom:12px}.hero-card p{line-height:1.7;color:rgba(255,255,255,.7)}
section{padding:86px 24px}.container{max-width:1120px;margin:auto}.section-title{font-size:clamp(28px,4vw,46px);color:var(--primary);margin-bottom:14px}.section-desc{color:var(--gray);font-size:17px;line-height:1.7;max-width:720px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:38px}.card{background:var(--white);border:1px solid #e7edf5;border-radius:18px;padding:28px;box-shadow:0 10px 34px rgba(10,35,66,.08);transition:.25s}.card:hover{transform:translateY(-6px)}.card span{display:grid;place-items:center;width:38px;height:38px;background:rgba(0,188,212,.12);color:var(--accent);border-radius:10px;font-weight:900;margin-bottom:16px}.card h3{color:var(--primary);margin-bottom:10px}.card p{color:var(--gray);line-height:1.65}
.light{background:var(--light)}.process{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:38px}.step{background:white;border-radius:18px;padding:24px;text-align:center;box-shadow:0 10px 30px rgba(10,35,66,.07)}.num{width:54px;height:54px;margin:0 auto 14px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,var(--accent),var(--secondary));color:white;font-weight:900}
.cta{background:linear-gradient(135deg,#0a2342,#0a4080);color:white;text-align:center}.cta .section-title{color:white}.cta .section-desc{color:rgba(255,255,255,.75);margin:auto}
footer{background:#06101f;color:#9fb0c9;text-align:center;padding:28px}
@media(max-width:900px){.hero-inner,.grid,.process{grid-template-columns:1fr}nav .links{display:none}}
</style>
</head>
<body>
<nav><div class="logo">SWG <span>Consulting</span></div><div class="links"><a href="#servicos">Serviços</a><a href="#processo">Processo</a><a href="#contato" class="nav-cta">Contato</a></div></nav>
<header class="hero"><div class="hero-inner"><div><span class="badge">${esc(nicho)} • ${esc(estilo)}</span><h1>${esc(empresa)}<br><span>segurança, saúde e conformidade</span></h1><p class="lead">${esc(descricao)}</p><div class="btns"><a href="#contato" class="btn primary">Solicitar proposta</a><a href="#servicos" class="btn secondary">Ver serviços</a></div></div><div class="hero-card"><h3>Gestão SST profissional</h3><p>Organize documentos, reduza riscos e mantenha sua empresa preparada para auditorias, fiscalizações e crescimento seguro.</p></div></div></header>
<section id="servicos"><div class="container"><h2 class="section-title">Serviços em destaque</h2><p class="section-desc">Atendimento completo para empresas que precisam de segurança técnica, agilidade e documentação confiável.</p><div class="grid">${cards}</div></div></section>
<section class="light"><div class="container"><h2 class="section-title">Diferenciais</h2><p class="section-desc">Processos claros, comunicação objetiva e foco em resultado.</p><div class="grid"><div class="card"><span>1</span><h3>Diagnóstico claro</h3><p>Entendimento do cenário atual e prioridades da empresa.</p></div><div class="card"><span>2</span><h3>Execução técnica</h3><p>Entrega estruturada com documentos e orientações práticas.</p></div><div class="card"><span>3</span><h3>Acompanhamento</h3><p>Suporte para manter a conformidade ao longo do tempo.</p></div></div></div></section>
<section id="processo"><div class="container"><h2 class="section-title">Como funciona</h2><div class="process"><div class="step"><div class="num">1</div><h3>Contato</h3><p>Você apresenta a necessidade.</p></div><div class="step"><div class="num">2</div><h3>Análise</h3><p>Avaliamos o cenário.</p></div><div class="step"><div class="num">3</div><h3>Execução</h3><p>Realizamos as entregas.</p></div><div class="step"><div class="num">4</div><h3>Suporte</h3><p>Acompanhamos sua empresa.</p></div></div></div></section>
<section class="cta" id="contato"><div class="container"><h2 class="section-title">Pronto para começar?</h2><p class="section-desc">Solicite uma proposta e veja como a ${esc(empresa)} pode ajudar sua empresa.</p><div class="btns" style="justify-content:center"><a class="btn primary" href="mailto:contato@swgconsulting.com.br">Falar com consultor</a></div></div></section>
<footer>© ${new Date().getFullYear()} ${esc(empresa)}. Site gerado pela DEV SWG.</footer>
</body>
</html>`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Método não permitido. Use POST." });
  }

  try {
    const body = req.body || {};
    const empresa = String(body.empresa || body.company || "SWG Consulting").trim();
    const nicho = String(body.nicho || body.market || "Medicina e Segurança do Trabalho").trim();
    const estilo = String(body.estilo || body.style || "One Page").trim();
    const descricao = String(body.descricao || body.description || "Soluções profissionais em medicina e segurança do trabalho.").trim();
    const servicos = Array.isArray(body.servicos) ? body.servicos : [];

    // TEMPLATE-FIRST: sempre responde rápido para o sistema nunca travar.
    const html = templateHtml({ empresa, nicho, estilo, descricao, servicos });

    return res.status(200).json({
      success: true,
      source: "template",
      message: "Site gerado por template profissional.",
      html
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || "Erro interno em /api/generate." });
  }
}
