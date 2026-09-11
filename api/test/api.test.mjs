import { criarD1 } from "./d1-falso.mjs";
import worker from "../src/index.js";

const SITE = "https://invictusmed.com.br";
const resultados = [];
const check = (nome, ok, extra = "") => resultados.push({ nome, ok, extra });

/* ---- Ambiente de teste: banco real em memória, IA e e-mail simulados ---- */
let emailsEnviados = [];
let chamadasIA = [];

function novoEnv(extra = {}) {
  return {
    DB: criarD1(new URL("../schema.sql", import.meta.url).pathname),
    SITE_URL: SITE,
    LIMITE_GRATIS_DIA: "3",
    GROQ_KEY: "k1",
    RESEND_KEY: "re_fake",
    ...extra,
  };
}

const fichaOk = {
  tipo: "doenca", nome: "Hipertensão Arterial", definicao: "Texto.",
  sintomas_comuns: ["Cefaleia"], farmaco: {},
};

/* Intercepta o mundo externo: Resend e provedores de IA */
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes("resend.com")) {
    const corpo = JSON.parse(init.body);
    emailsEnviados.push({ para: corpo.to[0], html: corpo.html });
    return new Response("{}", { status: 200 });
  }
  chamadasIA.push({ url: u });
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(fichaOk) } }] }),
    { status: 200, headers: { "content-type": "application/json" } });
};

const req = (caminho, opcoes = {}) => new Request(`${SITE}/api${caminho}`, {
  headers: { "content-type": "application/json", Origin: SITE, ...(opcoes.headers || {}) },
  ...opcoes,
});
const post = (caminho, corpo, headers) =>
  req(caminho, { method: "POST", body: JSON.stringify(corpo || {}), headers });

/* Extrai o token do link que foi para o e-mail */
const tokenDoEmail = html => decodeURIComponent(html.match(/token=([^"&]+)/)[1]);

/* Faz o ciclo completo de login e devolve o cookie de sessão */
async function entrar(env, email) {
  emailsEnviados = [];
  await worker.fetch(post("/auth/solicitar", { email }), env);
  const token = tokenDoEmail(emailsEnviados[0].html);
  const r = await worker.fetch(post("/auth/confirmar", { token }), env);
  const cookie = r.headers.get("Set-Cookie").split(";")[0];
  return { cookie, resposta: r };
}

/* ================= LOGIN ================= */
{
  const env = novoEnv();
  emailsEnviados = [];
  let r = await worker.fetch(post("/auth/solicitar", { email: "Aluno@Exemplo.COM " }), env);
  check("solicitar link responde 200", r.status === 200, String(r.status));
  check("e-mail enviado e normalizado", emailsEnviados[0]?.para === "aluno@exemplo.com", emailsEnviados[0]?.para);

  r = await worker.fetch(post("/auth/solicitar", { email: "nao-e-email" }), env);
  check("e-mail inválido → 400", r.status === 400 && (await r.json()).codigo === "EMAIL");

  r = await worker.fetch(post("/auth/solicitar", { email: "aluno@exemplo.com" }), env);
  check("pedido repetido é barrado (anti-flood)", r.status === 429, String(r.status));

  const token = tokenDoEmail(emailsEnviados[0].html);
  r = await worker.fetch(post("/auth/confirmar", { token }), env);
  const cookie = r.headers.get("Set-Cookie") || "";
  check("confirmar cria sessão", r.status === 200 && (await r.json()).email === "aluno@exemplo.com");
  check("cookie é httpOnly, Secure e SameSite", /HttpOnly/.test(cookie) && /Secure/.test(cookie) && /SameSite=Lax/.test(cookie));

  r = await worker.fetch(post("/auth/confirmar", { token }), env);
  check("link mágico só funciona uma vez", r.status === 401 && (await r.json()).codigo === "LINK");

  r = await worker.fetch(post("/auth/confirmar", { token: "inventado" }), env);
  check("token inventado é rejeitado", r.status === 401);
}

/* ====== O QUE FICA GRAVADO NO BANCO ====== */
{
  const env = novoEnv();
  await entrar(env, "seguranca@exemplo.com");
  const link = env.DB._sqlite.prepare("SELECT token_hash FROM links_magicos").get();
  const sessao = env.DB._sqlite.prepare("SELECT token_hash FROM sessoes").get();
  check("link mágico gravado só como hash", /^[a-f0-9]{64}$/.test(link.token_hash), link.token_hash.slice(0, 16) + "…");
  check("sessão gravada só como hash", /^[a-f0-9]{64}$/.test(sessao.token_hash));
  const assin = env.DB._sqlite.prepare("SELECT status FROM assinaturas").get();
  check("conta nasce no plano gratuito", assin.status === "gratis", assin.status);
}

/* ================= SESSÃO ================= */
{
  const env = novoEnv();
  let r = await worker.fetch(req("/conta"), env);
  check("sem cookie → não autenticado", r.status === 200 && (await r.json()).autenticado === false);

  const { cookie } = await entrar(env, "aluno@exemplo.com");
  r = await worker.fetch(req("/conta", { headers: { Cookie: cookie } }), env);
  let conta = await r.json();
  check("com cookie → conta identificada", conta.autenticado && conta.email === "aluno@exemplo.com");
  check("mostra quanto resta do plano", conta.restantes === 3 && conta.limite === 3, `${conta.restantes}/${conta.limite}`);

  r = await worker.fetch(post("/auth/sair", {}, { Cookie: cookie }), env);
  check("sair limpa o cookie", /Max-Age=0/.test(r.headers.get("Set-Cookie") || ""));
  r = await worker.fetch(req("/conta", { headers: { Cookie: cookie } }), env);
  check("sessão encerrada não vale mais", (await r.json()).autenticado === false);
}

/* ================= COTA ================= */
{
  const env = novoEnv();
  const { cookie } = await entrar(env, "cota@exemplo.com");
  const buscar = () => worker.fetch(post("/ia", { termo: "Hipertensão" }, { Cookie: cookie }), env);

  for (let i = 0; i < 3; i++) {
    const r = await buscar();
    check(`busca ${i + 1} de 3 permitida`, r.status === 200, String(r.status));
  }
  let r = await buscar();
  let j = await r.json();
  check("4ª busca barrada pelo limite", r.status === 429 && j.codigo === "LIMITE", `${r.status} ${j.codigo}`);

  r = await worker.fetch(req("/conta", { headers: { Cookie: cookie } }), env);
  check("restantes zera ao bater no teto", (await r.json()).restantes === 0);

  // Assinante não tem teto
  env.DB._sqlite.prepare("UPDATE assinaturas SET status='ativa', periodo_fim=? WHERE 1")
    .run(Date.now() + 86400000);
  r = await buscar();
  check("assinante passa do limite", r.status === 200, String(r.status));
  r = await worker.fetch(req("/conta", { headers: { Cookie: cookie } }), env);
  const contaPaga = await r.json();
  check("conta paga aparece como ilimitada", contaPaga.ilimitado === true && contaPaga.restantes === null);

  // Assinatura vencida volta a ser tratada como gratuita
  env.DB._sqlite.prepare("UPDATE assinaturas SET periodo_fim=? WHERE 1").run(Date.now() - 1000);
  r = await buscar();
  check("assinatura vencida volta a respeitar o teto", r.status === 429, String(r.status));
}

/* ============ HISTÓRICO SINCRONIZADO ============ */
{
  const env = novoEnv();
  const { cookie } = await entrar(env, "sync@exemplo.com");
  const comCookie = { Cookie: cookie };

  let r = await worker.fetch(req("/itens?tipo=historico"), env);
  check("itens exigem sessão", r.status === 401 && (await r.json()).codigo === "SEM-SESSAO");

  await worker.fetch(post("/ia", { termo: "Hepatite" }, comCookie), env);
  r = await worker.fetch(req("/itens?tipo=historico", { headers: comCookie }), env);
  let lista = (await r.json()).itens;
  check("busca entra no histórico da conta", lista.length === 1 && lista[0].nome === "Hipertensão Arterial", lista[0]?.nome);

  await worker.fetch(post("/itens", { tipo: "favorito", nome: "Diabetes" }, comCookie), env);
  await worker.fetch(post("/itens", { tipo: "favorito", nome: "Diabetes" }, comCookie), env);
  r = await worker.fetch(req("/itens?tipo=favorito", { headers: comCookie }), env);
  check("favoritar duas vezes não duplica", (await r.json()).itens.length === 1);

  await worker.fetch(req("/itens", { method: "DELETE", headers: comCookie, body: JSON.stringify({ tipo: "favorito", nome: "Diabetes" }) }), env);
  r = await worker.fetch(req("/itens?tipo=favorito", { headers: comCookie }), env);
  check("remover favorito funciona", (await r.json()).itens.length === 0);

  r = await worker.fetch(post("/itens", { tipo: "invalido", nome: "x" }, comCookie), env);
  check("tipo inválido → 400", r.status === 400);
}

/* ====== UM USUÁRIO NÃO VÊ O DO OUTRO ====== */
{
  const env = novoEnv();
  const a = await entrar(env, "ana@exemplo.com");
  await worker.fetch(post("/itens", { tipo: "favorito", nome: "Segredo da Ana" }, { Cookie: a.cookie }), env);
  const b = await entrar(env, "bruno@exemplo.com");
  const r = await worker.fetch(req("/itens?tipo=favorito", { headers: { Cookie: b.cookie } }), env);
  check("favoritos são isolados por conta", (await r.json()).itens.length === 0);
}

/* ============ USO SEM CONTA ============ */
{
  const env = novoEnv();
  let r = await worker.fetch(post("/ia", { termo: "Hipertensão" }), env);
  check("site continua funcionando sem conta", r.status === 200, String(r.status));

  r = await worker.fetch(post("/ia", { termo: "x", modo: "quizz" }), env);
  check("modo com erro de digitação → 400", r.status === 400 && (await r.json()).codigo === "MODO");
  r = await worker.fetch(post("/ia", { termo: "   " }), env);
  check("termo vazio → 400", r.status === 400);
  r = await worker.fetch(req("/inexistente"), env);
  check("rota desconhecida → 404", r.status === 404);
}

/* ================= CORS ================= */
{
  const env = novoEnv();
  let r = await worker.fetch(req("/conta", { method: "OPTIONS" }), env);
  check("preflight responde 204", r.status === 204, String(r.status));
  check("CORS permite credenciais", r.headers.get("access-control-allow-credentials") === "true");
  r = await worker.fetch(req("/conta", { headers: { Origin: "https://site-clone.com" } }), env);
  check("origem estranha não é ecoada", r.headers.get("access-control-allow-origin") !== "https://site-clone.com");
}

let falhas = 0;
for (const x of resultados) { if (!x.ok) falhas++; console.log(`${x.ok ? "✅" : "❌"} ${x.nome}${x.extra ? "  ·  " + x.extra : ""}`); }
console.log(`\n${resultados.length - falhas}/${resultados.length} verificações passaram`);
process.exit(falhas ? 1 : 0);
