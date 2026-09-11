# DevControl

Local-first, AI-ready multi-project development control plane.

DevControl discovers repositories on the workstation, matches GitHub remotes, classifies each
project, infers low-risk qualification commands, safely fast-forwards clean projects, executes
local qualification, learns project-specific playbooks, quarantines bad synced SHAs, rolls back
only DevControl-owned failed updates, and creates standardized AI failure packets.

GitHub is the control/audit plane. The local workstation remains the authority for heavy
qualification, GPU/Godot/Blender work, research, and runtime acceptance.

## V0.6 autonomous loop

```text
discover local repositories
  -> infer stack + safe qualification
  -> OBSERVE / SHADOW / QUALIFY / MANAGED
  -> safe fast-forward sync
  -> refresh discovery
  -> local qualification
  -> PASS: mark known-good
  -> FAIL after DevControl sync:
       quarantine bad SHA
       rollback to previous clean SHA
  -> learn command reliability and duration
  -> generate AI failure packet
  -> refresh Autonomy Dashboard
```

The loop is serialized by one `devcontrol-reconcile.timer`. This replaces the older independent
discovery / qualification / failure-report timers and avoids state races.

## Safety boundaries

DevControl does **not** run arbitrary discovered commands.

Only commands inferred by the discovery layer and admitted by the autonomy policy can enter the
automatic executor. Commands with deployment, publishing, production, live-money, trading,
wallet, release, Steam, or secret-related risk are not automatically executed.

Automatic Git sync is allowed only when:

- the working tree is clean;
- HEAD is on a named branch;
- the remote update is a strict fast-forward;
- the target SHA is not quarantined.

Automatic rollback is allowed only when the failing SHA was just fast-forwarded by DevControl
and the checkout is still clean and unchanged. Local uncommitted work is never hard-reset.

DevControl itself is always `OBSERVE`: the control plane never automatically syncs or qualifies
its own checkout.

## Zero-config discovery

The default scan roots are:

```text
/mnt/disk1/Code
/mnt/disk2
```

Override them with:

```bash
DEVCONTROL_DISCOVERY_ROOTS=/mnt/disk1/Code:/mnt/disk2
DEVCONTROL_DISCOVERY_MAX_DEPTH=3
```

Detected stacks currently include Rust, Python, Node.js, Godot, Go, JVM, and CMake.

A project may still be explicitly registered in `config/projects.json`, but new repositories do
not need to be manually added before DevControl can observe and classify them.

## Autonomous levels

```text
BLOCKED   registry/path conflict or hard safety boundary
OBSERVE   collect metadata only
SHADOW    observe and learn; do not execute qualification
QUALIFY   high-confidence safe project; automatic qualification allowed
MANAGED   registered project with safe inferred qualification commands
```

## Fast local install / upgrade

Requires Node.js 20+ and an authenticated `gh` CLI or `GITHUB_TOKEN`.

```bash
cd /mnt/disk1/Code/DevControl
git fetch origin main
git checkout main
git pull --ff-only

npm run check
bash scripts/install-user-service.sh
```

The installer creates:

```text
devcontrol.service
devcontrol-reconcile.timer
```

It also disables the legacy:

```text
devcontrol-discovery.timer
devcontrol-qualify.timer
devcontrol-failure-report.timer
```

## Unified CLI

The installer creates `~/.local/bin/devctl`.

```bash
devctl status
devctl local

devctl discover
devctl sync --managed
devctl qualify --managed
devctl reconcile

devctl failures
devctl quarantine-clear <project>

devctl check
```

`devctl local` is the quickest machine-level view of discovery, autonomy, last qualification,
known-good SHA, quarantine state, playbook statistics, and queued AI failure packets.

## Dashboards

Main GitHub / CI dashboard:

```text
http://127.0.0.1:8787/
```

Autonomous local development dashboard:

```text
http://127.0.0.1:8787/autonomy.html
```

The Autonomy Dashboard shows:

- every discovered project;
- autonomy level;
- current SHA and dirty state;
- known-good SHA;
- sync / quarantine state;
- latest local qualification;
- learned run pass rate;
- inferred safe commands;
- AI failure packet count.

Its JSON snapshot is generated locally by each reconcile cycle and is ignored by git.

## Project Learner

Every qualification updates `state/playbooks.json`.

For each safe command DevControl learns:

```text
samples
passes
failures
timeouts
pass rate
average duration
latest exit status
```

Future qualification order prefers commands with better historical reliability, fewer timeouts,
and lower execution cost while remaining inside the discovery/autonomy allowlist.

## AI failure queue

Failed qualifications become standardized packets under:

```text
state/ai-queue/
```

A packet contains:

```text
project / repository
SHA / run ID
failed command
failure categories
redacted log excerpt
historical pass rate
command statistics
reproduction cwd + command
```

GitHub issue creation is opt-in:

```bash
DEVCONTROL_GITHUB_FAILURE_ISSUES=1
```

The default is local-only to avoid issue spam.

## State

All generated operational state stays under `state/` and is ignored by git:

```text
state/
├── discovery.json
├── project-lifecycle.json
├── playbooks.json
├── latest/
├── executions/
├── ai-queue/
├── events.ndjson
└── reported-failures.json
```

The lifecycle file carries `knownGoodSha`, pending DevControl-owned sync, quarantine state, and
the last qualification outcome.

## Current GitHub / Integration capabilities

The original DevControl control plane remains available:

- configuration-driven project registry;
- portfolio status;
- GitHub workflow, PR, issue, and runner visibility;
- Dashboard comment parsing;
- Server-Sent Events;
- reversible `rerun failed jobs`;
- Integration Bridge with deny-by-default write policy;
- local audit log;
- Codex/OpenAI/local-tool adapter path.

See `docs/INTEGRATIONS.md`.

## Systemd operations

```bash
systemctl --user status devcontrol.service
systemctl --user status devcontrol-reconcile.timer
systemctl --user list-timers 'devcontrol-*'

journalctl --user -u devcontrol.service -f
journalctl --user -u devcontrol-reconcile.service -n 200 --no-pager
```

The default reconcile interval is 60 seconds:

```bash
DEVCONTROL_RECONCILE_INTERVAL_SEC=60
DEVCONTROL_QUALIFY_TIMEOUT_MS=900000
```

Re-run `scripts/install-user-service.sh` after changing timer settings.

## Architecture

```text
GitHub
  ↕
DevControl Core (localhost)
  ├── Project Registry
  ├── Automatic Discovery
  ├── Autonomy Policy
  ├── Safe Sync Lifecycle
  │    ├── known-good
  │    ├── quarantine
  │    └── rollback
  ├── Unified Executor
  ├── Project Learner
  ├── Failure Intelligence
  ├── AI Queue
  ├── Integration Bridge
  └── Dashboards
       ↕
Local projects
  ├── Rust / Python / Node
  ├── Godot / GPU
  ├── research systems
  └── future projects
```

The service binds to `127.0.0.1:8787` by default. Keep it localhost-only unless placed behind an
authenticated reverse proxy.

## Direction

The next layer is AI Planner / Repair Supervisor: consume failure packets plus the learned
project playbook, propose the smallest repair, push a new GitHub commit, and let the same
reconcile loop validate it locally. The policy boundary remains: AI may automate development
work, but high-risk deploy/publish/trading/release actions stay outside automatic execution.
