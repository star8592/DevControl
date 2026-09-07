#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-probe}"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/devcontrol"
ENV_FILE="$CONFIG_DIR/env"
DEFAULT_FILE="$CONFIG_DIR/integrations.json"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

INTEGRATIONS_FILE="${DEVCONTROL_INTEGRATIONS_FILE:-$DEFAULT_FILE}"

case "$ACTION" in
  probe)
    if ! command -v codex >/dev/null 2>&1; then
      echo "Codex CLI: NOT FOUND"
      exit 2
    fi
    codex --version
    echo "Config: $INTEGRATIONS_FILE"
    ;;

  enable|disable)
    if [ "$ACTION" = "enable" ] && ! command -v codex >/dev/null 2>&1; then
      echo "ERROR: codex CLI is not installed or not in PATH." >&2
      exit 2
    fi
    if [ ! -f "$INTEGRATIONS_FILE" ]; then
      echo "ERROR: integration config not found: $INTEGRATIONS_FILE" >&2
      echo "Run: bash scripts/install-user-service.sh" >&2
      exit 2
    fi

    export DEVCONTROL_CODEX_ACTION="$ACTION"
    export DEVCONTROL_CODEX_CONFIG="$INTEGRATIONS_FILE"
    node <<'NODE'
const fs = require('fs');
const file = process.env.DEVCONTROL_CODEX_CONFIG;
const action = process.env.DEVCONTROL_CODEX_ACTION;
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!data.integrations || !data.integrations.codex) throw new Error('codex integration is missing');
const codex = data.integrations.codex;
codex.enabled = action === 'enable';
codex.mode = 'supervised';
codex.transport = 'local-cli';
codex.capabilities = ['plan', 'review'];
codex.allowProjectPathsOnly = true;
codex.allowArbitraryShell = false;
codex.requireApprovalFor = ['edit', 'test', 'push', 'merge', 'release', 'production-write'];
data.security = data.security || {};
data.security.bindLocalhostOnly = true;
data.security.browserNeverReceivesTokens = true;
data.security.rejectArbitraryCommandText = true;
data.security.auditEveryWriteAction = true;
data.security.defaultWritePolicy = 'deny';
fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
NODE
    chmod 600 "$INTEGRATIONS_FILE"
    systemctl --user restart devcontrol.service
    echo "Codex read-only adapter: ${ACTION^^}D"
    echo "Config: $INTEGRATIONS_FILE"
    if [ "$ACTION" = "enable" ]; then
      echo "Allowed: plan, review"
      echo "Sandbox: read-only"
      echo "Forbidden: arbitrary shell, edit, test, push, merge, release, production-write"
    fi
    ;;

  *)
    echo "Usage: $0 [probe|enable|disable]" >&2
    exit 2
    ;;
esac
