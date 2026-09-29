#!/usr/bin/env python3
"""Adapta o site do Invictus.Med para rodar como artefato dentro do Claude.

O site publicado fala com um Cloudflare Worker, que guarda a chave da API.
Dentro do Claude não há chave nenhuma para guardar: a página chama o modelo
pela capacidade "sample", e quem abre a página é quem paga pela chamada.

Este script parte dos arquivos do repositório e aplica só as diferenças que
o ambiente exige. Assim a versão-artefato acompanha o site sem virar um
segundo código para manter à mão.
"""
import re
import sys
import pathlib

repo, saida, worker = (pathlib.Path(p) for p in sys.argv[1:4])


def troca(texto, velho, novo, quantas=1):
    """Substituição que falha alto se o alvo mudou de forma no repositório."""
    achadas = texto.count(velho)
    if achadas != quantas:
        raise SystemExit(f"esperava {quantas} ocorrência(s) de:\n  {velho[:90]}…\nachei {achadas}")
    return texto.replace(velho, novo)


def bloco_de_funcao(fonte, nome):
    i = fonte.index(f"function {nome}(")
    # "async function X" tem que sair inteiro: deixar o "async" para trás
    # gera "async async function", que nem chega a interpretar.
    if fonte[max(0, i - 6):i] == "async ":
        i -= 6
    nivel, comecou = 0, False
    for k in range(i, len(fonte)):
        if fonte[k] == "{":
            nivel += 1
            comecou = True
        elif fonte[k] == "}":
            nivel -= 1
            if comecou and nivel == 0:
                return fonte[i:k + 1]
    raise SystemExit(f"função {nome} sem fim")


# ---------------------------------------------------------------- prompts
w = worker.read_text(encoding="utf-8")
nomes = re.findall(r"^function (build\w*Prompt)\(", w, re.M)
prompts = "\n\n".join(bloco_de_funcao(w, n) for n in nomes)

# Os validadores e os dois auxiliares de que os prompts dependem. Vêm do
# worker também: se o formato de resposta mudar lá, muda aqui junto.
valida = w[w.index("const VALIDA = {"):w.index("\n};", w.index("const VALIDA = {")) + 3]
corta = re.search(r"^const corta = .*$", w, re.M).group(0)
variacao = bloco_de_funcao(w, "variacao")

ia_js = f'''/* =================================================================
   Invictus.Med — ia.js (versão que roda dentro do Claude)
   -----------------------------------------------------------------
   No site publicado, quem fala com o modelo é um Cloudflare Worker: ele
   guarda a chave da API, monta o prompt e faz a cascata entre provedores.
   Aqui não existe chave para guardar. A página pede diretamente ao Claude
   pela capacidade "sample", e a conta é de quem abre a página — não do
   dono do site.

   Os prompts são os MESMOS do worker, copiados na montagem e não
   reescritos: o formato de resposta que o script.js espera é o mesmo nos
   dois lugares, e duas versões divergindo seria a forma mais fácil de
   quebrar a ficha sem ninguém perceber.

   Gerado por adaptar.py. Não edite à mão — edite o worker.js.
   ================================================================= */
(function () {{
  "use strict";

  const txt = v => typeof v === "string" && v.trim().length > 0;
  const lst = v => Array.isArray(v) && v.length > 0;
  {corta}

  {variacao.replace(chr(10), chr(10) + "  ")}

  {valida.replace(chr(10), chr(10) + "  ")}

  {prompts.replace(chr(10), chr(10) + "  ")}

  /* Qual prompt para cada modo. Espelha o despacho do worker. */
  function promptDoModo(modo, corpo) {{
    const termo = corta(corpo.termo, 400).trim();
    switch (modo) {{
      case "ficha":     return buildPrompt(termo);
      case "caso":      return buildCasePrompt(termo);
      case "abnt":      return buildAbntPrompt(termo, Array.isArray(corpo.referencias) ? corpo.referencias : []);
      case "anamnese":  return buildAnamnesePrompt(termo, corpo);
      case "comparar":  return buildCompararPrompt(corpo);
      case "posologia": return corpo.tipo === "farmaco"
        ? buildDosesFarmacoPrompt(termo)
        : buildPosologiaPrompt(termo, Array.isArray(corpo.medicamentos) ? corpo.medicamentos : []);
      case "quiz":       return buildQuizPrompt(termo);
      case "flashcards": return buildFlashPrompt(termo);
      case "resumo":     return buildResumoPrompt(termo);
      case "mapa":       return buildMapaPrompt(termo);
      default: return null;
    }}
  }}

  /* Modos em que repetir a resposta seria um defeito: quiz e flashcards
     precisam variar a cada geração, e a anamnese é de um paciente só. */
  const SEM_CACHE = new Set(["caso", "quiz", "flashcards", "resumo", "mapa", "anamnese", "comparar"]);

  /* A ficha é longa e vale um modelo mais forte; o resto resolve no padrão. */
  const NIVEL = {{ ficha: "complex", caso: "default", comparar: "default" }};

  let sample;          // a capacidade, resolvida uma vez
  let tentouResolver = false;

  async function capacidade() {{
    if (!tentouResolver) {{
      tentouResolver = true;
      try {{ sample = window.claude && await window.claude.use("sample"); }}
      catch {{ sample = null; }}
    }}
    return sample || null;
  }}

  const erro = (mensagem, codigo) => {{
    const e = new Error(mensagem);
    e.codigo = codigo;
    return e;
  }};

  /* O mesmo contrato do postProxy que isto substitui: recebe o corpo que o
     site mandaria ao worker, devolve o JSON que o site espera de volta. */
  async function pedir(corpo, sinal) {{
    const ia = await capacidade();
    if (!ia) throw erro("NO_PROXY", "SEM-IA");

    const modo = String(corpo.modo || "ficha");
    const prompt = promptDoModo(modo, corpo);
    if (!prompt) throw erro("Modo desconhecido.", "MODO");

    let dados;
    try {{
      dados = await ia.json(prompt, {{
        signal: sinal,
        modelTier: NIVEL[modo] || "default",
        cache: !SEM_CACHE.has(modo),
      }});
    }} catch (e) {{
      const cod = (e && e.code) || "IA";
      if (cod === "cancelled") throw erro("CANCELLED", "CANCELLED");
      if (cod === "not_granted") throw erro("sem permissão", "PERMISSAO");
      if (cod === "rate_limited") throw erro("limite", "429");
      throw erro((e && e.message) || "falha na IA", String(cod).toUpperCase());
    }}

    // Mesma checagem que o worker faz antes de responder: JSON válido mas
    // vazio é falha na prática, e é melhor dizer isso do que pintar uma
    // tela em branco.
    const ok = VALIDA[modo];
    if (ok && !ok(dados)) throw erro("resposta vazia", "VAZIO");
    return dados;
  }}

  window.INVICTUS_IA = {{ pedir, disponivel: capacidade }};
}})();
'''
(saida / "ia.js").write_text(ia_js, encoding="utf-8")

# Os dois trechos de JavaScript que substituem funções cujo mecanismo o
# visualizador do artefato recusa. Vivem aqui para não brigar com as aspas.

LIMPAR_JS = r"""let confirmandoLimpeza = 0;

function limparAnamnese() {
  // confirm() não abre diálogo nenhum aqui — devolve false na hora, e o botão
  // não faria nada. A confirmação vira o próprio botão: o primeiro toque
  // pergunta, o segundo apaga, e em 4 segundos ele se arrepende sozinho.
  const btn = $("#anamLimpar");
  if (Date.now() - confirmandoLimpeza > 4000) {
    confirmandoLimpeza = Date.now();
    if (btn) {
      btn.dataset.rotulo = btn.dataset.rotulo || btn.textContent;
      btn.textContent = "Tem certeza? Toque de novo";
      btn.classList.add("is-confirmando");
      setTimeout(() => {
        if (Date.now() - confirmandoLimpeza >= 4000) {
          btn.textContent = btn.dataset.rotulo;
          btn.classList.remove("is-confirmando");
        }
      }, 4000);
    }
    return;
  }
  confirmandoLimpeza = 0;
  if (btn) {
    btn.textContent = btn.dataset.rotulo || "Limpar tudo";
    btn.classList.remove("is-confirmando");
  }
  anamDados = anamPadrao();
  anamSalvar();
  anamEtapa = 0;
  anamRenderizar();
  toast("Anamnese limpa.");
}"""

BAIXAR_JS = r"""async function baixarAnamnese() {
  const texto = $("#anamTexto").value;
  const nome = `anamnese-${v("iniciais") || "paciente"}-${new Date().toISOString().slice(0, 10)}.txt`
    .replace(/[^\w.-]/g, "-");
  // Um <a download> não faz nada dentro desta caixa. Quem entrega o arquivo é
  // a capacidade "downloads"; sem ela, o texto está inteiro na tela, copiável.
  let baixar = null;
  try { baixar = window.claude && await window.claude.use("downloads"); } catch { baixar = null; }
  if (!baixar) { toast("Não dá para baixar aqui — use Copiar, o texto está inteiro acima."); return; }
  try {
    await baixar.save({ filename: nome, data: texto });
    toast("Arquivo pronto.");
  } catch (e) {
    if (e && e.code === "cancelled") return;
    toast("Não consegui baixar — use Copiar, o texto está inteiro acima.");
  }
}"""

# ---------------------------------------------------------------- script.js
s = (repo / "script.js").read_text(encoding="utf-8")

s = troca(s, '''const CONFIG = {
  PROXY_URL: "https://invictus-proxy.n9rn6tsb26.workers.dev/",   // ← URL do seu Worker''',
'''const CONFIG = {
  // Nesta versão não existe URL de Worker: quem fala com o modelo é o
  // próprio Claude, pela capacidade "sample" (ver ia.js).
  PROXY_URL: "",''')

s = troca(s, '''const isProxyConfigured = () =>
  Boolean(CONFIG.PROXY_URL) && !/INSERIR[-_]URL/i.test(CONFIG.PROXY_URL);''',
'''/* Aqui "configurado" quer dizer: a capacidade de falar com o Claude foi
   concedida a esta visualização. Quem não tem cai na demonstração. */
let iaDisponivel = null;
const isProxyConfigured = () => iaDisponivel !== false;''')

s = troca(s, bloco_de_funcao(s, "postProxy"),
'''async function postProxy(payload, outerSignal) {
  if (!window.INVICTUS_IA) throw errWithCode("NO_PROXY", "SEM-IA");
  try {
    const dados = await window.INVICTUS_IA.pedir(payload, outerSignal);
    iaDisponivel = true;
    return dados;
  } catch (e) {
    if (codeOf(e) === "SEM-IA" || codeOf(e) === "PERMISSAO") iaDisponivel = false;
    throw e;
  }
}''')

# Service worker: não existe neste ambiente, e não há o que guardar offline.
s = troca(s, bloco_de_funcao(s, "registrarServiceWorker"),
'''function registrarServiceWorker() {
  // Dentro do Claude a página roda numa caixa isolada, sem service worker
  // e sem arquivo para guardar. A parte que funciona sem rede — escores,
  // anamnese, revisão — continua funcionando porque nunca dependeu dele.
}''')

# Endereço: o artefato tem o endereço dele, e ?q= não chega até aqui.
s = troca(s, bloco_de_funcao(s, "marcarNoEndereco"),
'''function marcarNoEndereco() {
  /* A página roda dentro de outra: mexer no endereço não vale para
     compartilhar e pode nem ser permitido. O link a compartilhar é o do
     próprio artefato. */
}''')

s = troca(s, bloco_de_funcao(s, "abrirPeloEndereco"),
'''function abrirPeloEndereco() {
  return false;   // sem ?q= nem ?abrir= por aqui
}''')

# Compartilhar volta a ser o que era antes do link por ficha: copiar o texto.
s = troca(s, bloco_de_funcao(s, "linkDaFicha"),
'''function linkDaFicha(d) {
  return "";   // o link desta versão é o do artefato, não o da ficha
}''')

s = troca(s, bloco_de_funcao(s, "shareContent"),
'''async function shareContent(d) {
  // Sem endereço próprio por ficha, compartilhar volta a ser mandar o
  // conteúdo — que é o que dá para colar numa mensagem.
  const texto = dataToText(d);
  if (navigator.share) {
    try { await navigator.share({ title: `Invictus.Med — ${d.nome || ""}`, text: texto }); return; }
    catch (e) { if (e && e.name === "AbortError") return; }
  }
  toast(await copyToClipboard(texto) ? "Conteúdo copiado." : "Compartilhamento indisponível.");
}''')

# PDF: o navegador bloqueia download iniciado pela página dentro da caixa;
# quem entrega o arquivo é a capacidade "downloads".
s = troca(s, '''  doc.save(nome + ".pdf");
  toast("PDF baixado.");''',
'''  entregarPDF(doc, nome + ".pdf");''')

s = troca(s, "/* Monta os blocos de conteúdo (texto) para o PDF, tanto doença quanto fármaco. */",
'''/* Dentro do Claude, um download disparado pela própria página é barrado.
   A capacidade "downloads" é o caminho: ela pergunta ao leitor e entrega o
   arquivo. Sem ela, resta a janela de impressão, de onde dá para salvar
   como PDF. */
async function entregarPDF(doc, nome) {
  let baixar = null;
  try { baixar = window.claude && await window.claude.use("downloads"); } catch { baixar = null; }
  if (!baixar) { toast("Não consegui baixar aqui — use Imprimir e salve como PDF."); return; }
  try {
    await baixar.save({ filename: nome, data: new Uint8Array(doc.output("arraybuffer")) });
    toast("PDF pronto.");
  } catch (e) {
    if (e && e.code === "cancelled") return;
    toast("Não consegui baixar aqui — use Imprimir e salve como PDF.");
  }
}

/* Monta os blocos de conteúdo (texto) para o PDF, tanto doença quanto fármaco. */''')

# A versão que aparece no rodapé da ficha em PDF.
s = s.replace("Invictus.Med (beta).", "Invictus.Med (beta 2).")

# Mensagens de erro: aqui não existe CONFIG.PROXY_URL para ninguém conferir.
s = troca(s, """  } else if (m === "NO_PROXY" || m === "NO_KEY") {
    // Aviso de configuração — só aparece para o desenvolvedor, antes de publicar
    soft = false;
    msg = `<b>Configuração pendente.</b> A conexão com a IA ainda não foi definida
      (veja <code>CONFIG.PROXY_URL</code> no <code>script.js</code>). Por enquanto, apenas os
      exemplos de demonstração funcionam.`;""",
"""  } else if (codigo === "PERMISSAO") {
    msg = `<b>Precisa da sua permissão.</b> Esta página pergunta ao Claude para montar a ficha,
      e a consulta entra na sua conta. Tente de novo e escolha permitir — ou use as
      calculadoras e a anamnese, que funcionam sem IA nenhuma.`;
  } else if (m === "NO_PROXY" || m === "NO_KEY" || codigo === "SEM-IA") {
    msg = `<b>A IA não está disponível nesta visualização.</b> As calculadoras, a anamnese e a
      revisão continuam funcionando — elas nunca dependeram de IA.`;""")

# A janela de impressão pode ser barrada pela caixa em que a página roda.
# A mensagem antiga mandava liberar pop-ups, o que aqui não resolve.
s = troca(s, '''  if (!win) { toast("Permita pop-ups para imprimir."); return; }''',
'''  if (!win) { toast("A impressão não abre aqui — use o botão PDF."); return; }''')

# Sem link por ficha, o campo "fonte" do Markdown sairia vazio.
s = troca(s, '''  meta.push(`fonte: ${JSON.stringify(linkDaFicha(d))}`, "---", "");''',
'''  const link = linkDaFicha(d);
  if (link) meta.push(`fonte: ${JSON.stringify(link)}`);
  meta.push("---", "");''')

# ---- O que a caixa do visualizador recusa em silêncio ----
# Cada um destes falharia sem erro nenhum. Botão que não faz nada é pior que
# botão ausente: a pessoa acha que salvou.

# 1) window.print() não abre nada aqui, e window.open devolve null para a
#    maioria de quem lê. O botão Imprimir sai; o PDF fica, pela "downloads".
s = troca(s, '<button class="tool" id="tPrint" type="button">',
          '<button class="tool" id="tPrint" type="button" hidden>')
s = troca(s, bloco_de_funcao(s, "openPrintWindow"),
          'function openPrintWindow(d) {\n'
          '  // Sem diálogo de impressão nesta caixa: o caminho é o PDF.\n'
          '  toast("A impressão não existe aqui — use o botão PDF.");\n'
          '}')

# 2) navigator.share é recusado sem nem perguntar: ir direto para a cópia.
s = troca(s,
    '  const texto = dataToText(d);\n'
    '  if (navigator.share) {\n'
    '    try { await navigator.share({ title: `Invictus.Med — ${d.nome || ""}`, text: texto }); return; }\n'
    '    catch (e) { if (e && e.name === "AbortError") return; }\n'
    '  }\n'
    '  toast(await copyToClipboard(texto) ? "Conteúdo copiado." : "Compartilhamento indisponível.");',
    '  // navigator.share é recusado aqui sem prompt nenhum; copiar é o caminho.\n'
    '  const texto = dataToText(d);\n'
    '  toast(await copyToClipboard(texto) ? "Conteúdo copiado." : "Não foi possível copiar.");')

# 3) confirm() devolve false na hora: "Limpar tudo" nunca limparia nada.
s = troca(s, bloco_de_funcao(s, "limparAnamnese"), LIMPAR_JS)

# 4) <a download> é inerte para quem lê: mesma capacidade "downloads".
s = troca(s, bloco_de_funcao(s, "baixarAnamnese"), BAIXAR_JS)

(saida / "script.js").write_text(s, encoding="utf-8")

# ---------------------------------------------------------------- estilo
c = (repo / "style.css").read_text(encoding="utf-8")

# Num celular, a barra do sistema cobre o topo da caixa. O esqueleto do
# artefato já afasta o conteúdo; um cabeçalho grudado em top:0 subiria por
# baixo dela mesmo assim.
c = troca(c, "  position: sticky; top: 0; z-index: 40;",
          "  position: sticky; top: env(safe-area-inset-top, 0px); z-index: 40;")

c += """

/* O botão de limpar a anamnese pergunta antes, porque nesta caixa não
   existe diálogo de confirmação: o primeiro toque avisa, o segundo apaga. */
.is-confirmando {
  color: var(--amber) !important;
  border-color: color-mix(in srgb, var(--amber) 55%, transparent) !important;
}
"""
(saida / "style.css").write_text(c, encoding="utf-8")

# ---------------------------------------------------------------- página
h = (repo / "index.html").read_text(encoding="utf-8")

# Só o corpo: o artefato já é embrulhado num documento completo.
corpo = h[h.index("<body>") + len("<body>"):h.index("</body>")]

# O script que aplica o tema antes da primeira pintura vive no <head> do
# site; aqui ele tem que vir no começo do corpo, antes do CSS.
tema = re.search(r"<script>\s*\(function \(\) \{\s*try \{\s*var salvo.*?</script>", h, re.S).group(0)

# O Claude carimba data-theme na raiz conforme o tema de quem está lendo.
# Sem isto, a escolha do leitor era sobrescrita pelo escuro padrão do site
# toda vez que ele abrisse a página sem ter mexido no botão de tema.
tema = tema.replace(
    ''': (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");''',
    ''': (document.documentElement.getAttribute("data-theme")
             || (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));''')

# Fora: manifesto, ícone de iOS e o ?v= — nada disso se aplica aqui.
corpo = re.sub(r'(script|style)\.(js|css)\?v=\d+', r'\1.\2', corpo)

pagina = f'''<title>Invictus.Med</title>

{tema}

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" media="print" onload="this.media='all'; this.onload=null;"
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap" />

<link rel="stylesheet" href="style.css" />
{corpo}
<script src="ia.js"></script>
'''

# O script.js carrega depois do ia.js; o de PDF continua vindo do cdnjs.
pagina = troca(pagina, '<script src="script.js" defer></script>', "")
pagina = pagina.replace("<script src=\"ia.js\"></script>",
                        "<script src=\"ia.js\"></script>\n<script src=\"script.js\" defer></script>")

(saida / "pagina.html").write_text(pagina, encoding="utf-8")

print("gerados: pagina.html, script.js, ia.js")
