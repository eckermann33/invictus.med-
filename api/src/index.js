/* =================================================================
   Invictus.Med — API (Cloudflare Worker)
   -----------------------------------------------------------------
   Rotas:
     POST /api/auth/solicitar   { email }            → envia o link mágico
     POST /api/auth/confirmar   { token }            → cria a sessão
     POST /api/auth/sair                             → encerra a sessão
     GET  /api/conta                                 → quem sou eu e quanto me resta
     GET  /api/itens?tipo=historico|favorito         → lista sincronizada
     POST /api/itens            { tipo, nome }       → salva
     DELETE /api/itens          { tipo, nome? }      → remove um ou limpa tudo
     POST /api/ia               { modo, termo, ... } → gera a ficha e afins

   A conta é OPCIONAL para usar o site: sem sessão, /api/ia continua
   funcionando com um teto menor por IP. Quem entra ganha teto maior,
   histórico sincronizado e, na fase de cobrança, o plano pago.
   ================================================================= */

import { usuarioAtual, solicitarLink, confirmarLink, sair } from "./auth.js";
import { verificarCota, registrarUso, estadoDaConta } from "./planos.js";
import { gerar, MODOS } from "./ia.js";
import {
  listarItens, salvarItem, removerItem, limparItens,
  contarBusca, termosMaisBuscados, resumoDeUso,
  salvarReporte, listarReportes, fichasComMaisReportes,
} from "./db.js";

const MAX_TERMO = 400;

/* Site e API no mesmo domínio: não há preflight nem origem cruzada no uso
   normal. A lista existe para o desenvolvimento local, em que o site roda
   em localhost e a API num túnel do wrangler. */
const ORIGENS_DEV = ["http://localhost:8000", "http://127.0.0.1:8000"];

function cors(request, env) {
  const origin = request.headers.get("Origin") || "";
  const permitidas = [env.SITE_URL, ...ORIGENS_DEV].filter(Boolean);
  if (!permitidas.includes(origin)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

const json = (corpo, status, cabecalhos, cookie) => new Response(JSON.stringify(corpo), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    ...cabecalhos,
    ...(cookie ? { "Set-Cookie": cookie } : {}),
  },
});

export default {
  async fetch(request, env) {
    const cabecalhos = cors(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cabecalhos });

    const url = new URL(request.url);
    const rota = url.pathname.replace(/^\/api/, "").replace(/\/+$/, "") || "/";

    try {
      /* ---- Autenticação ---- */
      if (rota === "/auth/solicitar" && request.method === "POST") {
        const r = await solicitarLink(request, env);
        return json(r.corpo, r.status, cabecalhos, r.cookie);
      }
      if (rota === "/auth/confirmar" && request.method === "POST") {
        const r = await confirmarLink(request, env);
        return json(r.corpo, r.status, cabecalhos, r.cookie);
      }
      if (rota === "/auth/sair" && request.method === "POST") {
        const r = await sair(request, env);
        return json(r.corpo, r.status, cabecalhos, r.cookie);
      }

      const usuario = await usuarioAtual(request, env);

      /* ---- Conta ---- */
      if (rota === "/conta" && request.method === "GET") {
        if (!usuario) return json({ autenticado: false }, 200, cabecalhos);
        return json({ autenticado: true, ...(await estadoDaConta(env, usuario)) }, 200, cabecalhos);
      }

      /* ---- Histórico e favoritos (só com conta) ---- */
      if (rota === "/itens") {
        if (!usuario) return json({ erro: "Entre na sua conta.", codigo: "SEM-SESSAO" }, 401, cabecalhos);
        return itens(request, env, usuario, url, cabecalhos);
      }

      /* ---- Relato de conteúdo errado ---- */
      if (rota === "/reporte" && request.method === "POST") {
        return reporte(request, env, usuario, cabecalhos);
      }

      /* ---- Painel do dono ---- */
      if (rota === "/painel" && request.method === "GET") {
        if (!ehDono(env, usuario)) {
          return json({ erro: "Acesso restrito.", codigo: "DONO" }, 403, cabecalhos);
        }
        const [termos, resumo, reportes, piores] = await Promise.all([
          termosMaisBuscados(env.DB, 30, 50),
          resumoDeUso(env.DB, 30),
          listarReportes(env.DB, 100),
          fichasComMaisReportes(env.DB, 20),
        ]);
        return json({ resumo, termos, reportes, fichas_com_reportes: piores }, 200, cabecalhos);
      }

      /* ---- Geração de conteúdo ---- */
      if (rota === "/ia" && request.method === "POST") {
        return ia(request, env, usuario, cabecalhos);
      }

      return json({ erro: "Rota não encontrada.", codigo: "ROTA" }, 404, cabecalhos);
    } catch {
      return json({ erro: "Erro interno.", codigo: "INTERNO" }, 500, cabecalhos);
    }
  },
};

/* ================================================================= */

async function itens(request, env, usuario, url, cabecalhos) {
  const tipos = new Set(["historico", "favorito"]);

  if (request.method === "GET") {
    const tipo = url.searchParams.get("tipo") || "historico";
    if (!tipos.has(tipo)) return json({ erro: "Tipo inválido.", codigo: "TIPO" }, 400, cabecalhos);
    return json({ itens: await listarItens(env.DB, usuario.id, tipo) }, 200, cabecalhos);
  }

  const corpo = await request.json().catch(() => ({}));
  const tipo = String(corpo.tipo || "");
  if (!tipos.has(tipo)) return json({ erro: "Tipo inválido.", codigo: "TIPO" }, 400, cabecalhos);

  if (request.method === "POST") {
    const nome = String(corpo.nome || "").trim().slice(0, MAX_TERMO);
    if (!nome) return json({ erro: "Nome vazio.", codigo: "NOME" }, 400, cabecalhos);
    await salvarItem(env.DB, usuario.id, tipo, nome);
    return json({ ok: true }, 200, cabecalhos);
  }

  if (request.method === "DELETE") {
    const nome = String(corpo.nome || "").trim();
    if (nome) await removerItem(env.DB, usuario.id, tipo, nome);
    else await limparItens(env.DB, usuario.id, tipo);
    return json({ ok: true }, 200, cabecalhos);
  }

  return json({ erro: "Método não permitido.", codigo: "METODO" }, 405, cabecalhos);
}

async function ia(request, env, usuario, cabecalhos) {
  const corpo = await request.json().catch(() => ({}));
  const termo = String(corpo.termo || "").trim().slice(0, MAX_TERMO);
  const modo = String(corpo.modo || "ficha").trim() || "ficha";

  if (!termo) return json({ erro: "Termo vazio.", codigo: "VAZIO" }, 400, cabecalhos);
  if (!MODOS.has(modo)) return json({ erro: "Modo desconhecido.", codigo: "MODO" }, 400, cabecalhos);

  // Sem conta o site continua funcionando, com um teto menor.
  if (!usuario) {
    const teto = Number(env.LIMITE_ANONIMO_DIA || 3);
    if (modo === "ficha" && teto <= 0) {
      return json({ erro: "Entre na sua conta para pesquisar.", codigo: "SEM-SESSAO" }, 401, cabecalhos);
    }
  } else {
    const cota = await verificarCota(env, usuario, modo);
    if (!cota.pode) {
      return json({ erro: cota.erro, codigo: cota.codigo, limite: cota.limite, usadas: cota.usadas },
        429, cabecalhos);
    }
  }

  const r = await gerar(env, modo, termo, corpo);
  if (!r.ok) return json({ erro: "Provedores indisponíveis.", codigo: r.codigo }, 503, cabecalhos);

  // Contagem agregada por termo, desligada de quem buscou: é o que permite
  // saber o que as pessoas procuram sem guardar o histórico de ninguém.
  await contarBusca(env.DB, termo, modo).catch(() => {});

  if (usuario) {
    await registrarUso(env, usuario, modo);
    // O histórico acompanha a conta em vez de morrer com o navegador.
    if (modo === "ficha") {
      await salvarItem(env.DB, usuario.id, "historico", String(r.dados.nome || termo).slice(0, MAX_TERMO))
        .catch(() => {});
    }
  }

  return json(r.dados, 200, cabecalhos);
}

/* O painel é do dono. Sem uma lista de e-mails autorizados em EMAIL_DONO,
   ninguém entra — inclusive eu, se esquecer de configurar. */
function ehDono(env, usuario) {
  if (!usuario) return false;
  const donos = String(env.EMAIL_DONO || "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
  return donos.includes(String(usuario.email || "").toLowerCase());
}

async function reporte(request, env, usuario, cabecalhos) {
  const corpo = await request.json().catch(() => ({}));
  const ficha = String(corpo.ficha || "").trim();
  if (!ficha) return json({ erro: "Ficha não informada.", codigo: "FICHA" }, 400, cabecalhos);

  await salvarReporte(env.DB, {
    usuarioId: usuario?.id,
    ficha,
    secoes: Array.isArray(corpo.secoes) ? corpo.secoes.slice(0, 12).map(String) : [],
    descricao: corpo.descricao,
  });
  return json({ ok: true }, 200, cabecalhos);
}
