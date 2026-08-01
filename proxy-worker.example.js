/* =================================================================
   Invictus.Med — proxy-worker.example.js
   -----------------------------------------------------------------
   Implementação de REFERÊNCIA do Cloudflare Worker que o front-end
   espera em CONFIG.PROXY_URL (script.js).

   Por que existe: com o proxy, a chave da IA fica no servidor e nunca
   aparece no código do site. O navegador só conversa com este Worker.

   Como usar:
     1. npm create cloudflare@latest invictus-proxy
     2. copie este arquivo para src/index.js
     3. npx wrangler secret put GEMINI_API_KEY
     4. npx wrangler deploy
     5. cole a URL publicada em CONFIG.PROXY_URL, no script.js

   Este arquivo é um EXEMPLO — se você já tem um Worker no ar, ele
   serve como documentação executável do contrato da API.
   ================================================================= */

/* Domínios autorizados a chamar o Worker. Deixe "*" só em testes:
   em produção, liste o seu site para evitar que terceiros gastem sua cota. */
const ORIGENS_PERMITIDAS = [
  "https://eckermann33.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
];

const MODELO = "gemini-2.5-flash";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_TERMO = 400;

/* =================================================================
   CORS
   ================================================================= */
function corsHeaders(origin) {
  const permitido = ORIGENS_PERMITIDAS.includes(origin) ? origin : ORIGENS_PERMITIDAS[0];
  return {
    "access-control-allow-origin": permitido,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    "vary": "Origin",
  };
}

const json = (body, status, origin) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders(origin) },
  });

/* O front-end lê { erro, codigo } e mostra o código no cantinho da mensagem. */
const erro = (codigo, mensagem, status, origin) =>
  json({ erro: mensagem, codigo }, status, origin);

/* =================================================================
   PROMPTS — um por modo de uso
   ================================================================= */
const REGRA_JSON =
  "Responda EXCLUSIVAMENTE com um objeto JSON válido, sem texto antes ou depois, " +
  "sem markdown e sem crases. Todo o conteúdo em português do Brasil.";

function promptFicha(termo) {
  return `Você é um assistente médico de referência clínica para estudantes e profissionais da saúde.
Analise o termo: "${termo}".

${REGRA_JSON}

Se for uma DOENÇA, SÍNDROME ou CONDIÇÃO, use este esquema:
{
  "nome": "", "cid10": "", "cid11": "", "sinonimos": [], "area_medica": "",
  "definicao": "2 a 4 frases",
  "sintomas_comuns": [], "sintomas_raros": [], "sinais_alerta": [],
  "tratamento": { "padrao": [], "medicamentos": [], "complementares": [], "prognostico": "" },
  "diagnostico": { "laboratoriais": [], "imagem": [], "criterios": [] },
  "complicacoes": [],
  "variacoes": [{ "nome": "", "definicao": "", "transmissao": "", "gravidade": "leve|moderada|grave", "tratamento": "" }],
  "diferenciais": [],
  "epidemiologia": { "prevalencia": "", "faixa_etaria": "", "sexo": "", "distribuicao_geografica": "" },
  "fisiopatologia": { "simples": "para leigos", "avancada": "para estudantes de medicina" },
  "referencias": []
}

Se for um FÁRMACO / MEDICAMENTO, use este outro esquema:
{
  "nome": "", "tipo": "farmaco", "area_medica": "", "sinonimos": [],
  "farmaco": {
    "principio_ativo": "", "classe": "", "para_que_serve": "2 a 4 frases",
    "doencas_tratadas": [], "mecanismo_simples": "", "mecanismo_avancado": "",
    "efeitos_adversos_comuns": [], "efeitos_adversos_graves": [],
    "contraindicacoes": [], "interacoes": []
  },
  "referencias": []
}

REGRAS:
- O termo pode descrever um CENÁRIO CLÍNICO com várias comorbidades. Nesse caso use "nome" como rótulo curto do quadro, faça um panorama integrado em "definicao" e preencha "variacoes" com uma entrada por condição.
- Se o termo for AMPLO (ex.: "Hepatite", "Anemia"), preencha "variacoes" com os principais subtipos; caso contrário deixe [].
- Listas sem dados pertinentes ficam vazias. Não invente códigos CID.
- Máximo ~6 itens por lista. Nunca corte a resposta no meio.`;
}

function promptCaso(termo) {
  return `Crie um caso clínico didático sobre "${termo}" para treinar raciocínio de estudantes de medicina.
${REGRA_JSON}
Esquema:
{
  "titulo": "", "apresentacao": "idade, sexo e contexto",
  "queixa": "queixa principal e história da doença atual",
  "antecedentes": "", "exame_fisico": "", "exames_complementares": "",
  "conduta": "conduta esperada", "pergunta_raciocinio": "uma pergunta aberta para reflexão"
}
Use um paciente fictício. Todos os campos devem ser texto simples (não objetos aninhados).`;
}

function promptQuiz(termo) {
  return `Crie 5 perguntas de múltipla escolha sobre "${termo}", nível estudante de medicina.
${REGRA_JSON}
Esquema:
{ "perguntas": [ { "pergunta": "", "alternativas": ["A","B","C","D"], "correta": 0, "explicacao": "por que a correta é a correta" } ] }
"correta" é o ÍNDICE (começando em 0) da alternativa certa. Sempre 4 alternativas plausíveis.`;
}

function promptFlashcards(termo) {
  return `Crie 8 flashcards de estudo sobre "${termo}".
${REGRA_JSON}
Esquema: { "cards": [ { "frente": "pergunta curta", "verso": "resposta objetiva" } ] }
A frente deve ser uma pergunta direta; o verso, uma resposta de 1 a 3 frases.`;
}

function promptResumo(termo) {
  return `Escreva um resumo de estudo sobre "${termo}", organizado em tópicos.
${REGRA_JSON}
Esquema: { "titulo": "", "topicos": [ { "titulo": "", "conteudo": "1 a 3 frases" } ] }
Entre 5 e 8 tópicos, cobrindo definição, fisiopatologia, quadro clínico, diagnóstico e tratamento.`;
}

function promptMapa(termo) {
  return `Monte um mapa mental sobre "${termo}".
${REGRA_JSON}
Esquema: { "central": "tema central", "ramos": [ { "titulo": "", "subitens": ["", ""] } ] }
Entre 4 e 6 ramos, cada um com 3 a 5 subitens curtos (poucas palavras).`;
}

function promptAbnt(termo, referencias) {
  const lista = (referencias || []).filter(Boolean).join("; ") || "(nenhuma informada)";
  return `Formate as referências abaixo no padrão ABNT (NBR 6023), sobre o tema "${termo}".
Referências informadas: ${lista}
${REGRA_JSON}
Esquema: { "abnt": ["referência 1 formatada", "referência 2 formatada"] }
Use apenas obras reais e reconhecidas. Não invente autores, editoras nem anos.`;
}

const PROMPTS = {
  caso: promptCaso,
  quiz: promptQuiz,
  flashcards: promptFlashcards,
  resumo: promptResumo,
  mapa: promptMapa,
};

/* =================================================================
   CHAMADA À IA
   ================================================================= */
async function chamarGemini(prompt, apiKey) {
  const res = await fetch(`${GEMINI_URL}/${MODELO}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.3,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const detalhe = await res.text().catch(() => "");
    const e = new Error(`Gemini ${res.status}: ${detalhe.slice(0, 200)}`);
    e.status = res.status;
    throw e;
  }

  const data = await res.json();
  const texto = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
  if (!texto) throw new Error("Resposta vazia da IA");
  return texto;
}

/* Tolerante a crases e texto extra em volta do JSON */
function extrairJSON(texto) {
  let t = String(texto).trim().replace(/```json|```/gi, "").trim();
  const ini = t.indexOf("{"), fim = t.lastIndexOf("}");
  if (ini !== -1 && fim !== -1) t = t.slice(ini, fim + 1);
  return JSON.parse(t);
}

/* =================================================================
   HANDLER
   ================================================================= */
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== "POST") {
      return erro("METODO", "Use POST.", 405, origin);
    }
    if (!env.GEMINI_API_KEY) {
      return erro("SEM-CHAVE", "Chave da IA não configurada no Worker.", 500, origin);
    }

    let body;
    try { body = await request.json(); }
    catch { return erro("JSON", "Corpo da requisição inválido.", 400, origin); }

    const termo = String(body?.termo || "").trim().slice(0, MAX_TERMO);
    const modo = String(body?.modo || "ficha");
    if (!termo) return erro("TERMO", "Informe um termo.", 400, origin);

    let prompt;
    if (modo === "ficha") prompt = promptFicha(termo);
    else if (modo === "abnt") prompt = promptAbnt(termo, body?.referencias);
    else if (PROMPTS[modo]) prompt = PROMPTS[modo](termo);
    else return erro("MODO", "Modo desconhecido.", 400, origin);

    try {
      const bruto = await chamarGemini(prompt, env.GEMINI_API_KEY);
      return json(extrairJSON(bruto), 200, origin);
    } catch (e) {
      // 429 do provedor → o front mostra "muitas pesquisas no momento"
      if (e.status === 429) return erro("LIMITE-429", "Limite de consultas atingido.", 429, origin);
      if (e instanceof SyntaxError) return erro("PARSE", "A IA devolveu um formato inesperado.", 502, origin);
      return erro("IA", "Falha ao consultar a IA.", 502, origin);
    }
  },
};
