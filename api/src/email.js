/* =================================================================
   Envio do e-mail de login (Resend)
   -----------------------------------------------------------------
   Trocar de provedor é mexer só nesta função: o resto do sistema não
   sabe quem envia. Qualquer serviço com API HTTP serve (Brevo, Postmark).
   ================================================================= */

const RESEND_URL = "https://api.resend.com/emails";

export async function enviarLinkMagico(env, email, link) {
  if (!env.RESEND_KEY) {
    // Em desenvolvimento, sem chave, o link vai para o log do Worker
    // (npx wrangler tail) em vez de falhar o fluxo inteiro.
    console.log(`[login] link para ${email}: ${link}`);
    return env.PERMITIR_LOGIN_SEM_EMAIL === "1";
  }

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${env.RESEND_KEY}`,
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        from: env.EMAIL_REMETENTE || "Invictus.Med <login@invictusmed.com.br>",
        to: [email],
        subject: "Seu link de acesso — Invictus.Med",
        text: textoSimples(link),
        html: corpoHTML(link),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const textoSimples = link =>
  `Seu acesso ao Invictus.Med

Clique para entrar: ${link}

O link vale por 15 minutos e só funciona uma vez.
Se não foi você que pediu, pode ignorar este e-mail.`;

const corpoHTML = link => `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:32px 16px;background:#F1F9F5;font-family:Arial,Helvetica,sans-serif;color:#0B1F18;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;">
    <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#10B981;font-weight:bold;">Invictus.Med</div>
    <h1 style="font-size:22px;margin:12px 0 8px;">Seu link de acesso</h1>
    <p style="margin:0 0 24px;line-height:1.6;color:#2F4A40;">
      Clique no botão para entrar na sua conta. O link vale por 15 minutos e só funciona uma vez.
    </p>
    <a href="${link}" style="display:inline-block;background:#10B981;color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:bold;">
      Entrar no Invictus.Med
    </a>
    <p style="margin:24px 0 0;font-size:13px;color:#5C7A6E;line-height:1.6;">
      Se o botão não funcionar, copie este endereço:<br>
      <span style="word-break:break-all;color:#0B6B4F;">${link}</span>
    </p>
    <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e2e2e2;font-size:12px;color:#8FB3A6;">
      Se não foi você que pediu, pode ignorar este e-mail — nada acontece sem clicar no link.
    </p>
  </div>
</body></html>`;
