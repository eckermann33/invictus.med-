/* =================================================================
   Chamada à IA em cascata
   -----------------------------------------------------------------
   FICHA        → GROQ_KEY → GROK_KEY_2 → GROQ_KEY_3
   CASO / ABNT  → mesma cascata, raciocínio um pouco maior
   ESTUDO       → Cerebras (chave e cota próprias), com as chaves Groq
                  como rede de segurança se ele cair

   Orçamento de tempo: o site cancela em 45s. A cascata inteira precisa
   caber nisso, senão um provedor travado consome a janela sozinho e os
   níveis seguintes nunca chegam a ser tentados.
   ================================================================= */

import {
  promptFicha, promptCaso, promptAbnt,
  promptQuiz, promptFlash, promptResumo, promptMapa,
} from "./prompts.js";

const GATEWAY_PADRAO = "https://api.groq.com/openai/v1/chat/completions";
const MODELO_PADRAO = "groq/openai/gpt-oss-120b";

const ORCAMENTO_MS = 40000;
const TENTATIVA_MS = 18000;
const MINIMO_UTIL_MS = 6000;

/* A Groq conta o max_tokens RESERVADO no tamanho da requisição, contra o
   limite por minuto: pedir demais devolve 413 antes mesmo de gerar. 4096 é
   o valor comprovado nesta conta. */
const MAX_TOKENS = 4096;
const PISO_TOKENS = 1024;

/* Cada nível aceita mais de um nome de secret — GROK_KEY_2 está com K no
   painel, e sem essa tolerância o nível 2 seria pulado em silêncio. */
const NIVEIS_FICHA = [
  { sigla: "GROQ",  keys: ["GROQ_KEY"],                              modelEnv: "MODEL_1", extra: { reasoning_effort: "low", include_reasoning: false } },
  { sigla: "GROQ2", keys: ["GROQ_KEY_2", "GROK_KEY_2"],              modelEnv: "MODEL_2", extra: { reasoning_effort: "low", include_reasoning: false } },
  { sigla: "GROQ3", keys: ["GROQ_KEY_3", "GROK_KEY_3", "GROQ_KEY"],  modelEnv: "MODEL_3", extra: { reasoning_effort: "low", include_reasoning: false } },
];

const NIVEIS_CASO = NIVEIS_FICHA.map(n => ({
  ...n,
  sigla: n.sigla.replace("GROQ", "CASO"),
  extra: { ...n.extra, reasoning_effort: "medium" },
}));

const NIVEIS_ESTUDO = [
  { sigla: "ESTUDO", keys: ["CEREBRAS_KEY"], url: "https://api.cerebras.ai/v1/chat/completions",
    model: "gpt-oss-120b", extra: { reasoning_effort: "medium" } },
  ...NIVEIS_FICHA.slice(0, 2).map(n => ({ ...n, sigla: `EST-${n.sigla}`, extra: { ...n.extra, reasoning_effort: "medium" } })),
];

/* Modos em que o usuário pede variação explicitamente — servir do cache
   devolveria sempre o mesmo caso, o mesmo quiz. */
const SEM_CACHE = new Set(["caso", "quiz", "flashcards", "resumo", "mapa"]);

/* HTTP 200 com JSON válido mas vazio é falha na prática. Validar aqui faz
   uma resposta oca acionar o PRÓXIMO provedor em vez de virar erro na tela. */
const txt = v => typeof v === "string" && v.trim().length > 0;
const lst = v => Array.isArray(v) && v.length > 0;

export const VALIDA = {
  ficha: d => {
    const farmacoOk = d.farmaco && typeof d.farmaco === "object" &&
      Object.values(d.farmaco).some(v => txt(v) || lst(v));
    return Boolean(txt(d.definicao) || lst(d.sintomas_comuns) || lst(d.variacoes) || farmacoOk);
  },
  caso: d => Boolean(txt(d.apresentacao) || txt(d.queixa)),
  abnt: d => lst(d.abnt),
  quiz: d => lst(d.perguntas) && d.perguntas.every(q =>
    txt(q.pergunta) && lst(q.alternativas) && q.alternativas.length >= 2 &&
    Number.isInteger(Number(q.correta)) && Number(q.correta) < q.alternativas.length),
  flashcards: d => lst(d.cards) && d.cards.some(c => txt(c.frente) && txt(c.verso)),
  resumo: d => lst(d.topicos) && d.topicos.some(t => txt(t.conteudo)),
  mapa: d => lst(d.ramos) && d.ramos.some(r => txt(r.titulo)),
};

const PROMPTS = {
  ficha: promptFicha, caso: promptCaso, quiz: promptQuiz,
  flashcards: promptFlash, resumo: promptResumo, mapa: promptMapa,
};

export const MODOS = new Set([...Object.keys(PROMPTS), "abnt"]);

function niveisDe(modo) {
  if (modo === "ficha") return NIVEIS_FICHA;
  if (modo === "caso" || modo === "abnt") return NIVEIS_CASO;
  return NIVEIS_ESTUDO;
}

export async function gerar(env, modo, termo, extras = {}) {
  const prompt = modo === "abnt"
    ? promptAbnt(termo, Array.isArray(extras.referencias) ? extras.referencias : [])
    : PROMPTS[modo](termo);

  const url = env.GATEWAY_URL || GATEWAY_PADRAO;
  const maxTokens = Number(env.MAX_TOKENS_FICHA) || MAX_TOKENS;
  const inicio = Date.now();
  const restante = () => ORCAMENTO_MS - (Date.now() - inicio);

  const falhas = [];
  for (const n of niveisDe(modo)) {
    const sobra = restante();
    if (sobra < MINIMO_UTIL_MS) { falhas.push("tempo"); break; }

    const key = n.keys.map(nome => env[nome]).find(Boolean);
    if (!key) { falhas.push(`${n.sigla}:sem-chave`); continue; }

    const modelo = env[n.modelEnv] || n.model || MODELO_PADRAO;
    const r = await chamar(
      { ...n, model: modelo }, n.url || url, key, prompt,
      maxTokens, Math.min(TENTATIVA_MS, sobra - 1500), SEM_CACHE.has(modo));

    const valida = VALIDA[modo] || (() => true);
    if (r.ok && valida(r.dados)) return { ok: true, dados: r.dados };
    falhas.push(`${n.sigla}:${r.ok ? "vazio" : r.codigo}`);
  }

  // Guarda a falha de CADA nível: ver só a última esconde a causa real.
  return { ok: false, codigo: falhas.join(">") || "SEM-CHAVE" };
}

/* Em 413 (requisição grande demais para a cota por minuto), reduz o
   max_tokens pela metade e repete no MESMO provedor — a chave não é o problema. */
async function chamar(p, url, key, prompt, maxTokens, limiteMs, semCache) {
  let tokens = maxTokens;
  for (;;) {
    const r = await chamarUmaVez(p, url, key, prompt, tokens, limiteMs, semCache);
    if (r.codigo !== "413" || tokens <= PISO_TOKENS) return r;
    tokens = Math.max(PISO_TOKENS, Math.floor(tokens / 2));
  }
}

async function chamarUmaVez(p, url, key, prompt, maxTokens, limiteMs, semCache) {
  const headers = { "content-type": "application/json", "authorization": `Bearer ${key}` };
  if (semCache) headers["cf-aig-cache-ttl"] = "0";

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(limiteMs),
      body: JSON.stringify({
        model: p.model,
        messages: [
          { role: "system", content: "Você é um assistente médico. Responda SOMENTE com um objeto JSON válido, sem markdown." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        ...p.extra,
      }),
    });
  } catch (e) {
    return { ok: false, codigo: e && e.name === "TimeoutError" ? "lento" : "rede" };
  }

  const corpo = await res.text();
  if (!res.ok) return { ok: false, codigo: String(res.status) };

  let bruto = "";
  try { bruto = JSON.parse(corpo)?.choices?.[0]?.message?.content || ""; }
  catch { return { ok: false, codigo: "resp" }; }

  const dados = extrairJSON(bruto);
  if (!dados) return { ok: false, codigo: "json" };
  return { ok: true, dados };
}

function extrairJSON(text) {
  let t = String(text).trim().replace(/```json|```/gi, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a !== -1 && b !== -1) t = t.slice(a, b + 1);
  try { return JSON.parse(t); } catch { return null; }
}
