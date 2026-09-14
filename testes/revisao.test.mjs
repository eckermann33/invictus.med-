/* O agendamento de revisão é aritmética — dá para testar sem navegador.
   O `agendarSM2` é extraído do script.js que realmente é publicado, e não
   copiado: uma cópia passaria a valer mesmo depois de o original mudar. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fonte = fs.readFileSync(path.join(raiz, "script.js"), "utf8");

function extrair(nome) {
  const i = fonte.indexOf(`function ${nome}(`);
  if (i === -1) throw new Error(`função ${nome} não encontrada no script.js`);
  // Conta chaves a partir da primeira, para pegar a função inteira.
  let nivel = 0, comecou = false, fim = i;
  for (let k = i; k < fonte.length; k++) {
    if (fonte[k] === "{") { nivel++; comecou = true; }
    else if (fonte[k] === "}") { nivel--; if (comecou && nivel === 0) { fim = k + 1; break; } }
  }
  return fonte.slice(i, fim);
}

const constantes = (fonte.match(/^const EF_MINIMA = [\d.]+;/m) || [])[0]
  + "\n" + (fonte.match(/^const DIA = \d+;/m) || [])[0]
  + "\nconst hoje = () => 0;";

const { agendarSM2, idCarta } = new Function(
  `${constantes}\n${extrair("agendarSM2")}\n${extrair("idCarta")}\n` +
  "return { agendarSM2, idCarta };")();

const res = [];
const check = (nome, ok, extra = "") => res.push({ nome, ok, extra });
const perto = (a, b) => Math.abs(a - b) < 0.005;

/* ---------- A sequência clássica do SM-2 ---------- */
let c = agendarSM2(null, 5, 0);
check("primeiro acerto agenda para 1 dia", c.intervalo === 1, String(c.intervalo));
check("primeiro acerto fácil sobe a facilidade", perto(c.ef, 2.6), String(c.ef));

c = agendarSM2(c, 5, 0);
check("segundo acerto agenda para 6 dias", c.intervalo === 6, String(c.intervalo));

const antes = c.ef;
c = agendarSM2(c, 5, 0);
check("terceiro acerto multiplica pela facilidade",
  c.intervalo === Math.round(6 * antes), `${c.intervalo} esperado ${Math.round(6 * antes)}`);
check("a facilidade continua subindo com 'fácil'", c.ef > antes, `${antes} → ${c.ef}`);

/* ---------- Errar zera a sequência ---------- */
const longa = agendarSM2(agendarSM2(agendarSM2(null, 5, 0), 5, 0), 5, 0);
const errada = agendarSM2(longa, 0, 0);
check("errar zera as repetições", errada.repeticoes === 0, String(errada.repeticoes));
check("errar traz a carta de volta hoje", errada.intervalo === 0, String(errada.intervalo));
check("errar derruba a facilidade", errada.ef < longa.ef, `${longa.ef} → ${errada.ef}`);
check("carta errada vence antes da acertada", errada.proxima < longa.proxima,
  `${errada.proxima} < ${longa.proxima}`);

/* ---------- Difícil encurta sem zerar ---------- */
const facil = agendarSM2(agendarSM2(agendarSM2(null, 5, 0), 5, 0), 5, 0);
const dificil = agendarSM2(agendarSM2(agendarSM2(null, 3, 0), 3, 0), 3, 0);
check("'difícil' não zera a sequência", dificil.repeticoes === 3, String(dificil.repeticoes));
check("'difícil' espaça menos que 'fácil'", dificil.intervalo < facil.intervalo,
  `difícil ${dificil.intervalo}d < fácil ${facil.intervalo}d`);

/* ---------- O piso da facilidade ---------- */
let ruim = null;
for (let i = 0; i < 30; i++) ruim = agendarSM2(ruim, 0, 0);
check("a facilidade não desce do piso de 1,3", perto(ruim.ef, 1.3), String(ruim.ef));
check("nem com 30 erros o intervalo fica negativo", ruim.intervalo >= 0, String(ruim.intervalo));

/* ---------- O intervalo cresce de verdade ---------- */
let carta = null, historico = [];
for (let i = 0; i < 6; i++) { carta = agendarSM2(carta, 5, 0); historico.push(carta.intervalo); }
check("intervalos crescem a cada acerto",
  historico.every((v, i) => i === 0 || v > historico[i - 1]), historico.join(", "));
check("depois de 6 acertos passa de um mês", carta.intervalo > 30, `${carta.intervalo} dias`);

/* ---------- Estado corrompido não derruba ---------- */
const lixo = agendarSM2({ ef: "abc", repeticoes: null, intervalo: undefined }, 5, 0);
check("estado corrompido volta ao padrão sem quebrar",
  Number.isFinite(lixo.ef) && Number.isFinite(lixo.intervalo), JSON.stringify(lixo));

/* ---------- Identidade da carta ---------- */
check("acentos e pontuação não criam cartas duplicadas",
  idCarta("Qual é a meta pressórica?") === idCarta("qual e a meta pressorica"),
  idCarta("Qual é a meta pressórica?"));
check("perguntas diferentes continuam diferentes",
  idCarta("Qual a meta pressórica?") !== idCarta("Qual a dose inicial?"));
check("frente vazia não gera identidade", idCarta("") === "" && idCarta(null) === "");
check("frente muito longa é truncada", idCarta("a".repeat(500)).length === 120);

for (const r of res) console.log(`${r.ok ? "✅" : "❌"} ${r.nome}${r.extra ? "  ·  " + r.extra : ""}`);
console.log(`\n${res.filter(r => r.ok).length}/${res.length} verificações passaram`);
process.exit(res.every(r => r.ok) ? 0 : 1);
