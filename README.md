# 🚀 RISE SST — Ecossistema completo para SST

## Deploy na Vercel

### 1. Fork / push para GitHub
```bash
git init
git add .
git commit -m "RISE SST v2.0"
git remote add origin https://github.com/SEU_USUARIO/rise-sst.git
git push -u origin main
```

### 2. Importe o repositório na Vercel
- Acesse [vercel.com](https://vercel.com) → New Project → importe o repo
- Configure as variáveis de ambiente:

| Variável | Descrição |
|---|---|
| `ANTHROPIC_API_KEY` | Chave da API Anthropic (obrigatória) |
| `KV_REST_API_URL` | Vercel KV URL (opcional — para persistência WA) |
| `KV_REST_API_TOKEN` | Vercel KV Token (opcional) |

### 3. Vercel KV (persistência do WhatsApp Disparos)
- No painel da Vercel: Storage → Create → KV Database
- Vincule ao projeto — as variáveis são injetadas automaticamente

## Desenvolvimento local
```bash
npm install
cp .env.example .env
# preencha ANTHROPIC_API_KEY no .env
node server.js
# acesse http://localhost:3000
```

## Funcionalidades
- 📊 **Dashboard** — KPIs, gráfico mensal, funil, log de leads
- 🔍 **Buscador de Empresas** — busca por CNPJ via IA + web search → auto-add ao CRM
- 💬 **WhatsApp Disparos** — disparos em massa, agendamentos, conversas, CRM interno
- 📋 **CRM** — 3 abas: Buscador | ZapDisparos | Empresa — kanban + tabela + persistência
- 🤖 **IA de Atendimento** — (em breve)
- 📈 **Análise Completa** — (em breve)
