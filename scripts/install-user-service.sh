#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/devcontrol"
SYSTEMD_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
ENV_FILE="$CONFIG_DIR/env"
INTEGRATIONS_FILE="$CONFIG_DIR/integrations.json"
SERVICE_FILE="$SYSTEMD_DIR/devcontrol.service"
OWNER="${DEVCONTROL_OWNER:-star8592}"
HOST_VALUE="${HOST:-127.0.0.1}"
PORT_VALUE="${PORT:-8787}"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js 20+ is required." >&2
  exit 1
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "ERROR: Node.js 20+ is required; found $(node --version)." >&2
  exit 1
fi

TOKEN="${GITHUB_TOKEN:-}"
if [ -z "$TOKEN" ] && command -v gh >/dev/null 2>&1; then
  TOKEN="$(gh auth token 2>/dev/null || true)"
fi
if [ -z "$TOKEN" ]; then
  echo "ERROR: No GitHub token available." >&2
  echo "Set GITHUB_TOKEN or authenticate GitHub CLI with: gh auth login" >&2
  exit 1
fi

mkdir -p "$CONFIG_DIR" "$SYSTEMD_DIR"
umask 077

if [ ! -f "$INTEGRATIONS_FILE" ]; then
  cp "$ROOT/config/integrations.json" "$INTEGRATIONS_FILE"
  chmod 600 "$INTEGRATIONS_FILE"
  echo "Created local integration config: $INTEGRATIONS_FILE"
else
  echo "Keeping existing local integration config: $INTEGRATIONS_FILE"
fi

cat > "$ENV_FILE" <<EOF
GITHUB_TOKEN=$TOKEN
DEVCONTROL_OWNER=$OWNER
HOST=$HOST_VALUE
PORT=$PORT_VALUE
DEVCONTROL_INTEGRATIONS_FILE=$INTEGRATIONS_FILE
EOF
chmod 600 "$ENV_FILE"

NODE_BIN="$(command -v node)"
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=DevControl generic local-first project control console
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$ROOT
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_BIN $ROOT/server.mjs
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now devcontrol.service
systemctl --user restart devcontrol.service

URL="http://$HOST_VALUE:$PORT_VALUE/api/health"
for _ in $(seq 1 30); do
  if command -v curl >/dev/null 2>&1 && curl -fsS --max-time 2 "$URL" >/dev/null 2>&1; then
    echo "DevControl is running: http://$HOST_VALUE:$PORT_VALUE"
    echo "Integrations: $INTEGRATIONS_FILE"
    echo "Service: systemctl --user status devcontrol.service"
    exit 0
  fi
  sleep 0.25
done

echo "DevControl service was installed, but the health check did not pass yet." >&2
echo "Inspect: systemctl --user status devcontrol.service" >&2
echo "Logs:    journalctl --user -u devcontrol.service -n 100 --no-pager" >&2
exit 1
