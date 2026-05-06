Versão template-first funcionando.

O problema era que a geração com IA ficava presa/longa e o preview dependia dela.
Agora:
- /api/generate retorna um HTML profissional por template imediatamente.
- O preview abre /viewer.html.
- O HTML gerado fica salvo no localStorage.
- Se a API falhar, o front-end usa template local.
- Botões Código, Abrir Site e Baixar HTML funcionam.

Próximo passo depois que tudo estiver estável:
- adicionar mais templates por nicho
- adicionar seletor de modelo/template
- depois reativar IA como melhoria opcional, não como fluxo obrigatório
