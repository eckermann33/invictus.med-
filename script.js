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
   Por padrão, o sistema vem pronto para o GOOGLE GEMINI (tier
   gratuito). Para ativar, basta criar uma chave em
   https://aistudio.google.com (sem cartão de crédito) e colá-la
   abaixo em const API_KEY.

   Provedores suportados (troque CONFIG.PROVIDER se quiser):
     • "gemini"    → Google Gemini  (GRÁTIS, padrão recomendado)
     • "openai"    → OpenAI / GPT    (pago)
     • "anthropic" → Anthropic Claude (pago)

   ⚠️ Privacidade: o tier gratuito do Gemini pode usar os prompts
   para treinar modelos. Este site só envia o NOME da doença, então
   não há problema — mas nunca digite dados de pacientes na busca.
   ================================================================= */
const API_KEY = "AQ.Ab8RN6JmhhNhicn1_byevLpQbnNZljC5DmgiXuOspVesxQ6Xqg";   // ← cole aqui sua chave do Google AI Studio

const CONFIG = {
  API_KEY: API_KEY,
  PROVIDER: "gemini",                    // "gemini" (grátis) | "openai" | "anthropic"
  MODEL: "gemini-2.5-flash",             // modelo gratuito do Gemini
  MAX_TOKENS: 4096,
  // Endpoints
  GEMINI_URL: "https://generativelanguage.googleapis.com/v1beta/models",
  ANTHROPIC_URL: "https://api.anthropic.com/v1/messages",
  ANTHROPIC_VERSION: "2023-06-01",
  OPENAI_URL: "https://api.openai.com/v1/chat/completions",
};

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

REGRAS IMPORTANTES:
- Se o termo for AMPLO (ex.: "Hepatite", "Diabetes", "Anemia"), preencha "variacoes" com os principais tipos/subtipos. Caso contrário, deixe "variacoes" como [].
- Listas sem dados pertinentes devem ficar vazias ([]). Não invente códigos CID.
- Seja preciso, conciso e clinicamente correto. Use apenas o JSON.`;
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
  notice:     $("#notice"),
  results:    $("#results"),
  content:    $("#content"),
  tocNav:     $("#tocNav"),
  empty:      $("#empty"),
  hero:       $("#hero"),
  toast:      $("#toast"),
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
];

function renderSuggestions(query) {
  const q = query.trim().toLowerCase();
  if (q.length < 1) { hideSuggestions(); return; }

  const matches = DICIONARIO
    .filter(d => d.toLowerCase().includes(q))
    .slice(0, 8);

  if (!matches.length) { hideSuggestions(); return; }

  els.suggestions.innerHTML = matches.map((m, i) => {
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
    const html = escapeHTML(m).replace(re, "<mark>$1</mark>");
    return `<li role="option" data-val="${escapeHTML(m)}" aria-selected="false">
      <span class="s-ico"><svg viewBox="0 0 24 24" width="16" height="16"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-3-3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
      <span>${html}</span>
    </li>`;
  }).join("");

  suggIndex = -1;
  els.suggestions.hidden = false;
  els.input.setAttribute("aria-expanded", "true");
}

function hideSuggestions() {
  els.suggestions.hidden = true;
  els.input.setAttribute("aria-expanded", "false");
  suggIndex = -1;
}

/* =================================================================
   6) CHAMADA À IA
   ================================================================= */
async function fetchAnalysis(termo) {
  // Sem chave configurada → tenta demonstração offline
  if (!CONFIG.API_KEY || CONFIG.API_KEY === "INSERIR_CHAVE_AQUI") {
    const demo = getDemo(termo);
    if (demo) return demo;
    throw new Error("NO_KEY");
  }

  const prompt = buildPrompt(termo);
  let raw;

  if (CONFIG.PROVIDER === "gemini") {
    // Endpoint nativo do Gemini — funciona direto do navegador (CORS ok).
    // responseMimeType: "application/json" força a resposta a vir só em JSON.
    const url = `${CONFIG.GEMINI_URL}/${CONFIG.MODEL}:generateContent?key=${encodeURIComponent(CONFIG.API_KEY)}`;
    const res = await fetch(url, {
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
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    raw = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
  } else if (CONFIG.PROVIDER === "anthropic") {
    const res = await fetch(CONFIG.ANTHROPIC_URL, {
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
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    raw = (data.content || []).map(b => b.text || "").join("");
  } else {
    // OpenAI-compatível
    const res = await fetch(CONFIG.OPENAI_URL, {
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
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    raw = data?.choices?.[0]?.message?.content || "";
  }

  return parseJSON(raw);
}

/* Extrai e valida o JSON da resposta (tolerante a crases/texto extra) */
function parseJSON(text) {
  let t = String(text).trim().replace(/```json|```/gi, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end !== -1) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

/* =================================================================
   7) FLUXO DE BUSCA
   ================================================================= */
async function analyze(termRaw) {
  const term = (termRaw ?? els.input.value).trim();
  if (!term) { els.input.focus(); return; }

  hideSuggestions();
  hide(els.notice);
  hide(els.results);
  hide(els.empty);
  hide(els.hero);
  show(els.loader);
  els.loaderText.textContent = `Analisando “${term}”…`;
  window.scrollTo({ top: 0, behavior: "smooth" });

  try {
    const data = await fetchAnalysis(term);
    currentData = data;
    renderResult(data);
    addToHistory(data.nome || term);
    hide(els.loader);
    show(els.results);
  } catch (err) {
    hide(els.loader);
    showError(err);
    show(els.hero);
  }
}

function showError(err) {
  let msg;
  if (err.message === "NO_KEY") {
    msg = `<b>Configure a chave da IA.</b> Crie uma chave gratuita em
      <code>aistudio.google.com</code>, abra o arquivo <code>script.js</code> e substitua
      <code>INSERIR_CHAVE_AQUI</code> pela sua chave em <code>const API_KEY</code>.
      Sem chave, apenas os exemplos de demonstração (ex.: <code>Hipertensão</code>, <code>Diabetes</code>) funcionam.`;
  } else if (err instanceof SyntaxError) {
    msg = `<b>Não foi possível interpretar a resposta da IA.</b> Tente novamente ou refine o termo da busca.`;
  } else {
    msg = `<b>Falha na consulta (${escapeHTML(err.message)}).</b> Verifique sua chave, o modelo configurado e a conexão. Em caso de erro de CORS, use um backend intermediário.`;
  }
  els.notice.innerHTML = msg;
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
    <ol class="refs">${d.referencias.map(r => `<li>${escapeHTML(r)}</li>`).join("")}</ol>` });

  return S;
}

function renderResult(d) {
  const isFav = isFavorite(d.nome);

  /* Cabeçalho (identificação + ações) */
  const cidParts = [];
  if (d.cid10) cidParts.push(`<span class="cid cid--code"><span>CID-10</span><span>${escapeHTML(d.cid10)}</span></span>`);
  if (d.cid11) cidParts.push(`<span class="cid cid--code"><span>CID-11</span><span>${escapeHTML(d.cid11)}</span></span>`);
  if (d.area_medica) cidParts.push(`<span class="cid"><span>Área</span><span>${escapeHTML(d.area_medica)}</span></span>`);

  const head = `
    <section class="fiche-head" id="identificacao">
      ${d.area_medica ? `<span class="fiche-head__area">${escapeHTML(d.area_medica)}</span>` : ""}
      <h1 class="fiche-head__name">${escapeHTML(d.nome || "Resultado")}</h1>
      ${d.sinonimos && d.sinonimos.length ? `<p class="fiche-head__syn">Sinônimos: ${escapeHTML(d.sinonimos.join(", "))}</p>` : ""}
      <div class="cid-row">${cidParts.join("")}</div>
      <div class="toolbar">
        <button class="tool ${isFav ? "is-active" : ""}" id="tFav" type="button">
          <svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 17.3 6.2 20.5l1.1-6.5L2.6 9.4l6.5-.9L12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
          <span>${isFav ? "Favoritado" : "Favoritar"}</span></button>
        <button class="tool" id="tCopy" type="button"><svg viewBox="0 0 24 24" width="16" height="16"><rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10" fill="none" stroke="currentColor" stroke-width="2"/></svg><span>Copiar</span></button>
        <button class="tool" id="tShare" type="button"><svg viewBox="0 0 24 24" width="16" height="16"><circle cx="18" cy="5" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="6" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="19" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" stroke="currentColor" stroke-width="2"/></svg><span>Compartilhar</span></button>
        <button class="tool" id="tPdf" type="button"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 9V3h9l3 3v3M6 18v3h12v-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><rect x="4" y="9" width="16" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="2"/></svg><span>PDF</span></button>
        <button class="tool" id="tPrint" type="button"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2M6 14h12v7H6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg><span>Imprimir</span></button>
      </div>
    </section>`;

  const sections = buildSections(d);
  const cards = sections.map(s =>
    `<section class="card" id="${s.id}">${s.html}</section>`).join("");

  els.content.innerHTML = head + cards;

  /* Índice lateral */
  const toc = [{ id: "identificacao", label: "Identificação" }, ...sections];
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
  $("#tFav").addEventListener("click", () => toggleFavorite(d));
  $("#tCopy").addEventListener("click", () => copyContent(d));
  $("#tShare").addEventListener("click", () => shareContent(d));
  $("#tPdf").addEventListener("click", () => { toast("Use “Salvar como PDF” na janela de impressão."); setTimeout(() => window.print(), 400); });
  $("#tPrint").addEventListener("click", () => window.print());
}

/* Scrollspy: destaca a seção visível no índice */
function initScrollSpy() {
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
}

/* =================================================================
   9) COPIAR / COMPARTILHAR (texto formatado)
   ================================================================= */
function dataToText(d) {
  const L = [];
  const list = a => (a && a.length) ? a.join(", ") : "—";
  L.push(`${d.nome || ""}`);
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
  try { await navigator.clipboard.writeText(dataToText(d)); toast("Conteúdo copiado."); }
  catch { toast("Não foi possível copiar."); }
}

async function shareContent(d) {
  const text = dataToText(d);
  if (navigator.share) {
    try { await navigator.share({ title: `Invictus.Med — ${d.nome}`, text }); } catch {}
  } else {
    try { await navigator.clipboard.writeText(text); toast("Copiado para compartilhar."); }
    catch { toast("Compartilhamento indisponível."); }
  }
}

/* =================================================================
   10) HISTÓRICO & FAVORITOS (localStorage)
   ================================================================= */
const HKEY = "invictus.history";
const FKEY = "invictus.favorites";

function addToHistory(nome) {
  if (!nome) return;
  let h = store.get(HKEY, []);
  h = h.filter(x => x.nome.toLowerCase() !== nome.toLowerCase());
  h.unshift({ nome, ts: Date.now() });
  store.set(HKEY, h.slice(0, 40));
}

function isFavorite(nome) {
  if (!nome) return false;
  return store.get(FKEY, []).some(x => x.nome.toLowerCase() === nome.toLowerCase());
}

function toggleFavorite(d) {
  const nome = d.nome;
  if (!nome) return;
  let f = store.get(FKEY, []);
  const exists = f.some(x => x.nome.toLowerCase() === nome.toLowerCase());
  if (exists) {
    f = f.filter(x => x.nome.toLowerCase() !== nome.toLowerCase());
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
    btn.querySelector("span").textContent = nowFav ? "Favoritado" : "Favoritar";
  }
}

/* Painel lateral */
function openDrawer(kind) {
  const isFavMode = kind === "favorites";
  els.drawerTitle.textContent = isFavMode ? "Favoritos" : "Histórico";
  const data = store.get(isFavMode ? FKEY : HKEY, []);

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
      store.set(key, store.get(key, []).filter(x => x.nome !== name));
      openDrawer(kind);
    });
  });
  const clearBtn = $("#drawerClear");
  if (clearBtn) clearBtn.addEventListener("click", () => {
    store.set(isFavMode ? FKEY : HKEY, []); openDrawer(kind);
  });

  show(els.drawerScrim);
  show(els.drawer);
  requestAnimationFrame(() => els.drawer.classList.add("is-open"));
  els.drawer.setAttribute("aria-hidden", "false");
}

function closeDrawer() {
  els.drawer.classList.remove("is-open");
  els.drawer.setAttribute("aria-hidden", "true");
  setTimeout(() => { hide(els.drawer); hide(els.drawerScrim); }, 320);
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `${Math.floor(s / 60)}min`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/* =================================================================
   11) BUSCA POR VOZ (Web Speech API)
   ================================================================= */
function initVoice() {
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
function initTheme() {
  const saved = store.get("invictus.theme", null);
  const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  const theme = saved || (prefersLight ? "light" : "dark");
  document.documentElement.setAttribute("data-theme", theme);

  $("#btnTheme").addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    store.set("invictus.theme", next);
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

  // Painéis laterais
  $("#btnHistory").addEventListener("click", () => openDrawer("history"));
  $("#btnFavorites").addEventListener("click", () => openDrawer("favorites"));
  $("#drawerClose").addEventListener("click", closeDrawer);
  els.drawerScrim.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeDrawer(); });
}

function updateSuggHighlight(items) {
  items.forEach((li, i) => li.setAttribute("aria-selected", i === suggIndex ? "true" : "false"));
  if (items[suggIndex]) items[suggIndex].scrollIntoView({ block: "nearest" });
}

/* =================================================================
   15) INICIALIZAÇÃO
   ================================================================= */
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initVoice();
  bindGlobalEvents();
});
