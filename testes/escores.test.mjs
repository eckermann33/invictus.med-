/* Extrai ESCORES e somarEscore do script.js de verdade — assim o teste valida
   o que está publicado, não uma cópia que pode ficar para trás.
   Rodar com: node testes/escores.test.mjs */
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../script.js", import.meta.url), "utf8");
const ini = src.indexOf("const ESCORES = [");
const fim = src.indexOf("\n}", src.indexOf("function somarEscore")) + 2;
if (ini < 0 || fim < 2) { console.error("Não achei os escores no script.js"); process.exit(2); }
const trecho = src.slice(ini, fim);
const mod = await import("data:text/javascript," +
  encodeURIComponent(trecho + "\nexport { ESCORES, somarEscore };"));
const { ESCORES, somarEscore } = mod;

const res = [];
const ck = (n, ok, e = "") => res.push({ n, ok, e });

const rodar = (id, valores) => {
  const esc = ESCORES.find(x => x.id === id);
  return esc.calcular(valores, somarEscore(esc, valores));
};

/* ---- Casos com resultado conhecido ---- */
let r = rodar("imc", { peso: 70, altura: 1.75 });
ck("IMC 70kg/1,75m = 22,9 eutrofia", r.valor === "22.9" && r.rotulo === "Eutrofia", `${r.valor} ${r.rotulo}`);
r = rodar("imc", { peso: 110, altura: 1.70 });
ck("IMC 110kg/1,70m = obesidade grau II", r.rotulo === "Obesidade grau II", `${r.valor} ${r.rotulo}`);
r = rodar("imc", { peso: 45, altura: 1.70 });
ck("IMC baixo peso detectado", r.rotulo === "Baixo peso", `${r.valor} ${r.rotulo}`);

r = rodar("superficie", { peso: 70, altura: 175 });
ck("Mosteller 70kg/175cm = 1,84 m²", r.valor === "1.84", r.valor);

r = rodar("cockcroft", { idade: 60, peso: 70, creatinina: 1.0, sexo: "m" });
ck("Cockcroft homem 60a/70kg/Cr1,0 = 77,8", r.valor === "77.8", r.valor);
r = rodar("cockcroft", { idade: 60, peso: 70, creatinina: 1.0, sexo: "f" });
ck("Cockcroft mulher aplica fator 0,85 = 66,1", r.valor === "66.1", r.valor);
r = rodar("cockcroft", { idade: 80, peso: 60, creatinina: 2.5, sexo: "m" });
ck("Cockcroft baixo classifica G4", /G4/.test(r.rotulo) && r.nivel === "alerta", `${r.valor} ${r.rotulo}`);

/* CHA2DS2-VASc: ICC(1) + HAS(1) + idade≥75(2) = 4 */
r = rodar("chadsvasc", { icc: true, has: true, idade75: true, dm: false, avc: false, vascular: false, idade65: false, feminino: false });
ck("CHA₂DS₂-VASc pesa idade≥75 como 2 → total 4", r.valor === 4, String(r.valor));
/* AVC prévio sozinho = 2 */
r = rodar("chadsvasc", { avc: true });
ck("CHA₂DS₂-VASc AVC prévio vale 2", r.valor === 2 && r.nivel === "alerta", String(r.valor));
r = rodar("chadsvasc", {});
ck("CHA₂DS₂-VASc zerado = risco baixo", r.valor === 0 && r.rotulo === "Risco baixo");

/* Wells TVP: câncer(1) + alternativo(-2) = -1 */
r = rodar("wells_tvp", { cancer: true, alternativo: true });
ck("Wells subtrai 2 pelo diagnóstico alternativo", r.valor === -1, String(r.valor));
r = rodar("wells_tvp", { cancer: true, paralisia: true, acamado: true });
ck("Wells 3 pontos = probabilidade alta", r.valor === 3 && r.rotulo === "Probabilidade alta");

/* Glasgow: 4+5+6 = 15 */
r = rodar("glasgow", { ocular: 4, verbal: 5, motora: 6 });
ck("Glasgow máximo = 15 leve", r.valor === 15 && r.rotulo === "Leve", String(r.valor));
r = rodar("glasgow", { ocular: 1, verbal: 1, motora: 1 });
ck("Glasgow mínimo = 3 grave", r.valor === 3 && r.nivel === "alerta", String(r.valor));
r = rodar("glasgow", { ocular: 2, verbal: 2, motora: 4 });
ck("Glasgow 8 ainda conta como grave", r.valor === 8 && r.nivel === "alerta", String(r.valor));

/* Child-Pugh: tudo 1 = 5 pontos = A */
r = rodar("childpugh", { bilirrubina: 1, albumina: 1, inr: 1, ascite: 1, encefalopatia: 1 });
ck("Child-Pugh mínimo = 5 classe A", r.valor === 5 && r.rotulo === "Classe A", `${r.valor} ${r.rotulo}`);
r = rodar("childpugh", { bilirrubina: 3, albumina: 3, inr: 3, ascite: 3, encefalopatia: 3 });
ck("Child-Pugh máximo = 15 classe C", r.valor === 15 && r.rotulo === "Classe C");
r = rodar("childpugh", { bilirrubina: 2, albumina: 2, inr: 1, ascite: 1, encefalopatia: 1 });
ck("Child-Pugh 7 pontos = classe B", r.valor === 7 && r.rotulo === "Classe B", String(r.valor));

/* CURB-65 */
r = rodar("curb65", { confusao: true, ureia: true, fr: true });
ck("CURB-65 3 pontos pede internação", r.valor === 3 && /internação/.test(r.rotulo), r.rotulo);
r = rodar("curb65", {});
ck("CURB-65 zero = ambulatorial", r.valor === 0 && /ambulatorial/.test(r.rotulo));
r = rodar("curb65", { confusao: true, ureia: true, fr: true, pa: true, idade: true });
ck("CURB-65 máximo = 5 sem estourar a tabela", r.valor === 5 && /UTI/.test(r.rotulo), r.rotulo);

/* qSOFA */
r = rodar("qsofa", { fr: true, pas: true });
ck("qSOFA 2 pontos = alto risco", r.valor === 2 && r.nivel === "alerta");
r = rodar("qsofa", { fr: true });
ck("qSOFA 1 ponto = baixo risco", r.valor === 1 && r.nivel === "ok");

/* HAS-BLED */
r = rodar("hasbled", { has: true, renal: true, avc: true });
ck("HAS-BLED 3 = risco alto", r.valor === 3 && r.nivel === "alerta");

/* Carga tabágica: 20/dia por 30 anos = 30 maços-ano */
r = rodar("cargatabagica", { cigarros: 20, anos: 30 });
ck("Carga tabágica 20/dia × 30 anos = 30", r.valor === 30 && r.nivel === "alerta", String(r.valor));
r = rodar("cargatabagica", { cigarros: 10, anos: 10 });
ck("Carga tabágica 10/dia × 10 anos = 5", r.valor === 5 && r.nivel === "ok", String(r.valor));

/* ---- Integridade das definições ---- */
for (const e of ESCORES) {
  ck(`${e.nome}: tem id, área, campos e função`,
    Boolean(e.id && e.area && e.campos?.length && typeof e.calcular === "function"));
  const ids = e.campos.map(c => c.id);
  ck(`${e.nome}: ids de campo únicos`, new Set(ids).size === ids.length);
  ck(`${e.nome}: todo campo tem rótulo e tipo válido`,
    e.campos.every(c => c.rotulo && ["num","opt","sim"].includes(c.tipo)));
}
ck("ids de escore únicos", new Set(ESCORES.map(e => e.id)).size === ESCORES.length);

let f = 0;
for (const x of res) { if (!x.ok) f++; console.log(`${x.ok?"✅":"❌"} ${x.n}${x.e?"  ·  "+x.e:""}`); }
console.log(`\n${res.length-f}/${res.length} verificações passaram`);
process.exit(f?1:0);
