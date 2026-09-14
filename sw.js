/* =================================================================
   Invictus.Med — sw.js (service worker)
   -----------------------------------------------------------------
   Por que existe: metade do site não precisa de internet nenhuma. As
   calculadoras são aritmética, a anamnese monta o texto no navegador,
   favoritos e histórico já moram no localStorage. Sem um service
   worker, nada disso abre quando o wi-fi do hospital cai — o navegador
   nem chega a carregar a página.

   O que fica guardado: só os arquivos do site (HTML, CSS, JS, ícones).
   Resposta de IA não entra aqui. Ficha clínica salva em cache vira
   conteúdo médico velho sem aviso, e isso o script.js trata por conta
   própria, marcando a data na tela.
   ================================================================= */

// Trocar a versão invalida o cache inteiro. Precisa acompanhar o ?v= do
// index.html, senão o app fica servindo a versão anterior para sempre.
const VERSAO = "v23";
const CACHE = `invictus-${VERSAO}`;

// O esqueleto do site. Sem isto no cache, offline não abre nada.
const ESQUELETO = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.webmanifest",
  "./icone-192.png",
  "./icone-512.png",
  "./icone-maskable-512.png",
  "./apple-touch-icon.png",
];

self.addEventListener("install", evento => {
  evento.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll é tudo-ou-nada: um 404 em qualquer item aborta a instalação
    // inteira e o site fica sem offline. Guarda um a um e segue em frente.
    await Promise.all(ESQUELETO.map(u => cache.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", evento => {
  evento.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes
      .filter(n => n.startsWith("invictus-") && n !== CACHE)
      .map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

/* O site é atualizado sem etapa de build: o arquivo novo pode estar no ar
   um minuto depois de eu editar. Servir cache primeiro deixaria todo mundo
   numa versão velha. Então: rede primeiro, com o cache de rede como rede de
   segurança — e o cache só decide quando a rede não responde. */
async function redePrimeiro(req) {
  const cache = await caches.open(CACHE);
  try {
    const resposta = await fetch(req);
    // Só guarda o que deu certo. Guardar um 404 ou um erro do servidor
    // congelaria a falha para as próximas visitas.
    if (resposta && resposta.ok && resposta.type === "basic") {
      cache.put(req, resposta.clone());
    }
    return resposta;
  } catch (e) {
    const guardada = await cache.match(req, { ignoreSearch: true });
    if (guardada) return guardada;
    // Navegação sem rede e sem cache exato: entrega o index, que sabe
    // abrir as calculadoras e a anamnese sozinho.
    if (req.mode === "navigate") {
      const inicio = await cache.match("./index.html", { ignoreSearch: true });
      if (inicio) return inicio;
    }
    throw e;
  }
}

self.addEventListener("fetch", evento => {
  const req = evento.request;
  if (req.method !== "GET") return;                     // POST à IA passa direto

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      // fontes e CDN: deixa o navegador cuidar

  evento.respondWith(redePrimeiro(req));
});

// O index.html pede a troca imediata quando avisa que há versão nova.
self.addEventListener("message", evento => {
  if (evento.data === "atualizar-agora") self.skipWaiting();
});
