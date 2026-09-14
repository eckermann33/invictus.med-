/* O ?v= do index.html e o VERSAO do sw.js têm que andar juntos.
   Se divergirem, o service worker segue servindo o cache antigo e a
   atualização não chega a quem já instalou — falha silenciosa, do tipo
   que só aparece quando alguém reclama que "o site não atualizou". */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(raiz, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(raiz, "sw.js"), "utf8");

const res = [];
const check = (nome, ok, extra = "") => res.push({ nome, ok, extra });

const versoes = [...html.matchAll(/(?:script\.js|style\.css)\?v=(\d+)/g)].map(m => m[1]);
check("index.html versiona css e js", versoes.length === 2, versoes.join(","));
check("css e js usam a mesma versão", new Set(versoes).size === 1, versoes.join(","));

const vSw = (sw.match(/const VERSAO = "v(\d+)"/) || [])[1];
check("sw.js declara uma versão", Boolean(vSw), String(vSw));
check("sw.js está na mesma versão do index.html", vSw === versoes[0],
  `index=${versoes[0]} sw=${vSw}`);

// Tudo que o sw.js promete guardar precisa existir no repositório, senão
// o arquivo some do cache em silêncio e o offline fica pela metade.
const esqueleto = [...sw.matchAll(/^\s*"\.\/([^"]+)",$/gm)].map(m => m[1]);
const faltando = esqueleto.filter(f => !fs.existsSync(path.join(raiz, f)));
check("todo arquivo do esqueleto existe", faltando.length === 0, faltando.join(","));
check("o esqueleto cobre css, js e manifesto",
  ["style.css", "script.js", "manifest.webmanifest"].every(f => esqueleto.includes(f)),
  esqueleto.join(" "));

// Os ícones que o manifesto promete também precisam estar lá.
const manifesto = JSON.parse(fs.readFileSync(path.join(raiz, "manifest.webmanifest"), "utf8"));
const icones = manifesto.icons.map(i => i.src);
const semIcone = icones.filter(f => !fs.existsSync(path.join(raiz, f)));
check("todo ícone do manifesto existe", semIcone.length === 0, semIcone.join(","));
check("o esqueleto guarda os ícones do manifesto",
  icones.every(i => esqueleto.includes(i)), icones.join(" "));

for (const r of res) console.log(`${r.ok ? "✅" : "❌"} ${r.nome}${r.extra ? "  ·  " + r.extra : ""}`);
console.log(`\n${res.filter(r => r.ok).length}/${res.length} verificações passaram`);
process.exit(res.every(r => r.ok) ? 0 : 1);
