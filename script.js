/* =================================================================
   Invictus.Med — script.js
   Lógica da aplicação: IA configurável, busca, renderização de ficha
   clínica, histórico, favoritos, voz, sugestões, exportação.
   JavaScript puro — sem frameworks.
   ================================================================= */

"use strict";

/* =================================================================
   1) CONFIGURAÇÃO DA IA
   -----------------------------------------------------------------
   Há dois caminhos gratuitos com o Google Gemini:

   • PROVIDER: "proxy"  (RECOMENDADO) — a chave fica escondida num
     servidor gratuito (Cloudflare Worker). Veja proxy-worker.js.
     Configure apenas CONFIG.PROXY_URL com a URL do seu Worker.
     Neste modo, a const API_KEY abaixo é ignorada.

   • PROVIDER: "gemini" — chama o Google direto do navegador. Mais
     simples, mas a chave fica VISÍVEL no código. Use só para testes.
     Neste modo, cole a chave em const API_KEY.

   Provedores pagos opcionais: "openai" e "anthropic".

   ⚠️ Privacidade: este site só envia o NOME da doença para a IA.
   Nunca digite dados de pacientes na busca.
   ================================================================= */
const API_KEY = "INSERIR_CHAVE_AQUI";   // ← só é usada se PROVIDER for "gemini" direto

const CONFIG = {
  API_KEY: API_KEY,
  // "proxy"  = chave escondida no servidor (Cloudflare Worker) — RECOMENDADO
  // "gemini" = chave direto no navegador (grátis, mas a chave fica visível)
  // "openai" / "anthropic" = provedores pagos
  PROVIDER: "proxy",
  PROXY_URL: "https://invictus-proxy.n9rn6tsb26.workers.dev/",   // ← URL do seu Worker
  MODEL: "gemini-2.5-flash",
  MAX_TOKENS: 8192,
  // Endpoint para relatos de erro de conteúdo. Vazio = o site monta o texto
  // e oferece cópia, em vez de enviar sozinho.
  REPORT_URL: "",
  // Tempo máximo de espera por uma resposta (ms). Evita o carregamento infinito.
  TIMEOUT_MS: 45000,
  // Tamanho máximo do termo enviado à IA (evita payloads abusivos).
  MAX_TERM_LEN: 400,
  // Endpoints
  GEMINI_URL: "https://generativelanguage.googleapis.com/v1beta/models",
  ANTHROPIC_URL: "https://api.anthropic.com/v1/messages",
  ANTHROPIC_VERSION: "2023-06-01",
  OPENAI_URL: "https://api.openai.com/v1/chat/completions",
};

/* =================================================================
   MEUS PROJETOS — edite aqui livremente.
   "nome" = o texto que aparece (a máscara). "url" = o link real.
   Adicione/remova quantos quiser, no formato { nome: "...", url: "..." },
   ================================================================= */
const PROJECTS = [
  { nome: "Teste para prática de Neuro", url: "https://eckermann33.github.io/prova-neuro-/" },
  { nome: "Conversor de arquivos", url: "https://eckermann33.github.io/conversor-de-arquivos/" },
  { nome: "Instagram — @_eckermann", url: "https://www.instagram.com/_eckermann" },
  { nome: "DPOC-CLINICO", url: "https://eckermann33.github.io/DPOC-Clinico/" },
  // { nome: "Outro projeto", url: "https://..." },
];

/* =================================================================
   2) PROMPT ESTRUTURADO (retorno em JSON em português)
   ================================================================= */
function buildPrompt(termo) {
  return `Você é um assistente médico de referência clínica para estudantes e profissionais da saúde.
Analise o termo: "${termo}".

Responda EXCLUSIVAMENTE com um objeto JSON válido (sem texto antes ou depois, sem markdown, sem crases) seguindo EXATAMENTE este esquema e em português do Brasil:

{
  "nome": "nome correto e completo da condição",
  "cid10": "código CID-10 ou ''",
  "cid11": "código CID-11 ou ''",
  "sinonimos": ["sinônimos populares e técnicos"],
  "area_medica": "especialidade(s) relacionada(s)",
  "definicao": "explicação médica objetiva e clara (2 a 4 frases)",
  "sintomas_comuns": ["sintomas mais frequentes"],
  "sintomas_raros": ["sintomas raros ou menos frequentes"],
  "sinais_alerta": ["sinais que exigem avaliação médica URGENTE"],
  "tratamento": {
    "padrao": ["condutas e tratamento padrão"],
    "medicamentos": ["medicamentos/classes frequentemente usados"],
    "complementares": ["tratamentos complementares ou de suporte"],
    "prognostico": "prognóstico geral em 1 a 2 frases"
  },
  "diagnostico": {
    "laboratoriais": ["exames laboratoriais"],
    "imagem": ["exames de imagem"],
    "criterios": ["critérios diagnósticos relevantes"]
  },
  "complicacoes": ["possíveis complicações"],
  "variacoes": [
    { "nome": "", "definicao": "", "transmissao": "(apenas se infecciosa, senão '')", "gravidade": "leve|moderada|grave", "tratamento": "" }
  ],
  "diferenciais": ["doenças semelhantes que podem ser confundidas"],
  "epidemiologia": {
    "prevalencia": "",
    "faixa_etaria": "faixa etária mais acometida",
    "sexo": "sexo mais acometido",
    "distribuicao_geografica": ""
  },
  "fisiopatologia": {
    "simples": "explicação simplificada para leigos",
    "avancada": "explicação detalhada para estudantes de medicina"
  },
  "referencias": ["fontes médicas reconhecidas utilizadas"]
}

SE O TERMO FOR UM FÁRMACO / MEDICAMENTO (ex.: "Sertralina", "Metformina", "Omeprazol"), ignore o esquema acima e responda com ESTE outro esquema:

{
  "nome": "nome do fármaco",
  "tipo": "farmaco",
  "area_medica": "especialidade(s) em que é mais usado",
  "sinonimos": ["nomes comerciais e sinônimos"],
  "farmaco": {
    "principio_ativo": "",
    "classe": "classe farmacológica",
    "para_que_serve": "explicação objetiva (2 a 4 frases)",
    "doencas_tratadas": ["condições tratadas"],
    "mecanismo_simples": "mecanismo de ação em linguagem acessível",
    "mecanismo_avancado": "mecanismo detalhado (receptores, vias, farmacocinética)",
    "efeitos_adversos_comuns": [],
    "efeitos_adversos_graves": [],
    "contraindicacoes": [],
    "interacoes": ["interações medicamentosas relevantes"]
  },
  "referencias": ["fontes médicas reconhecidas utilizadas"]
}

REGRAS IMPORTANTES:
- O termo pode descrever um CENÁRIO CLÍNICO com VÁRIAS condições/comorbidades (ex.: "paciente com hipertensão arterial sistêmica, diabetes tipo 2 e obesidade"). Nesse caso: use "nome" como rótulo curto do quadro (ex.: "Quadro clínico: HAS + DM2 + Obesidade"); em "definicao" faça um panorama integrado das comorbidades e como se relacionam; preencha "variacoes" com UMA entrada por condição individual (nome, definicao, gravidade, tratamento); em "tratamento" priorize o manejo integrado; em "complicacoes" destaque os riscos combinados; em "diferenciais" relacione condições associadas.
- Se o termo for AMPLO (ex.: "Hepatite", "Diabetes", "Anemia"), preencha "variacoes" com os principais tipos/subtipos. Caso contrário, deixe "variacoes" como [].
- Listas sem dados pertinentes devem ficar vazias ([]). Não invente códigos CID.
- Seja CONCISO: no máximo ~6 itens por lista. Responda SOMENTE com o JSON COMPLETO e válido — nunca corte a resposta no meio.`;
}

/* =================================================================
   3) ATALHOS DE DOM
   ================================================================= */
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const els = {
  input:      $("#searchInput"),
  analyze:    $("#btnAnalyze"),
  voice:      $("#btnVoice"),
  suggestions:$("#suggestions"),
  loader:     $("#loader"),
  loaderText: $("#loaderText"),
  loaderMsg:  $("#loaderMsg"),
  notice:     $("#notice"),
  results:    $("#results"),
  content:    $("#content"),
  tocNav:     $("#tocNav"),
  empty:      $("#empty"),
  hero:       $("#hero"),
  toast:      $("#toast"),
  // Aba de estudo
  studyView:  $("#studyView"),
  studyOut:   $("#studyOut"),
  studyTema:  $("#studyTema"),
  // Drawer
  drawer:      $("#drawer"),
  drawerScrim: $("#drawerScrim"),
  drawerTitle: $("#drawerTitle"),
  drawerList:  $("#drawerList"),
  drawerTools: $("#drawerTools"),
  drawerEmpty: $("#drawerEmpty"),
};

/* Estado em memória */
let currentData = null;     // último resultado renderizado
let suggIndex = -1;         // item de sugestão destacado (teclado)

/* =================================================================
   4) UTILITÁRIOS
   ================================================================= */
const escapeHTML = (s = "") =>
  String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

function show(el)  { el.hidden = false; }
function hide(el)  { el.hidden = true; }

function toast(msg) {
  els.toast.textContent = msg;
  show(els.toast);
  requestAnimationFrame(() => els.toast.classList.add("is-show"));
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    els.toast.classList.remove("is-show");
    setTimeout(() => hide(els.toast), 260);
  }, 2200);
}

/* localStorage seguro */
const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  },
};

/* Lista salva no localStorage, já higienizada (descarta itens corrompidos) */
function readList(key) {
  const raw = store.get(key, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter(x => x && typeof x.nome === "string" && x.nome.trim());
}

/* Erro com código técnico anexado (usado no cantinho discreto da mensagem) */
function errWithCode(message, codigo) {
  const e = new Error(message);
  e.codigo = codigo || "ERR";
  return e;
}
const codeOf = err => (err && err.codigo) ? String(err.codigo) : "";

/* Copiar texto — usa a API moderna e cai para um método antigo se ela falhar
   (o clipboard só existe em contexto seguro: https:// ou localhost). */
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* segue para o método reserva */ }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:-1000px;opacity:0;";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

/* =================================================================
   5) SUGESTÕES AUTOMÁTICAS (lista interna de condições)
   ================================================================= */
const DICIONARIO = [
  "Hipertensão Arterial","Diabetes","Diabetes tipo 1","Diabetes tipo 2","Diabetes gestacional",
  "Hepatite","Hepatite A","Hepatite B","Hepatite C","Anemia","Anemia ferropriva","Anemia falciforme",
  "Asma","Bronquite","Pneumonia","Tuberculose","COVID-19","Influenza","Dengue","Zika","Chikungunya",
  "Lúpus Eritematoso Sistêmico","Artrite Reumatoide","Fibromialgia","Gota","Osteoporose",
  "Doença de Crohn","Retocolite Ulcerativa","Síndrome do Intestino Irritável","Refluxo Gastroesofágico",
  "Úlcera Péptica","Cirrose Hepática","Pancreatite","Cálculo Renal","Insuficiência Renal Crônica",
  "Infarto Agudo do Miocárdio","Insuficiência Cardíaca","Arritmia","Fibrilação Atrial","AVC",
  "Enxaqueca","Epilepsia","Doença de Parkinson","Doença de Alzheimer","Esclerose Múltipla",
  "Depressão","Transtorno de Ansiedade","Transtorno Bipolar","Esquizofrenia","TDAH","TOC",
  "Hipotireoidismo","Hipertireoidismo","Tireoidite de Hashimoto","Síndrome de Cushing",
  "Câncer de Mama","Câncer de Próstata","Câncer Colorretal","Leucemia","Linfoma",
  "Psoríase","Dermatite Atópica","Vitiligo","Acne","Rosácea","Herpes Zóster","Catapora",
  "Sarampo","Caxumba","Rubéola","Sífilis","Gonorreia","HIV/AIDS","HPV",
  "Doença Celíaca","Intolerância à Lactose","Obesidade","Dislipidemia","Síndrome Metabólica",
  "DPOC","Apneia do Sono","Sinusite","Rinite Alérgica","Otite","Conjuntivite","Glaucoma","Catarata",
  "Endometriose","Síndrome dos Ovários Policísticos","Miomatose Uterina","Pré-eclâmpsia",
  "Meningite","Sepse","Apendicite","Colecistite","Hérnia de Disco","Tendinite","Bursite",
  "Doença de Chagas","Leishmaniose","Malária","Esquistossomose","Toxoplasmose",
  "Losartana","Enalapril","Hidroclorotiazida","Anlodipino","Metformina","Insulina",
  "Omeprazol","Sinvastatina","Atorvastatina","Sertralina","Fluoxetina","Risperidona",
  "Haloperidol","Diazepam","Clonazepam","Amoxicilina","Azitromicina","Dipirona",
  "Paracetamol","Ibuprofeno","Prednisona","Levotiroxina","Varfarina","Salbutamol",
];

/* Destaca o trecho pesquisado sem quebrar o escape de HTML
   (fatiar antes de escapar evita marcar posições erradas em termos com &, < ou "). */
function highlightMatch(text, q) {
  const i = text.toLowerCase().indexOf(q);
  if (i === -1) return escapeHTML(text);
  return escapeHTML(text.slice(0, i))
    + `<mark>${escapeHTML(text.slice(i, i + q.length))}</mark>`
    + escapeHTML(text.slice(i + q.length));
}

function renderSuggestions(query) {
  const q = query.trim().toLowerCase();
  if (q.length < 1) { hideSuggestions(); return; }

  const matches = DICIONARIO
    .filter(d => d.toLowerCase().includes(q))
    .slice(0, 8);

  if (!matches.length) { hideSuggestions(); return; }

  els.suggestions.innerHTML = matches.map((m, i) =>
    `<li id="sugg-${i}" role="option" data-val="${escapeHTML(m)}" aria-selected="false">
      <span class="s-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-3-3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
      <span>${highlightMatch(m, q)}</span>
    </li>`).join("");

  suggIndex = -1;
  els.suggestions.hidden = false;
  els.input.setAttribute("aria-expanded", "true");
  els.input.removeAttribute("aria-activedescendant");
}

function hideSuggestions() {
  els.suggestions.hidden = true;
  els.input.setAttribute("aria-expanded", "false");
  els.input.removeAttribute("aria-activedescendant");
  suggIndex = -1;
}

/* =================================================================
   6) CHAMADA À IA
   ================================================================= */
/* O Worker está configurado? (aceita tanto o placeholder antigo quanto vazio) */
const isProxyConfigured = () =>
  Boolean(CONFIG.PROXY_URL) && !/INSERIR[-_]URL/i.test(CONFIG.PROXY_URL);

/* fetch com prazo máximo + cancelamento externo.
   Sem isso, uma resposta que nunca chega deixa o loader girando para sempre. */
async function fetchWithTimeout(url, init = {}, outerSignal) {
  const ctrl = new AbortController();
  const abortNow = () => ctrl.abort();
  if (outerSignal) {
    if (outerSignal.aborted) ctrl.abort();
    else outerSignal.addEventListener("abort", abortNow, { once: true });
  }
  const timer = setTimeout(abortNow, CONFIG.TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (e && e.name === "AbortError") {
      // Cancelado por uma nova busca do usuário × estourou o tempo: são coisas diferentes
      throw outerSignal && outerSignal.aborted
        ? errWithCode("CANCELLED", "CANCELLED")
        : errWithCode("TIMEOUT", "TIMEOUT");
    }
    throw errWithCode(e && e.message || "NETWORK", "REDE");
  } finally {
    clearTimeout(timer);
    if (outerSignal) outerSignal.removeEventListener("abort", abortNow);
  }
}

/* Chamada única ao Worker — usada pela ficha, pelo estudo de caso,
   pelas ferramentas de estudo e pelas referências em ABNT. */
async function postProxy(payload, outerSignal) {
  if (!isProxyConfigured()) throw errWithCode("NO_PROXY", "NO_PROXY");

  const res = await fetchWithTimeout(CONFIG.PROXY_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }, outerSignal);

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Erro com o código técnico do Worker anexado (para o cantinho discreto)
    throw errWithCode(data.erro || `HTTP ${res.status}`, data.codigo || `HTTP-${res.status}`);
  }
  return data;
}

/* A resposta parece mesmo uma ficha clínica? Um objeto vazio renderizaria
   uma tela sem conteúdo — melhor avisar que não deu certo. */
function isFichaValida(d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return false;
  const texto = v => typeof v === "string" && v.trim();
  const lista = v => Array.isArray(v) && v.length > 0;
  const temConteudo = v => texto(v) || lista(v);

  // O proxy devolve a chave "farmaco" mesmo em fichas de doença (com os campos
  // vazios). Verificar só a existência do objeto aceitaria uma ficha em branco.
  const farmacoPreenchido = d.farmaco && typeof d.farmaco === "object" &&
    Object.values(d.farmaco).some(temConteudo);

  return Boolean(
    texto(d.definicao) || lista(d.sintomas_comuns) || lista(d.variacoes) ||
    farmacoPreenchido || (texto(d.nome) && (lista(d.diferenciais) || lista(d.complicacoes)))
  );
}

async function fetchAnalysis(termo, signal) {
  /* ---- Modo proxy: a chave fica no servidor (Cloudflare Worker) ---- */
  if (CONFIG.PROVIDER === "proxy") {
    if (!isProxyConfigured()) {
      const demo = getDemo(termo);
      if (demo) return demo;
      throw errWithCode("NO_PROXY", "NO_PROXY");
    }
    const data = await postProxy({ termo }, signal); // o Worker devolve a ficha pronta
    if (!isFichaValida(data)) throw errWithCode("BAD_SHAPE", "FICHA");
    return data;
  }

  /* ---- Modos diretos (chave no navegador) ---- */
  // Sem chave configurada → tenta demonstração offline
  if (!CONFIG.API_KEY || CONFIG.API_KEY === "INSERIR_CHAVE_AQUI") {
    const demo = getDemo(termo);
    if (demo) return demo;
    throw errWithCode("NO_KEY", "NO_KEY");
  }

  const prompt = buildPrompt(termo);
  let raw;

  if (CONFIG.PROVIDER === "gemini") {
    // Endpoint nativo do Gemini — funciona direto do navegador (CORS ok).
    // responseMimeType: "application/json" força a resposta a vir só em JSON.
    const url = `${CONFIG.GEMINI_URL}/${CONFIG.MODEL}:generateContent?key=${encodeURIComponent(CONFIG.API_KEY)}`;
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: CONFIG.MAX_TOKENS,
          temperature: 0.3,
          responseMimeType: "application/json",
        },
      }),
    }, signal);
    if (!res.ok) throw errWithCode(`HTTP ${res.status}`, `HTTP-${res.status}`);
    const data = await res.json();
    raw = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
  } else if (CONFIG.PROVIDER === "anthropic") {
    const res = await fetchWithTimeout(CONFIG.ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": CONFIG.API_KEY,
        "anthropic-version": CONFIG.ANTHROPIC_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: CONFIG.MODEL,
        max_tokens: CONFIG.MAX_TOKENS,
        messages: [{ role: "user", content: prompt }],
      }),
    }, signal);
    if (!res.ok) throw errWithCode(`HTTP ${res.status}`, `HTTP-${res.status}`);
    const data = await res.json();
    raw = (data.content || []).map(b => b.text || "").join("");
  } else {
    // OpenAI-compatível
    const res = await fetchWithTimeout(CONFIG.OPENAI_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${CONFIG.API_KEY}`,
      },
      body: JSON.stringify({
        model: CONFIG.MODEL,
        max_tokens: CONFIG.MAX_TOKENS,
        messages: [
          { role: "system", content: "Responda apenas com JSON válido, sem markdown." },
          { role: "user", content: prompt },
        ],
      }),
    }, signal);
    if (!res.ok) throw errWithCode(`HTTP ${res.status}`, `HTTP-${res.status}`);
    const data = await res.json();
    raw = data?.choices?.[0]?.message?.content || "";
  }

  const ficha = parseJSON(raw);
  if (!isFichaValida(ficha)) throw errWithCode("BAD_SHAPE", "FICHA");
  return ficha;
}

/* Extrai e valida o JSON da resposta (tolerante a crases/texto extra) */
function parseJSON(text) {
  let t = String(text).trim().replace(/```json|```/gi, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end !== -1) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

/* Mensagens que se alternam enquanto a IA "pensa" */
const THINKING_MSGS = [
  "Consultando a base clínica",
  "Analisando sintomas e sinais",
  "Cruzando diagnósticos diferenciais",
  "Revisando condutas e tratamentos",
  "Organizando a ficha clínica",
];
let thinkingTimer = null;

function startThinking() {
  let i = 0;
  if (els.loaderMsg) els.loaderMsg.textContent = THINKING_MSGS[0];
  clearInterval(thinkingTimer);
  thinkingTimer = setInterval(() => {
    i = (i + 1) % THINKING_MSGS.length;
    if (els.loaderMsg) els.loaderMsg.textContent = THINKING_MSGS[i];
  }, 1700);
}
function stopThinking() { clearInterval(thinkingTimer); thinkingTimer = null; }

/* Volta para a tela de busca para fazer outra pergunta */
function resetToSearch() {
  if (activeSearch) { activeSearch.abort(); activeSearch = null; }
  searchSeq++;                 // invalida qualquer resposta ainda a caminho
  setBusy(false);
  stopThinking();
  hide(els.studyView);
  hide(els.results);
  hide(els.notice);
  hide(els.loader);
  show(els.hero);
  show(els.empty);
  els.input.value = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
  setTimeout(() => els.input.focus(), 350);
}

/* =================================================================
   7) FLUXO DE BUSCA
   ================================================================= */
let activeSearch = null;   // AbortController da busca em andamento
let searchSeq = 0;         // descarta respostas que chegam fora de ordem

/* Trava/destrava a interface enquanto a IA responde */
function setBusy(busy) {
  if (els.analyze) {
    els.analyze.disabled = busy;
    els.analyze.setAttribute("aria-busy", busy ? "true" : "false");
  }
  if (els.loader) els.loader.setAttribute("aria-busy", busy ? "true" : "false");
}

async function analyze(termRaw) {
  const term = (termRaw ?? els.input.value).trim().slice(0, CONFIG.MAX_TERM_LEN);
  if (!term) { els.input.focus(); return; }

  // Uma busca nova cancela a anterior — sem isso, a resposta mais lenta
  // poderia sobrescrever a mais recente na tela.
  if (activeSearch) activeSearch.abort();
  const ctrl = new AbortController();
  activeSearch = ctrl;
  const seq = ++searchSeq;

  hideSuggestions();
  hide(els.notice);
  hide(els.results);
  hide(els.studyView);
  hide($("#anamneseView"));
  hide($("#calcView"));
  hide(els.empty);
  hide(els.hero);
  show(els.loader);
  setBusy(true);
  startThinking();
  window.scrollTo({ top: 0, behavior: "smooth" });

  try {
    const data = await fetchAnalysis(term, ctrl.signal);
    if (seq !== searchSeq) return;              // resposta obsoleta
    currentData = data;
    renderResult(data);
    addToHistory(data.nome || term);
    stopThinking();
    hide(els.loader);
    show(els.results);
  } catch (err) {
    if (seq !== searchSeq || codeOf(err) === "CANCELLED") return;
    stopThinking();
    hide(els.loader);
    showError(err);
    show(els.hero);
  } finally {
    if (seq === searchSeq) { setBusy(false); activeSearch = null; }
  }
}

function showError(err) {
  const m = String(err && err.message || "");
  const codigo = codeOf(err) || "ERR";
  let msg;
  let soft = true; // visual suave (não vermelho) para mensagens ao usuário

  if (/429|limite|limit|quota|exceeded|resource_exhausted/i.test(m + " " + codigo)) {
    // Limite atingido — mensagem calma, sem jargão
    msg = `<b>Muitas pesquisas no momento.</b> O site atingiu o limite temporário de consultas.
      Tente novamente daqui a alguns minutos. 🙂`;
  } else if (m === "NO_PROXY" || m === "NO_KEY") {
    // Aviso de configuração — só aparece para o desenvolvedor, antes de publicar
    soft = false;
    msg = `<b>Configuração pendente.</b> A conexão com a IA ainda não foi definida
      (veja <code>CONFIG.PROXY_URL</code> no <code>script.js</code>). Por enquanto, apenas os
      exemplos de demonstração funcionam.`;
  } else if (codigo === "TIMEOUT") {
    msg = `<b>A análise está demorando mais que o normal.</b> A conexão pode estar instável —
      tente novamente em instantes.`;
  } else if (codigo === "REDE") {
    msg = `<b>Sem conexão com o servidor.</b> Verifique sua internet e tente de novo.`;
  } else if (codigo === "FICHA" || err instanceof SyntaxError) {
    msg = `<b>Não consegui montar a ficha desta vez.</b> Tente novamente ou refine o termo da busca.`;
  } else {
    // Qualquer outra falha → mensagem genérica e tranquila
    msg = `<b>Não foi possível completar a análise agora.</b> Tente novamente em instantes.`;
  }

  // Código técnico pequenininho — sempre visível para diagnóstico, sem revelar o motivo
  els.notice.className = "notice" + (soft ? " notice--soft" : "");
  els.notice.innerHTML = msg + `<span class="notice__code">cód. ${escapeHTML(codigo)}</span>`;
  show(els.notice);
}

/* =================================================================
   8) RENDERIZAÇÃO DA FICHA
   ================================================================= */
const ICON = {
  def:     '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 5h16v14H4zM4 9h16M9 13h7M9 16h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  symp:    '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M3 12h3l2-6 4 12 2-6h7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  treat:   '<svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="8" width="13" height="8" rx="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.5 8v8" stroke="currentColor" stroke-width="1.8"/><circle cx="18" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  diag:    '<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m15 15 5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  compl:   '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 3 2 20h20zM12 9v5M12 17h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  var:     '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M6 3v6a6 6 0 0 0 12 0V3M12 15v6M8 21h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  diff:    '<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="8" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="16" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  epi:     '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 19V5M4 19h16M8 16l3-4 3 2 4-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  fisio:   '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-1 5 3 3 0 0 0 1 5 3 3 0 0 0 3 3 3 3 0 0 0 3-1V4a3 3 0 0 0-3-1z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  refs:    '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2zM18 20a2 2 0 0 0 2-2V8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  alert:   '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 3 2 20h20zM12 9v5M12 17h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

/* Monta uma lista de chips, ou retorna '' se vazio */
function chipList(arr, cls = "") {
  if (!arr || !arr.length) return "";
  return `<div class="taglist ${cls}">${arr.map(x => `<span class="tag">${escapeHTML(x)}</span>`).join("")}</div>`;
}
function bulletList(arr) {
  if (!arr || !arr.length) return "";
  return `<ul class="bullets">${arr.map(x => `<li>${escapeHTML(x)}</li>`).join("")}</ul>`;
}

/* Cada seção: { id, label, html } — só entra se tiver conteúdo */
function buildSections(d) {
  const S = [];
  const has = v => Array.isArray(v) ? v.length : (v && String(v).trim());

  /* Definição */
  if (has(d.definicao)) S.push({ id: "definicao", label: "Definição", html: `
    <div class="card__head"><span class="card__ico">${ICON.def}</span><h2 class="card__title">Definição</h2></div>
    <p>${escapeHTML(d.definicao)}</p>` });

  /* Sintomas */
  if (has(d.sintomas_comuns) || has(d.sintomas_raros) || has(d.sinais_alerta)) {
    let h = `<div class="card__head"><span class="card__ico">${ICON.symp}</span><h2 class="card__title">Principais sintomas</h2></div>`;
    if (has(d.sintomas_comuns)) h += `<p class="sub">Sintomas comuns</p>${chipList(d.sintomas_comuns, "taglist--common")}`;
    if (has(d.sintomas_raros))  h += `<p class="sub">Sintomas incomuns</p>${chipList(d.sintomas_raros, "taglist--rare")}`;
    if (has(d.sinais_alerta))   h += `<p class="sub sub--alert">${ICON.alert} Sinais de alerta — avaliação urgente</p>
        <div class="alert-box">${bulletList(d.sinais_alerta)}</div>`;
    S.push({ id: "sintomas", label: "Sintomas", html: h });
  }

  /* Tratamento */
  const t = d.tratamento || {};
  if (has(t.padrao) || has(t.medicamentos) || has(t.complementares) || has(t.prognostico)) {
    let h = `<div class="card__head"><span class="card__ico">${ICON.treat}</span><h2 class="card__title">Tratamento</h2></div>`;
    if (has(t.padrao))         h += `<p class="sub">Tratamento padrão</p>${bulletList(t.padrao)}`;
    if (has(t.medicamentos))   h += `<p class="sub">Medicamentos frequentemente utilizados</p>${chipList(t.medicamentos)}`;
    if (has(t.complementares)) h += `<p class="sub">Tratamentos complementares</p>${bulletList(t.complementares)}`;
    if (has(t.prognostico))    h += `<div class="prognosis"><p class="sub">Prognóstico</p><p>${escapeHTML(t.prognostico)}</p></div>`;
    S.push({ id: "tratamento", label: "Tratamento", html: h });
  }

  /* Diagnóstico */
  const dg = d.diagnostico || {};
  if (has(dg.laboratoriais) || has(dg.imagem) || has(dg.criterios)) {
    let h = `<div class="card__head"><span class="card__ico">${ICON.diag}</span><h2 class="card__title">Diagnóstico</h2></div>`;
    if (has(dg.laboratoriais)) h += `<p class="sub">Exames laboratoriais</p>${chipList(dg.laboratoriais)}`;
    if (has(dg.imagem))        h += `<p class="sub">Exames de imagem</p>${chipList(dg.imagem)}`;
    if (has(dg.criterios))     h += `<p class="sub">Critérios diagnósticos</p>${bulletList(dg.criterios)}`;
    S.push({ id: "diagnostico", label: "Diagnóstico", html: h });
  }

  /* Complicações */
  if (has(d.complicacoes)) S.push({ id: "complicacoes", label: "Complicações", html: `
    <div class="card__head"><span class="card__ico">${ICON.compl}</span><h2 class="card__title">Complicações</h2></div>
    ${bulletList(d.complicacoes)}` });

  /* Variações (subtipos) */
  if (has(d.variacoes)) {
    const cards = d.variacoes.map(v => {
      const sev = (v.gravidade || "").toLowerCase();
      const sevCls = sev.includes("grav") ? "sev--grave" : sev.includes("mod") ? "sev--mod" : sev ? "sev--leve" : "";
      const sevTag = v.gravidade ? `<span class="sev ${sevCls}">${escapeHTML(v.gravidade)}</span>` : "";
      let meta = "";
      if (has(v.transmissao)) meta += `<span><b>Transmissão:</b> ${escapeHTML(v.transmissao)}</span>`;
      if (has(v.tratamento))  meta += `<span><b>Tratamento:</b> ${escapeHTML(v.tratamento)}</span>`;
      return `<article class="vcard">
        <div class="vcard__name">${escapeHTML(v.nome || "")} ${sevTag}</div>
        ${has(v.definicao) ? `<p>${escapeHTML(v.definicao)}</p>` : ""}
        <div class="vcard__meta">${meta}</div>
      </article>`;
    }).join("");
    S.push({ id: "variacoes", label: "Variações", html: `
      <div class="card__head"><span class="card__ico">${ICON.var}</span><h2 class="card__title">Variações da doença</h2></div>
      <div class="variations">${cards}</div>` });
  }

  /* Diferenciais */
  if (has(d.diferenciais)) {
    const items = d.diferenciais.map(x =>
      `<button class="diff" type="button" data-search="${escapeHTML(x)}">${escapeHTML(x)}
        <svg viewBox="0 0 24 24" width="13" height="13"><path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>`).join("");
    S.push({ id: "diferenciais", label: "Diferenciais", html: `
      <div class="card__head"><span class="card__ico">${ICON.diff}</span><h2 class="card__title">Diferenciais diagnósticos</h2></div>
      <div class="diff-list">${items}</div>` });
  }

  /* Epidemiologia */
  const e = d.epidemiologia || {};
  if (has(e.prevalencia) || has(e.faixa_etaria) || has(e.sexo) || has(e.distribuicao_geografica)) {
    const kv = [
      ["Prevalência", e.prevalencia],
      ["Faixa etária", e.faixa_etaria],
      ["Sexo mais acometido", e.sexo],
      ["Distribuição geográfica", e.distribuicao_geografica],
    ].filter(([, v]) => has(v))
     .map(([k, v]) => `<div class="kv"><div class="kv__k">${k}</div><div class="kv__v">${escapeHTML(v)}</div></div>`).join("");
    S.push({ id: "epidemiologia", label: "Epidemiologia", html: `
      <div class="card__head"><span class="card__ico">${ICON.epi}</span><h2 class="card__title">Epidemiologia</h2></div>
      <div class="kv-grid">${kv}</div>` });
  }

  /* Fisiopatologia (abas simples/avançada) */
  const f = d.fisiopatologia || {};
  if (has(f.simples) || has(f.avancada)) {
    S.push({ id: "fisiopatologia", label: "Fisiopatologia", html: `
      <div class="card__head"><span class="card__ico">${ICON.fisio}</span><h2 class="card__title">Fisiopatologia</h2></div>
      <div class="tabs">
        <button class="tab active" type="button" data-tab="f-simples">Simplificada</button>
        <button class="tab" type="button" data-tab="f-avancada">Avançada (medicina)</button>
      </div>
      <div class="tab-panel active" id="f-simples"><p>${escapeHTML(f.simples || "—")}</p></div>
      <div class="tab-panel" id="f-avancada"><p>${escapeHTML(f.avancada || "—")}</p></div>` });
  }

  /* Referências */
  if (has(d.referencias)) S.push({ id: "referencias", label: "Referências", html: `
    <div class="card__head"><span class="card__ico">${ICON.refs}</span><h2 class="card__title">Referências</h2></div>
    ${listaReferencias(d.referencias)}
    <button class="abnt-btn" id="btnAbnt" type="button">Formatar em ABNT</button>
    <div class="abnt-out" id="abntOut" hidden></div>` });

  return S;
}

/* Seções específicas para FÁRMACOS (mesmos cards, conteúdo diferente) */
function buildDrugSections(d) {
  const f = d.farmaco || {};
  const has = v => Array.isArray(v) ? v.length : (v && String(v).trim());
  const S = [];

  if (has(f.para_que_serve) || has(f.doencas_tratadas)) {
    let h = `<div class="card__head"><span class="card__ico">${ICON.def}</span><h2 class="card__title">Para que serve</h2></div>`;
    if (has(f.para_que_serve)) h += `<p>${escapeHTML(f.para_que_serve)}</p>`;
    if (has(f.doencas_tratadas)) h += `<p class="sub">Doenças e condições tratadas</p>${chipList(f.doencas_tratadas, "taglist--common")}`;
    S.push({ id: "indicacoes", label: "Indicações", html: h });
  }

  if (has(f.mecanismo_simples) || has(f.mecanismo_avancado)) {
    S.push({ id: "mecanismo", label: "Mecanismo", html: `
      <div class="card__head"><span class="card__ico">${ICON.fisio}</span><h2 class="card__title">Mecanismo de ação</h2></div>
      <div class="tabs">
        <button class="tab active" type="button" data-tab="m-simples">Simplificado</button>
        <button class="tab" type="button" data-tab="m-avancado">Avançado (receptores/vias)</button>
      </div>
      <div class="tab-panel active" id="m-simples"><p>${escapeHTML(f.mecanismo_simples || "—")}</p></div>
      <div class="tab-panel" id="m-avancado"><p>${escapeHTML(f.mecanismo_avancado || "—")}</p></div>` });
  }

  if (has(f.efeitos_adversos_comuns) || has(f.efeitos_adversos_graves)) {
    let h = `<div class="card__head"><span class="card__ico">${ICON.compl}</span><h2 class="card__title">Efeitos adversos</h2></div>`;
    if (has(f.efeitos_adversos_comuns)) h += `<p class="sub">Comuns</p>${chipList(f.efeitos_adversos_comuns, "taglist--common")}`;
    if (has(f.efeitos_adversos_graves)) h += `<p class="sub sub--alert">${ICON.alert} Graves — exigem atenção</p><div class="alert-box">${bulletList(f.efeitos_adversos_graves)}</div>`;
    S.push({ id: "efeitos", label: "Efeitos adversos", html: h });
  }

  if (has(f.contraindicacoes)) S.push({ id: "contraindicacoes", label: "Contraindicações", html: `
    <div class="card__head"><span class="card__ico">${ICON.compl}</span><h2 class="card__title">Contraindicações</h2></div>
    ${bulletList(f.contraindicacoes)}` });

  if (has(f.interacoes)) S.push({ id: "interacoes", label: "Interações", html: `
    <div class="card__head"><span class="card__ico">${ICON.diff}</span><h2 class="card__title">Interações medicamentosas</h2></div>
    ${chipList(f.interacoes)}` });

  if (has(d.referencias)) S.push({ id: "referencias", label: "Referências", html: `
    <div class="card__head"><span class="card__ico">${ICON.refs}</span><h2 class="card__title">Referências</h2></div>
    ${listaReferencias(d.referencias)}
    <button class="abnt-btn" id="btnAbnt" type="button">Formatar em ABNT</button>
    <div class="abnt-out" id="abntOut" hidden></div>` });

  return S;
}

/* Referências na tela, cada uma com um caminho de um clique para conferir.
   Antes elas nunca eram exibidas: a pessoa clicava e recebia citações
   formatadas direto na área de transferência, prontas para colar num
   trabalho, sem nunca ver o que estava copiando. Fabricação de citação é
   uma falha conhecida de modelos de linguagem — então o mínimo é mostrar
   e oferecer verificação. */
function listaReferencias(refs) {
  const itens = refs.map(r => {
    const q = encodeURIComponent(String(r).slice(0, 300));
    return `<li class="ref">
      <span class="ref__txt">${escapeHTML(r)}</span>
      <span class="ref__links">
        <a href="https://scholar.google.com/scholar?q=${q}" target="_blank" rel="noopener noreferrer">Buscar</a>
        <a href="https://pubmed.ncbi.nlm.nih.gov/?term=${q}" target="_blank" rel="noopener noreferrer">PubMed</a>
      </span>
    </li>`;
  }).join("");
  return `<ul class="refs">${itens}</ul>
    <p class="ref__aviso">
      Confira cada referência antes de citar. Estas foram indicadas pela IA e
      <b>podem não existir</b> — modelos de linguagem inventam citações com aparência convincente.
    </p>`;
}

function renderResult(d) {
  const isFav = isFavorite(d.nome);
  const isFarmaco = d.tipo === "farmaco" && d.farmaco;
  const fco = d.farmaco || {};

  /* Cabeçalho (identificação + ações) */
  const cidParts = [];
  if (isFarmaco) {
    if (fco.principio_ativo) cidParts.push(`<span class="cid cid--code"><span>Princípio ativo</span><span>${escapeHTML(fco.principio_ativo)}</span></span>`);
    if (fco.classe) cidParts.push(`<span class="cid"><span>Classe</span><span>${escapeHTML(fco.classe)}</span></span>`);
  } else {
    if (d.cid10) cidParts.push(`<span class="cid cid--code"><span>CID-10</span><span>${escapeHTML(d.cid10)}</span></span>`);
    if (d.cid11) cidParts.push(`<span class="cid cid--code"><span>CID-11</span><span>${escapeHTML(d.cid11)}</span></span>`);
    if (d.area_medica) cidParts.push(`<span class="cid"><span>Área</span><span>${escapeHTML(d.area_medica)}</span></span>`);
  }
  const areaLabel = isFarmaco ? ("Fármaco" + (d.area_medica ? " · " + d.area_medica : "")) : d.area_medica;

  const head = `
    <div class="newsearch-bar">
      <button class="btn-newsearch" id="btnNewSearch" type="button">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M11 5 4 12l7 7M4 12h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Nova pesquisa
      </button>
      <button class="btn-study" id="btnStudy" type="button">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 5h7a3 3 0 0 1 3 3v11a2.5 2.5 0 0 0-2.5-2.5H4zM20 5h-7a3 3 0 0 0-3 3v11a2.5 2.5 0 0 1 2.5-2.5H20z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
        Estudar isto
      </button>
    </div>
    <section class="fiche-head" id="identificacao">
      ${areaLabel ? `<span class="fiche-head__area">${escapeHTML(areaLabel)}</span>` : ""}
      <h1 class="fiche-head__name">${escapeHTML(d.nome || "Resultado")}</h1>
      ${d.sinonimos && d.sinonimos.length ? `<p class="fiche-head__syn">Sinônimos: ${escapeHTML(d.sinonimos.join(", "))}</p>` : ""}
      <div class="cid-row">${cidParts.join("")}</div>
      <div class="toolbar">
        <button class="tool ${isFav ? "is-active" : ""}" id="tFav" type="button" aria-pressed="${isFav ? "true" : "false"}">
          <svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 17.3 6.2 20.5l1.1-6.5L2.6 9.4l6.5-.9L12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
          <span>${isFav ? "Favoritado" : "Favoritar"}</span></button>
        <button class="tool" id="tCopy" type="button"><svg viewBox="0 0 24 24" width="16" height="16"><rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10" fill="none" stroke="currentColor" stroke-width="2"/></svg><span>Copiar</span></button>
        <button class="tool" id="tShare" type="button"><svg viewBox="0 0 24 24" width="16" height="16"><circle cx="18" cy="5" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="6" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="19" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" stroke="currentColor" stroke-width="2"/></svg><span>Compartilhar</span></button>
        <button class="tool" id="tPdf" type="button"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 9V3h9l3 3v3M6 18v3h12v-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><rect x="4" y="9" width="16" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="2"/></svg><span>PDF</span></button>
        <button class="tool tool--reportar" id="tReportar" type="button"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 8v5M12 16h.01M10.3 3.9 2.5 18a1.8 1.8 0 0 0 1.6 2.7h15.8a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Reportar erro</span></button>
        <button class="tool" id="tPrint" type="button"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2M6 14h12v7H6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg><span>Imprimir</span></button>
      </div>
    </section>`;

  const sections = isFarmaco ? buildDrugSections(d) : buildSections(d);
  const cards = sections.map(s =>
    `<section class="card" id="${s.id}">${s.html}</section>`).join("");

  const caseBlock = `
    <section class="card case-card" id="estudoCaso">
      <div class="card__head"><span class="card__ico">${ICON.refs}</span><h2 class="card__title">Estudo de caso</h2></div>
      <p class="case-card__intro">Gere um caso clínico didático baseado em <b>${escapeHTML(d.nome || "")}</b> para treinar o raciocínio.</p>
      <button class="case-btn" id="btnCase" type="button">Gerar estudo de caso</button>
      <div id="caseOut" class="case-out"></div>
    </section>`;

  els.content.innerHTML = head + cards + caseBlock;

  /* Índice lateral */
  const toc = [{ id: "identificacao", label: "Identificação" }, ...sections,
    { id: "estudoCaso", label: "Estudo de caso" }];
  els.tocNav.innerHTML = toc.map(s => `<a href="#${s.id}">${escapeHTML(s.label)}</a>`).join("");

  /* Animação de entrada */
  $$(".card, .fiche-head", els.content).forEach((el, i) => {
    el.classList.add("animate-in");
    el.style.animationDelay = `${i * 45}ms`;
  });

  bindResultEvents(d);
  initScrollSpy();
}

/* Eventos dentro do resultado (abas, ações, diferenciais clicáveis) */
function bindResultEvents(d) {
  // Botão de gerar estudo de caso
  const btnCase = $("#btnCase", els.content);
  if (btnCase) btnCase.addEventListener("click", () => generateCase(d));

  // Botão "Estudar isto" → abre a aba de estudo com o tema preenchido
  const btnStudy = $("#btnStudy", els.content);
  if (btnStudy) btnStudy.addEventListener("click", () => openStudy(d.nome));

  // Botão de copiar referências em ABNT
  const btnAbnt = $("#btnAbnt", els.content);
  if (btnAbnt) btnAbnt.addEventListener("click", () => generateABNT(d, btnAbnt));

  // Abas de fisiopatologia
  $$(".tab", els.content).forEach(tab => {
    tab.addEventListener("click", () => {
      $$(".tab", els.content).forEach(t => t.classList.remove("active"));
      $$(".tab-panel", els.content).forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      $("#" + tab.dataset.tab).classList.add("active");
    });
  });

  // Diferenciais → nova busca
  $$(".diff[data-search]", els.content).forEach(b => {
    b.addEventListener("click", () => { els.input.value = b.dataset.search; analyze(b.dataset.search); });
  });

  // Ações
  $("#btnNewSearch")?.addEventListener("click", resetToSearch);
  $("#tFav")?.addEventListener("click", () => toggleFavorite(d));
  $("#tCopy")?.addEventListener("click", () => copyContent(d));
  $("#tShare")?.addEventListener("click", () => shareContent(d));
  $("#tPdf")?.addEventListener("click", () => generatePDF(d));
  $("#tPrint")?.addEventListener("click", () => openPrintWindow(d));
  $("#tReportar")?.addEventListener("click", () => abrirReporte(d));
}

/* Scrollspy: destaca a seção visível no índice */
let scrollSpyObs = null;

function initScrollSpy() {
  // Cada nova ficha cria um observador; sem desligar o anterior eles se
  // acumulam a cada pesquisa e continuam observando elementos já removidos.
  if (scrollSpyObs) { scrollSpyObs.disconnect(); scrollSpyObs = null; }

  const links = $$("#tocNav a");
  if (!links.length || !("IntersectionObserver" in window)) return;
  const map = new Map(links.map(a => [a.getAttribute("href").slice(1), a]));
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        links.forEach(a => a.classList.remove("active"));
        map.get(e.target.id)?.classList.add("active");
      }
    });
  }, { rootMargin: "-40% 0px -55% 0px" });
  $$(".card, .fiche-head", els.content).forEach(sec => obs.observe(sec));
  scrollSpyObs = obs;
}

/* =================================================================
   9) COPIAR / COMPARTILHAR (texto formatado)
   ================================================================= */
/* =================================================================
   PDF DE ESTUDO — documento limpo e contínuo (não formato de impressora)
   ================================================================= */
function buildStudyHTML(d) {
  const esc = escapeHTML;
  const ul = arr => (arr && arr.length) ? `<ul>${arr.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
  const sec = (title, inner) => inner ? `<h2>${esc(title)}</h2>${inner}` : "";
  const p = txt => (txt && String(txt).trim()) ? `<p>${esc(txt)}</p>` : "";
  let body = "";

  if (d.tipo === "farmaco" && d.farmaco) {
    const f = d.farmaco;
    const meta = [f.principio_ativo ? `Princípio ativo: ${esc(f.principio_ativo)}` : "", f.classe ? `Classe: ${esc(f.classe)}` : ""].filter(Boolean).join(" · ");
    if (meta) body += `<p class="meta">${meta}</p>`;
    body += sec("Para que serve", p(f.para_que_serve));
    body += sec("Doenças e condições tratadas", ul(f.doencas_tratadas));
    body += sec("Mecanismo de ação (simplificado)", p(f.mecanismo_simples));
    body += sec("Mecanismo de ação (avançado)", p(f.mecanismo_avancado));
    body += sec("Efeitos adversos comuns", ul(f.efeitos_adversos_comuns));
    body += sec("Efeitos adversos graves", ul(f.efeitos_adversos_graves));
    body += sec("Contraindicações", ul(f.contraindicacoes));
    body += sec("Interações medicamentosas", ul(f.interacoes));
  } else {
    const meta = [d.cid10 ? `CID-10: ${esc(d.cid10)}` : "", d.cid11 ? `CID-11: ${esc(d.cid11)}` : "", d.area_medica ? `Área: ${esc(d.area_medica)}` : ""].filter(Boolean).join(" · ");
    if (meta) body += `<p class="meta">${meta}</p>`;
    if (d.sinonimos && d.sinonimos.length) body += `<p class="meta">Sinônimos: ${esc(d.sinonimos.join(", "))}</p>`;
    body += sec("Definição", p(d.definicao));
    body += sec("Sintomas comuns", ul(d.sintomas_comuns));
    body += sec("Sintomas incomuns", ul(d.sintomas_raros));
    body += sec("Sinais de alerta", ul(d.sinais_alerta));
    const t = d.tratamento || {};
    body += sec("Tratamento padrão", ul(t.padrao));
    body += sec("Medicamentos", ul(t.medicamentos));
    body += sec("Tratamentos complementares", ul(t.complementares));
    body += sec("Prognóstico", p(t.prognostico));
    const dg = d.diagnostico || {};
    body += sec("Exames laboratoriais", ul(dg.laboratoriais));
    body += sec("Exames de imagem", ul(dg.imagem));
    body += sec("Critérios diagnósticos", ul(dg.criterios));
    body += sec("Complicações", ul(d.complicacoes));
    if (d.variacoes && d.variacoes.length) {
      body += `<h2>Variações</h2>` + d.variacoes.map(v =>
        `<p><b>${esc(v.nome || "")}</b>${v.gravidade ? ` (${esc(v.gravidade)})` : ""}${v.definicao ? ` — ${esc(v.definicao)}` : ""}` +
        `${v.transmissao ? `<br><i>Transmissão:</i> ${esc(v.transmissao)}` : ""}${v.tratamento ? `<br><i>Tratamento:</i> ${esc(v.tratamento)}` : ""}</p>`).join("");
    }
    body += sec("Diagnósticos diferenciais", ul(d.diferenciais));
    const e = d.epidemiologia || {};
    const epi = [e.prevalencia && `Prevalência: ${esc(e.prevalencia)}`, e.faixa_etaria && `Faixa etária: ${esc(e.faixa_etaria)}`, e.sexo && `Sexo: ${esc(e.sexo)}`, e.distribuicao_geografica && `Distribuição: ${esc(e.distribuicao_geografica)}`].filter(Boolean);
    if (epi.length) body += `<h2>Epidemiologia</h2>${ul(epi)}`;
    const fp = d.fisiopatologia || {};
    body += sec("Fisiopatologia (simplificada)", p(fp.simples));
    body += sec("Fisiopatologia (avançada)", p(fp.avancada));
  }
  if (d.referencias && d.referencias.length) body += sec("Referências", ul(d.referencias));

  return `<div id="pdfDoc" style="width:720px;padding:36px 40px;background:#fff;color:#1a1a1a;font-family:Arial,Helvetica,sans-serif;line-height:1.55;font-size:14px;box-sizing:border-box;">
    <div style="border-bottom:3px solid #10B981;padding-bottom:12px;margin-bottom:18px;">
      <div style="font-size:13px;color:#10B981;font-weight:bold;letter-spacing:0.5px;">INVICTUS.MED · FICHA DE ESTUDO</div>
      <div style="font-size:26px;font-weight:bold;color:#10120F;margin-top:4px;">${esc(d.nome || "Ficha")}</div>
    </div>
    <style>
      #pdfDoc h2{font-size:16px;color:#0B6B4F;margin:18px 0 6px;border-bottom:1px solid #e2e2e2;padding-bottom:3px;}
      #pdfDoc p{margin:6px 0;}
      #pdfDoc ul{margin:6px 0 6px 0;padding-left:20px;}
      #pdfDoc li{margin:3px 0;}
      #pdfDoc .meta{color:#555;font-size:13px;}
    </style>
    ${body}
    <p style="margin-top:26px;padding-top:12px;border-top:1px solid #e2e2e2;color:#888;font-size:11px;">
      Conteúdo educacional gerado por inteligência artificial — não substitui avaliação, diagnóstico ou conduta de profissional de saúde. Invictus.Med (beta).
    </p>
  </div>`;
}

/* PDF DIRETO (baixa o arquivo) — monta a partir do texto, sem "fotografar"
   a tela (por isso nunca vem em branco). Usa jsPDF. */
function generatePDF(d) {
  const JS = window.jspdf && window.jspdf.jsPDF;
  if (!JS) { openPrintWindow(d); return; } // sem a lib → cai para a janela de impressão

  const doc = new JS({ unit: "pt", format: "a4" });
  const margin = 48, pageW = 595.28, pageH = 841.89, maxW = pageW - margin * 2;
  let y = margin;

  const write = (text, size, bold, color) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color ? color[0] : 40, color ? color[1] : 40, color ? color[2] : 40);
    doc.splitTextToSize(String(text), maxW).forEach(linha => {
      if (y > pageH - margin) { doc.addPage(); y = margin; }
      doc.text(linha, margin, y);
      y += size * 1.35;
    });
  };

  write("INVICTUS.MED · FICHA DE ESTUDO", 9, true, [16, 185, 129]); y += 2;
  write(d.nome || "Ficha", 20, true, [11, 31, 24]); y += 8;

  buildStudyBlocks(d).forEach(b => {
    y += 10;
    write(b.h, 12, true, [11, 107, 79]); y += 2;
    b.items.forEach(it => write((b.items.length > 1 ? "•  " : "") + it, 10.5, false));
  });

  y += 18;
  write("Conteúdo educacional gerado por IA — não substitui avaliação médica. Invictus.Med (beta).", 8, false, [150, 150, 150]);

  const nome = "Invictus-Med-" + String(d.nome || "ficha").normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 40);
  doc.save(nome + ".pdf");
  toast("PDF baixado.");
}

/* Monta os blocos de conteúdo (texto) para o PDF, tanto doença quanto fármaco. */
function buildStudyBlocks(d) {
  const B = [];
  const add = (h, items) => { const arr = (items || []).filter(x => x && String(x).trim()).map(String); if (arr.length) B.push({ h, items: arr }); };
  const one = v => (v && String(v).trim()) ? [String(v)] : [];

  if (d.tipo === "farmaco" && d.farmaco) {
    const f = d.farmaco;
    add("Identificação", [f.principio_ativo && `Princípio ativo: ${f.principio_ativo}`, f.classe && `Classe: ${f.classe}`].filter(Boolean));
    add("Para que serve", one(f.para_que_serve));
    add("Doenças tratadas", f.doencas_tratadas);
    add("Mecanismo (simplificado)", one(f.mecanismo_simples));
    add("Mecanismo (avançado)", one(f.mecanismo_avancado));
    add("Efeitos adversos comuns", f.efeitos_adversos_comuns);
    add("Efeitos adversos graves", f.efeitos_adversos_graves);
    add("Contraindicações", f.contraindicacoes);
    add("Interações", f.interacoes);
  } else {
    add("Identificação", [d.cid10 && `CID-10: ${d.cid10}`, d.cid11 && `CID-11: ${d.cid11}`, d.area_medica && `Área: ${d.area_medica}`].filter(Boolean));
    if (d.sinonimos && d.sinonimos.length) add("Sinônimos", [d.sinonimos.join(", ")]);
    add("Definição", one(d.definicao));
    add("Sintomas comuns", d.sintomas_comuns);
    add("Sintomas incomuns", d.sintomas_raros);
    add("Sinais de alerta", d.sinais_alerta);
    const t = d.tratamento || {};
    add("Tratamento padrão", t.padrao);
    add("Medicamentos", t.medicamentos);
    add("Tratamentos complementares", t.complementares);
    add("Prognóstico", one(t.prognostico));
    const dg = d.diagnostico || {};
    add("Exames laboratoriais", dg.laboratoriais);
    add("Exames de imagem", dg.imagem);
    add("Critérios diagnósticos", dg.criterios);
    add("Complicações", d.complicacoes);
    if (d.variacoes && d.variacoes.length) add("Variações", d.variacoes.map(v => `${v.nome || ""}${v.gravidade ? ` (${v.gravidade})` : ""}${v.definicao ? `: ${v.definicao}` : ""}`));
    add("Diagnósticos diferenciais", d.diferenciais);
    const e = d.epidemiologia || {};
    add("Epidemiologia", [e.prevalencia && `Prevalência: ${e.prevalencia}`, e.faixa_etaria && `Faixa etária: ${e.faixa_etaria}`, e.sexo && `Sexo: ${e.sexo}`, e.distribuicao_geografica && `Distribuição: ${e.distribuicao_geografica}`].filter(Boolean));
    const fp = d.fisiopatologia || {};
    add("Fisiopatologia (simplificada)", one(fp.simples));
    add("Fisiopatologia (avançada)", one(fp.avancada));
  }
  return B;
}

/* Janela de impressão limpa (usada pelo botão Imprimir e como reserva do PDF). */
function openPrintWindow(d) {
  const doc = buildStudyHTML(d);
  const win = window.open("", "_blank");
  if (!win) { toast("Permita pop-ups para imprimir."); return; }
  win.document.open();
  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHTML(d.nome || "Ficha")} — Invictus.Med</title>
    <style>@page { margin: 14mm; } body { margin: 0; background: #fff; }</style>
    </head><body>${doc}
    <script>window.onload=function(){setTimeout(function(){window.print();},350);};<\/script>
    </body></html>`);
  win.document.close();
  toast("Abrindo a impressão…");
}

/* =================================================================
   ABA DE ESTUDO — quiz, flashcards, resumo e mapa mental (via Cerebras).
   Gera por tema digitado, sob demanda (só no clique de cada ferramenta).
   ================================================================= */
function openStudy(tema) {
  if (!els.studyView) { toast("Atualize o site (suba o index.html mais novo)."); return; }
  if (els.studyTema) els.studyTema.value = tema || "";
  if (els.studyOut) els.studyOut.innerHTML = "";
  // Esconde TODAS as outras telas e mostra só a de estudo
  hide(els.results); hide(els.empty); hide(els.notice); hide(els.loader); hide(els.hero);
  show(els.studyView);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeStudy() {
  hide(els.studyView);
  // Volta para a ficha se houver uma; senão, para o estado inicial
  if (currentData) show(els.results); else show(els.empty);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function generateStudy(modo) {
  const tema = (els.studyTema.value || "").trim();
  const out = els.studyOut;
  if (!tema) { toast("Digite um tema para estudar."); els.studyTema.focus(); return; }

  // Marca o botão ativo e mostra carregando
  $$(".study-tool", els.studyView).forEach(b => b.classList.toggle("is-active", b.dataset.modo === modo));
  const msgs = { quiz: "Preparando o quiz…", flashcards: "Montando os flashcards…", resumo: "Escrevendo o resumo…", mapa: "Desenhando o mapa mental…" };
  out.innerHTML = `<div class="case-loading">${msgs[modo] || "Gerando…"}</div>`;

  try {
    const data = await postProxy({ modo, termo: tema.slice(0, CONFIG.MAX_TERM_LEN) });

    if (modo === "quiz") renderQuiz(data.perguntas || [], out);
    else if (modo === "flashcards") renderFlashcards(data.cards || [], out);
    else if (modo === "resumo") renderResumo(data, out);
    else if (modo === "mapa") renderMapa(data, out);
  } catch (e) {
    const cod = codeOf(e) || "ERR";
    out.innerHTML = `<div class="case-err">Não foi possível gerar agora. Tente novamente em instantes.
      <span class="case-err__code">cód. ${escapeHTML(cod)}</span></div>`;
  }
}

function renderQuiz(perguntas, out) {
  if (!perguntas.length) { out.innerHTML = `<div class="case-err">Não veio nenhuma pergunta. Tente de novo.</div>`; return; }
  const letras = ["A", "B", "C", "D", "E"];
  const total = perguntas.length;
  let acertos = 0, respondidas = 0;

  out.innerHTML = `
    <div class="quiz-score" id="quizScore">Responda às ${total} perguntas</div>
    <ol class="quiz-list">
      ${perguntas.map(q => {
        const alts = Array.isArray(q.alternativas) ? q.alternativas : [];
        return `<li class="quiz-q" data-correct="${Number(q.correta)}" data-answered="0">
          <p class="quiz-q__txt">${escapeHTML(String(q.pergunta || ""))}</p>
          <div class="quiz-alts">
            ${alts.map((a, ai) => `<button class="quiz-alt" type="button" data-i="${ai}">
              <span class="quiz-alt__letra">${letras[ai] || ai + 1}</span>
              <span>${escapeHTML(String(a))}</span></button>`).join("")}
          </div>
          <div class="quiz-exp" hidden>${escapeHTML(String(q.explicacao || ""))}</div>
        </li>`;
      }).join("")}
    </ol>`;

  const scoreEl = $("#quizScore", out);
  $$(".quiz-alt", out).forEach(btn => {
    btn.addEventListener("click", () => {
      const li = btn.closest(".quiz-q");
      if (!li || li.dataset.answered === "1") return;
      li.dataset.answered = "1";
      const correta = Number(li.dataset.correct), escolhida = Number(btn.dataset.i);
      $$(".quiz-alt", li).forEach(b => {
        b.classList.add("is-locked");
        const i = Number(b.dataset.i);
        if (i === correta) b.classList.add("is-correct");
        if (i === escolhida && escolhida !== correta) b.classList.add("is-wrong");
      });
      const exp = $(".quiz-exp", li); if (exp) exp.hidden = false;
      respondidas++; if (escolhida === correta) acertos++;
      if (scoreEl) {
        scoreEl.textContent = respondidas === total ? `Resultado: ${acertos} de ${total} ✓` : `Acertos: ${acertos} / ${total} · respondidas: ${respondidas}/${total}`;
        if (respondidas === total) scoreEl.classList.add("quiz-score--done");
      }
    });
  });
}

function renderFlashcards(cards, out) {
  if (!cards.length) { out.innerHTML = `<div class="case-err">Não vieram flashcards. Tente de novo.</div>`; return; }
  out.innerHTML = `<div class="flash-grid">
    ${cards.map((c, i) => `
      <div class="flash" data-i="${i}">
        <div class="flash__frente"><span class="flash__num">${i + 1}</span><p>${escapeHTML(String(c.frente || ""))}</p>
          <button class="flash__reveal" type="button">Revelar resposta</button></div>
        <div class="flash__verso" hidden><p>${escapeHTML(String(c.verso || ""))}</p></div>
      </div>`).join("")}
  </div>`;
  $$(".flash__reveal", out).forEach(btn => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".flash");
      $(".flash__verso", card).hidden = false;
      btn.style.display = "none";
    });
  });
}

function renderResumo(data, out) {
  const topicos = Array.isArray(data.topicos) ? data.topicos : [];
  if (!topicos.length) { out.innerHTML = `<div class="case-err">Resumo não veio. Tente de novo.</div>`; return; }
  out.innerHTML = `
    ${data.titulo ? `<h3 class="resumo-title">${escapeHTML(String(data.titulo))}</h3>` : ""}
    ${topicos.map(t => `
      <div class="resumo-bloco">
        <h4 class="resumo-h">${escapeHTML(String(t.titulo || ""))}</h4>
        <p>${escapeHTML(String(t.conteudo || ""))}</p>
      </div>`).join("")}`;
}

function renderMapa(data, out) {
  const ramos = Array.isArray(data.ramos) ? data.ramos : [];
  if (!ramos.length) { out.innerHTML = `<div class="case-err">Mapa não veio. Tente de novo.</div>`; return; }
  out.innerHTML = `
    <div class="mapa">
      <div class="mapa__central">${escapeHTML(String(data.central || "Tema"))}</div>
      <div class="mapa__ramos">
        ${ramos.map(r => `
          <div class="mapa__ramo">
            <div class="mapa__ramo-tit">${escapeHTML(String(r.titulo || ""))}</div>
            <ul class="mapa__subs">
              ${(Array.isArray(r.subitens) ? r.subitens : []).map(s => `<li>${escapeHTML(String(s))}</li>`).join("")}
            </ul>
          </div>`).join("")}
      </div>
    </div>`;
}

/* =================================================================
   REFERÊNCIAS EM ABNT — gera sob demanda (no clique) e copia.
   Não mostra as referências na tela; só copia formatado.
   ================================================================= */
async function generateABNT(d, btn) {
  const original = btn ? btn.textContent : "";
  const out = $("#abntOut", els.content);
  if (btn) { btn.disabled = true; btn.textContent = "Formatando…"; }

  try {
    const data = await postProxy({ modo: "abnt", termo: d.nome, referencias: d.referencias || [] });

    const lista = Array.isArray(data.abnt) ? data.abnt.filter(Boolean).map(String) : [];
    const texto = lista.length ? lista.join("\n\n") : String(data.abnt || "").trim();
    if (!texto) throw errWithCode("vazio", "VAZIO");

    // Mostrar antes de copiar. Copiar direto para a área de transferência
    // levava uma citação possivelmente inexistente para dentro de um
    // trabalho acadêmico sem ninguém nunca ter lido.
    if (out) {
      const itens = (lista.length ? lista : [texto]).map(r => {
        const q = encodeURIComponent(r.slice(0, 300));
        return `<li class="ref">
          <span class="ref__txt">${escapeHTML(r)}</span>
          <span class="ref__links">
            <a href="https://scholar.google.com/scholar?q=${q}" target="_blank" rel="noopener noreferrer">Conferir</a>
          </span>
        </li>`;
      }).join("");
      out.innerHTML = `
        <p class="abnt-out__aviso">
          <b>Confira antes de colar no seu trabalho.</b> Citação inventada por IA costuma
          ter formato impecável — autor plausível, revista real, ano coerente — e mesmo
          assim não existir.
        </p>
        <ul class="refs refs--abnt">${itens}</ul>
        <button class="abnt-copiar" id="btnAbntCopiar" type="button">Copiar tudo</button>`;
      show(out);
      $("#btnAbntCopiar", out)?.addEventListener("click", async () => {
        toast(await copyToClipboard(texto) ? "Referências copiadas." : "Não foi possível copiar.");
      });
    }

    if (btn) { btn.disabled = false; btn.textContent = "Formatar de novo"; }
  } catch (e) {
    toast("Não consegui formatar agora. Tente novamente em instantes.");
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

/* =================================================================
   ESTUDO DE CASO — IA leve (sob demanda), não pesa na ficha principal
   ================================================================= */
async function generateCase(d) {
  const out = $("#caseOut", els.content);
  const btn = $("#btnCase", els.content);
  if (!out) return;
  if (btn) { btn.disabled = true; btn.textContent = "Gerando caso…"; }
  out.innerHTML = `<div class="case-loading">Montando um caso clínico…</div>`;

  try {
    const data = await postProxy({ modo: "caso", termo: d.nome });
    renderCase(data, out, d);
    if (btn) btn.style.display = "none";
  } catch (e) {
    const cod = codeOf(e) || "ERR";
    out.innerHTML = `<div class="case-err">Não foi possível gerar o caso agora. Tente novamente em instantes.
      <span class="case-err__code">cód. ${escapeHTML(cod)}</span></div>`;
    if (btn) { btn.disabled = false; btn.textContent = "Gerar estudo de caso"; }
  }
}

function renderCase(c, out, d) {
  // Converte qualquer valor (texto, objeto ou lista) em texto legível
  const toText = (val) => {
    if (val == null) return "";
    if (typeof val === "string") return val;
    if (Array.isArray(val)) return val.map(toText).filter(Boolean).join("; ");
    if (typeof val === "object") {
      return Object.entries(val)
        .map(([k, v]) => {
          const txt = toText(v);
          if (!txt) return "";
          const rotulo = k.replace(/_/g, " ").replace(/^\w/, m => m.toUpperCase());
          return `${rotulo}: ${txt}`;
        })
        .filter(Boolean).join(". ");
    }
    return String(val);
  };
  const row = (label, val) => {
    const txt = toText(val);
    return txt ? `<div class="case-row"><span class="case-row__lbl">${label}</span><p>${escapeHTML(txt)}</p></div>` : "";
  };
  out.innerHTML = `
    ${c.titulo ? `<h3 class="case-title">${escapeHTML(toText(c.titulo))}</h3>` : ""}
    ${row("Apresentação", c.apresentacao)}
    ${row("Queixa e história", c.queixa)}
    ${row("Antecedentes", c.antecedentes)}
    ${row("Exame físico", c.exame_fisico)}
    ${row("Exames complementares", c.exames_complementares)}
    ${row("Conduta esperada", c.conduta)}
    ${c.pergunta_raciocinio ? `<div class="case-q"><span class="case-q__lbl">Para refletir</span><p>${escapeHTML(toText(c.pergunta_raciocinio))}</p></div>` : ""}
    <button class="case-btn case-btn--again" id="btnCaseAgain" type="button">↻ Gerar outro caso</button>`;
  const again = $("#btnCaseAgain", out);
  if (again) again.addEventListener("click", () => generateCase(d));
}

function dataToText(d) {
  const L = [];
  const list = a => (a && a.length) ? a.join(", ") : "—";
  L.push(`${d.nome || ""}`);

  // Fármaco → texto específico
  if (d.tipo === "farmaco" && d.farmaco) {
    const f = d.farmaco;
    if (f.principio_ativo) L.push(`Princípio ativo: ${f.principio_ativo}`);
    if (f.classe) L.push(`Classe: ${f.classe}`);
    if (f.para_que_serve) L.push(`\nPARA QUE SERVE\n${f.para_que_serve}`);
    if (f.doencas_tratadas?.length) L.push(`\nDOENÇAS TRATADAS\n${list(f.doencas_tratadas)}`);
    if (f.mecanismo_simples) L.push(`\nMECANISMO (simples)\n${f.mecanismo_simples}`);
    if (f.mecanismo_avancado) L.push(`\nMECANISMO (avançado)\n${f.mecanismo_avancado}`);
    if (f.efeitos_adversos_comuns?.length) L.push(`\nEFEITOS ADVERSOS COMUNS\n• ${f.efeitos_adversos_comuns.join("\n• ")}`);
    if (f.efeitos_adversos_graves?.length) L.push(`\n⚠ EFEITOS ADVERSOS GRAVES\n• ${f.efeitos_adversos_graves.join("\n• ")}`);
    if (f.contraindicacoes?.length) L.push(`\nCONTRAINDICAÇÕES\n${list(f.contraindicacoes)}`);
    if (f.interacoes?.length) L.push(`\nINTERAÇÕES\n${list(f.interacoes)}`);
    if (d.referencias?.length) L.push(`\nREFERÊNCIAS\n${d.referencias.join("\n")}`);
    L.push(`\n— Gerado por Invictus.Med (conteúdo educacional; não substitui avaliação médica).`);
    return L.join("\n");
  }

  if (d.cid10) L.push(`CID-10: ${d.cid10}${d.cid11 ? " · CID-11: " + d.cid11 : ""}`);
  if (d.area_medica) L.push(`Área médica: ${d.area_medica}`);
  if (d.sinonimos?.length) L.push(`Sinônimos: ${list(d.sinonimos)}`);
  if (d.definicao) L.push(`\nDEFINIÇÃO\n${d.definicao}`);
  if (d.sintomas_comuns?.length) L.push(`\nSINTOMAS COMUNS\n• ${d.sintomas_comuns.join("\n• ")}`);
  if (d.sintomas_raros?.length)  L.push(`\nSINTOMAS INCOMUNS\n• ${d.sintomas_raros.join("\n• ")}`);
  if (d.sinais_alerta?.length)   L.push(`\n⚠ SINAIS DE ALERTA\n• ${d.sinais_alerta.join("\n• ")}`);
  const t = d.tratamento || {};
  if (t.padrao?.length || t.medicamentos?.length) {
    L.push(`\nTRATAMENTO`);
    if (t.padrao?.length) L.push(`Padrão: ${list(t.padrao)}`);
    if (t.medicamentos?.length) L.push(`Medicamentos: ${list(t.medicamentos)}`);
    if (t.complementares?.length) L.push(`Complementares: ${list(t.complementares)}`);
    if (t.prognostico) L.push(`Prognóstico: ${t.prognostico}`);
  }
  if (d.complicacoes?.length) L.push(`\nCOMPLICAÇÕES\n• ${d.complicacoes.join("\n• ")}`);
  if (d.diferenciais?.length) L.push(`\nDIFERENCIAIS\n${list(d.diferenciais)}`);
  const f = d.fisiopatologia || {};
  if (f.simples) L.push(`\nFISIOPATOLOGIA (simples)\n${f.simples}`);
  if (f.avancada) L.push(`\nFISIOPATOLOGIA (avançada)\n${f.avancada}`);
  if (d.referencias?.length) L.push(`\nREFERÊNCIAS\n${d.referencias.join("\n")}`);
  L.push(`\n— Gerado por Invictus.Med (conteúdo educacional; não substitui avaliação médica).`);
  return L.join("\n");
}

async function copyContent(d) {
  toast(await copyToClipboard(dataToText(d)) ? "Conteúdo copiado." : "Não foi possível copiar.");
}

async function shareContent(d) {
  const text = dataToText(d);
  if (navigator.share) {
    try { await navigator.share({ title: `Invictus.Med — ${d.nome}`, text }); return; }
    catch (e) {
      if (e && e.name === "AbortError") return;   // o usuário só fechou o menu
      /* sem suporte de fato → cai para a cópia */
    }
  }
  toast(await copyToClipboard(text) ? "Copiado para compartilhar." : "Compartilhamento indisponível.");
}

/* =================================================================
   10) HISTÓRICO & FAVORITOS (localStorage)
   ================================================================= */
const HKEY = "invictus.history";
const FKEY = "invictus.favorites";

const mesmoNome = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

function addToHistory(nome) {
  if (!nome || typeof nome !== "string" || !nome.trim()) return;
  const h = readList(HKEY).filter(x => !mesmoNome(x.nome, nome));
  h.unshift({ nome, ts: Date.now() });
  store.set(HKEY, h.slice(0, 40));
}

function isFavorite(nome) {
  if (!nome) return false;
  return readList(FKEY).some(x => mesmoNome(x.nome, nome));
}

function toggleFavorite(d) {
  const nome = d.nome;
  if (!nome) return;
  let f = readList(FKEY);
  const exists = f.some(x => mesmoNome(x.nome, nome));
  if (exists) {
    f = f.filter(x => !mesmoNome(x.nome, nome));
    toast("Removido dos favoritos.");
  } else {
    f.unshift({ nome, ts: Date.now() });
    toast("Adicionado aos favoritos.");
  }
  store.set(FKEY, f);
  // Atualiza botão
  const btn = $("#tFav");
  if (btn) {
    const nowFav = !exists;
    btn.classList.toggle("is-active", nowFav);
    btn.setAttribute("aria-pressed", nowFav ? "true" : "false");
    const label = btn.querySelector("span");
    if (label) label.textContent = nowFav ? "Favoritado" : "Favoritar";
  }
}

/* Painel lateral */
let drawerOpen = false;
let drawerLastFocus = null;

/* Mantém o Tab preso dentro do painel enquanto ele estiver aberto */
function trapDrawerFocus(e) {
  if (e.key !== "Tab" || !drawerOpen) return;
  const foco = $$("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])", els.drawer)
    .filter(el => !el.disabled && el.offsetParent !== null);
  if (!foco.length) return;
  const first = foco[0], last = foco[foco.length - 1];
  if (!els.drawer.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function revealDrawer() {
  if (!drawerOpen) {
    drawerLastFocus = document.activeElement;   // para devolver o foco ao fechar
    document.addEventListener("keydown", trapDrawerFocus, true);
  }
  drawerOpen = true;
  show(els.drawerScrim);
  show(els.drawer);
  requestAnimationFrame(() => {
    els.drawer.classList.add("is-open");
    $("#drawerClose")?.focus();
  });
  els.drawer.setAttribute("aria-hidden", "false");
}

function openDrawer(kind) {
  // Painel de PROJETOS (links externos com nome/máscara)
  if (kind === "projects") {
    els.drawerTitle.textContent = "Outros projetos";
    els.drawerTools.innerHTML = "";
    if (!PROJECTS.length) {
      els.drawerList.innerHTML = "";
      show(els.drawerEmpty);
    } else {
      hide(els.drawerEmpty);
      els.drawerList.innerHTML = PROJECTS.map(p => `
        <li class="drawer__item drawer__item--link">
          <a href="${escapeHTML(p.url)}" target="_blank" rel="noopener noreferrer" class="di-link">
            <span class="di-name">${escapeHTML(p.nome)}</span>
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </a>
        </li>`).join("");
    }
    revealDrawer();
    return;
  }

  const isFavMode = kind === "favorites";
  els.drawerTitle.textContent = isFavMode ? "Favoritos" : "Histórico";
  const data = readList(isFavMode ? FKEY : HKEY);

  els.drawerTools.innerHTML = data.length
    ? `<button class="drawer__clear" id="drawerClear" type="button">Limpar ${isFavMode ? "favoritos" : "histórico"}</button>` : "";

  if (!data.length) {
    els.drawerList.innerHTML = "";
    show(els.drawerEmpty);
  } else {
    hide(els.drawerEmpty);
    els.drawerList.innerHTML = data.map(item => `
      <li class="drawer__item" data-name="${escapeHTML(item.nome)}">
        <span class="di-name">${escapeHTML(item.nome)}</span>
        <span class="di-time">${timeAgo(item.ts)}</span>
        <button class="di-del" type="button" aria-label="Remover" data-del="${escapeHTML(item.nome)}">
          <svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </li>`).join("");
  }

  // Eventos dos itens
  $$(".drawer__item", els.drawerList).forEach(li => {
    li.addEventListener("click", e => {
      if (e.target.closest(".di-del")) return;
      const name = li.dataset.name;
      closeDrawer(); els.input.value = name; analyze(name);
    });
  });
  $$(".di-del", els.drawerList).forEach(b => {
    b.addEventListener("click", e => {
      e.stopPropagation();
      const key = isFavMode ? FKEY : HKEY;
      const name = b.dataset.del;
      store.set(key, readList(key).filter(x => x.nome !== name));
      openDrawer(kind);
    });
  });
  const clearBtn = $("#drawerClear");
  if (clearBtn) clearBtn.addEventListener("click", () => {
    store.set(isFavMode ? FKEY : HKEY, []); openDrawer(kind);
  });

  revealDrawer();
}

function closeDrawer() {
  if (!drawerOpen) return;
  drawerOpen = false;
  document.removeEventListener("keydown", trapDrawerFocus, true);
  els.drawer.classList.remove("is-open");
  els.drawer.setAttribute("aria-hidden", "true");
  setTimeout(() => { hide(els.drawer); hide(els.drawerScrim); }, 320);
  if (drawerLastFocus && typeof drawerLastFocus.focus === "function") drawerLastFocus.focus();
  drawerLastFocus = null;
}

function timeAgo(ts) {
  if (!Number.isFinite(ts)) return "";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 0) return "agora";
  if (s < 60) return "agora";
  if (s < 3600) return `${Math.floor(s / 60)}min`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/* =================================================================
   11) BUSCA POR VOZ (Web Speech API)
   ================================================================= */
function initVoice() {
  if (!els.voice) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { els.voice.style.display = "none"; return; }
  const rec = new SR();
  rec.lang = "pt-BR"; rec.interimResults = false; rec.maxAlternatives = 1;

  els.voice.addEventListener("click", () => {
    try { rec.start(); els.voice.classList.add("is-listening"); toast("Ouvindo…"); }
    catch { /* já em execução */ }
  });
  rec.onresult = e => {
    const txt = e.results[0][0].transcript;
    els.input.value = txt;
    els.voice.classList.remove("is-listening");
    analyze(txt);
  };
  rec.onerror = () => { els.voice.classList.remove("is-listening"); toast("Não consegui ouvir. Tente de novo."); };
  rec.onend = () => els.voice.classList.remove("is-listening");
}

/* =================================================================
   12) TEMA (claro/escuro) — nativo via prefers-color-scheme
   ================================================================= */
const THEME_COLOR = { dark: "#0B0E0D", light: "#F7F8F8" };

function applyTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", t);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[t]);
  const btn = $("#btnTheme");
  if (btn) {
    btn.setAttribute("aria-pressed", t === "light" ? "true" : "false");
    btn.setAttribute("aria-label", t === "light" ? "Ativar tema escuro" : "Ativar tema claro");
  }
  return t;
}

function initTheme() {
  // O tema já foi aplicado por um script curto no <head> (evita o "flash"
  // de tela escura antes de o CSS trocar). Aqui só sincronizamos e ligamos o botão.
  const atual = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  applyTheme(atual);

  $("#btnTheme")?.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    store.set("invictus.theme", applyTheme(next));
  });

  // Se o usuário nunca escolheu manualmente, acompanha a preferência do sistema
  window.matchMedia?.("(prefers-color-scheme: light)").addEventListener?.("change", e => {
    if (store.get("invictus.theme", null) === null) applyTheme(e.matches ? "light" : "dark");
  });
}

/* =================================================================
   13) DEMONSTRAÇÃO OFFLINE (funciona sem chave de IA)
   ================================================================= */
function getDemo(term) {
  const key = term.trim().toLowerCase();
  const match = Object.keys(DEMO).find(k => key.includes(k));
  return match ? DEMO[match] : null;
}

const DEMO = {
  "hipertens": {
    nome: "Hipertensão Arterial Sistêmica",
    cid10: "I10", cid11: "BA00",
    sinonimos: ["Pressão alta", "HAS"],
    area_medica: "Cardiologia / Clínica Médica",
    definicao: "Condição crônica caracterizada por níveis pressóricos persistentemente elevados (≥140/90 mmHg em consultório). É um dos principais fatores de risco cardiovascular modificáveis.",
    sintomas_comuns: ["Geralmente assintomática", "Cefaleia occipital", "Tontura"],
    sintomas_raros: ["Epistaxe", "Zumbido", "Visão turva"],
    sinais_alerta: ["Dor torácica intensa", "Dispneia súbita", "Déficit neurológico (sugestivo de AVC)", "PA ≥180/120 com lesão de órgão-alvo"],
    tratamento: {
      padrao: ["Mudança de estilo de vida (dieta DASH, redução de sódio)", "Atividade física regular", "Controle de peso"],
      medicamentos: ["IECA", "BRA", "Diuréticos tiazídicos", "Bloqueadores de canal de cálcio"],
      complementares: ["Cessação do tabagismo", "Redução do consumo de álcool", "Manejo do estresse"],
      prognostico: "Excelente quando controlada; o risco cardiovascular reduz significativamente com adesão ao tratamento."
    },
    diagnostico: {
      laboratoriais: ["Função renal", "Eletrólitos", "Glicemia", "Perfil lipídico"],
      imagem: ["ECG", "Ecocardiograma (avaliação de hipertrofia)"],
      criterios: ["PA ≥140/90 mmHg em duas ou mais medições", "MAPA / MRPA para confirmação"]
    },
    complicacoes: ["Infarto do miocárdio", "AVC", "Insuficiência renal crônica", "Retinopatia hipertensiva", "Insuficiência cardíaca"],
    variacoes: [],
    diferenciais: ["Hipertensão do avental branco", "Feocromocitoma", "Hiperaldosteronismo primário", "Estenose de artéria renal"],
    epidemiologia: {
      prevalencia: "~30% dos adultos no Brasil",
      faixa_etaria: "Mais comum acima dos 40 anos",
      sexo: "Discreta predominância masculina até a meia-idade",
      distribuicao_geografica: "Universal, maior em áreas urbanas"
    },
    fisiopatologia: {
      simples: "A pressão dentro das artérias fica alta demais por muito tempo, forçando o coração e os vasos a trabalharem além do normal.",
      avancada: "Resulta da interação entre débito cardíaco e resistência vascular periférica, modulada pelo sistema renina-angiotensina-aldosterona, atividade simpática, função endotelial e manejo renal de sódio. Disfunção endotelial e remodelamento vascular perpetuam a elevação pressórica."
    },
    referencias: ["Diretriz Brasileira de Hipertensão Arterial (SBC)", "Harrison's Principles of Internal Medicine", "UpToDate — Hypertension"]
  },
  "diabetes": {
    nome: "Diabetes Mellitus",
    cid10: "E10–E14", cid11: "5A10–5A14",
    sinonimos: ["DM", "Açúcar no sangue alto"],
    area_medica: "Endocrinologia",
    definicao: "Grupo de doenças metabólicas caracterizadas por hiperglicemia crônica decorrente de defeitos na secreção e/ou ação da insulina.",
    sintomas_comuns: ["Poliúria", "Polidipsia", "Polifagia", "Perda de peso", "Fadiga"],
    sintomas_raros: ["Visão turva", "Infecções de repetição", "Cicatrização lenta"],
    sinais_alerta: ["Hálito cetônico e respiração rápida (cetoacidose)", "Rebaixamento do nível de consciência", "Glicemia muito elevada com desidratação"],
    tratamento: {
      padrao: ["Educação em diabetes", "Dieta e atividade física", "Monitorização glicêmica"],
      medicamentos: ["Insulina", "Metformina", "Inibidores de SGLT2", "Análogos de GLP-1"],
      complementares: ["Acompanhamento nutricional", "Cuidados com os pés", "Avaliação oftalmológica periódica"],
      prognostico: "Bom controle reduz drasticamente complicações; depende fortemente da adesão e do tipo."
    },
    diagnostico: {
      laboratoriais: ["Glicemia de jejum ≥126 mg/dL", "HbA1c ≥6,5%", "Teste de tolerância à glicose"],
      imagem: [],
      criterios: ["Sintomas clássicos + glicemia aleatória ≥200 mg/dL", "Confirmação em segunda dosagem"]
    },
    complicacoes: ["Retinopatia", "Nefropatia", "Neuropatia", "Pé diabético", "Doença cardiovascular"],
    variacoes: [
      { nome: "Diabetes tipo 1", definicao: "Destruição autoimune das células beta pancreáticas, com deficiência absoluta de insulina.", transmissao: "", gravidade: "grave", tratamento: "Insulinoterapia obrigatória" },
      { nome: "Diabetes tipo 2", definicao: "Resistência à insulina associada a déficit secretório progressivo.", transmissao: "", gravidade: "moderada", tratamento: "Estilo de vida, antidiabéticos orais e, eventualmente, insulina" },
      { nome: "Diabetes gestacional", definicao: "Intolerância à glicose diagnosticada na gravidez.", transmissao: "", gravidade: "moderada", tratamento: "Dieta, monitorização e insulina se necessário" },
      { nome: "MODY", definicao: "Diabetes monogênico de início precoce e herança autossômica dominante.", transmissao: "", gravidade: "leve", tratamento: "Variável conforme o subtipo genético" },
      { nome: "LADA", definicao: "Diabetes autoimune latente do adulto, evolução mais lenta que o tipo 1.", transmissao: "", gravidade: "moderada", tratamento: "Progressão para insulina" }
    ],
    diferenciais: ["Diabetes insipidus", "Hipertireoidismo", "Síndrome de Cushing"],
    epidemiologia: {
      prevalencia: "~10% da população adulta brasileira",
      faixa_etaria: "Tipo 1 na infância/adolescência; tipo 2 em adultos",
      sexo: "Distribuição semelhante entre os sexos",
      distribuicao_geografica: "Crescente em todo o mundo"
    },
    fisiopatologia: {
      simples: "O corpo não consegue usar bem o açúcar do sangue, seja por falta de insulina, seja porque ela não funciona direito.",
      avancada: "No tipo 1, autoimunidade destrói células beta (deficiência absoluta de insulina). No tipo 2, resistência periférica à insulina, disfunção de células beta, aumento da produção hepática de glicose e alterações em incretinas convergem para hiperglicemia sustentada."
    },
    referencias: ["Diretrizes da Sociedade Brasileira de Diabetes", "ADA Standards of Care", "Williams Textbook of Endocrinology"]
  },
};

/* =================================================================
   14) LIGAÇÃO DE EVENTOS GLOBAIS
   ================================================================= */
function bindGlobalEvents() {
  // Busca
  els.analyze.addEventListener("click", () => analyze());
  els.input.addEventListener("keydown", e => {
    const items = $$("#suggestions li");
    if (!els.suggestions.hidden && items.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); suggIndex = (suggIndex + 1) % items.length; updateSuggHighlight(items); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); suggIndex = (suggIndex - 1 + items.length) % items.length; updateSuggHighlight(items); return; }
      if (e.key === "Enter" && suggIndex >= 0) { e.preventDefault(); const v = items[suggIndex].dataset.val; els.input.value = v; hideSuggestions(); analyze(v); return; }
      if (e.key === "Escape") { hideSuggestions(); return; }
    }
    if (e.key === "Enter") { hideSuggestions(); analyze(); }
  });
  els.input.addEventListener("input", () => renderSuggestions(els.input.value));
  els.input.addEventListener("focus", () => { if (els.input.value) renderSuggestions(els.input.value); });

  // Clique nas sugestões
  els.suggestions.addEventListener("click", e => {
    const li = e.target.closest("li");
    if (!li) return;
    els.input.value = li.dataset.val; hideSuggestions(); analyze(li.dataset.val);
  });

  // Fecha sugestões ao clicar fora
  document.addEventListener("click", e => {
    if (!e.target.closest(".search__field")) hideSuggestions();
  });

  // Exemplos rápidos
  $$(".chip[data-example]").forEach(c =>
    c.addEventListener("click", () => { els.input.value = c.dataset.example; analyze(c.dataset.example); }));

  // Logo volta para a busca
  const brand = document.querySelector(".brand");
  if (brand) brand.addEventListener("click", e => { e.preventDefault(); resetToSearch(); });

  // Painéis laterais
  $("#btnProjects").addEventListener("click", () => openDrawer("projects"));
  $("#btnHistory").addEventListener("click", () => openDrawer("history"));
  $("#btnFavorites").addEventListener("click", () => openDrawer("favorites"));
  $("#drawerClose")?.addEventListener("click", closeDrawer);
  els.drawerScrim?.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (drawerOpen) { closeDrawer(); return; }
    if (!els.suggestions.hidden) hideSuggestions();
  });

  // Aba de estudo
  const studyBack = $("#studyBack");
  if (studyBack) studyBack.addEventListener("click", closeStudy);
  $$(".study-tool").forEach(b => b.addEventListener("click", () => generateStudy(b.dataset.modo)));
}

function updateSuggHighlight(items) {
  items.forEach((li, i) => li.setAttribute("aria-selected", i === suggIndex ? "true" : "false"));
  const atual = items[suggIndex];
  if (atual) {
    atual.scrollIntoView({ block: "nearest" });
    els.input.setAttribute("aria-activedescendant", atual.id);
  } else {
    els.input.removeAttribute("aria-activedescendant");
  }
}


/* =================================================================
   16) ANAMNESE ESTRUTURADA
   -----------------------------------------------------------------
   A ideia é digitar o mínimo possível. Quase tudo é clique: o texto
   final é montado por modelo, de forma determinística — sem IA, sem
   custo e sem risco de invenção.

   A IA entra em UM ponto só: transformar a queixa e a história escritas
   de forma solta ("dor na barriga há 3 dias, piora depois de comer")
   em prosa clínica. E mesmo isso é opcional — o texto sai completo sem.

   Privacidade: não existe campo de nome, CPF ou prontuário. Só o que a
   pessoa escreve na queixa e na história vai para a IA; identificação,
   antecedentes e hábitos nunca saem daqui.
   ================================================================= */

/* Interrogatório sintomatológico, por aparelho. Cada sintoma vira um
   chip de três estados: não abordado → refere → nega. */
const ISDA = [
  { sistema: "Geral", sintomas: ["Febre", "Astenia", "Perda de peso", "Ganho de peso", "Sudorese noturna", "Calafrios", "Hiporexia"] },
  { sistema: "Pele e fâneros", sintomas: ["Prurido", "Lesões de pele", "Alteração de coloração", "Queda de cabelo", "Alteração ungueal"] },
  { sistema: "Cabeça e pescoço", sintomas: ["Cefaleia", "Tontura", "Vertigem", "Dor cervical", "Adenomegalia"] },
  { sistema: "Olhos", sintomas: ["Turvação visual", "Dor ocular", "Hiperemia", "Diplopia", "Fotofobia", "Lacrimejamento"] },
  { sistema: "Otorrinolaringológico", sintomas: ["Otalgia", "Hipoacusia", "Zumbido", "Obstrução nasal", "Rinorreia", "Epistaxe", "Odinofagia", "Rouquidão"] },
  { sistema: "Cardiovascular", sintomas: ["Dor torácica", "Palpitações", "Dispneia aos esforços", "Ortopneia", "Dispneia paroxística noturna", "Edema de membros inferiores", "Síncope", "Claudicação"] },
  { sistema: "Respiratório", sintomas: ["Tosse seca", "Tosse produtiva", "Expectoração", "Hemoptise", "Dispneia", "Sibilância", "Dor pleurítica"] },
  { sistema: "Digestório", sintomas: ["Náuseas", "Vômitos", "Pirose", "Disfagia", "Dor abdominal", "Distensão abdominal", "Diarreia", "Constipação", "Melena", "Hematoquezia", "Icterícia"] },
  { sistema: "Geniturinário", sintomas: ["Disúria", "Polaciúria", "Urgência miccional", "Noctúria", "Hematúria", "Incontinência", "Corrimento", "Dor lombar"] },
  { sistema: "Musculoesquelético", sintomas: ["Artralgia", "Mialgia", "Rigidez matinal", "Edema articular", "Lombalgia", "Limitação de movimento"] },
  { sistema: "Neurológico", sintomas: ["Convulsões", "Parestesias", "Paresia", "Alteração da marcha", "Tremor", "Alteração de memória", "Alteração da fala"] },
  { sistema: "Psiquiátrico", sintomas: ["Humor deprimido", "Ansiedade", "Insônia", "Hipersonia", "Anedonia", "Ideação suicida", "Alteração do apetite"] },
  { sistema: "Endócrino", sintomas: ["Intolerância ao calor", "Intolerância ao frio", "Polidipsia", "Poliúria", "Polifagia"] },
];

/* Comorbidades mais frequentes — clicar é mais rápido que digitar. */
const COMORBIDADES = [
  "Hipertensão arterial", "Diabetes mellitus", "Dislipidemia", "Obesidade",
  "Asma", "DPOC", "Cardiopatia", "Infarto prévio", "AVC prévio",
  "Doença renal crônica", "Hepatopatia", "Neoplasia", "Hipotireoidismo",
  "Hipertireoidismo", "Depressão", "Ansiedade", "Epilepsia",
  "Doença reumatológica", "HIV", "Tuberculose prévia",
];

const ALERGIAS = ["Dipirona", "AAS", "Anti-inflamatórios", "Penicilina", "Sulfa", "Iodo/contraste", "Látex", "Alimentos"];

const FAMILIARES = [
  "Hipertensão arterial", "Diabetes mellitus", "Cardiopatia isquêmica precoce",
  "AVC", "Neoplasia", "Dislipidemia", "Doença renal", "Doença autoimune",
  "Transtorno psiquiátrico", "Tuberculose",
];

/* Etapas do roteiro. "campos" descreve o formulário de forma declarativa,
   para a marcação sair daqui e não ficar espalhada no HTML. */
const ETAPAS = [
  {
    id: "identificacao",
    titulo: "Identificação",
    resumo: "Quem é o paciente",
    campos: [
      { id: "iniciais", tipo: "texto", rotulo: "Iniciais", dica: "Ex.: J.S.M. — nunca o nome completo", curto: true },
      { id: "idade", tipo: "numero", rotulo: "Idade", sufixo: "anos", curto: true, min: 0, max: 120 },
      { id: "sexo", tipo: "opcoes", rotulo: "Sexo", opcoes: ["Feminino", "Masculino"] },
      { id: "estadoCivil", tipo: "opcoes", rotulo: "Estado civil", opcoes: ["Solteiro(a)", "Casado(a)", "União estável", "Divorciado(a)", "Viúvo(a)"] },
      { id: "profissao", tipo: "texto", rotulo: "Profissão", dica: "Opcional" },
      { id: "procedencia", tipo: "texto", rotulo: "Natural e procedente de", dica: "Opcional" },
    ],
  },
  {
    id: "queixa",
    titulo: "Queixa e história",
    resumo: "A parte escrita",
    aviso: "Escreva solto, do jeito que o paciente contou. É esta a parte que a IA organiza depois — e a única que sai deste navegador.",
    campos: [
      { id: "queixa", tipo: "texto", rotulo: "Queixa principal", dica: 'Como o paciente diz. Ex.: "dor na barriga"' },
      { id: "duracao", tipo: "texto", rotulo: "Há quanto tempo", dica: "Ex.: 3 dias, 2 semanas", curto: true },
      { id: "hda", tipo: "area", rotulo: "História da doença atual", linhas: 7,
        dica: "Conte como começou, como evoluiu, o que melhora e o que piora, o que já foi feito. Pode escrever corrido e informal." },
    ],
  },
  {
    id: "isda",
    titulo: "Interrogatório",
    resumo: "Sintomas por aparelho",
    aviso: "Clique uma vez para <b>refere</b>, outra para <b>nega</b>, outra para voltar ao neutro. O que ficar neutro não entra no texto.",
    isda: true,
  },
  {
    id: "antecedentes",
    titulo: "Antecedentes",
    resumo: "Doenças, cirurgias, medicações",
    campos: [
      { id: "comorbidades", tipo: "chips", rotulo: "Comorbidades", itens: COMORBIDADES },
      { id: "comorbidadesOutras", tipo: "texto", rotulo: "Outra comorbidade", dica: "Opcional" },
      { id: "cirurgias", tipo: "area", rotulo: "Cirurgias prévias", linhas: 2, dica: "Ex.: apendicectomia em 2019" },
      { id: "alergias", tipo: "chips", rotulo: "Alergias", itens: ALERGIAS },
      { id: "alergiasOutras", tipo: "texto", rotulo: "Outra alergia", dica: "Opcional" },
      { id: "medicacoes", tipo: "area", rotulo: "Medicações em uso", linhas: 3, dica: "Nome e posologia, uma por linha" },
      { id: "internacoes", tipo: "texto", rotulo: "Internações prévias", dica: "Opcional" },
    ],
  },
  {
    id: "habitos",
    titulo: "Hábitos e família",
    resumo: "Vida e antecedentes familiares",
    campos: [
      { id: "tabagismo", tipo: "opcoes", rotulo: "Tabagismo", opcoes: ["Nega", "Ex-tabagista", "Tabagista atual"] },
      { id: "cigarrosDia", tipo: "numero", rotulo: "Cigarros por dia", curto: true, min: 0, max: 200, depende: { campo: "tabagismo", valores: ["Ex-tabagista", "Tabagista atual"] } },
      { id: "anosFumo", tipo: "numero", rotulo: "Por quantos anos", curto: true, min: 0, max: 90, depende: { campo: "tabagismo", valores: ["Ex-tabagista", "Tabagista atual"] } },
      { id: "etilismo", tipo: "opcoes", rotulo: "Etilismo", opcoes: ["Nega", "Social", "Uso regular", "Uso pesado"] },
      { id: "etilismoDetalhe", tipo: "texto", rotulo: "Quanto e com que frequência", dica: "Ex.: 4 latas nos fins de semana", depende: { campo: "etilismo", valores: ["Social", "Uso regular", "Uso pesado"] } },
      { id: "drogas", tipo: "opcoes", rotulo: "Drogas ilícitas", opcoes: ["Nega", "Sim"] },
      { id: "drogasDetalhe", tipo: "texto", rotulo: "Quais", depende: { campo: "drogas", valores: ["Sim"] } },
      { id: "atividade", tipo: "opcoes", rotulo: "Atividade física", opcoes: ["Sedentário", "Irregular", "Regular"] },
      { id: "sono", tipo: "opcoes", rotulo: "Sono", opcoes: ["Preservado", "Alterado"] },
      { id: "alimentacao", tipo: "texto", rotulo: "Alimentação", dica: "Opcional. Ex.: rica em ultraprocessados" },
      { id: "familiares", tipo: "chips", rotulo: "Antecedentes familiares", itens: FAMILIARES },
      { id: "familiaresDetalhe", tipo: "texto", rotulo: "Detalhe dos antecedentes familiares", dica: "Opcional. Ex.: pai com IAM aos 52 anos" },
    ],
  },
  { id: "resultado", titulo: "Texto final", resumo: "Revisar e copiar", resultado: true },
];

/* ---------- Estado ---------- */
const AKEY = "invictus.anamnese";
let anamEtapa = 0;
let anamDados = {};       // { campoId: valor }  +  { isda: { "Sistema::Sintoma": "refere"|"nega" } }

const anamPadrao = () => ({ isda: {} });

function anamCarregar() {
  const salvo = store.get(AKEY, null);
  anamDados = (salvo && typeof salvo === "object") ? { ...anamPadrao(), ...salvo } : anamPadrao();
  if (!anamDados.isda || typeof anamDados.isda !== "object") anamDados.isda = {};
}
const anamSalvar = () => store.set(AKEY, anamDados);

/* ---------- Abertura e fechamento ---------- */
function abrirAnamnese() {
  anamCarregar();
  hide(els.results); hide(els.empty); hide(els.notice); hide(els.loader); hide(els.hero);
  hide(els.studyView); hide($("#calcView"));
  show($("#anamneseView"));
  anamRenderizar();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function fecharAnamnese() {
  hide($("#anamneseView"));
  if (currentData) show(els.results); else { show(els.hero); show(els.empty); }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------- Render ---------- */
function anamRenderizar() {
  const etapa = ETAPAS[anamEtapa];
  const corpo = $("#anamCorpo");

  // Trilha
  $("#anamTrilha").innerHTML = ETAPAS.map((e, i) => `
    <li class="anam-passo ${i === anamEtapa ? "is-atual" : ""} ${i < anamEtapa ? "is-feito" : ""}">
      <button type="button" data-ir="${i}">
        <span class="anam-passo__n">${i + 1}</span>
        <span class="anam-passo__t">${escapeHTML(e.titulo)}</span>
      </button>
    </li>`).join("");
  $$("#anamTrilha [data-ir]").forEach(b =>
    b.addEventListener("click", () => { anamEtapa = Number(b.dataset.ir); anamRenderizar(); }));

  let html = `<h3 class="anam__h">${escapeHTML(etapa.titulo)}</h3>`;
  if (etapa.aviso) html += `<p class="anam__dica">${etapa.aviso}</p>`;

  if (etapa.isda) html += anamHTMLisda();
  else if (etapa.resultado) html += anamHTMLresultado();
  else html += `<div class="anam__campos">${etapa.campos.map(anamHTMLcampo).join("")}</div>`;

  corpo.innerHTML = html;
  anamLigarEventos(etapa);

  $("#anamAnterior").disabled = anamEtapa === 0;
  $("#anamProximo").textContent = anamEtapa === ETAPAS.length - 2 ? "Gerar texto" : "Próximo";
  $("#anamProximo").hidden = etapa.resultado === true;
}

function anamHTMLcampo(c) {
  // Campos que só fazem sentido em função de outra resposta
  if (c.depende) {
    const atual = anamDados[c.depende.campo];
    if (!c.depende.valores.includes(atual)) return "";
  }
  const v = anamDados[c.id];
  const dica = c.dica ? `<span class="anam-campo__dica">${escapeHTML(c.dica)}</span>` : "";
  const cls = `anam-campo ${c.curto ? "anam-campo--curto" : ""}`;

  if (c.tipo === "opcoes") {
    return `<div class="${cls}">
      <label class="anam-campo__rot">${escapeHTML(c.rotulo)}</label>${dica}
      <div class="anam-opcoes" role="group" aria-label="${escapeHTML(c.rotulo)}">
        ${c.opcoes.map(o => `<button type="button" class="anam-opcao ${v === o ? "is-on" : ""}"
            data-campo="${c.id}" data-valor="${escapeHTML(o)}" aria-pressed="${v === o}">${escapeHTML(o)}</button>`).join("")}
      </div></div>`;
  }
  if (c.tipo === "chips") {
    const sel = Array.isArray(v) ? v : [];
    return `<div class="anam-campo">
      <label class="anam-campo__rot">${escapeHTML(c.rotulo)}</label>${dica}
      <div class="anam-chips" role="group" aria-label="${escapeHTML(c.rotulo)}">
        ${c.itens.map(i => `<button type="button" class="anam-chip ${sel.includes(i) ? "is-on" : ""}"
            data-lista="${c.id}" data-item="${escapeHTML(i)}" aria-pressed="${sel.includes(i)}">${escapeHTML(i)}</button>`).join("")}
      </div></div>`;
  }
  if (c.tipo === "area") {
    return `<div class="anam-campo anam-campo--largo">
      <label class="anam-campo__rot" for="anam-${c.id}">${escapeHTML(c.rotulo)}</label>${dica}
      <textarea class="anam-input anam-input--area" id="anam-${c.id}" data-campo="${c.id}"
        rows="${c.linhas || 3}">${escapeHTML(v || "")}</textarea></div>`;
  }
  const tipo = c.tipo === "numero" ? "number" : "text";
  const extra = c.tipo === "numero" ? `min="${c.min ?? 0}" max="${c.max ?? 999}" inputmode="numeric"` : "";
  return `<div class="${cls}">
    <label class="anam-campo__rot" for="anam-${c.id}">${escapeHTML(c.rotulo)}</label>${dica}
    <div class="anam-input__wrap">
      <input class="anam-input" id="anam-${c.id}" type="${tipo}" ${extra}
        data-campo="${c.id}" value="${escapeHTML(v ?? "")}" />
      ${c.sufixo ? `<span class="anam-input__sufixo">${escapeHTML(c.sufixo)}</span>` : ""}
    </div></div>`;
}

function anamHTMLisda() {
  return `<div class="anam-isda">${ISDA.map(g => `
    <section class="anam-sis">
      <div class="anam-sis__head">
        <h4>${escapeHTML(g.sistema)}</h4>
        <button type="button" class="anam-sis__negar" data-negar="${escapeHTML(g.sistema)}">Negar todos</button>
      </div>
      <div class="anam-chips">
        ${g.sintomas.map(s => {
          const est = anamDados.isda[`${g.sistema}::${s}`] || "";
          return `<button type="button" class="anam-chip anam-chip--tri ${est ? "is-" + est : ""}"
            data-sis="${escapeHTML(g.sistema)}" data-sint="${escapeHTML(s)}"
            aria-label="${escapeHTML(s)}: ${est || "não abordado"}">${escapeHTML(s)}</button>`;
        }).join("")}
      </div>
    </section>`).join("")}</div>`;
}

function anamHTMLresultado() {
  return `
    <div class="anam-res__acoes">
      <button class="btn btn--primary anam-res__btn" id="anamCopiar" type="button">Copiar texto</button>
      <button class="anam-res__btn anam-res__btn--sec" id="anamRefinar" type="button">Organizar história com IA</button>
      <button class="anam-res__btn anam-res__btn--sec" id="anamBaixar" type="button">Baixar .txt</button>
    </div>
    <p class="anam__dica" id="anamRefinoDica">
      A IA reescreve só a história da doença atual em linguagem clínica. Ela não inventa
      sintoma nem sugere diagnóstico — e o resto do texto já está pronto sem ela.
    </p>
    <textarea class="anam-res__texto" id="anamTexto" rows="22" spellcheck="false"></textarea>
    <p class="anam__aviso anam__aviso--res">
      Revise antes de usar. Texto de apoio ao estudo, não substitui registro em prontuário
      feito por profissional responsável.
    </p>`;
}

/* ---------- Eventos ---------- */
function anamLigarEventos(etapa) {
  const corpo = $("#anamCorpo");

  $$(".anam-opcao", corpo).forEach(b => b.addEventListener("click", () => {
    const atual = anamDados[b.dataset.campo];
    anamDados[b.dataset.campo] = atual === b.dataset.valor ? "" : b.dataset.valor;
    anamSalvar();
    anamRenderizar();   // pode revelar ou esconder campos dependentes
  }));

  $$(".anam-chip[data-lista]", corpo).forEach(b => b.addEventListener("click", () => {
    const lista = Array.isArray(anamDados[b.dataset.lista]) ? anamDados[b.dataset.lista] : [];
    const item = b.dataset.item;
    anamDados[b.dataset.lista] = lista.includes(item) ? lista.filter(x => x !== item) : [...lista, item];
    b.classList.toggle("is-on");
    b.setAttribute("aria-pressed", b.classList.contains("is-on"));
    anamSalvar();
  }));

  // Três estados num clique só: neutro → refere → nega → neutro
  $$(".anam-chip--tri", corpo).forEach(b => b.addEventListener("click", () => {
    const chave = `${b.dataset.sis}::${b.dataset.sint}`;
    const atual = anamDados.isda[chave] || "";
    const proximo = atual === "" ? "refere" : atual === "refere" ? "nega" : "";
    if (proximo) anamDados.isda[chave] = proximo; else delete anamDados.isda[chave];
    b.classList.remove("is-refere", "is-nega");
    if (proximo) b.classList.add("is-" + proximo);
    b.setAttribute("aria-label", `${b.dataset.sint}: ${proximo || "não abordado"}`);
    anamSalvar();
  }));

  $$("[data-negar]", corpo).forEach(b => b.addEventListener("click", () => {
    const sis = b.dataset.negar;
    const grupo = ISDA.find(g => g.sistema === sis);
    // Só marca o que ainda não foi tocado: não desfaz um "refere" já registrado
    grupo.sintomas.forEach(s => {
      const chave = `${sis}::${s}`;
      if (!anamDados.isda[chave]) anamDados.isda[chave] = "nega";
    });
    anamSalvar();
    anamRenderizar();
  }));

  $$("[data-campo]", corpo).filter(el => el.tagName === "INPUT" || el.tagName === "TEXTAREA")
    .forEach(el => el.addEventListener("input", () => {
      anamDados[el.dataset.campo] = el.value;
      anamSalvar();
    }));

  if (etapa.resultado) {
    const area = $("#anamTexto");
    area.value = montarAnamnese();
    $("#anamCopiar").addEventListener("click", async () => {
      toast(await copyToClipboard(area.value) ? "Anamnese copiada." : "Não foi possível copiar.");
    });
    $("#anamRefinar").addEventListener("click", refinarHistoria);
    $("#anamBaixar").addEventListener("click", baixarAnamnese);
  }
}

/* ---------- Montagem do texto ----------
   Tudo aqui é modelo puro: mesma entrada, mesma saída, sem IA no meio. */

/* "a, b e c" — como se escreve, não "a, b, c" */
function listar(itens) {
  const l = (itens || []).filter(Boolean).map(String);
  if (!l.length) return "";
  if (l.length === 1) return l[0];
  return `${l.slice(0, -1).join(", ")} e ${l[l.length - 1]}`;
}

const minuscula = s => s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
const maiuscula = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

/* Resolve as formas "Casado(a)" / "Sedentário(a)" pelo sexo informado. Deixar
   o "(a)" no texto final denuncia formulário; errar a concordância, também. */
function concordar(texto) {
  const fem = v("sexo") === "Feminino";
  return String(texto || "")
    .replace(/o\(a\)/g, fem ? "a" : "o")
    .replace(/\bSedentário\b/g, fem ? "Sedentária" : "Sedentário");
}

/* Baixa a inicial de cada item da lista, mas preserva siglas: "Hipertensão
   arterial" vira "hipertensão arterial", enquanto "HIV" e "DPOC" ficam como
   estão. Duas maiúsculas seguidas no começo = sigla. */
const minusculaItem = s => (s && !/^[A-ZÀ-Ú]{2}/.test(s)) ? minuscula(s) : s;
const listarMinusculo = itens => listar((itens || []).filter(Boolean).map(minusculaItem));
const v = id => (anamDados[id] || "").toString().trim();
const vLista = id => Array.isArray(anamDados[id]) ? anamDados[id] : [];

function blocoIdentificacao() {
  const partes = [];
  if (v("iniciais")) partes.push(v("iniciais"));
  if (v("idade")) partes.push(`${v("idade")} anos`);
  if (v("sexo")) partes.push(`sexo ${v("sexo").toLowerCase()}`);
  if (v("estadoCivil")) partes.push(concordar(minuscula(v("estadoCivil"))));
  if (v("profissao")) partes.push(minuscula(v("profissao")));
  if (v("procedencia")) partes.push(`natural e procedente de ${v("procedencia")}`);
  return partes.length ? partes.join(", ") + "." : "";
}

function blocoQueixa() {
  const q = v("queixa");
  if (!q) return "";
  const d = v("duracao");
  return `"${q}"${d ? ` há ${d}` : ""}.`;
}

function blocoISDA() {
  const linhas = [];
  for (const g of ISDA) {
    const refere = [], nega = [];
    for (const s of g.sintomas) {
      const est = anamDados.isda[`${g.sistema}::${s}`];
      if (est === "refere") refere.push(minusculaItem(s));
      else if (est === "nega") nega.push(minusculaItem(s));
    }
    if (!refere.length && !nega.length) continue;   // sistema não abordado fica fora
    const trechos = [];
    if (refere.length) trechos.push(`refere ${listar(refere)}`);
    if (nega.length) trechos.push(`nega ${listar(nega)}`);
    linhas.push(`${g.sistema}: ${trechos.join("; ")}.`);
  }
  return linhas.join("\n");
}

function blocoAntecedentes() {
  const linhas = [];
  const comorb = [...vLista("comorbidades"), v("comorbidadesOutras")].filter(Boolean);
  linhas.push(comorb.length
    ? `Comorbidades: ${listarMinusculo(comorb)}.`
    : "Nega comorbidades prévias.");

  if (v("cirurgias")) linhas.push(`Cirurgias prévias: ${minuscula(v("cirurgias"))}.`);
  else linhas.push("Nega cirurgias prévias.");

  const alerg = [...vLista("alergias"), v("alergiasOutras")].filter(Boolean);
  linhas.push(alerg.length
    ? `Alergias: ${listarMinusculo(alerg)}.`
    : "Nega alergias conhecidas.");

  if (v("medicacoes")) linhas.push(`Medicações em uso: ${v("medicacoes").replace(/\n+/g, "; ")}.`);
  else linhas.push("Nega uso de medicações contínuas.");

  if (v("internacoes")) linhas.push(`Internações prévias: ${minuscula(v("internacoes"))}.`);
  return linhas.join("\n");
}

function blocoHabitos() {
  const partes = [];

  const tab = v("tabagismo");
  if (tab === "Nega") partes.push("Nega tabagismo.");
  else if (tab) {
    const cig = Number(v("cigarrosDia")), anos = Number(v("anosFumo"));
    let t = tab === "Ex-tabagista" ? "Ex-tabagista" : "Tabagista atual";
    if (cig > 0 && anos > 0) {
      // Carga tabágica: a conta que sempre se esquece de fazer na hora
      const macosAno = Math.round((cig / 20) * anos * 10) / 10;
      t += `, ${cig} cigarros/dia por ${anos} anos (${macosAno} maços-ano)`;
    } else if (cig > 0) t += `, ${cig} cigarros/dia`;
    partes.push(t + ".");
  }

  const eti = v("etilismo");
  if (eti === "Nega") partes.push("Nega etilismo.");
  else if (eti) partes.push(`Etilismo ${minuscula(eti)}${v("etilismoDetalhe") ? ` (${v("etilismoDetalhe")})` : ""}.`);

  const dro = v("drogas");
  if (dro === "Nega") partes.push("Nega uso de drogas ilícitas.");
  else if (dro === "Sim") partes.push(`Refere uso de drogas ilícitas${v("drogasDetalhe") ? `: ${v("drogasDetalhe")}` : ""}.`);

  if (v("atividade")) partes.push(v("atividade") === "Sedentário" ? concordar("Sedentário.") : `Atividade física ${minuscula(v("atividade"))}.`);
  if (v("sono")) partes.push(`Sono ${minuscula(v("sono"))}.`);
  if (v("alimentacao")) partes.push(`Alimentação: ${minuscula(v("alimentacao"))}.`);
  return partes.join(" ");
}

function blocoFamiliares() {
  const f = vLista("familiares");
  const partes = [];
  if (f.length) partes.push(`Refere ${listarMinusculo(f)} na família.`);
  else partes.push("Nega antecedentes familiares relevantes.");
  if (v("familiaresDetalhe")) partes.push(maiuscula(v("familiaresDetalhe")) + ".");
  return partes.join(" ");
}

function montarAnamnese() {
  // Linha em branco entre seções: o texto é feito para ser colado e lido,
  // e sem o respiro os blocos se confundem.
  const secao = (titulo, corpo) => corpo && corpo.trim()
    ? `${titulo}\n${corpo.trim()}\n\n` : "";

  let t = "";
  t += secao("IDENTIFICAÇÃO", blocoIdentificacao());
  t += secao("QUEIXA PRINCIPAL", blocoQueixa());
  t += secao("HISTÓRIA DA DOENÇA ATUAL", v("hdaRefinada") || v("hda"));
  t += secao("INTERROGATÓRIO SINTOMATOLÓGICO", blocoISDA());
  t += secao("ANTECEDENTES PESSOAIS", blocoAntecedentes());
  t += secao("HÁBITOS DE VIDA", blocoHabitos());
  t += secao("ANTECEDENTES FAMILIARES", blocoFamiliares());
  return t.trim();
}

/* ---------- Refino da história pela IA ----------
   Único ponto em que algo sai deste navegador. Só a queixa e a história
   vão — identificação, antecedentes e hábitos ficam sempre aqui. */
async function refinarHistoria() {
  const btn = $("#anamRefinar");
  const hda = v("hda");
  if (!hda) { toast("Escreva a história da doença atual primeiro."); return; }

  const rotulo = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Organizando…";

  try {
    const dados = await postProxy({
      modo: "anamnese",
      termo: v("queixa") || "queixa não informada",
      hda,
      duracao: v("duracao"),
      idade: v("idade"),
      sexo: v("sexo"),
    });
    const texto = String(dados.hda || "").trim();
    if (!texto) throw errWithCode("vazio", "VAZIO");

    anamDados.hdaRefinada = texto;
    if (dados.queixa) anamDados.queixaRefinada = String(dados.queixa).trim();
    anamSalvar();
    $("#anamTexto").value = montarAnamnese();
    toast("História reorganizada. Confira antes de usar.");
    btn.textContent = "Refazer com IA";
  } catch (e) {
    toast("Não consegui organizar agora. O texto continua completo sem isso.");
    btn.textContent = rotulo;
  } finally {
    btn.disabled = false;
  }
}

function baixarAnamnese() {
  const texto = $("#anamTexto").value;
  const nome = `anamnese-${v("iniciais") || "paciente"}-${new Date().toISOString().slice(0, 10)}.txt`
    .replace(/[^\w.-]/g, "-");
  const url = URL.createObjectURL(new Blob([texto], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Arquivo baixado.");
}

function limparAnamnese() {
  if (!confirm("Apagar todas as respostas desta anamnese?")) return;
  anamDados = anamPadrao();
  anamSalvar();
  anamEtapa = 0;
  anamRenderizar();
  toast("Anamnese limpa.");
}

function ligarEventosAnamnese() {
  $("#btnAnamnese")?.addEventListener("click", abrirAnamnese);
  $("#btnAnamneseHero")?.addEventListener("click", abrirAnamnese);
  $("#anamVoltarInicio")?.addEventListener("click", fecharAnamnese);
  $("#anamLimpar")?.addEventListener("click", limparAnamnese);
  $("#anamAnterior")?.addEventListener("click", () => {
    if (anamEtapa > 0) { anamEtapa--; anamRenderizar(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  });
  $("#anamProximo")?.addEventListener("click", () => {
    if (anamEtapa < ETAPAS.length - 1) { anamEtapa++; anamRenderizar(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  });
}


/* =================================================================
   REPORTAR CONTEÚDO ERRADO
   -----------------------------------------------------------------
   Conteúdo gerado por IA erra — não é hipótese, é estatística. Sem um
   caminho para relatar, quem encontra um erro só desconfia em silêncio,
   e o erro continua aparecendo para os próximos.

   Se CONFIG.REPORT_URL estiver configurado, o relato é enviado e pronto.
   Sem isso, o site monta o texto e oferece cópia — imperfeito, mas
   melhor que não ter para onde reclamar.
   ================================================================= */
const SECOES_REPORTE = [
  "Definição", "Sintomas", "Diagnóstico", "Tratamento", "Complicações",
  "Variações", "Diferenciais", "Epidemiologia", "Fisiopatologia", "Referências", "Outra parte",
];

let reporteFoco = null;

function abrirReporte(d) {
  reporteFoco = document.activeElement;
  const m = $("#reporteModal");
  $("#reporteFicha").textContent = d.nome || "esta ficha";
  $("#reporteSecoes").innerHTML = SECOES_REPORTE.map(sec =>
    `<button type="button" class="rep-chip" data-sec="${escapeHTML(sec)}" aria-pressed="false">${escapeHTML(sec)}</button>`).join("");
  $("#reporteTexto").value = "";
  hide($("#reporteSaida"));
  show($("#reporteForm"));

  $$(".rep-chip", m).forEach(b => b.addEventListener("click", () => {
    b.classList.toggle("is-on");
    b.setAttribute("aria-pressed", b.classList.contains("is-on"));
  }));

  show($("#reporteScrim"));
  show(m);
  document.addEventListener("keydown", teclasReporte, true);
  requestAnimationFrame(() => $("#reporteTexto")?.focus());
}

function fecharReporte() {
  if ($("#reporteModal").hidden) return;
  hide($("#reporteModal"));
  hide($("#reporteScrim"));
  document.removeEventListener("keydown", teclasReporte, true);
  if (reporteFoco && typeof reporteFoco.focus === "function") reporteFoco.focus();
  reporteFoco = null;
}

function teclasReporte(e) {
  const m = $("#reporteModal");
  if (m.hidden) return;
  if (e.key === "Escape") { e.stopPropagation(); fecharReporte(); return; }
  if (e.key !== "Tab") return;
  const foco = $$("button, textarea, a[href]", m).filter(el => !el.disabled && el.offsetParent !== null);
  if (!foco.length) return;
  const pri = foco[0], ult = foco[foco.length - 1];
  if (!m.contains(document.activeElement)) { e.preventDefault(); pri.focus(); }
  else if (e.shiftKey && document.activeElement === pri) { e.preventDefault(); ult.focus(); }
  else if (!e.shiftKey && document.activeElement === ult) { e.preventDefault(); pri.focus(); }
}

function textoDoReporte() {
  const secoes = $$(".rep-chip.is-on", $("#reporteModal")).map(b => b.dataset.sec);
  const descricao = ($("#reporteTexto").value || "").trim();
  return [
    "Relato de erro — Invictus.Med",
    `Ficha: ${currentData?.nome || "(sem nome)"}`,
    secoes.length ? `Seções: ${secoes.join(", ")}` : "Seções: (não indicadas)",
    descricao ? `O que está errado: ${descricao}` : "O que está errado: (não descrito)",
    `Data: ${new Date().toLocaleString("pt-BR")}`,
  ].join("\n");
}

async function enviarReporte() {
  const btn = $("#reporteEnviar");
  const texto = textoDoReporte();
  btn.disabled = true;
  btn.textContent = "Enviando…";

  if (CONFIG.REPORT_URL) {
    try {
      const res = await fetchWithTimeout(CONFIG.REPORT_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ficha: currentData?.nome || "",
          secoes: $$(".rep-chip.is-on", $("#reporteModal")).map(b => b.dataset.sec),
          descricao: ($("#reporteTexto").value || "").trim().slice(0, 2000),
        }),
      });
      if (res.ok) {
        fecharReporte();
        toast("Obrigado! Relato enviado.");
        btn.disabled = false; btn.textContent = "Enviar relato";
        return;
      }
    } catch { /* cai para a cópia manual */ }
  }

  // Sem servidor de relatos: entrega o texto pronto para a pessoa mandar.
  hide($("#reporteForm"));
  $("#reporteSaidaTexto").value = texto;
  show($("#reporteSaida"));
  btn.disabled = false;
  btn.textContent = "Enviar relato";
}

function ligarEventosReporte() {
  $("#reporteFechar")?.addEventListener("click", fecharReporte);
  $("#reporteScrim")?.addEventListener("click", fecharReporte);
  $("#reporteEnviar")?.addEventListener("click", enviarReporte);
  $("#reporteCopiar")?.addEventListener("click", async () => {
    toast(await copyToClipboard($("#reporteSaidaTexto").value)
      ? "Relato copiado — é só colar na mensagem." : "Não foi possível copiar.");
  });
}

/* =================================================================
   CALCULADORAS E ESCORES CLÍNICOS
   -----------------------------------------------------------------
   Tudo aqui é aritmética: nenhuma chamada de IA, custo zero, resposta
   instantânea e impossível de alucinar. É o mesmo princípio que já
   funciona na montagem do texto da anamnese.

   Cada escore declara seus campos e uma função que devolve
   { valor, rotulo, nivel, nota }. "nivel" pinta o resultado:
   ok | atencao | alerta.
   ================================================================= */

/* Tipos de campo: num (número), opt (escolha única), sim (sim/não) */
const ESCORES = [
  {
    id: "imc",
    nome: "IMC",
    area: "Geral",
    descricao: "Índice de massa corporal e faixa de classificação.",
    campos: [
      { id: "peso", rotulo: "Peso", tipo: "num", sufixo: "kg", min: 1, max: 400, passo: "0.1" },
      { id: "altura", rotulo: "Altura", tipo: "num", sufixo: "m", min: 0.5, max: 2.5, passo: "0.01" },
    ],
    calcular: v => {
      const imc = v.peso / (v.altura * v.altura);
      const faixas = [
        [18.5, "Baixo peso", "atencao"], [25, "Eutrofia", "ok"], [30, "Sobrepeso", "atencao"],
        [35, "Obesidade grau I", "alerta"], [40, "Obesidade grau II", "alerta"],
        [Infinity, "Obesidade grau III", "alerta"],
      ];
      const [, rotulo, nivel] = faixas.find(([lim]) => imc < lim);
      return { valor: imc.toFixed(1), unidade: "kg/m²", rotulo, nivel };
    },
  },
  {
    id: "superficie",
    nome: "Superfície corporal",
    area: "Geral",
    descricao: "Fórmula de Mosteller — usada em doses de quimioterapia.",
    campos: [
      { id: "peso", rotulo: "Peso", tipo: "num", sufixo: "kg", min: 1, max: 400, passo: "0.1" },
      { id: "altura", rotulo: "Altura", tipo: "num", sufixo: "cm", min: 30, max: 250, passo: "1" },
    ],
    calcular: v => ({
      valor: Math.sqrt((v.altura * v.peso) / 3600).toFixed(2),
      unidade: "m²", rotulo: "Superfície corporal", nivel: "ok",
    }),
  },
  {
    id: "cockcroft",
    nome: "Clearance de creatinina",
    area: "Nefrologia",
    descricao: "Cockcroft-Gault. Estima a função renal para ajuste de dose.",
    campos: [
      { id: "idade", rotulo: "Idade", tipo: "num", sufixo: "anos", min: 1, max: 120 },
      { id: "peso", rotulo: "Peso", tipo: "num", sufixo: "kg", min: 1, max: 400, passo: "0.1" },
      { id: "creatinina", rotulo: "Creatinina sérica", tipo: "num", sufixo: "mg/dL", min: 0.1, max: 20, passo: "0.01" },
      { id: "sexo", rotulo: "Sexo", tipo: "opt", opcoes: [["m", "Masculino"], ["f", "Feminino"]] },
    ],
    calcular: v => {
      const base = ((140 - v.idade) * v.peso) / (72 * v.creatinina);
      const cl = v.sexo === "f" ? base * 0.85 : base;
      const faixas = [
        [15, "Falência renal (G5)", "alerta"], [30, "Redução grave (G4)", "alerta"],
        [45, "Redução moderada a grave (G3b)", "alerta"], [60, "Redução leve a moderada (G3a)", "atencao"],
        [90, "Redução leve (G2)", "atencao"], [Infinity, "Normal ou elevada (G1)", "ok"],
      ];
      const [, rotulo, nivel] = faixas.find(([lim]) => cl < lim);
      return { valor: cl.toFixed(1), unidade: "mL/min", rotulo, nivel,
               nota: "Cockcroft-Gault usa peso real; em obesidade, considere peso ajustado." };
    },
  },
  {
    id: "chadsvasc",
    nome: "CHA₂DS₂-VASc",
    area: "Cardiologia",
    descricao: "Risco de AVC na fibrilação atrial. Orienta a anticoagulação.",
    campos: [
      { id: "icc", rotulo: "Insuficiência cardíaca / disfunção de VE", tipo: "sim" },
      { id: "has", rotulo: "Hipertensão arterial", tipo: "sim" },
      { id: "idade75", rotulo: "Idade ≥ 75 anos", tipo: "sim", peso: 2 },
      { id: "dm", rotulo: "Diabetes mellitus", tipo: "sim" },
      { id: "avc", rotulo: "AVC, AIT ou tromboembolismo prévio", tipo: "sim", peso: 2 },
      { id: "vascular", rotulo: "Doença vascular (IAM, DAP, placa aórtica)", tipo: "sim" },
      { id: "idade65", rotulo: "Idade entre 65 e 74 anos", tipo: "sim" },
      { id: "feminino", rotulo: "Sexo feminino", tipo: "sim" },
    ],
    calcular: (v, total) => {
      const nivel = total >= 2 ? "alerta" : total === 1 ? "atencao" : "ok";
      const rotulo = total === 0 ? "Risco baixo" : total === 1 ? "Risco intermediário" : "Risco alto";
      return { valor: total, unidade: "pontos", rotulo, nivel,
               nota: "Idade ≥75 e AVC prévio valem 2 pontos cada. Interprete junto com o risco de sangramento." };
    },
  },
  {
    id: "hasbled",
    nome: "HAS-BLED",
    area: "Cardiologia",
    descricao: "Risco de sangramento em quem usa anticoagulante.",
    campos: [
      { id: "has", rotulo: "Hipertensão não controlada (PAS > 160)", tipo: "sim" },
      { id: "renal", rotulo: "Função renal alterada", tipo: "sim" },
      { id: "hepatica", rotulo: "Função hepática alterada", tipo: "sim" },
      { id: "avc", rotulo: "AVC prévio", tipo: "sim" },
      { id: "sangramento", rotulo: "Sangramento prévio ou predisposição", tipo: "sim" },
      { id: "inr", rotulo: "INR instável", tipo: "sim" },
      { id: "idade", rotulo: "Idade > 65 anos", tipo: "sim" },
      { id: "drogas", rotulo: "Uso de AAS/AINE ou antiagregante", tipo: "sim" },
      { id: "alcool", rotulo: "Uso abusivo de álcool", tipo: "sim" },
    ],
    calcular: (v, total) => {
      const nivel = total >= 3 ? "alerta" : total === 2 ? "atencao" : "ok";
      return { valor: total, unidade: "pontos",
               rotulo: total >= 3 ? "Risco alto de sangramento" : "Risco não elevado", nivel,
               nota: "Pontuação alta não contraindica anticoagulação — indica corrigir os fatores modificáveis." };
    },
  },
  {
    id: "curb65",
    nome: "CURB-65",
    area: "Pneumologia",
    descricao: "Gravidade da pneumonia adquirida na comunidade.",
    campos: [
      { id: "confusao", rotulo: "Confusão mental", tipo: "sim" },
      { id: "ureia", rotulo: "Ureia > 50 mg/dL", tipo: "sim" },
      { id: "fr", rotulo: "Frequência respiratória ≥ 30 irpm", tipo: "sim" },
      { id: "pa", rotulo: "PAS < 90 ou PAD ≤ 60 mmHg", tipo: "sim" },
      { id: "idade", rotulo: "Idade ≥ 65 anos", tipo: "sim" },
    ],
    calcular: (v, total) => {
      const mapa = [
        ["Baixo risco — tratamento ambulatorial", "ok"],
        ["Baixo risco — tratamento ambulatorial", "ok"],
        ["Risco intermediário — considerar internação", "atencao"],
        ["Risco alto — internação", "alerta"],
        ["Risco muito alto — avaliar UTI", "alerta"],
        ["Risco muito alto — avaliar UTI", "alerta"],
      ];
      const [rotulo, nivel] = mapa[total];
      return { valor: total, unidade: "pontos", rotulo, nivel };
    },
  },
  {
    id: "qsofa",
    nome: "qSOFA",
    area: "Emergência",
    descricao: "Triagem rápida de risco em suspeita de infecção.",
    campos: [
      { id: "fr", rotulo: "Frequência respiratória ≥ 22 irpm", tipo: "sim" },
      { id: "consciencia", rotulo: "Alteração do nível de consciência (Glasgow < 15)", tipo: "sim" },
      { id: "pas", rotulo: "PAS ≤ 100 mmHg", tipo: "sim" },
    ],
    calcular: (v, total) => {
      return { valor: total, unidade: "pontos",
               rotulo: total >= 2 ? "Alto risco — investigar sepse" : "Baixo risco pelo qSOFA",
               nivel: total >= 2 ? "alerta" : "ok",
               nota: "qSOFA negativo não exclui sepse. É triagem, não diagnóstico." };
    },
  },
  {
    id: "wells_tvp",
    nome: "Wells (TVP)",
    area: "Emergência",
    descricao: "Probabilidade pré-teste de trombose venosa profunda.",
    campos: [
      { id: "cancer", rotulo: "Câncer ativo", tipo: "sim" },
      { id: "paralisia", rotulo: "Paralisia, paresia ou imobilização de membro inferior", tipo: "sim" },
      { id: "acamado", rotulo: "Acamado > 3 dias ou cirurgia maior nas últimas 12 semanas", tipo: "sim" },
      { id: "dor", rotulo: "Dor à palpação do trajeto venoso profundo", tipo: "sim" },
      { id: "edemaTodo", rotulo: "Edema de todo o membro inferior", tipo: "sim" },
      { id: "panturrilha", rotulo: "Panturrilha > 3 cm maior que a contralateral", tipo: "sim" },
      { id: "cacifo", rotulo: "Edema com cacifo no membro sintomático", tipo: "sim" },
      { id: "colaterais", rotulo: "Veias colaterais superficiais não varicosas", tipo: "sim" },
      { id: "tvpPrevia", rotulo: "TVP prévia documentada", tipo: "sim" },
      { id: "alternativo", rotulo: "Diagnóstico alternativo ao menos tão provável", tipo: "sim", peso: -2 },
    ],
    calcular: (v, total) => {
      const nivel = total >= 3 ? "alerta" : total >= 1 ? "atencao" : "ok";
      const rotulo = total >= 3 ? "Probabilidade alta" : total >= 1 ? "Probabilidade moderada" : "Probabilidade baixa";
      return { valor: total, unidade: "pontos", rotulo, nivel,
               nota: "Diagnóstico alternativo mais provável subtrai 2 pontos." };
    },
  },
  {
    id: "childpugh",
    nome: "Child-Pugh",
    area: "Gastroenterologia",
    descricao: "Gravidade da cirrose hepática.",
    campos: [
      { id: "bilirrubina", rotulo: "Bilirrubina total", tipo: "opt",
        opcoes: [[1, "< 2 mg/dL"], [2, "2 a 3 mg/dL"], [3, "> 3 mg/dL"]] },
      { id: "albumina", rotulo: "Albumina", tipo: "opt",
        opcoes: [[1, "> 3,5 g/dL"], [2, "2,8 a 3,5 g/dL"], [3, "< 2,8 g/dL"]] },
      { id: "inr", rotulo: "INR", tipo: "opt",
        opcoes: [[1, "< 1,7"], [2, "1,7 a 2,3"], [3, "> 2,3"]] },
      { id: "ascite", rotulo: "Ascite", tipo: "opt",
        opcoes: [[1, "Ausente"], [2, "Leve"], [3, "Moderada a grave"]] },
      { id: "encefalopatia", rotulo: "Encefalopatia", tipo: "opt",
        opcoes: [[1, "Ausente"], [2, "Graus I e II"], [3, "Graus III e IV"]] },
    ],
    calcular: (v, total) => {
      const classe = total <= 6 ? "A" : total <= 9 ? "B" : "C";
      const nivel = classe === "A" ? "ok" : classe === "B" ? "atencao" : "alerta";
      return { valor: total, unidade: "pontos", rotulo: `Classe ${classe}`, nivel };
    },
  },
  {
    id: "glasgow",
    nome: "Escala de coma de Glasgow",
    area: "Neurologia",
    descricao: "Nível de consciência. Vai de 3 a 15 pontos.",
    campos: [
      { id: "ocular", rotulo: "Abertura ocular", tipo: "opt",
        opcoes: [[4, "Espontânea"], [3, "Ao comando verbal"], [2, "À dor"], [1, "Ausente"]] },
      { id: "verbal", rotulo: "Resposta verbal", tipo: "opt",
        opcoes: [[5, "Orientado"], [4, "Confuso"], [3, "Palavras inapropriadas"], [2, "Sons incompreensíveis"], [1, "Ausente"]] },
      { id: "motora", rotulo: "Resposta motora", tipo: "opt",
        opcoes: [[6, "Obedece a comandos"], [5, "Localiza a dor"], [4, "Retirada à dor"], [3, "Flexão anormal"], [2, "Extensão anormal"], [1, "Ausente"]] },
    ],
    calcular: (v, total) => {
      const nivel = total <= 8 ? "alerta" : total <= 12 ? "atencao" : "ok";
      const rotulo = total <= 8 ? "Grave — considerar via aérea definitiva"
        : total <= 12 ? "Moderado" : "Leve";
      return { valor: total, unidade: "de 15", rotulo, nivel };
    },
  },
  {
    id: "cargatabagica",
    nome: "Carga tabágica",
    area: "Pneumologia",
    descricao: "Maços-ano. A partir de 20, rastreamento de câncer de pulmão entra em discussão.",
    campos: [
      { id: "cigarros", rotulo: "Cigarros por dia", tipo: "num", min: 1, max: 200 },
      { id: "anos", rotulo: "Anos de tabagismo", tipo: "num", min: 1, max: 90 },
    ],
    calcular: v => {
      const ma = (v.cigarros / 20) * v.anos;
      const nivel = ma >= 30 ? "alerta" : ma >= 20 ? "atencao" : "ok";
      return { valor: Math.round(ma * 10) / 10, unidade: "maços-ano",
               rotulo: ma >= 20 ? "Carga elevada" : "Carga baixa", nivel };
    },
  },
];

/* Soma genérica. Para caixas de "sim", usa o peso declarado no campo (padrão 1);
   para escolha única, soma o valor da opção escolhida. Assim o peso existe em um
   lugar só — o rótulo mostrado na tela e a conta nunca divergem. */
function somarEscore(esc, v) {
  return esc.campos.reduce((s, c) => {
    if (c.tipo === "sim") return s + (v[c.id] ? (c.peso ?? 1) : 0);
    if (c.tipo === "opt" && v[c.id] !== undefined && v[c.id] !== "") {
      const n = Number(v[c.id]);
      return s + (Number.isFinite(n) ? n : 0);
    }
    return s;
  }, 0);
}

/* ---------- Estado ---------- */
const CKEY = "invictus.calc";
let calcAtual = null;      // escore aberto
let calcValores = {};      // respostas do escore aberto

/* ---------- Abertura ---------- */
function abrirCalculadoras(idInicial) {
  hide(els.results); hide(els.empty); hide(els.notice); hide(els.loader); hide(els.hero);
  hide(els.studyView); hide($("#anamneseView"));
  show($("#calcView"));
  if (idInicial) abrirEscore(idInicial); else listarEscores();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function fecharCalculadoras() {
  hide($("#calcView"));
  if (currentData) show(els.results); else { show(els.hero); show(els.empty); }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------- Lista ---------- */
function listarEscores(filtro = "") {
  calcAtual = null;
  hide($("#calcDetalhe"));
  show($("#calcBusca"));

  const q = filtro.trim().toLowerCase();
  const achados = ESCORES.filter(e =>
    !q || e.nome.toLowerCase().includes(q) || e.area.toLowerCase().includes(q) ||
    e.descricao.toLowerCase().includes(q));

  const lista = $("#calcLista");
  if (!achados.length) {
    lista.innerHTML = `<p class="calc__vazio">Nenhum escore com esse nome.</p>`;
    show(lista);
    return;
  }

  // Agrupa por área, preservando a ordem em que as áreas aparecem
  const areas = [];
  for (const e of achados) if (!areas.includes(e.area)) areas.push(e.area);

  lista.innerHTML = areas.map(area => `
    <section class="calc-area">
      <h3 class="calc-area__t">${escapeHTML(area)}</h3>
      <div class="calc-grid">
        ${achados.filter(e => e.area === area).map(e => `
          <button class="calc-card" type="button" data-esc="${escapeHTML(e.id)}">
            <span class="calc-card__n">${escapeHTML(e.nome)}</span>
            <span class="calc-card__d">${escapeHTML(e.descricao)}</span>
          </button>`).join("")}
      </div>
    </section>`).join("");
  show(lista);

  $$(".calc-card", lista).forEach(b =>
    b.addEventListener("click", () => abrirEscore(b.dataset.esc)));
}

/* ---------- Um escore ---------- */
function abrirEscore(id) {
  const esc = ESCORES.find(e => e.id === id);
  if (!esc) return;
  calcAtual = esc;
  calcValores = {};

  hide($("#calcLista"));
  hide($("#calcBusca"));

  $("#calcDetalhe").innerHTML = `
    <button class="calc__voltar" id="calcVoltarLista" type="button">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Todos os escores
    </button>
    <h3 class="calc__h">${escapeHTML(esc.nome)}</h3>
    <p class="calc__desc">${escapeHTML(esc.descricao)}</p>
    <div class="calc__campos">${esc.campos.map(campoHTML).join("")}</div>
    <div class="calc-res" id="calcRes" hidden></div>
    <p class="calc__aviso">
      Resultado calculado no seu navegador, sem IA. Ainda assim,
      <b>escore não substitui julgamento clínico</b> — interprete no contexto do paciente.
    </p>`;
  show($("#calcDetalhe"));

  $("#calcVoltarLista").addEventListener("click", () => { listarEscores($("#calcFiltro").value); });
  ligarCamposEscore();
  recalcular();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function campoHTML(c) {
  const peso = c.tipo === "sim" && (c.peso ?? 1) !== 1
    ? `<span class="calc-peso">${c.peso > 0 ? "+" : ""}${c.peso}</span>` : "";

  if (c.tipo === "sim") {
    return `<button class="calc-sim" type="button" data-campo="${escapeHTML(c.id)}" aria-pressed="false">
      <span class="calc-sim__box" aria-hidden="true"></span>
      <span class="calc-sim__t">${escapeHTML(c.rotulo)}</span>${peso}
    </button>`;
  }
  if (c.tipo === "opt") {
    return `<div class="calc-campo">
      <span class="calc-campo__r">${escapeHTML(c.rotulo)}</span>
      <div class="calc-opts" role="group" aria-label="${escapeHTML(c.rotulo)}">
        ${c.opcoes.map(([val, txt]) => `
          <button class="calc-opt" type="button" data-campo="${escapeHTML(c.id)}"
                  data-valor="${escapeHTML(String(val))}" aria-pressed="false">
            ${escapeHTML(txt)}<span class="calc-peso">${escapeHTML(String(val))}</span>
          </button>`).join("")}
      </div></div>`;
  }
  return `<div class="calc-campo calc-campo--num">
    <label class="calc-campo__r" for="calc-${escapeHTML(c.id)}">${escapeHTML(c.rotulo)}</label>
    <div class="calc-num">
      <input id="calc-${escapeHTML(c.id)}" type="number" inputmode="decimal"
             data-campo="${escapeHTML(c.id)}"
             min="${c.min ?? 0}" max="${c.max ?? 9999}" step="${c.passo || "1"}" />
      ${c.sufixo ? `<span class="calc-num__s">${escapeHTML(c.sufixo)}</span>` : ""}
    </div></div>`;
}

function ligarCamposEscore() {
  const d = $("#calcDetalhe");

  $$(".calc-sim", d).forEach(b => b.addEventListener("click", () => {
    const ligado = !(calcValores[b.dataset.campo] === true);
    calcValores[b.dataset.campo] = ligado;
    b.classList.toggle("is-on", ligado);
    b.setAttribute("aria-pressed", String(ligado));
    recalcular();
  }));

  $$(".calc-opt", d).forEach(b => b.addEventListener("click", () => {
    const campo = b.dataset.campo;
    calcValores[campo] = b.dataset.valor;
    $$(`.calc-opt[data-campo="${campo}"]`, d).forEach(o => {
      const on = o === b;
      o.classList.toggle("is-on", on);
      o.setAttribute("aria-pressed", String(on));
    });
    recalcular();
  }));

  $$(".calc-num input", d).forEach(el => el.addEventListener("input", () => {
    const n = parseFloat(el.value);
    if (Number.isFinite(n)) calcValores[el.dataset.campo] = n;
    else delete calcValores[el.dataset.campo];
    recalcular();
  }));
}

/* Só calcula quando dá: um escore numérico com campo em branco produziria
   NaN ou uma divisão por zero mostrada como resultado. */
function podeCalcular(esc) {
  return esc.campos.every(c => {
    if (c.tipo === "num") {
      const v = calcValores[c.id];
      return Number.isFinite(v) && v > 0;
    }
    if (c.tipo === "opt") return calcValores[c.id] !== undefined && calcValores[c.id] !== "";
    return true;   // caixas de "sim" em branco valem como "não"
  });
}

function recalcular() {
  const esc = calcAtual;
  const out = $("#calcRes");
  if (!esc || !out) return;

  if (!podeCalcular(esc)) {
    const faltam = esc.campos.filter(c => c.tipo !== "sim" &&
      (calcValores[c.id] === undefined || calcValores[c.id] === "")).length;
    out.innerHTML = `<p class="calc-res__espera">Preencha ${faltam === 1 ? "o campo que falta" : `os ${faltam} campos`} para ver o resultado.</p>`;
    show(out);
    return;
  }

  let r;
  try { r = esc.calcular(calcValores, somarEscore(esc, calcValores)); }
  catch { out.innerHTML = `<p class="calc-res__espera">Não consegui calcular com esses valores.</p>`; show(out); return; }

  out.className = `calc-res nivel-${r.nivel || "ok"}`;
  out.innerHTML = `
    <div class="calc-res__linha">
      <span class="calc-res__v">${escapeHTML(String(r.valor))}</span>
      ${r.unidade ? `<span class="calc-res__u">${escapeHTML(r.unidade)}</span>` : ""}
    </div>
    <p class="calc-res__r">${escapeHTML(r.rotulo || "")}</p>
    ${r.nota ? `<p class="calc-res__n">${escapeHTML(r.nota)}</p>` : ""}
    <button class="calc-res__copiar" id="calcCopiar" type="button">Copiar resultado</button>`;
  show(out);

  $("#calcCopiar").addEventListener("click", async () => {
    const texto = `${esc.nome}: ${r.valor}${r.unidade ? " " + r.unidade : ""} — ${r.rotulo || ""}`.trim();
    toast(await copyToClipboard(texto) ? "Resultado copiado." : "Não foi possível copiar.");
  });
}

function ligarEventosCalc() {
  $("#btnCalc")?.addEventListener("click", () => abrirCalculadoras());
  $("#btnCalcHero")?.addEventListener("click", () => abrirCalculadoras());
  $("#calcVoltarInicio")?.addEventListener("click", fecharCalculadoras);
  $("#calcFiltro")?.addEventListener("input", e => {
    if (calcAtual) return;
    listarEscores(e.target.value);
  });
}

/* =================================================================
   19) INICIALIZAÇÃO
   ================================================================= */
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initVoice();
  bindGlobalEvents();
  ligarEventosAnamnese();
  ligarEventosReporte();
  ligarEventosCalc();
});
