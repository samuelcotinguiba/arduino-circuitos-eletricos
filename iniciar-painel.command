#!/bin/zsh
# Dois cliques no macOS: inicia Python e abre o navegador.
FLUXO_PROJECT_ROOT="${0:A:h}"
if ! command -v python3 >/dev/null; then
  echo 'Instale o Python 3 para abrir o Fluxo.'
  read '?Pressione Enter para fechar.'
  exit 1
fi
exec python3 "$FLUXO_PROJECT_ROOT/app.py"
