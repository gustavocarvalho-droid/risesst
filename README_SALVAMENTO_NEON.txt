DEV SWG - Versão com logo, favicon e salvamento no Neon

Alterações feitas:
1. Logo maior no menu lateral.
2. Logo alinhado/encostado para a direita dentro da área do logo.
3. Favicon configurado em /favicon.ico.
4. API /api/health testa Anthropic e Neon.
5. API /api/projects salva projetos no Neon.
6. O front-end chama /api/projects ao criar, gerar e melhorar sites.
7. Backup do index antigo salvo em backups/index_backup_antes_logo_neon.html.

IMPORTANTE:
- Nada foi apagado.
- O HTML anterior foi preservado em /backups.
- O Neon só estará realmente conectado se:
  https://dev-swg.vercel.app/api/health
  retornar:
  hasDatabaseUrl: true
  databaseConnected: true

Variáveis necessárias na Vercel:
- ANTHROPIC_API_KEY
- DATABASE_URL ou POSTGRES_URL ou POSTGRES_PRISMA_URL

Depois de extrair:
1. Substitua os arquivos na pasta do projeto.
2. Dê dois cliques em DEPLOY_AUTOMATICO.bat.
3. Aguarde a Vercel fazer o deploy.
4. Abra /api/health para confirmar Neon e Claude.
