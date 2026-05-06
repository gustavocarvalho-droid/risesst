Correção do erro 404 em /api/generate

O erro no console significa que a Vercel não encontrou a função:
api/generate.js

Este pacote garante:
- api/generate.js existe na raiz correta
- package.json existe na raiz
- vercel.json não bloqueia rotas /api
- api/health.js testa a API
- api/projects.js salva no Neon

IMPORTANTE:
Ao extrair, copie/substitua TODOS os arquivos e pastas dentro da pasta do projeto.
Não copie apenas index.html.

Depois clique em DEPLOY_AUTOMATICO.bat e aguarde a Vercel redeployar.

Testes:
1. https://dev-swg.vercel.app/api/health
2. https://dev-swg.vercel.app/api/generate

No teste 2, abrindo pelo navegador, o correto é aparecer:
Método não permitido. Use POST.
Isso significa que a rota existe e o botão do sistema conseguirá usar POST.
