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

Se o termo for amplo (hepatite, anemia, diabetes), a ficha ganha uma seção de
variações com os subtipos. Se for um medicamento, ela troca de formato: princípio
ativo, classe, mecanismo de ação, efeitos adversos, contraindicações e interações.
E os diferenciais são clicáveis — um clique já abre a ficha da outra condição.

## A aba de estudar

De dentro de qualquer ficha dá para abrir a aba de estudo, que gera quatro coisas
sob demanda: **quiz** de múltipla escolha com correção e explicação, **flashcards**
para revisão, **resumo** em tópicos e **mapa mental**. Cada uma só é gerada quando
você clica — nada fica pesando enquanto você não pede.

Tem também um **estudo de caso**: um paciente fictício com história, exame físico,
exames e uma pergunta de raciocínio no fim, sem a resposta. Bom para testar se
você realmente entendeu a condição, e não só decorou a lista.

## Os detalhes pequenos

Histórico e favoritos ficam salvos no seu navegador. Busca por voz, se o navegador
suportar. Tema claro e escuro, que segue a preferência do sistema até você escolher
uma. Exportação em PDF e uma versão limpa para impressão. E um botão que copia as
referências já formatadas em ABNT, para colar direto no trabalho.

No rodapé tem um "Aprovado por Dr. House". Passe o mouse em cima.

## Sobre o conteúdo

As fichas são geradas por IA no momento da busca. É isso que permite pesquisar
praticamente qualquer coisa sem precisar de um banco de dados gigante — e é
também o motivo de o conteúdo poder sair errado.

Então vale ser direto: isto é material de estudo. Não serve para decidir conduta
e não substitui consulta, diagnóstico ou tratamento de um profissional. As
referências que a ficha cita estão ali justamente para você conferir antes de
levar qualquer coisa para a prática.

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
| `proxy-worker.example.js` | o Cloudflare Worker que guarda a chave da IA |

A chave da IA nunca chega ao navegador. Quem fala com o modelo é um Cloudflare
Worker, e o site só conversa com ele. O Worker tenta os provedores em cascata:
se o primeiro falhar — cota estourada, modelo fora do ar, resposta vazia — ele
passa para o próximo sozinho. A aba de estudo usa uma chave separada, para não
disputar cota com as fichas.

E se não houver IA configurada, buscar por "hipertensão" ou "diabetes" ainda
funciona: essas duas fichas estão embutidas no código como demonstração.

## Mexendo no código

Não abra o `index.html` com duplo clique — a área de transferência e o
reconhecimento de voz exigem contexto seguro. Suba um servidor:

```bash
python3 -m http.server 8000   # ou: npx serve .
```

A configuração fica toda no objeto `CONFIG`, no topo do `script.js`. O normal é
`PROVIDER: "proxy"` com a URL do seu Worker em `PROXY_URL`. Existem também os
modos diretos (`gemini`, `openai`, `anthropic`), mas neles a chave fica visível
no código-fonte do site — servem para teste local, nunca para publicar.

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
- Ao editar `style.css` ou `script.js`, incremente o `?v=` no `index.html`, senão
  os navegadores continuam servindo a versão velha.

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

## O que ainda falta

Compartilhar ficha por link, com o termo na URL. Guardar as buscas recentes para
não consultar a IA duas vezes pela mesma coisa. Leitura offline das fichas já
vistas. E, quando o `script.js` crescer mais um pouco, quebrar ele em módulos.

---

Feito por [@_eckermann](https://www.instagram.com/_eckermann) · beta 1.0
