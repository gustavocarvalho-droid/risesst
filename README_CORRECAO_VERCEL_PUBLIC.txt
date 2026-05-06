Correção do erro Build Failed: No Output Directory named public

Este pacote resolve:
- Cria pasta public/
- Copia index.html para public/index.html
- Mantém api/generate.js na raiz correta
- Configura vercel.json com outputDirectory: public
- Corrige chamadas da API para window.location.origin + /api/generate
- Mantém Neon e Claude

Como aplicar:
1. Extraia o ZIP.
2. Substitua TODOS os arquivos da pasta do projeto.
3. Clique em DEPLOY_AUTOMATICO.bat.
4. Aguarde a Vercel finalizar.
5. Abra /api/generate no navegador. O correto é: Método não permitido. Use POST.
6. Depois teste o botão Gerar Site com IA.
