/* =================================================================
   Invictus.Med — proxy-worker.example.js
   -----------------------------------------------------------------
   Implementação de REFERÊNCIA do Cloudflare Worker que o front-end
   espera em CONFIG.PROXY_URL (script.js).

   Por que existe: com o proxy, a chave da IA fica no servidor e nunca
   aparece no código do site. O navegador só conversa com este Worker.

   ARQUITETURA (espelha a que está em produção):
     • FICHA  → cascata de provedores compatíveis com a API da OpenAI.
                Se o primeiro falhar, tenta o próximo automaticamente.
     • CASO e ABNT → mesmo provedor da ficha, com raciocínio um pouco maior.
     • ABA DE ESTUDO (quiz, flashcards, resumo, mapa) → provedor separado,
                com cota própria, para não competir com as fichas.

   SEGREDOS (Cloudflare → Settings → Variables and Secrets → Secret):
     • LLM_KEY      → chave principal
     • LLM_KEY_2    → chave reserva (opcional)
     • ESTUDO_KEY   → chave da aba de estudo (opcional)
   VARIÁVEL (texto normal, não secreto):
     • GATEWAY_URL  → endpoint compatível com OpenAI. Use o do seu
                      provedor, ou o do Cloudflare AI Gateway se quiser
                      cache e métricas. NÃO deixe o seu ID de conta
                      escrito neste arquivo se o repositório for público.

   Em qualquer falha devolve { erro, codigo } — o front mostra só uma
   mensagem tranquila e o "codigo" em letras miúdas, para diagnóstico.
   ================================================================= */

/* Deixe "*" apenas em teste. Em produção, restrinja ao seu site: com "*"
   qualquer página na internet pode chamar o Worker e gastar a sua cota. */
const ALLOW_ORIGIN = "*";

/* Endpoint padrão caso GATEWAY_URL não esteja definido no ambiente. */
const FALLBACK_URL = "https://api.groq.com/openai/v1/chat/completions";

const MAX_TERMO = 400;

/* Provedores da FICHA, tentados de cima para baixo.
   Use modelos DIFERENTES entre os níveis: se os dois forem o mesmo modelo,
   uma indisponibilidade do modelo derruba a cascata inteira, e só uma
   falha de cota por chave é realmente contornada. */
const PROVIDERS = [
  { sigla: "LLM1", keyEnv: "LLM_KEY",   model: "openai/gpt-oss-120b", extra: { reasoning_effort: "low" } },
  { sigla: "LLM2", keyEnv: "LLM_KEY_2", model: "qwen/qwen3-32b",      extra: {} },
];

/* Estudo de caso e ABNT — textos menores, raciocínio um pouco maior. */
const CASE = { sigla: "CASO", keyEnv: "LLM_KEY", model: "openai/gpt-oss-120b", extra: { reasoning_effort: "medium" } };

/* Aba de estudo — provedor/chave separados para isolar a cota. */
const ESTUDO = {
  sigla: "ESTUDO",
  keyEnv: "ESTUDO_KEY",
  url: "https://api.cerebras.ai/v1/chat/completions",
  model: "gpt-oss-120b",
  extra: { reasoning_effort: "medium" },
};

/* A ficha é o maior JSON gerado: com poucos tokens ela é cortada no meio,
   o JSON fica inválido e a resposta vira erro. Os outros modos são curtos. */
const MAX_TOKENS = { ficha: 8192, padrao: 4096 };

/* =================================================================
   HANDLER
   ================================================================= */
export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": ALLOW_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return json({ erro: "Use POST.", codigo: "METODO" }, 405, cors);

    try {
      let body = {};
      try { body = await request.json(); }
      catch { return json({ erro: "Corpo inválido.", codigo: "BODY" }, 400, cors); }

      const termo = String(body.termo || "").trim().slice(0, MAX_TERMO);
      const modo = String(body.modo || "ficha").trim();
      if (!termo) return json({ erro: "Termo vazio.", codigo: "VAZIO" }, 400, cors);

      const url = env.GATEWAY_URL || FALLBACK_URL;

      /* ---- Aba de estudo (provedor isolado) ---- */
      const prompts = { quiz: promptQuiz, flashcards: promptFlash, resumo: promptResumo, mapa: promptMapa };
      if (prompts[modo]) {
        const key = env[ESTUDO.keyEnv];
        if (!key) return json({ erro: "Sem chave de estudo.", codigo: "ESTUDO:sem-chave" }, 503, cors);
        const r = await chamar(ESTUDO, ESTUDO.url, key, prompts[modo](termo), MAX_TOKENS.padrao);
        if (r.ok) return json(r.dados, 200, cors);
        return json({ erro: "Falha no estudo.", codigo: `${modo.toUpperCase()}:${r.codigo}` }, 503, cors);
      }

      /* ---- Estudo de caso e referências em ABNT ---- */
      if (modo === "caso" || modo === "abnt") {
        const key = env.LLM_KEY || env.LLM_KEY_2;
        if (!key) return json({ erro: "Sem chave.", codigo: `${modo.toUpperCase()}:sem-chave` }, 503, cors);
        const prompt = modo === "caso"
          ? promptCaso(termo)
          : promptAbnt(termo, Array.isArray(body.referencias) ? body.referencias : []);
        const r = await chamar(CASE, url, key, prompt, MAX_TOKENS.padrao);
        if (r.ok) return json(r.dados, 200, cors);
        return json({ erro: "Falha ao gerar.", codigo: `${modo.toUpperCase()}:${r.codigo}` }, 503, cors);
      }

      /* ---- Ficha clínica (cascata) ---- */
      if (modo !== "ficha") return json({ erro: "Modo desconhecido.", codigo: "MODO" }, 400, cors);

      const prompt = promptFicha(termo);
      let ultimoCodigo = "SEM-CHAVE";
      for (const p of PROVIDERS) {
        const key = env[p.keyEnv];
        if (!key) { ultimoCodigo = `${p.sigla}:sem-chave`; continue; }
        const r = await chamar(p, url, key, prompt, MAX_TOKENS.ficha);
        if (r.ok) return json(r.dados, 200, cors);
        ultimoCodigo = `${p.sigla}:${r.codigo}`;
      }
      return json({ erro: "Provedores indisponíveis.", codigo: ultimoCodigo }, 503, cors);
    } catch {
      return json({ erro: "Erro interno.", codigo: "INTERNO" }, 500, cors);
    }
  },
};

/* Chama um provedor no formato OpenAI. Devolve {ok, dados} ou {ok:false, codigo}. */
async function chamar(p, url, key, prompt, maxTokens) {
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": `Bearer ${key}` },
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
  } catch { return { ok: false, codigo: "rede" }; }

  const txt = await res.text();
  if (!res.ok) return { ok: false, codigo: String(res.status) };

  let bruto = "";
  try { bruto = JSON.parse(txt)?.choices?.[0]?.message?.content || ""; }
  catch { return { ok: false, codigo: "resp" }; }

  const dados = extrairJSON(bruto);
  if (!dados) return { ok: false, codigo: "json" };
  return { ok: true, dados };
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...cors },
  });
}

/* Tolerante a crases e texto extra em volta do JSON */
function extrairJSON(text) {
  let t = String(text).trim().replace(/```json|```/gi, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a !== -1 && b !== -1) t = t.slice(a, b + 1);
  try { return JSON.parse(t); } catch { return null; }
}

/* =================================================================
   PROMPTS — as quantidades aqui precisam bater com o que o front espera
   ================================================================= */
const REGRA_JSON =
  "Responda EXCLUSIVAMENTE com um objeto JSON válido, sem texto antes ou depois, " +
  "sem markdown e sem crases. Tudo em português do Brasil. Cada campo é TEXTO " +
  "simples (string) — nunca objeto ou lista aninhada.";

function promptQuiz(termo) {
  return `Crie um QUIZ de múltipla escolha para estudantes de medicina sobre: "${termo}".
Gere EXATAMENTE 3 perguntas.
${REGRA_JSON}
Formato: { "perguntas": [ { "pergunta": "", "alternativas": ["A","B","C","D"], "correta": 0, "explicacao": "" } ] }
Regras:
- EXATAMENTE 4 alternativas por pergunta.
- "correta" é o ÍNDICE (0 a 3) da alternativa certa em "alternativas".
- Varie a posição da correta entre as perguntas.
- Dificuldade média, sem ambiguidade.`;
}

function promptFlash(termo) {
  return `Crie 8 FLASHCARDS de estudo para estudantes de medicina sobre: "${termo}".
${REGRA_JSON}
Formato: { "cards": [ { "frente": "pergunta ou conceito curto", "verso": "resposta objetiva" } ] }
Regras: EXATAMENTE 8 cards; "verso" com 1 a 3 frases; cobertura variada do tema.`;
}

function promptResumo(termo) {
  return `Crie um RESUMO DE ESTUDO estruturado para estudantes de medicina sobre: "${termo}".
${REGRA_JSON}
Formato: { "titulo": "", "topicos": [ { "titulo": "", "conteudo": "" } ] }
Regras: entre 4 e 7 tópicos, cobrindo os pontos mais importantes; "conteudo" objetivo e didático.`;
}

function promptMapa(termo) {
  return `Crie um MAPA MENTAL para estudantes de medicina sobre: "${termo}".
${REGRA_JSON}
Formato: { "central": "", "ramos": [ { "titulo": "", "subitens": ["", ""] } ] }
Regras: entre 4 e 6 ramos (ex.: Definição, Etiologia, Sintomas, Diagnóstico, Tratamento, Complicações),
cada um com 2 a 5 subitens curtos.`;
}

function promptCaso(termo) {
  return `Crie um ESTUDO DE CASO CLÍNICO didático para um estudante de medicina sobre: "${termo}".
${REGRA_JSON}
Formato:
{
  "titulo": "título curto do caso",
  "apresentacao": "idade, sexo e contexto de chegada",
  "queixa": "queixa principal e história da doença atual",
  "antecedentes": "antecedentes pessoais/familiares relevantes",
  "exame_fisico": "principais achados",
  "exames_complementares": "resultados laboratoriais/imagem pertinentes",
  "conduta": "conduta e manejo esperados",
  "pergunta_raciocinio": "pergunta de raciocínio clínico (NÃO dê a resposta)"
}
Paciente fictício, realista e coerente com o tema. Escreva em frases corridas.`;
}

function promptAbnt(termo, refs) {
  const lista = refs.length ? refs.join(" | ") : "(não fornecidas — use fontes reais e reconhecidas sobre o tema)";
  return `Formate referências no padrão ABNT (NBR 6023) sobre o tema "${termo}".
Referências usadas como base: ${lista}.
${REGRA_JSON}
Formato: { "abnt": ["referência completa em ABNT", "..."] }
Regras:
- Cada item completo (autor, título, edição, local, editora ou periódico, ano).
- Se faltar um dado, complete com a melhor informação real conhecida; NÃO invente autores ou obras.
- Ordene alfabeticamente. Entre 3 e 6 referências, priorizando diretrizes e livros-texto.`;
}

function promptFicha(termo) {
  return `Você é um assistente médico de referência clínica para estudantes e profissionais da saúde.
Analise o termo: "${termo}".

Responda EXCLUSIVAMENTE com um objeto JSON válido (sem markdown, sem crases), em português do Brasil,
seguindo EXATAMENTE este esquema:

{
  "tipo": "doenca | farmaco | sintomas",
  "nome": "nome correto e completo da condição OU do fármaco",
  "cid10": "", "cid11": "",
  "sinonimos": [], "area_medica": "",
  "definicao": "2 a 4 frases",
  "sintomas_comuns": [], "sintomas_raros": [], "sinais_alerta": [],
  "tratamento": { "padrao": [], "medicamentos": [], "complementares": [], "prognostico": "" },
  "diagnostico": { "laboratoriais": [], "imagem": [], "criterios": [] },
  "complicacoes": [],
  "variacoes": [ { "nome": "", "definicao": "", "transmissao": "(só se infecciosa, senão '')", "gravidade": "leve|moderada|grave", "tratamento": "" } ],
  "diferenciais": [],
  "epidemiologia": { "prevalencia": "", "faixa_etaria": "", "sexo": "", "distribuicao_geografica": "" },
  "fisiopatologia": { "simples": "para leigos", "avancada": "para estudantes de medicina" },
  "farmaco": {
    "principio_ativo": "", "classe": "", "para_que_serve": "1 a 2 frases",
    "doencas_tratadas": [], "mecanismo_simples": "",
    "mecanismo_avancado": "receptores e vias envolvidos",
    "efeitos_adversos_comuns": [], "efeitos_adversos_graves": [],
    "contraindicacoes": [], "interacoes": []
  },
  "referencias": []
}

REGRAS IMPORTANTES:
- Defina "tipo": use "farmaco" para MEDICAMENTO/princípio ativo (ex.: "sertralina", "losartana");
  "sintomas" para sintomas soltos; senão "doenca".
- Se "tipo" = "farmaco": preencha APENAS "tipo", "nome", "sinonimos", "area_medica", "farmaco" e
  "referencias". Deixe os campos de doença vazios ([] ou "").
- Se "tipo" = "doenca" ou "sintomas": preencha os campos de doença e deixe "farmaco" com campos vazios.
- O termo pode descrever um CENÁRIO CLÍNICO com várias comorbidades (ex.: "hipertensão, diabetes tipo 2
  e obesidade"). Nesse caso: "nome" = rótulo curto do quadro; "definicao" = panorama integrado;
  "variacoes" = uma entrada por condição; "tratamento" = manejo integrado; "complicacoes" = riscos combinados.
- Se o termo for AMPLO (ex.: "Hepatite", "Anemia"), preencha "variacoes" com os principais subtipos;
  caso contrário deixe [].
- Listas sem dados pertinentes ficam vazias. Não invente códigos CID.
- Seja CONCISO: no máximo ~6 itens por lista. Nunca corte a resposta no meio.`;
}
