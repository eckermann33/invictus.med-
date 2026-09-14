/* =================================================================
   Invictus.Med — demo.js
   Fichas de demonstração: o que o site mostra quando o Worker ainda
   não foi configurado (um fork recém-clonado, por exemplo).
   -----------------------------------------------------------------
   Vive num arquivo separado de propósito. No site publicado o Worker
   está configurado e estas fichas nunca são usadas — não faz sentido
   baixar e interpretar 6 KB de texto em toda visita. O script.js
   carrega este arquivo só quando realmente precisa dele.
   ================================================================= */
window.DEMO_INVICTUS = {
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
