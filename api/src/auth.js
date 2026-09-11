/* =================================================================
   Autenticação por link mágico
   -----------------------------------------------------------------
   Sem senha: a pessoa digita o e-mail, recebe um link e entra. Não há
   credencial para guardar, vazar ou esquecer.

   O cookie de sessão é httpOnly (JavaScript não lê, então XSS não rouba)
   e SameSite=Lax — o que só funciona porque o site e esta API vivem no
   MESMO domínio. Em domínios diferentes o navegador trataria como cookie
   de terceiro e Safari e Firefox bloqueariam.
   ================================================================= */

import {
  agora, novoToken, hashToken, normalizarEmail, emailValido,
  acharOuCriarUsuario, guardarLinkMagico, consumirLinkMagico,
  criarSessao, usuarioDaSessao, apagarSessao,
} from "./db.js";
import { enviarLinkMagico } from "./email.js";

const COOKIE = "invictus_sessao";
const VALIDADE_LINK_MS = 15 * 60 * 1000;          // 15 minutos
const VALIDADE_SESSAO_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

/* Um pedido de link a cada 60s por e-mail: evita usar o site como
   máquina de enviar e-mail para terceiros. */
const INTERVALO_PEDIDO_MS = 60 * 1000;

export function cookieSessao(token, maxAgeSeg) {
  const partes = [
    `${COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeg}`,
  ];
  return partes.join("; ");
}

export function lerCookieSessao(request) {
  const cabecalho = request.headers.get("Cookie") || "";
  for (const parte of cabecalho.split(";")) {
    const [nome, ...resto] = parte.trim().split("=");
    if (nome === COOKIE) return resto.join("=");
  }
  return null;
}

/* Quem está falando comigo? Devolve null se não houver sessão válida. */
export async function usuarioAtual(request, env) {
  const token = lerCookieSessao(request);
  if (!token) return null;
  return usuarioDaSessao(env.DB, await hashToken(token));
}

/* ---- POST /api/auth/solicitar  { email } ---- */
export async function solicitarLink(request, env) {
  const corpo = await request.json().catch(() => ({}));
  const email = normalizarEmail(corpo.email);
  if (!emailValido(email)) {
    return { status: 400, corpo: { erro: "E-mail inválido.", codigo: "EMAIL" } };
  }

  const ultimo = await env.DB.prepare(
    "SELECT expira_em FROM links_magicos WHERE email = ? ORDER BY expira_em DESC LIMIT 1")
    .bind(email).first();
  if (ultimo && (ultimo.expira_em - VALIDADE_LINK_MS) > agora() - INTERVALO_PEDIDO_MS) {
    return { status: 429, corpo: { erro: "Aguarde um minuto para pedir outro link.", codigo: "ESPERA" } };
  }

  const token = novoToken();
  await guardarLinkMagico(env.DB, email, await hashToken(token), agora() + VALIDADE_LINK_MS);

  const link = `${env.SITE_URL}/entrar?token=${encodeURIComponent(token)}`;
  const enviado = await enviarLinkMagico(env, email, link);
  if (!enviado) {
    return { status: 503, corpo: { erro: "Não consegui enviar o e-mail agora.", codigo: "EMAIL-ENVIO" } };
  }

  // Resposta idêntica exista a conta ou não: não revela quem é cadastrado.
  return { status: 200, corpo: { ok: true } };
}

/* ---- POST /api/auth/confirmar  { token } ---- */
export async function confirmarLink(request, env) {
  const corpo = await request.json().catch(() => ({}));
  const token = String(corpo.token || "");
  if (!token) return { status: 400, corpo: { erro: "Token ausente.", codigo: "TOKEN" } };

  const email = await consumirLinkMagico(env.DB, await hashToken(token));
  if (!email) {
    return { status: 401, corpo: { erro: "Link inválido ou expirado.", codigo: "LINK" } };
  }

  const usuario = await acharOuCriarUsuario(env.DB, email);
  const sessao = novoToken();
  await criarSessao(env.DB, usuario.id, await hashToken(sessao), agora() + VALIDADE_SESSAO_MS);

  return {
    status: 200,
    corpo: { email: usuario.email },
    cookie: cookieSessao(sessao, VALIDADE_SESSAO_MS / 1000),
  };
}

/* ---- POST /api/auth/sair ---- */
export async function sair(request, env) {
  const token = lerCookieSessao(request);
  if (token) await apagarSessao(env.DB, await hashToken(token));
  return { status: 200, corpo: { ok: true }, cookie: cookieSessao("", 0) };
}
