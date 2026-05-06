DEV SWG - ZIP funcionando com Claude + Vercel

Incluído:
- api/generate.js: backend real chamando a Anthropic/Claude
- api/health.js: teste de API e variáveis
- api/favicon.ico.js: remove erro 404 de favicon
- package.json: configuração Node para Vercel
- vercel.json: rewrites e cleanUrls
- DEPLOY_AUTOMATICO.bat: clique duplo para subir alterações
- deploy.ps1: script PowerShell do deploy
- css/style.css, js/app.js, assets/README_ASSETS.txt

Variável obrigatória na Vercel:
ANTHROPIC_API_KEY

Opcional:
ANTHROPIC_MODEL=claude-3-5-sonnet-latest

Como instalar:
1. Extraia este ZIP.
2. Copie/substitua os arquivos na pasta:
   C:\Users\Gustavo - SWG\Documents\DEV SWG
3. Dê dois cliques em DEPLOY_AUTOMATICO.bat.
4. Aguarde o push terminar.
5. A Vercel fará o deploy automaticamente.

Teste depois do deploy:
https://dev-swg.vercel.app/api/health

Se hasAnthropicKey aparecer true, a chave está conectada.
