# Invictus.Med

<https://eckermann33.github.io/invictus.med-/>

Você digita "hepatite", "sertralina" ou "paciente com hipertensão, diabetes tipo 2
e obesidade" — e recebe uma ficha clínica montada na hora, organizada em seções.

A ideia veio de um incômodo simples: procurar uma condição na internet costuma
devolver ou um texto raso demais, ou vinte abas abertas para juntar as peças. Eu
queria uma tela só, com o que interessa na hora de estudar, e no idioma certo.

É um site, não um app. Abre no navegador, funciona no celular, não precisa de
cadastro. Está em beta e é gratuito.

## O que vem numa ficha

Definição, sintomas comuns e incomuns, exames laboratoriais e de imagem,
critérios diagnósticos, tratamento padrão e medicamentoso, prognóstico,
complicações, epidemiologia e diagnósticos diferenciais. Os códigos CID-10 e
CID-11 aparecem no cabeçalho quando existem.

Duas partes que eu gosto especialmente:

**Sinais de alerta** ficam num bloco destacado, separado do resto. São os
sintomas que pedem avaliação urgente, e eles se perdem quando ficam no meio de
uma lista comprida.

**Fisiopatologia em duas versões** — uma explicação simples e uma detalhada, em
abas. Dá para começar pela simples e trocar quando quiser o mecanismo de verdade.

No tratamento há um botão de **doses usuais**: dose de adulto, via, intervalo,
duração, ajuste renal e o cuidado principal de cada fármaco, com link direto para
a bula na Anvisa. Ele é um clique separado de propósito — não vem junto com a
ficha, tanto porque a ficha já andava no limite de tokens do modelo quanto porque
dose merece um passo deliberado.

Cada fármaco leva o link da bula ali do lado: conferir precisa ser mais fácil do
que confiar. E só dose de adulto — criança, gestante e insuficiência renal
precisam de fonte própria, não de uma linha a mais numa tabela. Quando você copia
a tabela, a procedência vai junto no texto, porque ele sai do site e o aviso do
rodapé fica para trás.

Um botão de **modo script** reorganiza as mesmas seções na ordem em que o
raciocínio clínico acontece — quem costuma ter, o que acontece no corpo, como
se apresenta, como confirmar, com o que se confunde — e rotula o papel de cada
bloco. Sem IA e sem conteúdo novo: é o mesmo material na ordem em que a memória
guarda.

Se o termo for amplo (hepatite, anemia, diabetes), a ficha ganha uma seção de
variações com os subtipos. Se for um medicamento, ela troca de formato: princípio
ativo, classe, mecanismo de ação, efeitos adversos, contraindicações e interações
— mais um cartão de **doses usuais**, com as apresentações que existem, a dose de
cada indicação, a dose máxima e os ajustes renal e hepático. São doses gerais, de
referência: o que serve para estudar, não esquema para um paciente.
E os diferenciais são clicáveis — um clique já abre a ficha da outra condição.

## A aba de estudar

De dentro de qualquer ficha dá para abrir a aba de estudo, que gera quatro coisas
sob demanda: **quiz** de múltipla escolha com correção e explicação, **flashcards**
para revisão, **resumo** em tópicos e **mapa mental**. Cada uma só é gerada quando
você clica — nada fica pesando enquanto você não pede.

Os flashcards não são descartáveis. Depois de revelar a resposta você diz como foi
— errei, difícil ou fácil — e a carta é agendada pelo SM-2, o mesmo algoritmo que
o Anki usa na base: o que você errou volta ainda na sessão, o que você acertou
volta daqui a dias, e o intervalo cresce conforme você acerta. O botão **Revisar**
mostra quantas venceram e é o único da aba que não chama a IA — agendamento é
conta, então funciona sem internet e sem custo.

Tem também um **estudo de caso**, e ele funciona em duas etapas de propósito.
Primeiro você vê o paciente — história, exame físico, exames — e precisa
escrever sua hipótese, o que a sustenta e o que você não descarta. Só depois a
conduta esperada aparece, com a sua hipótese lado a lado para comparar.

Isso não é enfeite: ler resposta pronta não treina raciocínio. O que treina é
se comprometer com uma hipótese antes, e é essa a base das estratégias de
reflexão deliberada no ensino de raciocínio clínico. Se quiser, a IA ainda dá
retorno sobre o seu raciocínio — apontando o que sustentou e o que faltou
considerar, em vez de dar nota.

No quiz dá para puxar os temas do seu próprio histórico com um clique: em vez
de competir com bancos de centenas de milhares de questões, ele gera sobre
exatamente o que você andou pesquisando. O placar final mostra o tempo e a
média por questão.

## Calculadoras e escores

Vinte e nove escores e calculadoras que os livros mandam decorar e ninguém
decora, agrupados por especialidade e com filtro por nome:

| Área | O que tem |
| --- | --- |
| Geral | IMC, superfície corporal, peso ideal e ajustado |
| Cardiologia | CHA₂DS₂-VASc, HAS-BLED, HEART, TIMI |
| Emergência | qSOFA, Wells (TVP), Wells (TEP), PERC, Alvarado |
| Nefrologia | Clearance de creatinina, TFG (CKD-EPI 2021), ânion gap, sódio e cálcio corrigidos |
| Pneumologia | CURB-65, carga tabágica |
| Endocrinologia | HOMA-IR, HbA1c em glicemia média |
| Neurologia | Glasgow, ABCD² |
| Infectologia | Centor / McIsaac |
| Gastroenterologia | Child-Pugh |
| Pediatria | Apgar |
| Gineco e obstetrícia | Idade gestacional e DPP |
| Psiquiatria | PHQ-9, GAD-7 |

Essa parte **não usa IA nenhuma**. É aritmética rodando no seu navegador:
resultado na hora, de graça, funciona sem internet e é impossível de alucinar.
Mesmo princípio da montagem do texto da anamnese.

O resultado aparece enquanto você preenche e muda de cor conforme a gravidade.
E o peso de cada item fica visível ao lado dele — porque "idade ≥ 75 vale 2
pontos" é justamente o tipo de coisa que se esquece na hora da prova.

Numa calculadora clínica, errar a conta em silêncio é o pior defeito possível —
por isso cada fórmula tem teste automatizado com valores conhecidos, rodando
contra o próprio `script.js` e não contra uma cópia: `node testes/escores.test.mjs`.
São 90 verificações, incluindo uma que roda todos os escores de ponta a ponta só
para garantir que nenhum devolve `NaN`, que é o jeito silencioso de uma conta
errar. As outras duas suítes cobrem o agendamento das revisões
(`testes/revisao.test.mjs`) e a sincronia do cache (`testes/versao.test.mjs`).

## A aba de anamnese

Uma segunda ferramenta, separada da busca: um roteiro que monta uma anamnese
estruturada quase só com cliques.

Identificação, interrogatório sintomatológico, antecedentes, hábitos e história
familiar são todos por clique — no interrogatório, cada sintoma tem três
estados (não abordado, refere, nega), e um botão "negar todos" preenche o
aparelho inteiro de uma vez, sem desfazer o que você já marcou. Digitar mesmo,
só na queixa principal e na história da doença atual, que é o que não cabe em
botão.

O texto final é montado por modelo: mesma entrada, mesma saída, sem IA no meio.
Ele calcula a carga tabágica em maços-ano, resolve a concordância de gênero e
lista as coisas como se escreve ("hipertensão arterial e diabetes mellitus",
não "hipertensão arterial, diabetes mellitus"). Dá para copiar ou baixar em
`.txt`.

A IA entra em um ponto só, e opcional: reescrever a história que você digitou
solta em prosa clínica. O prompt proíbe acrescentar sintoma, inventar data ou
sugerir diagnóstico — mas revise mesmo assim.

Sobre privacidade, a aba foi feita com cuidado: não existe campo de nome
completo, CPF ou prontuário, só iniciais. Apenas a queixa e a história saem do
navegador quando você pede o refino — identificação, antecedentes e hábitos
nunca são enviados. O rascunho fica salvo só no seu navegador, e tem um botão
para apagar tudo.

## Os detalhes pequenos

Histórico e favoritos ficam salvos no seu navegador. Busca por voz, se o navegador
suportar. Tema claro e escuro, que segue a preferência do sistema até você escolher
uma. Exportação em PDF e uma versão limpa para impressão. E um botão que formata as
referências em ABNT — mostrando cada uma antes de você copiar.

Cada ficha tem endereço próprio: o `?q=` na barra é o link para mandar no grupo da
turma. Quem abrir recebe a ficha do momento, não uma cópia congelada — e o botão
voltar do navegador anda entre as fichas em vez de sair do site.

Para quem estuda em caderno digital, o botão Markdown copia a ficha pronta para o
Obsidian: cabeçalho YAML com CID e especialidade, sinônimos como *aliases* e os
diagnósticos diferenciais já em `[[links internos]]`.

No rodapé tem um "Aprovado por Dr. House". Passe o mouse em cima.

## Sobre o conteúdo

As fichas são geradas por IA no momento da busca. É isso que permite pesquisar
praticamente qualquer coisa sem precisar de um banco de dados gigante — e é
também o motivo de o conteúdo poder sair errado.

Então vale ser direto: isto é material de estudo. Não serve para decidir conduta
e não substitui consulta, diagnóstico ou tratamento de um profissional.

Por isso as referências ficam visíveis na ficha, cada uma com um link de busca
no Google Acadêmico e no PubMed. **Confira antes de citar**: modelos de
linguagem inventam citações com aparência impecável — autor plausível, revista
real, ano coerente — que simplesmente não existem. O botão de ABNT mostra o
resultado na tela e só copia quando você pede, justamente para você ler antes.

E se achar um erro, tem um botão de reportar em cada ficha. Conteúdo gerado por
IA erra, e saber onde ele erra mais é o que permite ir substituindo as partes
críticas por texto escrito à mão.

Sobre privacidade: o site manda para a IA só o termo que você digitou, nada mais.
Histórico, favoritos e tema ficam no `localStorage` do seu navegador e não saem
dele. Ainda assim, não digite dados de paciente na busca.

Achou um erro ou tem sugestão? [me chama](https://www.instagram.com/_eckermann).

## Por dentro

HTML, CSS e JavaScript puro. Sem framework, sem build, sem `node_modules` — são
três arquivos servidos como estáticos no GitHub Pages. A única dependência
externa é o [jsPDF](https://github.com/parallax/jsPDF), e mesmo ela é opcional:
se não carregar, o botão de PDF cai sozinho para a janela de impressão.

| Arquivo | |
| --- | --- |
| `index.html` | marcação, metadados e o script curto que aplica o tema antes da primeira pintura |
| `style.css` | tokens de cor, tema claro/escuro, responsivo e estilos de impressão |
| `script.js` | busca, chamadas à IA, renderização, histórico, favoritos, voz e exportação |
| `demo.js` | duas fichas de exemplo, carregadas só quando não há Worker |
| `sw.js` | o service worker que faz o site abrir sem internet |
| `manifest.webmanifest` | o que o navegador lê para instalar o site como app |
| `proxy-worker.example.js` | o Cloudflare Worker que guarda a chave da IA |

A chave da IA nunca chega ao navegador. Quem fala com o modelo é um Cloudflare
Worker, e o site só conversa com ele. O Worker tenta os provedores em cascata:
se o primeiro falhar — cota estourada, modelo fora do ar, resposta vazia — ele
passa para o próximo sozinho. A aba de estudo usa uma chave separada, para não
disputar cota com as fichas.

E se não houver IA configurada, buscar por "hipertensão" ou "diabetes" ainda
funciona: essas duas fichas ficam no `demo.js`. Ele só é baixado nesse caso —
com o Worker no ar, o arquivo nunca sai da rede.

## Mexendo no código

Não abra o `index.html` com duplo clique — a área de transferência e o
reconhecimento de voz exigem contexto seguro. Suba um servidor:

```bash
python3 -m http.server 8000   # ou: npx serve .
```

A configuração fica toda no objeto `CONFIG`, no topo do `script.js`, e o que
importa ali é o `PROXY_URL`. Não há modo de chamar o modelo direto do navegador:
seria preciso colocar a chave no código-fonte de um site público, e a economia de
alguns minutos de configuração não paga a conta que vem depois. Quem escolhe
modelo, monta o prompt e faz a cascata entre provedores é o Worker.

Para subir o seu próprio Worker, `proxy-worker.example.js` é o ponto de partida:
copie para `src/index.js` num projeto Cloudflare, cadastre as chaves como
secrets e faça o deploy. Dois cuidados que economizam dor de cabeça: restrinja
`ALLOW_ORIGIN` ao seu domínio (com `"*"`, qualquer site na internet chama o seu
Worker e gasta a sua cota), e se usar AI Gateway não deixe a URL escrita no
arquivo — ela contém o ID da sua conta, e este repositório é público.

Se for mexer, três coisas que não convém quebrar:

- Todo texto vindo da IA passa por `escapeHTML()` antes de virar `innerHTML`.
  Resposta de modelo é conteúdo não confiável, sem exceção.
- Toda chamada de rede vai por `fetchWithTimeout` / `postProxy`, que já cuidam de
  prazo, cancelamento e código de erro.
- Ao editar `style.css` ou `script.js`, incremente o `?v=` no `index.html` **e o
  `VERSAO` no `sw.js` junto**, senão o service worker segue servindo o cache
  antigo e a atualização não chega a quem instalou. O `testes/versao.test.mjs`
  existe para pegar exatamente esse esquecimento.

A acessibilidade também é para manter: link de pular para a busca, campo como
`combobox` com navegação por setas, painel lateral como diálogo modal com foco
preso e devolvido, foco visível em tudo, e respeito a `prefers-reduced-motion`.

<details>
<summary><b>Contrato da API do proxy</b> — o que o site envia e espera de volta</summary>

O site faz `POST` com corpo JSON para `CONFIG.PROXY_URL`. O campo `modo` escolhe
a tarefa; sem ele, o padrão é a ficha.

| Requisição | Resposta |
| --- | --- |
| `{ termo }` | ficha clínica (esquema abaixo) |
| `{ modo: "caso", termo }` | `{ titulo, apresentacao, queixa, antecedentes, exame_fisico, exames_complementares, conduta, pergunta_raciocinio }` |
| `{ modo: "quiz", termo }` | `{ perguntas: [{ pergunta, alternativas[], correta, explicacao }] }` |
| `{ modo: "flashcards", termo }` | `{ cards: [{ frente, verso }] }` |
| `{ modo: "resumo", termo }` | `{ titulo, topicos: [{ titulo, conteudo }] }` |
| `{ modo: "mapa", termo }` | `{ central, ramos: [{ titulo, subitens[] }] }` |
| `{ modo: "abnt", termo, referencias[] }` | `{ abnt: ["referência formatada", ...] }` |

Em `quiz`, `correta` é o **índice numérico** da alternativa certa (base 0) — se
vier como letra, nada é marcado como correto.

O campo `tipo` decide o formato da ficha: `"farmaco"` troca todos os cards pelos
de medicamento; `"doenca"` e `"sintomas"` usam o formato clínico.

```jsonc
// doença, síndrome ou condição
{
  "nome": "", "cid10": "", "cid11": "", "sinonimos": [], "area_medica": "",
  "definicao": "",
  "sintomas_comuns": [], "sintomas_raros": [], "sinais_alerta": [],
  "tratamento":   { "padrao": [], "medicamentos": [], "complementares": [], "prognostico": "" },
  "diagnostico":  { "laboratoriais": [], "imagem": [], "criterios": [] },
  "complicacoes": [],
  "variacoes":    [{ "nome": "", "definicao": "", "transmissao": "", "gravidade": "leve|moderada|grave", "tratamento": "" }],
  "diferenciais": [],
  "epidemiologia":  { "prevalencia": "", "faixa_etaria": "", "sexo": "", "distribuicao_geografica": "" },
  "fisiopatologia": { "simples": "", "avancada": "" },
  "referencias": []
}

// fármaco
{
  "nome": "", "tipo": "farmaco", "area_medica": "", "sinonimos": [],
  "farmaco": {
    "principio_ativo": "", "classe": "", "para_que_serve": "",
    "doencas_tratadas": [], "mecanismo_simples": "", "mecanismo_avancado": "",
    "efeitos_adversos_comuns": [], "efeitos_adversos_graves": [],
    "contraindicacoes": [], "interacoes": []
  },
  "referencias": []
}
```

Duas restrições que o proxy precisa respeitar:

**Tempo.** O site cancela em 45s (`CONFIG.TIMEOUT_MS`). Todo o trabalho do
proxy, incluindo as tentativas de fallback, tem que caber nessa janela — senão
o usuário vê `cód. TIMEOUT` com o servidor ainda processando. Numa cascata,
use um limite por tentativa de ~18s.

**Resposta vazia é falha.** O site valida a ficha antes de renderizar
(`isFichaValida`): JSON bem formado mas sem conteúdo vira `cód. FICHA`. Se o
proxy tem fallback, vale checar o mesmo antes de responder 200 — assim uma
resposta oca aciona o próximo provedor em vez de virar erro na tela.

**Erros** devem vir como `{ erro, codigo }` fora da faixa 2xx. O site nunca
mostra a mensagem técnica: só um texto tranquilo e o `codigo` em letras miúdas.
Os códigos gerados pelo próprio site são `TIMEOUT`, `REDE`, `FICHA`, `NO_PROXY`
e `CANCELLED`.

</details>

<details>
<summary><b>Travando a versão do jsPDF</b></summary>

O `index.html` carrega o jsPDF por CDN sem `integrity`. Para travar a versão:

```bash
curl -s https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js \
  | openssl dgst -sha384 -binary | openssl base64 -A
```

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
        integrity="sha384-COLE-O-HASH-AQUI"
        crossorigin="anonymous" referrerpolicy="no-referrer" defer></script>
```

Se o hash não bater o navegador bloqueia o script, e o botão de PDF passa a usar
a janela de impressão. O site continua funcionando.

</details>

## Dá para instalar

O site é um PWA: dá para adicionar à tela inicial e abrir como aplicativo, com
atalhos diretos para a anamnese e para os escores. Isso importa porque metade do
site não precisa de internet nenhuma — as calculadoras são aritmética, a anamnese
monta o texto no próprio navegador, favoritos e histórico já ficam salvos ali.
Sem um service worker, nada disso abre quando o wi-fi do hospital cai.

As últimas 30 fichas consultadas também ficam guardadas para leitura sem conexão.
Quando uma delas aparece, uma tarja diz de quando é: ficha médica antiga com cara
de recém-gerada é pior que ficha nenhuma, e quem está sem sinal no corredor não
tem como desconfiar sozinho.

## O que ainda falta

Guardar as buscas recentes no servidor, para não consultar a IA duas vezes pela
mesma coisa. E, quando o `script.js` crescer mais um pouco, quebrar ele em módulos.

---

Feito por [@_eckermann](https://www.instagram.com/_eckermann) · beta 2
