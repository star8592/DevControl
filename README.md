# DevControl

Local-first, configuration-driven project control console.

DevControl started with `DaoLife`, `BISRE`, `CrossAlpha`, and `Tidebound`, but the core is now generic: projects are loaded from `config/projects.json` instead of being hard-coded into the server.

GitHub remains the control/audit plane. Self-hosted runners remain the authority for heavy qualification, research, release qualification, and local promotion.

## Current capabilities

- configuration-driven project registry
- one-page multi-project portfolio status
- lightweight/web CI and self-hosted acceptance shown separately
- latest workflow run, branch and commit SHA
- open PR and Automation Dashboard visibility
- self-hosted runner visibility when GitHub permissions allow it
- live parsing of standardized Dashboard `STATUS / PHASE / BLOCKER / NEXT / COST`
- runner-offline and long-running/queued workflow warnings
- automatic refresh every 15 seconds
- GitHub credential kept server-side only
- reversible `rerun failed jobs` control
- lightweight syntax + health + portfolio aggregation CI for DevControl itself

## Add another project

Edit `config/projects.json` and add another object:

```json
{
  "key": "example",
  "name": "Example Project",
  "repo": "owner/repository",
  "dashboardIssue": 1,
  "phase": "Development",
  "nextAction": "Run the next safe gate",
  "lightWorkflows": ["CI"],
  "localWorkflows": ["Local Qualification"],
  "localPath": "/path/to/local/repository",
  "tags": ["example"],
  "safety": "Project-specific safety boundary."
}
```

Restart DevControl after changing the registry. A custom registry can also be selected with `DEVCONTROL_PROJECTS_FILE`.

## Fast local install

Requires Node.js 20+. If GitHub CLI is already authenticated, the installer can reuse `gh auth token`; otherwise export `GITHUB_TOKEN` first.

```bash
git clone https://github.com/star8592/DevControl.git
cd DevControl
bash scripts/install-user-service.sh
```

Then open:

```text
http://127.0.0.1:8787
```

Inspect service:

```bash
systemctl --user status devcontrol.service
journalctl --user -u devcontrol.service -n 100 --no-pager
```

## APIs

```bash
curl http://127.0.0.1:8787/api/health
curl http://127.0.0.1:8787/api/status
curl http://127.0.0.1:8787/api/projects
```

## Token permissions

For private repositories, use a fine-grained GitHub token with access to the relevant repositories.

Read capabilities currently used:

- repository metadata
- Actions workflow runs
- issues and comments
- pull requests
- runners, when permitted

Optional write capability:

- Actions: write — currently only required for the reversible `rerun failed jobs` control

The token is never embedded into `public/index.html` and is not returned by `/api/status`. The installer stores it in `~/.config/devcontrol/env` with mode `600`.

## Integration Bridge

AI and local applications are planned as capability-scoped adapters instead of unrestricted shell execution.

See `docs/INTEGRATIONS.md` and `config/integrations.example.json`.

Recommended priorities on a Linux control host:

1. Codex CLI adapter for bounded coding tasks
2. OpenAI API chat/planning adapter
3. optional local OpenAI-compatible model for low-risk summaries/triage
4. read-only `git` / `gh` adapters
5. editor launcher such as VS Code
6. OS-specific GUI launchers only as optional conveniences

The browser must never be able to submit arbitrary shell commands. Project paths come from the trusted registry, write actions are deny-by-default, and every write action should be auditable.

## Control model

Current control surface intentionally allows only reversible actions:

- refresh state
- open project Dashboard issue / latest parsed status comment
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
  -> DevControl Core (localhost)
      -> Project Registry
      -> Provider adapters
          -> GitHub API / Issues / PRs / Actions
          -> self-hosted runner execution
      -> Integration Bridge
          -> Codex / OpenAI / local model
          -> git / gh / editor launchers
      -> Audit + approval policy
```

The service binds to `127.0.0.1:8787` by default. If remote access is needed, keep DevControl bound to localhost and put it behind an authenticated reverse proxy rather than exposing it directly.

GitHub-hosted CI for DevControl itself is deliberately lightweight. Heavy project compute remains local/self-hosted.

## Roadmap

Track development in issue #1, `DevControl Dashboard / Roadmap`.

Current priorities:

1. integration registry + safe local bridge
2. audit log for every control action
3. Server-Sent Events for push-like updates
4. Codex task adapter
5. project-level pause/resume and approval policies
6. provider adapters beyond GitHub
