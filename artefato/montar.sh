#!/bin/bash
# Monta a versão do Invictus.Med que roda dentro do Claude, a partir dos
# arquivos do site.
#
# O site publicado fala com um Cloudflare Worker, que guarda a chave da API.
# Dentro do Claude não há chave nenhuma para guardar: a página pergunta ao
# modelo pela capacidade "sample", e quem abre a página é quem paga.
#
# Uso:
#   ./artefato/montar.sh caminho/para/o/worker.js [pasta-de-saida]
#
# O worker.js não está neste repositório de propósito — a URL do AI Gateway
# dentro dele contém o ID da conta Cloudflare, e este repositório é público.
# É dele que saem os prompts, para as duas versões não divergirem.
set -e

AQUI="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$AQUI/.." && pwd)"
WORKER="${1:?informe o caminho do worker.js}"
SAIDA="${2:-$AQUI/saida}"

mkdir -p "$SAIDA"
cp "$REPO/demo.js" "$SAIDA/demo.js"
python3 "$AQUI/adaptar.py" "$REPO" "$SAIDA" "$WORKER"

echo
echo "pronto em $SAIDA"
echo "publique pagina.html como artefato, com style.css, script.js, ia.js e"
echo "demo.js como arquivos de apoio, declarando as capacidades sample e downloads."
