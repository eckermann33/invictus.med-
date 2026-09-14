/* As contas dos escores, verificadas com valores conhecidos.
   -----------------------------------------------------------------
   ESCORES e somarEscore são extraídos do script.js que realmente é
   publicado, nunca copiados: uma cópia continuaria passando depois de o
   original mudar, que é o pior jeito possível de um teste falhar.

   Numa calculadora clínica, errar a conta em silêncio é o pior defeito. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fonte = fs.readFileSync(path.join(raiz, "script.js"), "utf8");

function recorte(inicio, fim) {
  const i = fonte.indexOf(inicio);
  if (i === -1) throw new Error(`não achei "${inicio}" no script.js`);
  const j = fonte.indexOf(fim, i);
  if (j === -1) throw new Error(`não achei o fim de "${inicio}"`);
  return fonte.slice(i, j + fim.length);
}

function extrairFuncao(nome) {
  const i = fonte.indexOf(`function ${nome}(`);
  if (i === -1) throw new Error(`função ${nome} não encontrada`);
  let nivel = 0, comecou = false;
  for (let k = i; k < fonte.length; k++) {
    if (fonte[k] === "{") { nivel++; comecou = true; }
    else if (fonte[k] === "}") { nivel--; if (comecou && nivel === 0) return fonte.slice(i, k + 1); }
  }
  throw new Error(`função ${nome} sem fim`);
}

const { ESCORES, somarEscore } = new Function(
  recorte("const numeroPt =", ";") + "\n" +
  recorte("const FREQUENCIA = [", "\n];") + "\n" +
  recorte("const itemFrequencia =", ";") + "\n" +
  recorte("const ESCORES = [", "\n];") + "\n" +
  extrairFuncao("somarEscore") + "\n" +
  "return { ESCORES, somarEscore };")();

const res = [];
const check = (nome, ok, extra = "") => res.push({ nome, ok, extra });
const perto = (a, b, tol = 0.05) => Math.abs(Number(a) - Number(b)) <= tol;

const achar = id => {
  const e = ESCORES.find(x => x.id === id);
  if (!e) throw new Error(`escore "${id}" não existe`);
  return e;
};

/* Calcula como a tela calcula: soma genérica + a função do escore. */
function rodar(id, valores) {
  const esc = achar(id);
  return esc.calcular(valores, somarEscore(esc, valores));
}

/* Marca todas as caixas "sim" listadas e deixa o resto desmarcado. */
const simOnly = (...ids) => Object.fromEntries(ids.map(i => [i, true]));

/* ================= Geral ================= */
{
  const r = rodar("imc", { peso: 70, altura: 1.75 });
  check("IMC: 70 kg e 1,75 m dão 22,9", r.valor === "22.9", r.valor);
  check("IMC: 22,9 é eutrofia", r.rotulo === "Eutrofia", r.rotulo);
  check("IMC: 120 kg e 1,70 m é obesidade grau III",
    rodar("imc", { peso: 120, altura: 1.70 }).rotulo === "Obesidade grau III");

  check("Superfície: 70 kg e 170 cm dão 1,82 m²",
    rodar("superficie", { peso: 70, altura: 170 }).valor === "1.82",
    rodar("superficie", { peso: 70, altura: 170 }).valor);

  // Devine para 175 cm masculino: 50 + 2,3 × (68,90 − 60) = 70,5 kg
  const pi = rodar("pesoideal", { altura: 175, peso: 70, sexo: "m" });
  check("Peso ideal: homem de 175 cm dá 70,5 kg", perto(pi.valor, 70.5, 0.1), pi.valor);
  const pif = rodar("pesoideal", { altura: 160, peso: 60, sexo: "f" });
  check("Peso ideal: mulher de 160 cm dá 52,4 kg", perto(pif.valor, 52.4, 0.1), pif.valor);
  // Ajustado = ideal + 0,4 × (atual − ideal); 70,5 + 0,4 × (120 − 70,5) = 90,3
  const pia = rodar("pesoideal", { altura: 175, peso: 120, sexo: "m" });
  check("Peso ajustado aparece acima de 130% do ideal", /90,3|90\.3/.test(pia.rotulo), pia.rotulo);
}

/* ================= Nefrologia e metabolismo ================= */
{
  // Cockcroft: ((140−60) × 70) / (72 × 1,0) = 77,8
  const cg = rodar("cockcroft", { idade: 60, peso: 70, creatinina: 1.0, sexo: "m" });
  check("Cockcroft: 60 anos, 70 kg, Cr 1,0 dão 77,8", perto(cg.valor, 77.8, 0.1), cg.valor);
  check("Cockcroft: mulher multiplica por 0,85",
    perto(rodar("cockcroft", { idade: 60, peso: 70, creatinina: 1.0, sexo: "f" }).valor, 66.1, 0.1));

  // Homem 60 anos, Cr 1,0. Conferido termo a termo contra a equação de 2021:
  // 142 × 1 × (1/0,9)^-1,2 × 0,9938^60 = 142 × 0,88123 × 0,68856 = 86,2.
  // A equação de 2009, com fator de raça, dava perto de 90 no mesmo caso — é
  // por isso que o número parece baixo para quem decorou a versão antiga.
  const ck = rodar("ckdepi", { idade: 60, creatinina: 1.0, sexo: "m" });
  check("CKD-EPI: homem 60 anos, Cr 1,0 dá 86,2", perto(ck.valor, 86.2, 0.1), ck.valor);
  const ckf = rodar("ckdepi", { idade: 60, creatinina: 1.0, sexo: "f" });
  check("CKD-EPI: mulher com mesma creatinina filtra menos que o homem",
    Number(ckf.valor) < Number(ck.valor), `${ckf.valor} < ${ck.valor}`);
  check("CKD-EPI: Cr 3,0 cai para faixa G4 ou pior",
    /G4|G5/.test(rodar("ckdepi", { idade: 60, creatinina: 3.0, sexo: "m" }).rotulo),
    rodar("ckdepi", { idade: 60, creatinina: 3.0, sexo: "m" }).rotulo);

  // AG = 140 − (100 + 24) = 16; corrigido por albumina 4,0 continua 16
  const ag = rodar("aniongap", { na: 140, cl: 100, hco3: 24, albumina: 4 });
  check("Ânion gap: 140/100/24 com albumina normal dá 16", perto(ag.valor, 16), ag.valor);
  check("Ânion gap: 16 é elevado", /Elevado/.test(ag.rotulo), ag.rotulo);
  // Albumina 2,0 acrescenta 2,5 × 2 = 5 → de 10 para 15
  const agB = rodar("aniongap", { na: 140, cl: 106, hco3: 24, albumina: 2 });
  check("Ânion gap: hipoalbuminemia esconde 5 pontos", perto(agB.valor, 15), agB.valor);
  check("Ânion gap: a nota mostra o valor sem correção", /10,0|10\.0/.test(agB.nota), agB.nota);

  // Na corrigido = 130 + 1,6 × (600−100)/100 = 138
  const nac = rodar("sodiocorrigido", { na: 130, glicemia: 600 });
  check("Sódio corrigido: 130 com glicemia 600 dá 138", perto(nac.valor, 138), nac.valor);
  check("Sódio corrigido: 138 já é normal", /normal/i.test(nac.rotulo), nac.rotulo);

  // Ca corrigido = 8,0 + 0,8 × (4 − 2) = 9,6
  const cac = rodar("calciocorrigido", { calcio: 8.0, albumina: 2.0 });
  check("Cálcio corrigido: 8,0 com albumina 2,0 dá 9,6", perto(cac.valor, 9.6), cac.valor);
  check("Cálcio corrigido: 9,6 é normal", /normal/i.test(cac.rotulo), cac.rotulo);
}

/* ================= Endocrinologia ================= */
{
  // HOMA = (90 × 10) / 405 = 2,22
  const h = rodar("homair", { glicemia: 90, insulina: 10 });
  check("HOMA-IR: glicemia 90 e insulina 10 dão 2,22", perto(h.valor, 2.22, 0.01), h.valor);
  check("HOMA-IR: 2,22 fica abaixo do corte", /Sem sinal/.test(h.rotulo), h.rotulo);
  check("HOMA-IR: insulina 20 passa do corte",
    /provável/.test(rodar("homair", { glicemia: 100, insulina: 20 }).rotulo));

  // eAG = 28,7 × 7 − 46,7 = 154,2
  const a1c = rodar("hba1c", { a1c: 7 });
  check("HbA1c 7% dá média de 154 mg/dL", Number(a1c.valor) === 154, String(a1c.valor));
  check("HbA1c 7% cai na faixa de diabetes", /diabetes/i.test(a1c.rotulo), a1c.rotulo);
  check("HbA1c 5,9% é pré-diabetes", /pré-diabetes/i.test(rodar("hba1c", { a1c: 5.9 }).rotulo));
  check("HbA1c 5,2% é normal", /normal/i.test(rodar("hba1c", { a1c: 5.2 }).rotulo));
}

/* ================= Cardiologia ================= */
{
  // CHA2DS2-VASc: ICC + HAS + idade≥75(2) = 4
  check("CHA₂DS₂-VASc: soma os pesos declarados",
    rodar("chadsvasc", simOnly("icc", "has", "idade75")).valor === 4,
    String(rodar("chadsvasc", simOnly("icc", "has", "idade75")).valor));

  // HEART: 2+2+2+2+2 = 10
  const heart = rodar("heart", { historia: "2", ecg: "2", idade: "2", fatores: "2", troponina: "2" });
  check("HEART: tudo no máximo dá 10", heart.valor === 10, String(heart.valor));
  check("HEART: 10 é risco alto", /alto/i.test(heart.rotulo), heart.rotulo);
  const heartB = rodar("heart", { historia: "0", ecg: "0", idade: "1", fatores: "1", troponina: "0" });
  check("HEART: 2 é risco baixo", heartB.valor === 2 && /baixo/i.test(heartB.rotulo), heartB.rotulo);
  const heartM = rodar("heart", { historia: "1", ecg: "1", idade: "1", fatores: "1", troponina: "0" });
  check("HEART: 4 já é risco moderado", heartM.valor === 4 && /moderado/i.test(heartM.rotulo));

  // TIMI: cada item vale 1
  const timi = rodar("timi", simOnly("idade65", "fatores3", "dacConhecida"));
  check("TIMI: três itens dão 3", timi.valor === 3, String(timi.valor));
  check("TIMI: 3 pontos mostram 13,2% de risco", /13,2%/.test(timi.rotulo), timi.rotulo);
  const timi0 = rodar("timi", {});
  check("TIMI: zero item mostra 4,7%", /4,7%/.test(timi0.rotulo), timi0.rotulo);
  const timi7 = rodar("timi", simOnly("idade65", "fatores3", "dacConhecida", "aas",
    "anginaGrave", "desvioST", "marcadores"));
  check("TIMI: sete itens mostram 40,9%", timi7.valor === 7 && /40,9%/.test(timi7.rotulo), timi7.rotulo);
}

/* ================= Emergência ================= */
{
  // Wells TEP: sinais de TVP (3) + TEP provável (3) = 6 → moderada
  const w6 = rodar("wells_tep", simOnly("sinaisTVP", "tepProvavel"));
  check("Wells TEP: 3 + 3 dão 6", w6.valor === "6", w6.valor);
  check("Wells TEP: 6 é probabilidade moderada", /moderada/.test(w6.rotulo), w6.rotulo);
  // 3 + 1,5 = 4,5 — o decimal precisa sobreviver à soma e à vírgula
  const w45 = rodar("wells_tep", simOnly("sinaisTVP", "fc100"));
  check("Wells TEP: pesos decimais somam certo", w45.valor === "4,5", w45.valor);
  check("Wells TEP: 4,5 é 'TEP provável' na versão de duas faixas",
    /provável/.test(w45.nota) && !/improvável/.test(w45.nota), w45.nota);
  const w0 = rodar("wells_tep", {});
  check("Wells TEP: zero é probabilidade baixa", /baixa/.test(w0.rotulo), w0.rotulo);
  const w75 = rodar("wells_tep", simOnly("sinaisTVP", "tepProvavel", "fc100"));
  check("Wells TEP: 7,5 é probabilidade alta", w75.valor === "7,5" && /alta/.test(w75.rotulo), w75.valor);

  // Wells TVP: diagnóstico alternativo subtrai 2
  const wt = rodar("wells_tvp", simOnly("cancer", "dor", "alternativo"));
  check("Wells TVP: o peso negativo desconta", wt.valor === 0, String(wt.valor));

  // PERC: só é negativo com zero critério
  const perc0 = rodar("perc", {});
  check("PERC: nenhum critério descarta TEP", /negativo/.test(perc0.rotulo), perc0.rotulo);
  check("PERC: negativo só vale em baixo risco", /baixa/.test(perc0.nota), perc0.nota);
  const perc1 = rodar("perc", simOnly("idade50"));
  check("PERC: um critério já invalida", /positivo/.test(perc1.rotulo), perc1.rotulo);

  // Alvarado: dor FID e leucocitose valem 2
  const alv = rodar("alvarado", simOnly("migracao", "anorexia", "nausea", "dorFID",
    "descompressao", "febre", "leucocitose", "desvio"));
  check("Alvarado: todos os itens dão 10", alv.valor === 10, String(alv.valor));
  check("Alvarado: 10 é muito provável", /muito provável/.test(alv.rotulo), alv.rotulo);
  const alv5 = rodar("alvarado", simOnly("dorFID", "leucocitose", "febre"));
  check("Alvarado: 5 é possível", alv5.valor === 5 && /possível/.test(alv5.rotulo), alv5.rotulo);
  check("Alvarado: 2 é pouco provável",
    /pouco provável/.test(rodar("alvarado", simOnly("anorexia", "nausea")).rotulo));

  // qSOFA e CURB-65 continuam como estavam
  check("qSOFA: 2 pontos são alto risco",
    /Alto risco/.test(rodar("qsofa", simOnly("fr", "pas")).rotulo));
  check("qSOFA: 1 ponto é baixo risco",
    /Baixo risco/.test(rodar("qsofa", simOnly("fr")).rotulo));
}

/* ================= Infectologia ================= */
{
  // Centor: 4 critérios + idade 3-14 (+1) = 5
  const c5 = rodar("centor", { ...simOnly("febre", "semTosse", "adenopatia", "exsudato"), idade: "1" });
  check("Centor: quatro critérios mais criança dão 5", c5.valor === 5, String(c5.valor));
  check("Centor: 5 é alta probabilidade", /Alta/.test(c5.rotulo), c5.rotulo);
  // Idade ≥45 subtrai 1: 2 critérios − 1 = 1
  const c1 = rodar("centor", { ...simOnly("febre", "semTosse"), idade: "-1" });
  check("Centor: idade ≥ 45 anos desconta um ponto", c1.valor === 1, String(c1.valor));
  check("Centor: 1 ponto não justifica antibiótico", /Baixa/.test(c1.rotulo), c1.rotulo);
}

/* ================= Neurologia ================= */
{
  // ABCD²: idade(1) + PA(1) + fraqueza(2) + ≥60min(2) + DM(1) = 7
  const a7 = rodar("abcd2", { ...simOnly("idade", "pa", "dm"), clinica: "2", duracao: "2" });
  check("ABCD²: tudo presente dá 7", a7.valor === 7, String(a7.valor));
  check("ABCD²: 7 é risco alto com 8,1%", /alto/i.test(a7.rotulo) && /8,1%/.test(a7.nota), a7.nota);
  const a3 = rodar("abcd2", { ...simOnly("idade"), clinica: "1", duracao: "1" });
  check("ABCD²: 3 é risco baixo", a3.valor === 3 && /baixo/i.test(a3.rotulo), a3.rotulo);
  check("ABCD²: escore baixo ainda manda investigar", /não dispensa/.test(a3.nota), a3.nota);

  check("Glasgow: 4+5+6 dão 15",
    rodar("glasgow", { ocular: "4", verbal: "5", motora: "6" }).valor === 15);
  check("Glasgow: 8 ou menos é grave",
    /Grave/.test(rodar("glasgow", { ocular: "2", verbal: "2", motora: "4" }).rotulo));
}

/* ================= Pediatria ================= */
{
  const ap10 = rodar("apgar", { fc: "2", respiracao: "2", tonus: "2", reflexo: "2", cor: "2" });
  check("Apgar: tudo no máximo dá 10", ap10.valor === 10, String(ap10.valor));
  check("Apgar: 10 é boa vitalidade", /Boa vitalidade/.test(ap10.rotulo), ap10.rotulo);
  const ap3 = rodar("apgar", { fc: "1", respiracao: "1", tonus: "1", reflexo: "0", cor: "0" });
  check("Apgar: 3 é anóxia grave", ap3.valor === 3 && /grave/.test(ap3.rotulo), ap3.rotulo);
  const ap5 = rodar("apgar", { fc: "2", respiracao: "1", tonus: "1", reflexo: "1", cor: "0" });
  check("Apgar: 5 é anóxia moderada", ap5.valor === 5 && /moderada/.test(ap5.rotulo), ap5.rotulo);
}

/* ================= Ginecologia e obstetrícia ================= */
{
  const diasAtras = n => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const g = rodar("gestacional", { dum: diasAtras(70) });   // 10 semanas exatas
  check("Idade gestacional: 70 dias dão 10s 0d", g.valor === "10s 0d", g.valor);
  const g2 = rodar("gestacional", { dum: diasAtras(263) }); // 37s 4d
  check("Idade gestacional: 263 dias dão 37s 4d", g2.valor === "37s 4d", g2.valor);
  check("Idade gestacional: 37 semanas já é termo", /Termo/.test(g2.rotulo), g2.rotulo);
  check("Idade gestacional: mostra a DPP", /DPP \d{2}\/\d{2}\/\d{4}/.test(g2.rotulo), g2.rotulo);

  // A DPP tem que cair 280 dias depois da DUM, não 279 nem 281.
  const dum = new Date(); dum.setDate(dum.getDate() - 100);
  const iso = dum.toISOString().slice(0, 10);
  const esperada = new Date(Date.parse(iso + "T00:00:00Z") + 280 * 86400000)
    .toLocaleDateString("pt-BR", { timeZone: "UTC" });
  check("Idade gestacional: DPP é DUM + 280 dias",
    rodar("gestacional", { dum: iso }).rotulo.includes(esperada), esperada);

  check("Idade gestacional: data no futuro é recusada",
    /futuro/.test(rodar("gestacional", { dum: "2099-01-01" }).rotulo));
  check("Idade gestacional: DUM absurda pede conferência",
    /confira/i.test(rodar("gestacional", { dum: "2000-01-01" }).rotulo));
}

/* ================= Psiquiatria ================= */
{
  const todos = (esc, n) => Object.fromEntries(achar(esc).campos.map(c => [c.id, String(n)]));

  const p0 = rodar("phq9", todos("phq9", 0));
  check("PHQ-9: tudo zero dá 0", p0.valor === 0 && /mínimos/.test(p0.rotulo), p0.rotulo);
  const p27 = rodar("phq9", todos("phq9", 3));
  check("PHQ-9: tudo no máximo dá 27", p27.valor === 27, String(p27.valor));
  check("PHQ-9: 27 é depressão grave", /grave/.test(p27.rotulo), p27.rotulo);
  check("PHQ-9: 9 itens, nada a mais nem a menos", achar("phq9").campos.length === 9,
    String(achar("phq9").campos.length));

  // O item de ideação muda a conduta sozinho, mesmo com total baixo.
  const pIde = rodar("phq9", { ...todos("phq9", 0), ideacao: "1" });
  check("PHQ-9: ideação positiva com total baixo ainda marca alerta",
    pIde.valor === 1 && pIde.nivel === "alerta", `${pIde.valor} / ${pIde.nivel}`);
  check("PHQ-9: nota de ideação traz o telefone do CVV", /188/.test(pIde.nota), pIde.nota);
  // Total alto mas item 9 zerado: a nota tem que ser a do rastreio, não a de risco.
  const pSem = rodar("phq9", { ...todos("phq9", 2), ideacao: "0" });
  check("PHQ-9: sem ideação, a nota é a do rastreio",
    pSem.valor === 16 && !/188/.test(pSem.nota), `${pSem.valor} · ${pSem.nota}`);

  const g21 = rodar("gad7", todos("gad7", 3));
  check("GAD-7: tudo no máximo dá 21", g21.valor === 21 && /grave/.test(g21.rotulo), String(g21.valor));
  check("GAD-7: 7 itens", achar("gad7").campos.length === 7, String(achar("gad7").campos.length));
  const g7 = rodar("gad7", { ...todos("gad7", 1) });
  check("GAD-7: 7 pontos é ansiedade leve", g7.valor === 7 && /leve/.test(g7.rotulo), g7.rotulo);
}

/* ================= Integridade do conjunto ================= */
{
  const ids = ESCORES.map(e => e.id);
  check("ids de escore únicos", new Set(ids).size === ids.length,
    ids.filter((x, i) => ids.indexOf(x) !== i).join(","));

  const semArea = ESCORES.filter(e => !e.area || !e.nome || !e.descricao).map(e => e.id);
  check("todo escore tem nome, área e descrição", semArea.length === 0, semArea.join(","));

  const tiposValidos = new Set(["sim", "opt", "num", "data"]);
  const ruins = [];
  for (const e of ESCORES) {
    const idsCampo = e.campos.map(c => c.id);
    if (new Set(idsCampo).size !== idsCampo.length) ruins.push(`${e.id}: id de campo repetido`);
    for (const c of e.campos) {
      if (!tiposValidos.has(c.tipo)) ruins.push(`${e.id}.${c.id}: tipo "${c.tipo}"`);
      if (!c.rotulo) ruins.push(`${e.id}.${c.id}: sem rótulo`);
      if (c.tipo === "opt" && (!Array.isArray(c.opcoes) || c.opcoes.length < 2)) {
        ruins.push(`${e.id}.${c.id}: opções insuficientes`);
      }
      if (c.tipo === "num" && !(c.max > c.min)) ruins.push(`${e.id}.${c.id}: faixa inválida`);
    }
  }
  check("todo campo tem tipo, rótulo e faixa válidos", ruins.length === 0, ruins.join(" | "));

  // Toda função de cálculo tem que devolver as três chaves que a tela lê.
  const semRetorno = [];
  for (const e of ESCORES) {
    const v = {};
    for (const c of e.campos) {
      if (c.tipo === "num") v[c.id] = Math.max(c.min ?? 1, 1);
      else if (c.tipo === "opt") v[c.id] = String(c.opcoes[0][0]);
      else if (c.tipo === "data") v[c.id] = new Date(Date.now() - 100 * 86400000).toISOString().slice(0, 10);
    }
    let r;
    try { r = e.calcular(v, somarEscore(e, v)); }
    catch (err) { semRetorno.push(`${e.id}: lançou ${err.message}`); continue; }
    if (r.valor === undefined || r.valor === null || r.valor === "") semRetorno.push(`${e.id}: sem valor`);
    if (!r.rotulo) semRetorno.push(`${e.id}: sem rótulo`);
    if (!["ok", "atencao", "alerta"].includes(r.nivel)) semRetorno.push(`${e.id}: nível "${r.nivel}"`);
  }
  check("todo escore calcula e devolve valor, rótulo e nível", semRetorno.length === 0,
    semRetorno.join(" | "));

  // Nenhum resultado pode sair NaN: é o jeito silencioso de uma conta errar.
  const comNaN = [];
  for (const e of ESCORES) {
    const v = {};
    for (const c of e.campos) {
      if (c.tipo === "num") v[c.id] = ((c.min ?? 1) + (c.max ?? 10)) / 2;
      else if (c.tipo === "opt") v[c.id] = String(c.opcoes[c.opcoes.length - 1][0]);
      else if (c.tipo === "data") v[c.id] = new Date(Date.now() - 200 * 86400000).toISOString().slice(0, 10);
      else v[c.id] = true;
    }
    const r = e.calcular(v, somarEscore(e, v));
    if (/NaN|Infinity|undefined/.test(String(r.valor) + r.rotulo + (r.nota || ""))) {
      comNaN.push(`${e.id}: ${r.valor} / ${r.rotulo}`);
    }
  }
  check("nenhum escore devolve NaN ou Infinity", comNaN.length === 0, comNaN.join(" | "));

  check("pelo menos 25 escores disponíveis", ESCORES.length >= 25, String(ESCORES.length));
  const areas = new Set(ESCORES.map(e => e.area));
  check("pelo menos 10 áreas cobertas", areas.size >= 10, [...areas].join(", "));
}

for (const r of res) console.log(`${r.ok ? "✅" : "❌"} ${r.nome}${r.extra ? "  ·  " + r.extra : ""}`);
console.log(`\n${res.filter(r => r.ok).length}/${res.length} verificações passaram`);
process.exit(res.every(r => r.ok) ? 0 : 1);
