# Invictus.Med — Referência Clínica Inteligente

Ferramenta web de consulta clínica: você digita uma doença, síndrome, condição,
cenário com comorbidades ou um fármaco, e recebe uma **ficha estruturada** —
definição, sintomas, sinais de alerta, diagnóstico, tratamento, epidemiologia,
fisiopatologia e diagnósticos diferenciais.

Inclui ainda ferramentas de estudo geradas sob demanda: quiz, flashcards, resumo,
mapa mental, estudo de caso e referências formatadas em ABNT.

> ⚠️ **Aviso médico** — o conteúdo é educacional e gerado por inteligência
> artificial. Não substitui consulta, diagnóstico ou tratamento por profissional
> de saúde qualificado. Verifique sempre as fontes primárias antes de qualquer
> decisão clínica.

---

## Índice

- [Stack e princípios](#stack-e-princípios)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Rodando localmente](#rodando-localmente)
- [Configuração da IA](#configuração-da-ia)
- [Contrato da API do proxy](#contrato-da-api-do-proxy)
- [Privacidade](#privacidade)
- [Acessibilidade](#acessibilidade)
- [Convenções de código](#convenções-de-código)
- [Roadmap](#roadmap)

---

## Stack e princípios

- **HTML + CSS + JavaScript puro.** Sem framework, sem bundler, sem passo de build.
  O site é servido como arquivos estáticos (GitHub Pages).
- **Uma única dependência externa:** [jsPDF](https://github.com/parallax/jsPDF),
  usada só na exportação em PDF — e opcional: se não carregar, o botão "PDF" cai
  automaticamente para a janela de impressão.
- **A chave da IA nunca vai para o navegador** no modo recomendado (proxy).
- **Degradação graciosa:** sem IA configurada, os exemplos de demonstração
  (`Hipertensão`, `Diabetes`) continuam funcionando offline.

## Estrutura do projeto

| Arquivo | O que faz |
| --- | --- |
| `index.html` | Marcação, metadados e o script curto que aplica o tema antes da primeira pintura. |
| `style.css` | Design system completo: tokens de cor, tema claro/escuro, responsivo, impressão. |
| `script.js` | Toda a lógica: busca, chamadas à IA, renderização da ficha, histórico, favoritos, voz, exportação. |
| `proxy-worker.example.js` | Implementação de referência do Cloudflare Worker que esconde a chave da IA. |

Mapa das seções de `script.js` (elas estão numeradas no próprio arquivo):

```
1) Configuração da IA          8)  Renderização da ficha
2) Prompt estruturado          9)  Copiar / compartilhar / PDF
3) Atalhos de DOM              10) Histórico e favoritos
4) Utilitários                 11) Busca por voz
5) Sugestões automáticas       12) Tema claro/escuro
6) Chamada à IA                13) Demonstração offline
7) Fluxo de busca              14) Eventos globais · 15) Inicialização
```

## Rodando localmente

Não abra o `index.html` com duplo clique (`file://`): a API de área de
transferência e o reconhecimento de voz exigem um contexto seguro. Suba um
servidor local:

```bash
# Python (já vem instalado na maioria dos sistemas)
python3 -m http.server 8000

# ou Node
npx serve .
```

Depois acesse <http://localhost:8000>.

Sem chave de IA configurada, busque por **Hipertensão** ou **Diabetes** para ver
as fichas de demonstração que vêm embutidas no código.

## Configuração da IA

Tudo é controlado pelo objeto `CONFIG`, no topo do `script.js`.

### Modo `proxy` — recomendado

A chave fica num Cloudflare Worker (o plano gratuito atende bem) e o navegador
nunca a enxerga.

```js
const CONFIG = {
  PROVIDER: "proxy",
  PROXY_URL: "https://SEU-WORKER.workers.dev/",
  // ...
};
```

Para publicar o Worker, use `proxy-worker.example.js` como ponto de partida:

```bash
npm create cloudflare@latest invictus-proxy
# copie proxy-worker.example.js para src/index.js
npx wrangler secret put LLM_KEY       # chave principal
npx wrangler secret put LLM_KEY_2     # reserva (opcional)
npx wrangler secret put ESTUDO_KEY    # aba de estudo (opcional)
npx wrangler deploy
```

O Worker fala o dialeto da API da OpenAI, então serve para qualquer provedor
compatível (Groq, Cerebras, OpenAI…). Aponte `GATEWAY_URL` — variável comum,
não secreta — para o endpoint do seu provedor, ou para um
[AI Gateway](https://developers.cloudflare.com/ai-gateway/) se quiser cache e
métricas.

Como funciona a divisão de carga:

| Modo | Provedor | Por quê |
| --- | --- | --- |
| Ficha | cascata `LLM_KEY` → `LLM_KEY_2` | se a primeira chave falhar, tenta a segunda sozinho |
| Caso / ABNT | mesma chave da ficha | respostas curtas, não pesam na cota |
| Quiz, flashcards, resumo, mapa | `ESTUDO_KEY` | cota isolada, para não competir com as fichas |

Dois cuidados:

- **`ALLOW_ORIGIN`**: deixar `"*"` permite que qualquer site chame o seu Worker
  e gaste a sua cota. Restrinja ao domínio do seu site em produção.
- **Não versione o ID da conta.** Se usar AI Gateway, a URL contém o seu
  identificador de conta Cloudflare — mantenha-a em variável de ambiente, não
  escrita no arquivo, já que este repositório é público.

### Modo direto — apenas para testes

```js
const API_KEY = "sua-chave";
const CONFIG = { PROVIDER: "gemini" /* ou "openai" | "anthropic" */ };
```

> 🔴 Neste modo a chave fica **visível** no código-fonte do site. Nunca publique
> assim: qualquer visitante consegue lê-la e usá-la.

## Contrato da API do proxy

O front-end faz `POST` com corpo JSON para `CONFIG.PROXY_URL`. O campo `modo`
seleciona a tarefa; sem ele, o padrão é a ficha clínica.

| Requisição | Resposta esperada |
| --- | --- |
| `{ termo }` | Ficha clínica (esquema abaixo) |
| `{ modo: "caso", termo }` | `{ titulo, apresentacao, queixa, antecedentes, exame_fisico, exames_complementares, conduta, pergunta_raciocinio }` |
| `{ modo: "quiz", termo }` | `{ perguntas: [{ pergunta, alternativas[], correta, explicacao }] }` — 3 perguntas, 4 alternativas |
| `{ modo: "flashcards", termo }` | `{ cards: [{ frente, verso }] }` — 8 cards |
| `{ modo: "resumo", termo }` | `{ titulo, topicos: [{ titulo, conteudo }] }` — 4 a 7 tópicos |
| `{ modo: "mapa", termo }` | `{ central, ramos: [{ titulo, subitens[] }] }` — 4 a 6 ramos |
| `{ modo: "abnt", termo, referencias[] }` | `{ abnt: ["referência formatada", ...] }` — 3 a 6 referências |

Em `quiz`, o campo `correta` é o **índice** (base 0) da alternativa certa.

A interface não depende dessas quantidades — ela renderiza o que vier. Elas
estão aqui para o Worker e o front continuarem coerentes.

O campo `tipo` (`"doenca"`, `"farmaco"` ou `"sintomas"`) decide o formato: com
`"farmaco"` a interface troca todos os cards pelos de medicamento. O Worker
devolve as duas estruturas sempre, com a que não se aplica em branco.

**Ficha clínica** — dois formatos, escolhidos pela IA conforme o termo:

<details>
<summary>Doença, síndrome ou condição</summary>

```jsonc
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
```
</details>

<details>
<summary>Fármaco (medicamento)</summary>

```jsonc
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
</details>

**Erros.** Qualquer resposta fora da faixa 2xx deve trazer
`{ erro: "mensagem", codigo: "CODIGO-CURTO" }`. O front-end nunca mostra a
mensagem técnica ao usuário — apenas um texto tranquilizador e o `codigo` em
letras miúdas, para diagnóstico. Códigos gerados pelo próprio front:
`TIMEOUT`, `REDE`, `FICHA` (resposta fora do formato), `NO_PROXY` e `CANCELLED`.

### Travando a versão do jsPDF (SRI)

O `index.html` carrega o jsPDF por CDN sem `integrity`. Para travar a versão,
calcule o hash a partir do arquivo publicado e adicione o atributo:

```bash
curl -s https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js \
  | openssl dgst -sha384 -binary | openssl base64 -A
```

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
        integrity="sha384-COLE-O-HASH-AQUI"
        crossorigin="anonymous" referrerpolicy="no-referrer" defer></script>
```

Se o hash não bater, o navegador bloqueia o script e o botão "PDF" passa a usar
a janela de impressão — o site continua funcionando.

## Privacidade

- O site envia à IA **apenas o termo digitado**. Nunca digite dados de pacientes.
- Histórico, favoritos e preferência de tema ficam no `localStorage` do próprio
  navegador. Nada é enviado a servidores nossos.
- Chaves em `.env` e `.dev.vars` estão no `.gitignore` — não versione segredos.

## Acessibilidade

O que já está implementado e deve ser preservado em mudanças futuras:

- Link "pular para a busca" no primeiro Tab.
- Campo de busca como `combobox` com `aria-activedescendant`, navegação por setas
  e `Esc` para fechar as sugestões.
- Painel lateral como `dialog` modal, com foco preso dentro dele e devolvido ao
  botão de origem ao fechar.
- Foco visível (`:focus-visible`) em todos os controles.
- Respeito a `prefers-reduced-motion` e a `prefers-color-scheme`.
- Estilos dedicados de impressão (`@media print`).

## Convenções de código

- Comentários, nomes de função e mensagens de interface em **português**.
- Todo texto vindo da IA passa por `escapeHTML()` antes de ir para `innerHTML`.
  Não abra exceção: a resposta da IA é conteúdo não confiável.
- Toda chamada de rede passa por `fetchWithTimeout` / `postProxy`, que já cuidam
  de prazo máximo, cancelamento e do código de erro.
- Ao mexer em `style.css` ou `script.js`, incremente o `?v=` no `index.html` para
  furar o cache dos navegadores.

## Roadmap

- [ ] Testes automatizados dos utilitários puros (`parseJSON`, `dataToText`, `isFichaValida`).
- [ ] Dividir `script.js` em módulos ES (`api.js`, `render.js`, `store.js`, `ui.js`).
- [ ] Service worker para leitura offline das fichas já visitadas.
- [ ] Compartilhar ficha por link (`?q=termo`), com o estado na URL.
- [ ] Cache das buscas recentes para não reconsultar a IA à toa.

---

Desenvolvido por [@_eckermann](https://www.instagram.com/_eckermann) · beta 1.0
