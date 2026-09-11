#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/devcontrol"
SYSTEMD_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
ENV_FILE="$CONFIG_DIR/env"
INTEGRATIONS_FILE="$CONFIG_DIR/integrations.json"
SERVICE_FILE="$SYSTEMD_DIR/devcontrol.service"
RECONCILE_SERVICE_FILE="$SYSTEMD_DIR/devcontrol-reconcile.service"
RECONCILE_TIMER_FILE="$SYSTEMD_DIR/devcontrol-reconcile.timer"
LOCAL_BIN="${HOME}/.local/bin"

# Preserve existing DevControl settings across upgrades.
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

OWNER="${DEVCONTROL_OWNER:-star8592}"
HOST_VALUE="${HOST:-127.0.0.1}"
PORT_VALUE="${PORT:-8787}"
DISCOVERY_ROOTS="${DEVCONTROL_DISCOVERY_ROOTS:-/mnt/disk1/Code:/mnt/disk2}"
DISCOVERY_MAX_DEPTH="${DEVCONTROL_DISCOVERY_MAX_DEPTH:-3}"
RECONCILE_INTERVAL="${DEVCONTROL_RECONCILE_INTERVAL_SEC:-60}"
QUALIFY_TIMEOUT="${DEVCONTROL_QUALIFY_TIMEOUT_MS:-900000}"
GODOT_BIN="${DEVCONTROL_GODOT_BIN:-godot}"
VISUAL_TIMEOUT="${DEVCONTROL_VISUAL_TIMEOUT_MS:-300000}"
GITHUB_FAILURE_ISSUES="${DEVCONTROL_GITHUB_FAILURE_ISSUES:-0}"
GITHUB_REPAIR_COMMENTS="${DEVCONTROL_GITHUB_REPAIR_PLAN_COMMENTS:-0}"
REPAIR_PLANNER="${DEVCONTROL_REPAIR_PLANNER:-heuristic}"
REPAIR_PLAN_TIMEOUT="${DEVCONTROL_REPAIR_PLAN_TIMEOUT_MS:-180000}"
AUTO_FIX="${DEVCONTROL_AUTO_FIX:-0}"
AUTO_FIX_TIMEOUT="${DEVCONTROL_AUTO_FIX_TIMEOUT_MS:-600000}"
AUTO_PUSH_REPAIR="${DEVCONTROL_AUTO_PUSH_REPAIR_BRANCH:-0}"
AUTO_CREATE_REPAIR_PR="${DEVCONTROL_AUTO_CREATE_REPAIR_PR:-0}"

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

mkdir -p "$CONFIG_DIR" "$SYSTEMD_DIR" "$ROOT/state" "$LOCAL_BIN"
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
DEVCONTROL_DISCOVERY_ROOTS=$DISCOVERY_ROOTS
DEVCONTROL_DISCOVERY_MAX_DEPTH=$DISCOVERY_MAX_DEPTH
DEVCONTROL_DISCOVERY_FILE=$ROOT/state/discovery.json
DEVCONTROL_STATE_DIR=$ROOT/state
DEVCONTROL_RECONCILE_INTERVAL_SEC=$RECONCILE_INTERVAL
DEVCONTROL_QUALIFY_TIMEOUT_MS=$QUALIFY_TIMEOUT
DEVCONTROL_GODOT_BIN=$GODOT_BIN
DEVCONTROL_VISUAL_TIMEOUT_MS=$VISUAL_TIMEOUT
DEVCONTROL_GITHUB_FAILURE_ISSUES=$GITHUB_FAILURE_ISSUES
DEVCONTROL_GITHUB_REPAIR_PLAN_COMMENTS=$GITHUB_REPAIR_COMMENTS
DEVCONTROL_REPAIR_PLANNER=$REPAIR_PLANNER
DEVCONTROL_REPAIR_PLAN_TIMEOUT_MS=$REPAIR_PLAN_TIMEOUT
DEVCONTROL_AUTO_FIX=$AUTO_FIX
DEVCONTROL_AUTO_FIX_TIMEOUT_MS=$AUTO_FIX_TIMEOUT
DEVCONTROL_AUTO_PUSH_REPAIR_BRANCH=$AUTO_PUSH_REPAIR
DEVCONTROL_AUTO_CREATE_REPAIR_PR=$AUTO_CREATE_REPAIR_PR
EOF
chmod 600 "$ENV_FILE"

NODE_BIN="$(command -v node)"
cat > "$LOCAL_BIN/devctl" <<EOF
#!/usr/bin/env bash
set -a
[ ! -f "$ENV_FILE" ] || . "$ENV_FILE"
set +a
exec "$NODE_BIN" "$ROOT/scripts/devctl.mjs" "\$@"
EOF
chmod 755 "$LOCAL_BIN/devctl"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=DevControl local-first multi-project control plane
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

cat > "$RECONCILE_SERVICE_FILE" <<EOF
[Unit]
Description=DevControl autonomous multi-project reconcile loop
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=$ROOT
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_BIN $ROOT/scripts/reconcile.mjs
NoNewPrivileges=true
PrivateTmp=true
Nice=5
EOF

cat > "$RECONCILE_TIMER_FILE" <<EOF
[Unit]
Description=Periodically reconcile all DevControl projects

[Timer]
OnBootSec=10s
OnUnitActiveSec=${RECONCILE_INTERVAL}s
AccuracySec=5s
Persistent=true
Unit=devcontrol-reconcile.service

[Install]
WantedBy=timers.target
EOF

systemctl --user disable --now \
  devcontrol-discovery.timer \
  devcontrol-qualify.timer \
  devcontrol-failure-report.timer >/dev/null 2>&1 || true

systemctl --user daemon-reload
systemctl --user enable --now devcontrol.service
systemctl --user enable --now devcontrol-reconcile.timer
systemctl --user start devcontrol-reconcile.service
systemctl --user restart devcontrol.service

URL="http://$HOST_VALUE:$PORT_VALUE/api/health"
for _ in $(seq 1 30); do
  if command -v curl >/dev/null 2>&1 && curl -fsS --max-time 2 "$URL" >/dev/null 2>&1; then
    echo "DevControl is running: http://$HOST_VALUE:$PORT_VALUE"
    echo "Autonomy:   http://$HOST_VALUE:$PORT_VALUE/autonomy.html"
    echo "CLI:        $LOCAL_BIN/devctl"
    echo "Reconcile:  every ${RECONCILE_INTERVAL}s"
    echo "Planner:    ${REPAIR_PLANNER} (PLAN_ONLY)"
    echo "Visual:     godot=${GODOT_BIN}; timeout=${VISUAL_TIMEOUT}ms; per-project opt-in"
    echo "AutoFix:    ${AUTO_FIX}; push repair branch=${AUTO_PUSH_REPAIR}; draft PR=${AUTO_CREATE_REPAIR_PR}"
    echo "State:      $ROOT/state"
    echo "Service:    systemctl --user status devcontrol.service"
    echo "Timer:      systemctl --user status devcontrol-reconcile.timer"
    exit 0
  fi
  sleep 0.25
done

echo "DevControl service was installed, but the health check did not pass yet." >&2
echo "Inspect: systemctl --user status devcontrol.service" >&2
echo "Logs:    journalctl --user -u devcontrol.service -n 100 --no-pager" >&2
exit 1