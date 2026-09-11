/* =================================================================
   Planos e limites
   -----------------------------------------------------------------
   Hoje só existem dois estados: "gratis" (com teto diário) e "ativa"
   (sem teto). Quando a cobrança entrar, é aqui que os planos crescem —
   o resto do sistema só pergunta "pode ou não pode".
   ================================================================= */

import { assinaturaDe, temAcessoPago, usoHoje, contarUso } from "./db.js";

/* Modos que consomem cota. As ferramentas de estudo usam uma chave de IA
   separada e um modelo mais barato, então não entram no teto das fichas. */
const MODOS_COM_COTA = new Set(["ficha"]);

export async function verificarCota(env, usuario, modo) {
  if (!MODOS_COM_COTA.has(modo)) return { pode: true };

  const assinatura = await assinaturaDe(env.DB, usuario.id);
  if (temAcessoPago(assinatura)) return { pode: true, assinatura };

  const limite = Number(env.LIMITE_GRATIS_DIA || 8);
  const usadas = await usoHoje(env.DB, usuario.id, modo);
  if (usadas >= limite) {
    return {
      pode: false,
      limite,
      usadas,
      assinatura,
      erro: "Você chegou ao limite de buscas de hoje.",
      codigo: "LIMITE",
    };
  }
  return { pode: true, limite, usadas, assinatura };
}

export async function registrarUso(env, usuario, modo) {
  if (!MODOS_COM_COTA.has(modo)) return;
  await contarUso(env.DB, usuario.id, modo);
}

/* Resumo mostrado no cabeçalho do site. */
export async function estadoDaConta(env, usuario) {
  const assinatura = await assinaturaDe(env.DB, usuario.id);
  const limite = Number(env.LIMITE_GRATIS_DIA || 8);
  const usadas = await usoHoje(env.DB, usuario.id, "ficha");
  const pago = temAcessoPago(assinatura);
  return {
    email: usuario.email,
    plano: assinatura.status,
    ilimitado: pago,
    restantes: pago ? null : Math.max(0, limite - usadas),
    limite: pago ? null : limite,
  };
}
