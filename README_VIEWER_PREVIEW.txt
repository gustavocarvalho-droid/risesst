Correção aplicada:
- O preview agora carrega /viewer.html dentro do iframe.
- O HTML gerado é salvo no localStorage e o viewer.html renderiza como página real.
- O botão Abrir Site abre /viewer.html em nova aba.
- Isso evita o problema de iframe branco com srcdoc/blob/document.write.
- Incluí public/swg-consulting-exemplo.html para teste manual do HTML que você enviou.

Teste depois do deploy:
1. Gere o site.
2. O preview deve carregar /viewer.html automaticamente.
3. Clique em Abrir Site para abrir em nova aba.
4. Acesse também: https://dev-swg.vercel.app/swg-consulting-exemplo.html
