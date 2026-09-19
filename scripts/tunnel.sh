#!/usr/bin/env bash
# Expose the local simulator through Cloudflare Tunnel.
# Quick mode (default): ephemeral https://*.trycloudflare.com — no login.
# Named mode: persistent hostname — requires `cloudflared tunnel login` once.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8765}"
MODE="${1:-quick}"

cd "$ROOT"

if ! command -v cloudflared >/dev/null; then
  echo "Install cloudflared first: brew install cloudflared" >&2
  exit 1
fi

if ! lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Simulator is not listening on 127.0.0.1:$PORT" >&2
  echo "Start it in another terminal:" >&2
  echo "  python3 -m simulator.server" >&2
  exit 1
fi

if [[ "$MODE" == "quick" ]]; then
  echo "Starting quick tunnel → http://127.0.0.1:$PORT"
  echo "Copy the https://….trycloudflare.com URL from the logs below."
  exec cloudflared tunnel --url "http://127.0.0.1:$PORT"
fi

if [[ "$MODE" == "named" ]]; then
  NAME="${TUNNEL_NAME:-panaderos}"
  HOSTNAME="${TUNNEL_HOSTNAME:-}"
  if [[ -z "$HOSTNAME" ]]; then
    echo "Set TUNNEL_HOSTNAME to your Cloudflare DNS name, e.g.:" >&2
    echo "  TUNNEL_HOSTNAME=panaderos.example.com ./scripts/tunnel.sh named" >&2
    exit 1
  fi
  if [[ ! -f "$HOME/.cloudflared/cert.pem" ]]; then
    echo "One-time login required (opens a browser)…"
    cloudflared tunnel login
  fi
  if ! cloudflared tunnel list 2>/dev/null | awk '{print $2}' | grep -qx "$NAME"; then
    cloudflared tunnel create "$NAME"
  fi
  TUNNEL_ID="$(cloudflared tunnel list | awk -v n="$NAME" '$2==n {print $1; exit}')"
  CONFIG="$HOME/.cloudflared/panaderos-config.yml"
  cat >"$CONFIG" <<EOF
tunnel: $TUNNEL_ID
credentials-file: $HOME/.cloudflared/$TUNNEL_ID.json

ingress:
  - hostname: $HOSTNAME
    service: http://127.0.0.1:$PORT
  - service: http_status:404
EOF
  cloudflared tunnel route dns "$NAME" "$HOSTNAME" || true
  echo "Named tunnel ready: https://$HOSTNAME"
  echo "(Optional) PUBLIC_ORIGIN=https://$HOSTNAME python3 -m simulator.server"
  exec cloudflared tunnel --config "$CONFIG" run "$NAME"
fi

echo "Usage: $0 [quick|named]" >&2
exit 1
