/* =================================================================
   Acesso ao banco (Cloudflare D1)
   ================================================================= */

export const agora = () => Date.now();
export const diaUTC = (ts = Date.now()) => new Date(ts).toISOString().slice(0, 10);

/* ---------- Identificadores e tokens ---------- */

export function novoId() {
  return crypto.randomUUID();
}

/* Token opaco de 32 bytes. É isso que vai no e-mail e no cookie. */
export function novoToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* Só o hash é gravado. Vazamento do banco não dá acesso a conta nenhuma. */
export async function hashToken(token) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- Usuários ---------- */

export function normalizarEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

export async function acharOuCriarUsuario(db, email) {
  const existente = await db.prepare("SELECT id, email FROM usuarios WHERE email = ?")
    .bind(email).first();
  if (existente) {
    await db.prepare("UPDATE usuarios SET ultimo_acesso = ? WHERE id = ?")
      .bind(agora(), existente.id).run();
    return existente;
  }
  const id = novoId();
  const t = agora();
  await db.prepare("INSERT INTO usuarios (id, email, criado_em, ultimo_acesso) VALUES (?, ?, ?, ?)")
    .bind(id, email, t, t).run();
  await db.prepare("INSERT INTO assinaturas (usuario_id, status, atualizada_em) VALUES (?, 'gratis', ?)")
    .bind(id, t).run();
  return { id, email };
}

/* ---------- Links mágicos ---------- */

export async function guardarLinkMagico(db, email, tokenHash, expiraEm) {
  await db.prepare("INSERT INTO links_magicos (token_hash, email, expira_em) VALUES (?, ?, ?)")
    .bind(tokenHash, email, expiraEm).run();
}

/* Consome o link: só vale uma vez e só dentro do prazo. */
export async function consumirLinkMagico(db, tokenHash) {
  const link = await db.prepare("SELECT token_hash, email, expira_em, usado_em FROM links_magicos WHERE token_hash = ?")
    .bind(tokenHash).first();
  if (!link) return null;
  if (link.usado_em) return null;
  if (link.expira_em < agora()) return null;
  await db.prepare("UPDATE links_magicos SET usado_em = ? WHERE token_hash = ?")
    .bind(agora(), tokenHash).run();
  return link.email;
}

/* ---------- Sessões ---------- */

export async function criarSessao(db, usuarioId, tokenHash, expiraEm) {
  await db.prepare("INSERT INTO sessoes (token_hash, usuario_id, criada_em, expira_em) VALUES (?, ?, ?, ?)")
    .bind(tokenHash, usuarioId, agora(), expiraEm).run();
}

export async function usuarioDaSessao(db, tokenHash) {
  const linha = await db.prepare(
    `SELECT u.id, u.email, s.expira_em
       FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = ?`).bind(tokenHash).first();
  if (!linha) return null;
  if (linha.expira_em < agora()) {
    await apagarSessao(db, tokenHash);
    return null;
  }
  return { id: linha.id, email: linha.email };
}

export async function apagarSessao(db, tokenHash) {
  await db.prepare("DELETE FROM sessoes WHERE token_hash = ?").bind(tokenHash).run();
}

/* ---------- Assinatura ---------- */

export async function assinaturaDe(db, usuarioId) {
  const a = await db.prepare("SELECT status, periodo_fim FROM assinaturas WHERE usuario_id = ?")
    .bind(usuarioId).first();
  if (!a) return { status: "gratis", periodo_fim: null };
  // Assinatura vencida vale como gratuita até o provedor confirmar a renovação.
  if (a.status === "ativa" && a.periodo_fim && a.periodo_fim < agora()) {
    return { status: "atrasada", periodo_fim: a.periodo_fim };
  }
  return a;
}

export const temAcessoPago = assin => assin.status === "ativa";

/* ---------- Uso diário ---------- */

export async function contarUso(db, usuarioId, modo) {
  const dia = diaUTC();
  await db.prepare(
    `INSERT INTO uso (usuario_id, dia, modo, contagem) VALUES (?, ?, ?, 1)
     ON CONFLICT(usuario_id, dia, modo) DO UPDATE SET contagem = contagem + 1`)
    .bind(usuarioId, dia, modo).run();
}

export async function usoHoje(db, usuarioId, modo) {
  const r = await db.prepare("SELECT contagem FROM uso WHERE usuario_id = ? AND dia = ? AND modo = ?")
    .bind(usuarioId, diaUTC(), modo).first();
  return r ? Number(r.contagem) : 0;
}

/* ---------- Histórico e favoritos ---------- */

const LIMITE_ITENS = { historico: 40, favorito: 200 };

export async function listarItens(db, usuarioId, tipo) {
  const r = await db.prepare(
    "SELECT nome, ts FROM itens WHERE usuario_id = ? AND tipo = ? ORDER BY ts DESC LIMIT ?")
    .bind(usuarioId, tipo, LIMITE_ITENS[tipo] || 40).all();
  return (r && r.results) || [];
}

export async function salvarItem(db, usuarioId, tipo, nome, ts = agora()) {
  await db.prepare(
    `INSERT INTO itens (usuario_id, tipo, nome, ts) VALUES (?, ?, ?, ?)
     ON CONFLICT(usuario_id, tipo, nome) DO UPDATE SET ts = excluded.ts`)
    .bind(usuarioId, tipo, nome, ts).run();
}

export async function removerItem(db, usuarioId, tipo, nome) {
  await db.prepare("DELETE FROM itens WHERE usuario_id = ? AND tipo = ? AND nome = ?")
    .bind(usuarioId, tipo, nome).run();
}

export async function limparItens(db, usuarioId, tipo) {
  await db.prepare("DELETE FROM itens WHERE usuario_id = ? AND tipo = ?").bind(usuarioId, tipo).run();
}
