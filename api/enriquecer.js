const https = require("https");

const CNAE_RISCO = {
  "01":3,"02":3,"03":3,"05":4,"06":4,"07":4,"08":3,"09":4,
  "10":3,"11":3,"12":4,"13":3,"14":3,"15":3,"16":3,"17":3,
  "18":2,"19":4,"20":4,"21":3,"22":3,"23":3,"24":4,"25":3,
  "26":2,"27":3,"28":3,"29":3,"30":3,"31":2,"32":2,"33":3,
  "35":4,"36":2,"37":3,"38":3,"39":3,
  "41":3,"42":3,"43":3,"45":2,"46":2,"47":2,
  "49":2,"50":3,"51":2,"52":3,"53":2,
  "55":2,"56":2,"58":1,"59":1,"60":1,"61":2,"62":1,"63":1,
  "64":1,"65":1,"66":1,"68":1,"69":1,"70":1,"71":1,"72":1,
  "73":1,"74":1,"75":1,"77":2,"78":1,"79":1,"80":3,"81":2,
  "82":1,"84":1,"85":1,"86":2,"87":2,"88":2,"90":1,"91":1,
  "92":2,"93":2,"94":1,"95":2,"96":2,"97":1,"99":1,
};
const CNAE_ESPECIFICO = {
  "2011":4,"2012":4,"2013":4,"2019":4,"2021":4,"2029":4,"2031":4,
  "2032":4,"2033":4,"2040":4,"2051":4,"2052":4,"2061":4,"2062":4,
  "2063":4,"2071":4,"2072":4,"2073":4,"2091":4,"2092":4,"2093":4,
  "2094":4,"2099":4,"2411":4,"2422":4,"2431":4,"2439":4,"2441":4,
  "2442":4,"2443":4,"2449":4,"8011":3,"8012":3,"8020":3,
  "8121":2,"8122":2,"8129":2,"8610":3,"8621":3,"8622":3,"8630":2,
  "8640":2,"8650":2,"8660":2,"8690":2,
};
const RISCO_LABEL = {1:"Grau 1 — Baixo Risco",2:"Grau 2 — Médio Risco",3:"Grau 3 — Alto Risco",4:"Grau 4 — Muito Alto Risco"};

function getCNAERisco(cnae) {
  if (!cnae) return null;
  const c = String(cnae).replace(/[^0-9]/g,"");
  return CNAE_ESPECIFICO[c.slice(0,4)] || CNAE_RISCO[c.slice(0,2)] || null;
}

function getServicos(grau, func) {
  const f = parseInt(func)||0;
  const s = ["PGR"];
  if (grau>=2||f>=20) s.push("PCMSO");
  if (grau>=3) s.push("LTCAT","Laudo de Insalubridade");
  if (grau>=4) s.push("PPRA","Laudo de Periculosidade");
  if (f>=50)   s.push("CIPA");
  if (f>=20)   s.push("Treinamentos NR");
  s.push("PPP","ASO");
  return [...new Set(s)];
}

function buscaCNPJ(cnpj) {
  return new Promise((resolve) => {
    const digits = cnpj.replace(/\D/g,"");
    if (digits.length !== 14) { resolve(null); return; }
    const options = {
      hostname: "brasilapi.com.br",
      path: `/api/cnpj/v1/${digits}`,
      method: "GET",
      timeout: 10000,
      headers: { "User-Agent": "RiseSST/2.0", "Accept": "application/json" },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(null); } });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.end();
  });
}

function buscaContatoEGMB(nome, cidade, cnpj, atividade, site) {
  return new Promise((resolve) => {
    const siteInfo = site ? `\nSite da empresa: ${site}` : "";

    const prompt = `Você precisa encontrar TODOS os dados de contato desta empresa brasileira.
Empresa: ${nome}
CNPJ: ${cnpj||""}
Cidade: ${cidade||""}
Atividade: ${atividade||""}${siteInfo}

PASSO 1 — Buscar Google Meu Negócio e contatos diretos:
- Pesquise: "${nome} ${cidade} telefone email site"
- Pesquise: "${nome} ${cidade} whatsapp contato"
- Se tiver site, acesse e encontre a página de contato/rodapé
- Pesquise no Google Maps: "${nome} ${cidade}"

PASSO 2 — Se não achar telefone ou email da empresa específica:
- Pesquise empresas do mesmo setor em "${cidade}" que tenham esses dados
- Busque: "${atividade} ${cidade} telefone contato email"
- Retorne os dados de contato mais relevantes encontrados, mesmo que de empresa similar
- Informe no campo "contato_fonte" se o contato é da empresa ou de similar

PASSO 3 — WhatsApp:
- Busque links "wa.me/55...", "api.whatsapp.com/send?phone=55..."
- Verifique o site da empresa por botão de WhatsApp
- Pesquise: "${nome} whatsapp"

Retorne APENAS JSON puro (sem markdown):
{
  "gmb_nome": "nome no Google Maps ou null",
  "gmb_telefone": "telefone com DDD somente dígitos ex: 1133334444 ou null",
  "gmb_whatsapp": "WhatsApp somente dígitos com código país ex: 5511999999999 ou null",
  "gmb_email": "email@empresa.com ou null",
  "gmb_site": "https://site.com.br ou null",
  "gmb_endereco": "endereço completo ou null",
  "gmb_cidade": "cidade - UF ou null",
  "gmb_rating": "ex: 4.5 ou null",
  "gmb_reviews": numero_inteiro_ou_null,
  "gmb_horario": "Seg-Sex 8h-18h ou null",
  "gmb_categoria": "categoria do negócio ou null",
  "contato_encontrado": true_ou_false,
  "contato_fonte": "URL ou descrição de onde achou os contatos"
}`;

    const body = JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      system: "Agente especializado em busca de dados de contato de empresas brasileiras. Retorne APENAS JSON puro sem texto antes ou depois.",
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: prompt }],
    });

    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      timeout: 60000,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
        "Content-Length": Buffer.byteLength(body, "utf8"),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          const textBlock = parsed.content?.find(b => b.type === "text");
          const raw = textBlock?.text || "";
          const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
          if (s !== -1 && e !== -1) {
            try { resolve(JSON.parse(raw.substring(s, e+1))); return; }
            catch(e2) {}
          }
          resolve({});
        } catch(e) { resolve({}); }
      });
    });
    req.on("error", () => resolve({}));
    req.on("timeout", () => { req.destroy(); resolve({}); });
    req.write(body);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST")    { res.status(405).end(); return; }

  let body = "";
  await new Promise(r => { req.on("data", c => body += c); req.on("end", r); });
  let payload = {};
  try { payload = JSON.parse(body); } catch(e) { res.status(400).json({error:"Body inválido"}); return; }

  const { nome, cnpj, cidade, atividade, funcionarios, site } = payload;
  if (!nome && !cnpj) { res.status(400).json({error:"nome ou cnpj obrigatório"}); return; }

  // 1. Receita Federal em paralelo com busca de contato
  const [receitaData, gmbData] = await Promise.all([
    cnpj ? buscaCNPJ(cnpj) : Promise.resolve(null),
    process.env.ANTHROPIC_API_KEY
      ? buscaContatoEGMB(nome || "", cidade, cnpj, atividade, site)
      : Promise.resolve({}),
  ]);

  // 2. CNAE e grau de risco
  let cnaeCode = null, cnaeDesc = null, grauRisco = null;
  if (receitaData) {
    const cnaePrincipal = receitaData.cnae_fiscal || receitaData.cnae_fiscal_principal?.codigo;
    if (cnaePrincipal) {
      cnaeCode = String(cnaePrincipal).replace(/[^0-9]/g,"");
      cnaeDesc = receitaData.cnae_fiscal_principal?.descricao || receitaData.descricao_atividade_principal || atividade || "";
      grauRisco = getCNAERisco(cnaeCode);
    }
  }
  if (!grauRisco && atividade) {
    const atv = atividade.toLowerCase();
    if (/constru|obra|civil|engenharia/.test(atv))       grauRisco = 3;
    else if (/metal|solda|fundição|torneiro/.test(atv))  grauRisco = 3;
    else if (/quím|petroquím|refin|explosivo/.test(atv)) grauRisco = 4;
    else if (/mineração|extrat|pedreira/.test(atv))      grauRisco = 4;
    else if (/elétric|energia|alta tensão/.test(atv))    grauRisco = 4;
    else if (/saúde|hospital|clínica|médic/.test(atv))   grauRisco = 2;
    else if (/comércio|varejo|atacado/.test(atv))        grauRisco = 2;
    else if (/tecnologia|software|ti |informática/.test(atv)) grauRisco = 1;
    else if (/transporte|logística|frota/.test(atv))     grauRisco = 2;
    else if (/limpeza|conservação/.test(atv))            grauRisco = 2;
    else if (/segurança|vigilância/.test(atv))           grauRisco = 3;
    else if (/aliment|restaurante/.test(atv))            grauRisco = 2;
    else                                                  grauRisco = 2;
  }

  const numFunc = parseInt(funcionarios) || 0;
  const servicos = grauRisco ? getServicos(grauRisco, numFunc) : [];

  // 3. Telefone: prioriza GMB > Receita
  const telefone = gmbData.gmb_telefone || receitaData?.ddd_telefone_1
    ? (gmbData.gmb_telefone
        ? gmbData.gmb_telefone
        : receitaData?.ddd_telefone_1
          ? `(${receitaData.ddd_telefone_1}) ${receitaData.telefone_1||""}`.trim()
          : null)
    : null;

  // 4. Email: prioriza GMB > Receita
  const email = gmbData.gmb_email || receitaData?.email || null;

  const result = {
    // Receita Federal
    receita_razao_social: receitaData?.razao_social || null,
    receita_nome_fantasia: receitaData?.nome_fantasia || null,
    receita_situacao: receitaData?.descricao_situacao_cadastral || null,
    receita_porte: receitaData?.porte || null,
    receita_abertura: receitaData?.data_inicio_atividade || null,
    receita_capital: receitaData?.capital_social || null,
    receita_logradouro: receitaData
      ? `${receitaData.logradouro||""}, ${receitaData.numero||""} ${receitaData.complemento||""} - ${receitaData.bairro||""}, ${receitaData.municipio||""} - ${receitaData.uf||""}`.replace(/,\s*,/g,",").trim()
      : null,
    receita_cep: receitaData?.cep || null,
    receita_telefone: receitaData?.ddd_telefone_1
      ? `(${receitaData.ddd_telefone_1}) ${receitaData.telefone_1||""}`.trim()
      : null,
    receita_email: receitaData?.email || null,

    // CNAE
    cnae_codigo: cnaeCode ? cnaeCode.replace(/(\d{2})(\d{2})(\d)(\d{2})/,"$1.$2-$3/$4") : null,
    cnae_descricao: cnaeDesc || null,
    cnae_grau_risco: grauRisco,
    cnae_grau_label: grauRisco ? RISCO_LABEL[grauRisco] : null,
    cnae_servicos_sst: servicos,
    cnaes_secundarios: receitaData?.cnaes_secundarios
      ? receitaData.cnaes_secundarios.slice(0,3).map(c => `${c.codigo} - ${c.descricao}`).join(" | ")
      : null,

    // Contato unificado (melhor fonte)
    telefone: telefone,
    email: email,

    // Google Meu Negócio / busca web
    ...gmbData,
  };

  // Limpar nulos/vazios
  Object.keys(result).forEach(k => {
    if (result[k] === null || result[k] === undefined || result[k] === "") delete result[k];
  });

  res.status(200).json(result);
};
