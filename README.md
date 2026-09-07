# DevControl

Local-first development portfolio console for `DaoLife`, `BISRE`, `CrossAlpha`, and `Tidebound`.

GitHub remains the control/audit plane. Self-hosted runners remain the authority for heavy qualification, research, release qualification, and local promotion.

## MVP capabilities

- one-page portfolio status for four repositories
- lightweight/web CI and self-hosted acceptance shown separately
- latest workflow run, branch and commit SHA
- open PR and Automation Dashboard visibility
- self-hosted runner visibility when GitHub permissions allow it
- blocker / next-action / project safety-boundary display
- automatic refresh every 15 seconds
- GitHub credential kept server-side only
- reversible `rerun failed jobs` control
- lightweight syntax + health CI for DevControl itself

## Run locally

Requires Node.js 20+.

```bash
git clone https://github.com/star8592/DevControl.git
cd DevControl

mkdir -p ~/.config/devcontrol
cat > ~/.config/devcontrol/env <<'EOF'
GITHUB_TOKEN=YOUR_FINE_GRAINED_TOKEN
DEVCONTROL_OWNER=star8592
HOST=127.0.0.1
PORT=8787
EOF

set -a
source ~/.config/devcontrol/env
set +a
node server.mjs
```

Open:

```text
http://127.0.0.1:8787
```

Health check:

```bash
curl http://127.0.0.1:8787/api/health
```

Portfolio JSON:

```bash
curl http://127.0.0.1:8787/api/status
```

## Token permissions

For the complete four-project view, use a fine-grained GitHub token with access to the relevant repositories.

Read capabilities used by the MVP:

- repository metadata
- Actions workflow runs
- issues
- pull requests
- runners, when permitted

Optional write capability:

- Actions: write — only required for the `rerun failed jobs` control

The token is never embedded into `public/index.html` and is not returned by `/api/status`.

## systemd user service

Copy `devcontrol.service.example` to your user unit directory and replace `/PATH/TO/DevControl`:

```bash
mkdir -p ~/.config/systemd/user
cp devcontrol.service.example ~/.config/systemd/user/devcontrol.service
systemctl --user daemon-reload
systemctl --user enable --now devcontrol.service
systemctl --user status devcontrol.service
```

The service binds to `127.0.0.1:8787` by default. If remote access is needed, keep DevControl bound to localhost and put it behind an authenticated reverse proxy rather than exposing it directly.

## Control model

Current control surface intentionally allows only reversible actions:

- refresh state
- open project Dashboard issue
- open latest Actions run
- rerun failed workflow jobs

High-risk controls are intentionally excluded:

- no automatic PR merge
- no Steam publishing / SteamPipe upload
- no BISRE Micro-Live or real-capital trading
- no frozen historical data mutation
- no CrossAlpha production-writer switchover
- no secret mutation

## Architecture

```text
Browser
  -> DevControl (localhost)
      -> GitHub API / control plane
          -> repository Actions / Issues / PRs
          -> self-hosted runner execution
              -> local qualification / research / release gates
                  -> result written back to GitHub
```

GitHub-hosted CI for DevControl itself is deliberately lightweight. Heavy project compute remains local/self-hosted.

## Roadmap

Track development in issue #1, `DevControl Dashboard / Roadmap`.

V0.2 priorities:

1. parse standardized project Dashboard comments for live `PHASE / BLOCKER / NEXT / COST`
2. queue-age and stale-run detection
3. runner heartbeat / offline alerts
4. Server-Sent Events for push-like updates
5. audited safe control adapters per project
6. logical pause/resume without bypassing project safety gates
