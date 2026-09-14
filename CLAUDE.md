# Convenções do Invictus.Med

Site estático de referência clínica para estudantes de medicina. HTML, CSS e
JavaScript puro — **sem framework e sem etapa de build**. Publicado no GitHub
Pages; a IA fica atrás de um Cloudflare Worker.

## Fluxo de trabalho

- **Mergeie no `main` e empurre assim que terminar cada coisa pedida.** Não
  espere eu pedir o merge. A única exceção é quando o merge quebraria o site
  no ar — aí avise antes em vez de mergear.
- Trabalhe numa branch `claude/<assunto>` e mergeie com `--no-ff`, para o
  histórico mostrar o que foi uma entrega.
- **Não mergeie `claude/contas-e-assinatura`.** Ela saiu de um ponto antigo do
  `main` e apagaria metade do que existe hoje. Se as contas voltarem à pauta, o
  trabalho tem que ser refeito em cima do `main` atual.

## Antes de cada merge

1. `node testes/*.test.mjs` — os testes que rodam sem navegador.
2. Os testes de navegador (Playwright) quando a mudança toca a tela.
3. **Suba o `?v=` do `index.html` E o `VERSAO` do `sw.js` juntos.** Se só um
   subir, o service worker continua servindo a versão antiga para quem já
   instalou, sem erro nenhum. O `testes/versao.test.mjs` pega esse esquecimento.

## Idioma

Tudo em português do Brasil: texto de interface, comentários, nomes de função
nova, mensagem de commit. O código antigo tem nomes em inglês (`renderResult`,
`fetchAnalysis`) — não vale renomear em massa, mas o que for novo nasce em
português.

## Regras que não convém quebrar

- **Chave de API nunca no navegador.** Toda chamada de IA passa pelo Worker,
  que guarda a chave, monta o prompt e faz a cascata entre provedores. Não
  existe modo de chamar o modelo direto do cliente, e não deve voltar a existir.
- **Todo texto vindo da IA passa por `escapeHTML()` antes de virar `innerHTML`.**
  Resposta de modelo é conteúdo não confiável, sem exceção.
- **Toda chamada de rede vai por `fetchWithTimeout` / `postProxy`**, que já
  cuidam de prazo, cancelamento e código de erro.
- **A URL do AI Gateway contém o ID da conta Cloudflare e o repositório é
  público.** Ela mora em `env.GATEWAY_URL`, nunca escrita num arquivo do repo.
- **Use IA só onde ela agrega.** O texto da anamnese, as contas dos escores, o
  modo script e o agendamento das revisões são determinísticos de propósito:
  saem de graça, na hora, e não têm como alucinar. A IA gera conteúdo novo, não
  faz o que uma função faz melhor.

## Aviso médico

O aviso médico fica **só no rodapé**. Não espalhe tarja de "não substitui
avaliação médica" pelas telas — foi decisão do dono do site, tomada depois de
elas existirem.

Duas coisas que continuam e não são aviso médico: o alerta de não identificar o
paciente na anamnese (proteção de dado) e o de que a IA inventa citação nas
referências (integridade acadêmica). A procedência também segue no que **sai**
do site — texto copiado, Markdown, PDF, impressão —, porque esses documentos
viajam sem o rodapé junto.

## Acessibilidade e desempenho

- Alvo de toque mínimo de **44×44px**; contraste mínimo de **4,5:1** para texto
  normal. Já foram corrigidos uma vez; não regridam.
- **Nada de recurso externo bloqueando a primeira pintura.** A folha do Google
  Fonts carrega com `media="print"` e vira `all` no `onload` — medido, ela
  segurava a tela por 12s quando o domínio estava lento.
- Metade do site funciona sem internet (calculadoras, anamnese, favoritos,
  revisão). Mudança que quebre isso precisa ser deliberada.

## Método

Meça antes de afirmar. Todo "está lento", "está quebrado" ou "isso melhora"
deste projeto foi reproduzido com teste antes de virar mudança — e mais de uma
vez o problema estava no teste, não no código.
