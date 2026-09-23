#!/bin/sh
set -eu
AKIM_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if command -v node >/dev/null 2>&1; then
  exec node "$AKIM_ROOT/server/main.mjs"
fi
AKIM_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
if [ -x "$AKIM_NODE" ]; then
  exec "$AKIM_NODE" "$AKIM_ROOT/server/main.mjs"
fi
echo 'Node.js 22+ is required. Install it, then run: node server/main.mjs' >&2
exit 1
