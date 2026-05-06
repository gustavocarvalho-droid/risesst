Correção aplicada:
- Modelo inválido removido: claude-3-5-sonnet-latest
- Novo modelo padrão: claude-sonnet-4-6
- Se ANTHROPIC_MODEL estiver vazio ou com valor antigo, o código usa claude-sonnet-4-6 automaticamente.

IMPORTANTE NA VERCEL:
Se existir a variável ANTHROPIC_MODEL com valor claude-3-5-sonnet-latest, edite para:
claude-sonnet-4-6

Ou simplesmente apague ANTHROPIC_MODEL e deixe só:
ANTHROPIC_API_KEY

Depois:
1. Extraia este ZIP.
2. Substitua todos os arquivos da pasta do projeto.
3. Clique em DEPLOY_AUTOMATICO.bat.
4. Aguarde a Vercel finalizar o deploy.
5. Teste novamente Gerar Site com IA.
