# Correções — Buscador de Empresas & Logo (22/06/2026)

## Diagnóstico (causa raiz)

### 1. Busca retornando vazio em TODAS as abas (Filtrada, Oportunidades, Ampla Brasil)
**Causa real:** `api/buscar.js`, `api/enriquecer.js` e `api/ia.js` chamavam o modelo
`claude-sonnet-4-20250514`, que a Anthropic **retirou em 15/06/2026**. Toda chamada à
API passou a retornar erro HTTP (404/erro de modelo), mas o código antigo só lia o
corpo da resposta como SSE (`data: ...`) — quando a Anthropic devolve um erro HTTP,
ela manda um JSON de erro puro, sem prefixo `data:`. Resultado: nenhuma linha era
reconhecida, `fullText` ficava vazio, e a função **resolvia com sucesso** (texto
vazio) em vez de propagar o erro. Por isso a tela sempre mostrava "Nenhuma empresa
encontrada", em qualquer aba, mesmo com a Ampla Brasil enviando o payload certo.

**Não era** um problema da lógica de filtros, deduplicação ou validação de CNPJ —
essas partes estavam corretas. Era 100% causado pelo modelo indisponível sendo
mascarado como resultado vazio.

### 2. Ampla Brasil "exigindo" cidade/bairro
Na verdade o frontend **já não exigia**: `bRunAmplaBrasil()` sempre envia
`cidade: ''`, e o backend (`buildPrompt` modo `ampla_brasil`) nunca menciona cidade
no prompt — usa apenas estado (opcional) + segmento + quantidade. O erro percebido
era o mesmo bug #1.

### 3. Logo quebrado (`net::ERR_INVALID_URL`) e some após reload
**Causa real:** em `api/usuarios.js`, a função genérica `sanitize(val, maxLen)`
fazia `.slice(0, maxLen)` em **qualquer** campo de texto, incluindo `logo_url`.
- No `action: 'create'`: limite de 2000 caracteres.
- No `action: 'update'` (usado pelo fluxo real de "salvar em Configurações"):
  limite de **500 caracteres**.

Uma logo em `data:image/webp;base64,...` facilmente passa de 10.000–50.000
caracteres. O valor salvo no banco ficava truncado/corrompido. Ao recarregar a
página, esse valor truncado era atribuído direto a `<img src>`, e o navegador
rejeitava com `net::ERR_INVALID_URL` (string base64 incompleta não é uma data URL
válida).

### 4. Erro 401 em `/api/usuarios` no console
Uma chamada auxiliar (carregamento da lista de usuários para o seletor master, no
módulo de WhatsApp) enviava `masterKey` dentro do **body**, em vez do header
`x-caller-user`/`x-master-key` que o middleware de autenticação do backend espera.
A chamada falhava silenciosamente em `catch(e){}`, mas gerava o 401 visível no
DevTools.

---

## Correções aplicadas

### Backend

**`api/buscar.js`**
- Model atualizado: `claude-sonnet-4-20250514` → `claude-sonnet-4-6`.
- `callAnthropicStream()` agora verifica o status HTTP da resposta da Anthropic.
  Se não for 2xx, lê o corpo de erro e rejeita a Promise com uma mensagem
  categorizada (`auth_error`, `model_not_found`, `rate_limit`, `api_error_N`),
  em vez de silenciosamente resolver com texto vazio.
- Também detecta eventos `type: "error"` dentro do próprio stream SSE (ex.:
  `overloaded_error`) e rejeita corretamente.
- Mensagem de "nenhum resultado" agora é específica por aba:
  - **Ampla Brasil**: menciona apenas estado/segmento/quantidade (nunca cidade
    ou palavra-chave).
  - **Oportunidades**: menciona segmento/cidade/estado.
  - **Busca Filtrada**: mensagem original (palavra-chave/cidade/segmento).
- Catch principal expandido para diferenciar: erro de autenticação da API,
  modelo indisponível, rate limit, créditos/billing insuficientes, timeout,
  e erro genérico — cada um com mensagem amigável e tecnicamente correta.

**`api/enriquecer.js`** e **`api/ia.js`**
- Model atualizado para `claude-sonnet-4-6`.

**`api/usuarios.js`**
- Nova função `sanitizeLogo()`, usada em vez de `sanitize(val, 2000)` /
  `sanitize(val, 500)` para o campo `logo_url`, tanto no `create` quanto no
  `update`. Ela:
  - Preserva data URLs (`data:image/...;base64,...`) **sem truncar** (até um
    guarda-rail de ~5MB em base64, bem acima do necessário para um logo).
  - Aceita URLs públicas `http(s)://` (limitadas a 2000 chars, razoável para URL).
  - Rejeita (retorna `null`) qualquer formato não reconhecido — não salva lixo
    no banco em vez de salvar uma string corrompida.
- Coluna `logo_url` já era `TEXT` no schema (sem limite) — o truncamento era
  só na camada de sanitização da API, não no banco.

### Frontend (`index.html`)

- Nova função utilitária global `normalizeLogoUrl(raw)`:
  - Valida data URLs (rejeita as truncadas/sem conteúdo após a vírgula —
    exatamente o padrão do bug antigo).
  - Valida URLs públicas com `new URL()`.
  - Detecta base64 puro sem prefixo e adiciona `data:image/webp;base64,`.
  - Retorna `null` para qualquer valor vazio/inválido — nunca deixa lixo
    chegar a um `<img src>`.
- Nova função `applyLogoToImg(imgEl, rawLogo, fallbackHTML)`: aplica o logo
  normalizado a um elemento `<img>` com `onerror` configurado para cair no
  fallback (ícone 🏢) caso a URL pública falhe ao carregar (ex.: 401 de
  bucket privado) — nunca deixa o ícone de imagem quebrada visível.
- Os 3 pontos que faziam `el.src = user.logo_url` (ou equivalente) direto
  agora passam por `normalizeLogoUrl`/`applyLogoToImg`:
  1. `usuariosApplyAccess()` — logo na sidebar após login/reload.
  2. Card de usuário na lista de Configurações (master).
  3. Preview do logo no modal de edição de usuário.
  4. `brandApplyToUI()` — logo na sidebar e na tela de login via branding.
- Corrigida a chamada que enviava `masterKey` no body (linha ~5908, módulo
  WhatsApp) para enviar `x-caller-user` no header, como o backend espera.

---

## O que NÃO foi alterado (conforme solicitado)
- Nenhuma tela nova foi criada.
- Layout principal preservado.
- Lógica de créditos, disparos e regra de "CNPJ confirmado" preservada
  integralmente (apenas a causa raiz do retorno vazio foi corrigida — a
  validação de CNPJ em si nunca removia empresas válidas).
- A aba Oportunidades não teve sua lógica alterada (só se beneficia
  indiretamente da correção do model ID e das mensagens de erro).

## Ação necessária após o deploy
Nenhuma variável de ambiente nova é necessária. Apenas confirme que
`ANTHROPIC_API_KEY` está configurada no Vercel (o sistema já reporta isso
claramente se estiver faltando, com a mensagem "Erro de autenticação com a
IA...").

## Testes recomendados pós-deploy
1. Ampla Brasil: SP + Construção Civil + qtd 10 + priorizar recém-abertas → deve
   retornar empresas (ou, se vazio, mensagem específica sem mencionar cidade).
2. Busca Filtrada: palavra-chave + cidade + estado → deve retornar empresas.
3. Oportunidades → continua funcionando como antes.
4. Configurações → upload de logo grande (ex. PNG 30-50KB) → salvar → reload da
   página → logo deve continuar aparecendo na sidebar, sem erro no console.
