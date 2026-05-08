# RISE SST — Guia de Restauração

## Estrutura do Backup
```
Rise SST/
├── index.html          ← Sistema completo (frontend)
├── vercel.json         ← Config Vercel
├── package.json        ← Dependências Node
├── deploy.ps1          ← Script de deploy (PowerShell)
├── deploy.bat          ← Script de deploy (CMD)
└── api/
    ├── buscar.js       ← API busca de empresas
    ├── dados.js        ← API persistência (Neon DB)
    ├── enriquecer.js   ← API enriquecimento CNPJ
    ├── ia.js           ← API proxy Anthropic (RISE IA)
    └── usuarios.js     ← API multi-tenant usuários
```

## Como Restaurar

### 1. Clonar o repositório
```
git clone https://github.com/gustavocarvalho-droid/risesst.git
cd risesst
```

### 2. Copiar os arquivos deste backup
- Copie `index.html` → pasta raiz
- Copie todos os arquivos de `api/` → pasta `api/`

### 3. Variáveis de ambiente na Vercel
Acesse: vercel.com → Projeto → Settings → Environment Variables

| Variável | Valor |
|---|---|
| `ANTHROPIC_API_KEY` | sk-ant-... (sua chave Anthropic) |
| `DATABASE_URL` | postgresql://... (Neon DB) |
| `POSTGRES_URL` | postgresql://... (Neon DB - mesma URL) |

### 4. Deploy
```powershell
# Clique direito em deploy.ps1 → Executar com PowerShell
```
Ou manualmente:
```
git add -A
git commit -m "restore backup"
git push
```

## Banco de Dados (Neon PostgreSQL)
- Provider: neon.tech
- Tabelas: rise_store, rise_users, rise_user_activity
- As tabelas são criadas automaticamente na primeira requisição

## Credenciais Padrão
- Master: gustavo1996c / 1996
- URL: https://risesst.vercel.app

## Suporte
WhatsApp: 11 97966-8226
Email: gustavo.carvalho@swgconsulting.com.br
