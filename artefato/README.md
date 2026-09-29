# A versão que roda dentro do Claude

O site publicado no GitHub Pages fala com um Cloudflare Worker, que guarda a
chave da API. Existe também uma versão que roda como artefato dentro do
Claude, e lá não há chave nenhuma para guardar: a página pergunta direto ao
modelo pela capacidade `sample`, e a conta é de quem abre a página.

Nada aqui vai para o ar junto com o site. Esta pasta é só o gerador.

## Montar

```bash
./artefato/montar.sh /caminho/para/o/worker.js
```

O `worker.js` não está neste repositório de propósito: a URL do AI Gateway
dentro dele contém o ID da conta Cloudflare, e este repositório é público.
É de lá que saem os prompts — copiados na montagem, nunca reescritos, para
as duas versões não divergirem sem ninguém perceber.

Sai uma pasta `saida/` com cinco arquivos. Publique o `pagina.html` como
artefato, com `style.css`, `script.js`, `ia.js` e `demo.js` como arquivos de
apoio, declarando as capacidades `sample` e `downloads`.

## O que muda em relação ao site

O `adaptar.py` parte dos arquivos do repositório e aplica só as diferenças
que o ambiente exige. Cada `troca()` falha alto se o trecho que ela procura
mudou de forma no site — é isso que impede a versão-artefato de sair
silenciosamente errada depois de uma alteração aqui.

**A IA.** `postProxy` deixa de falar com o Worker e passa a chamar
`claude.use("sample")`. Os prompts, os validadores de resposta e a decisão de
usar cache vêm todos do worker, então o formato que o `script.js` espera é o
mesmo dos dois lados.

**O que a caixa do visualizador recusa em silêncio.** Quatro coisas
falhariam sem erro nenhum, e botão que não faz nada é pior que botão
ausente — a pessoa acha que salvou:

| No site | No artefato |
| --- | --- |
| Botão Imprimir | escondido: `window.print()` não abre nada ali |
| `navigator.share` | vai direto para a cópia: Web Share é recusado sem prompt |
| `confirm()` ao limpar a anamnese | confirmação em dois toques no próprio botão |
| `<a download>` do texto e do PDF | capacidade `downloads`, que pergunta ao leitor |

**O resto.** Sem service worker (não existe ali, e nada precisa dele), sem
manifesto, sem `?q=` no endereço — o link a compartilhar é o do próprio
artefato, então Compartilhar volta a copiar o conteúdo. O tema respeita o
que o Claude carimba em `data-theme` quando o leitor ainda não escolheu.

O que nunca dependeu de IA continua igual: os 29 escores, a montagem do
texto da anamnese, o modo script, a repetição espaçada, o histórico e os
favoritos.
