# API do Invictus.Med

Worker do Cloudflare que guarda as chaves da IA, cuida das contas e aplica os
limites de plano. O site conversa só com ele.

## Por que site e API no mesmo domínio

O login usa cookie `httpOnly` — o JavaScript não consegue lê-lo, então um XSS
não rouba a sessão. Isso só funciona se o site e a API estiverem no **mesmo
domínio**; em domínios diferentes o navegador trata como cookie de terceiro e
Safari e Firefox bloqueiam por padrão.

O arranjo esperado:

```
invictusmed.com.br        → site (Cloudflare Pages)
invictusmed.com.br/api/*  → esta API (Worker)
```

## Subindo

```bash
npm install -g wrangler

# 1) Banco
wrangler d1 create invictus              # copie o database_id para o wrangler.toml
wrangler d1 execute invictus --remote --file=schema.sql

# 2) Segredos
wrangler secret put GROQ_KEY             # provedor de IA (principal)
wrangler secret put GROK_KEY_2           # reserva  (atenção: com K, como está hoje)
wrangler secret put GROQ_KEY_3           # terceiro nível
wrangler secret put CEREBRAS_KEY         # aba de estudo (cota separada)
wrangler secret put RESEND_KEY           # envio do e-mail de login

# 3) Publicar
wrangler deploy
```

Variáveis comuns ficam no `wrangler.toml`: `SITE_URL`, `LIMITE_GRATIS_DIA`,
`LIMITE_ANONIMO_DIA` e, se usar AI Gateway, `GATEWAY_URL`.

Durante o desenvolvimento, sem `RESEND_KEY`, o link de login é impresso no log
(`wrangler tail`) em vez de ser enviado — defina `PERMITIR_LOGIN_SEM_EMAIL=1`
para que o fluxo siga assim.

## Rotas

| Rota | O que faz |
| --- | --- |
| `POST /api/auth/solicitar` | recebe `{ email }` e manda o link mágico |
| `POST /api/auth/confirmar` | troca `{ token }` por uma sessão (cookie) |
| `POST /api/auth/sair` | encerra a sessão |
| `GET /api/conta` | quem está logado e quantas buscas restam |
| `GET /api/itens?tipo=historico\|favorito` | lista sincronizada |
| `POST /api/itens` | salva `{ tipo, nome }` |
| `DELETE /api/itens` | remove um item, ou a lista toda se vier sem `nome` |
| `POST /api/ia` | gera ficha, caso, quiz, flashcards, resumo, mapa ou ABNT |

## Decisões que valem conhecer

**Nenhum token é guardado em texto.** Links mágicos e sessões vão para o banco
como SHA-256. Se o banco vazar, ninguém entra com o que está gravado lá.

**A conta é opcional.** Sem sessão o site continua funcionando, com um teto
menor. Login é um ganho — histórico que acompanha a pessoa e mais buscas — não
um pedágio.

**Cota só nas fichas.** As ferramentas de estudo usam chave e cota separadas,
então não consomem o limite diário.

**Assinatura vencida vira gratuita sozinha.** Se `periodo_fim` passou, o acesso
cai para o plano gratuito sem precisar de rotina de limpeza.

## Testes

```bash
node --no-warnings test/api.test.mjs
```

Rodam contra um SQLite em memória carregado com o `schema.sql` de verdade — são
as mesmas consultas que vão para produção, não uma imitação do banco. Cobrem
login, expiração e reuso de link, isolamento entre contas, limites de plano e
CORS.

## Ainda não existe

A cobrança. As tabelas (`assinaturas`) e a checagem (`temAcessoPago`) já estão
no lugar e o resto do sistema já sabe lidar com `status = 'ativa'` — falta
integrar o Mercado Pago e o webhook que muda esse status.
