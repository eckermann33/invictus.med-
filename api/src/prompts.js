/* =================================================================
   Prompts — as quantidades aqui precisam bater com o que o site espera
   ================================================================= */

/* Marca curta e aleatória: muda o corpo enviado ao provedor, o que evita
   que "Gerar outro caso" caia numa resposta em cache e volte idêntica. */
export function variacao() {
  return Math.random().toString(36).slice(2, 8);
}

const REGRA_JSON =
  "Responda EXCLUSIVAMENTE com um objeto JSON válido, sem texto antes ou depois, " +
  "sem markdown e sem crases. Tudo em português do Brasil. Cada campo é TEXTO " +
  "simples (string) — nunca objeto ou lista aninhada.";

export function promptQuiz(termo) {
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

export function promptFlash(termo) {
  return `Crie 8 FLASHCARDS de estudo para estudantes de medicina sobre: "${termo}".
${REGRA_JSON}
Formato: { "cards": [ { "frente": "pergunta ou conceito curto", "verso": "resposta objetiva" } ] }
Regras: EXATAMENTE 8 cards; "verso" com 1 a 3 frases; cobertura variada do tema.`;
}

export function promptResumo(termo) {
  return `Crie um RESUMO DE ESTUDO estruturado para estudantes de medicina sobre: "${termo}".
${REGRA_JSON}
Formato: { "titulo": "", "topicos": [ { "titulo": "", "conteudo": "" } ] }
Regras: entre 4 e 7 tópicos, cobrindo os pontos mais importantes; "conteudo" objetivo e didático.`;
}

export function promptMapa(termo) {
  return `Crie um MAPA MENTAL para estudantes de medicina sobre: "${termo}".
${REGRA_JSON}
Formato: { "central": "", "ramos": [ { "titulo": "", "subitens": ["", ""] } ] }
Regras: entre 4 e 6 ramos (ex.: Definição, Etiologia, Sintomas, Diagnóstico, Tratamento, Complicações),
cada um com 2 a 5 subitens curtos.`;
}

export function promptCaso(termo) {
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

export function promptAbnt(termo, refs) {
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

export function promptFicha(termo) {
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
