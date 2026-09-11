# DevControl

Local-first, AI-ready multi-project development control plane.

DevControl discovers repositories on the workstation, matches GitHub remotes, classifies each
project, infers low-risk qualification commands, safely fast-forwards clean projects, executes
local qualification, learns project-specific playbooks, quarantines bad synced SHAs, rolls back
only DevControl-owned failed updates, creates standardized AI failure packets, produces repair
plans, and can optionally attempt isolated repairs without touching the project's main checkout.

GitHub is the control/audit plane. The local workstation remains the authority for heavy
qualification, GPU/Godot/Blender work, research, and runtime acceptance.

## V0.8 autonomous loop

```text
discover local repositories
  -> infer stack + safe qualification
  -> OBSERVE / SHADOW / QUALIFY / MANAGED
  -> safe fast-forward sync
  -> refresh discovery
  -> local qualification
  -> PASS: mark known-good
  -> FAIL after DevControl-owned sync:
       quarantine bad SHA
       rollback original checkout to previous clean SHA
  -> learn command reliability / cost
  -> AI failure packet
  -> PLAN_ONLY repair plan
  -> optional isolated AUTO_FIX worktree
       Codex workspace-write only in repair worktree
       block risky changed paths
       failed command must pass
       every safe qualification command must pass
       create dedicated local repair commit/branch
       optional repair-branch push
       NEVER auto-merge
  -> refresh Autonomy Dashboard
```

The loop is serialized by one `devcontrol-reconcile.timer`; there are no competing discovery,
qualification and reporter timers.

## Default behavior vs explicit opt-in

Safe defaults:

```text
automatic discovery                      ON
automatic safe fast-forward sync         ON for eligible projects
automatic local qualification            ON for eligible projects
known-good / quarantine / rollback       ON
AI failure packet generation             ON
heuristic PLAN_ONLY repair planning      ON
GitHub failure issues                    OFF
GitHub repair-plan comments              OFF
Codex read-only repair planner            OFF
automatic code modification              OFF
repair branch push                       OFF
automatic merge                          NEVER
production/deploy/publish/trading        NEVER
```

The two most important write switches are deliberately separate:

```bash
DEVCONTROL_AUTO_FIX=0
DEVCONTROL_AUTO_PUSH_REPAIR_BRANCH=0
```

Turning on AutoFix does not enable push. Turning on push never enables merge.

## Safety boundaries

DevControl does **not** run arbitrary discovered commands.

Only commands inferred by discovery and admitted by the autonomy policy can enter the automatic
executor. Deployment, publishing, production, live-money, trading, wallet, release, Steam, or
secret-related commands are excluded from automatic qualification.

Automatic Git sync is allowed only when:

- the working tree is clean;
- HEAD is on a named branch;
- the remote update is a strict fast-forward;
- the target SHA is not quarantined.

Automatic rollback is allowed only when the failing SHA was just fast-forwarded by DevControl
and the checkout is still clean and unchanged. Local uncommitted work is never hard-reset.

DevControl itself is always `OBSERVE`: the control plane never automatically syncs, qualifies,
or repairs its own checkout.

## Isolated AutoFix

AutoFix is experimental and disabled by default.

When explicitly enabled, DevControl does **not** let Codex edit the ordinary project checkout.
It creates:

```text
state/worktrees/<project>/<failure-signature>/
```

from the exact failed SHA and creates a dedicated branch:

```text
devcontrol/repair/<project>-<signature>
```

Codex is invoked in `workspace-write` sandbox mode inside that worktree. Its environment is
scrubbed of variables whose names resemble tokens, keys, secrets, passwords, cookies,
authorization, or credentials.

Phase-one AutoFix blocks candidate commits when changes touch high-risk paths such as CI/CD,
deployment/release/Steam/production/secrets or dependency manifest/lock files. It is intended for
small source/test repairs, not environment migrations or release engineering.

A candidate is committed only after:

1. the exact failed command passes;
2. all remaining safe qualification commands pass.

The default result is a **local repair branch and commit**. Optional branch push is controlled by:

```bash
DEVCONTROL_AUTO_PUSH_REPAIR_BRANCH=1
```

DevControl never auto-merges that branch.

## Repair Supervisor

Every failure packet gets a deterministic PLAN_ONLY repair plan. By default this uses no external
AI:

```bash
DEVCONTROL_REPAIR_PLANNER=heuristic
```

To let Codex inspect the actual repository in a read-only sandbox while producing the plan:

```bash
DEVCONTROL_REPAIR_PLANNER=codex
```

This planning phase does not modify files, create commits, push, merge, deploy, publish, release,
or change production state.

Repair plans are stored under:

```text
state/repair-plans/
```

AutoFix attempts are stored under:

```text
state/repair-attempts/
```

## GitHub / ChatGPT bridge

Local failure packets are always generated. GitHub writes are opt-in:

```bash
DEVCONTROL_GITHUB_FAILURE_ISSUES=1
DEVCONTROL_GITHUB_REPAIR_PLAN_COMMENTS=1
```

With both enabled, DevControl creates one deduplicated failure issue per failure signature and
adds one deduplicated repair-plan comment to that same issue. This gives ChatGPT/GitHub a compact,
standardized handoff containing the failing SHA/command, redacted evidence, history, repair plan,
and acceptance gates.

## Zero-config discovery

Default scan roots:

```text
/mnt/disk1/Code
/mnt/disk2
```

Override with:

```bash
DEVCONTROL_DISCOVERY_ROOTS=/mnt/disk1/Code:/mnt/disk2
DEVCONTROL_DISCOVERY_MAX_DEPTH=3
```

Detected stacks currently include Rust, Python, Node.js, Godot, Go, JVM, and CMake.

Projects can still be explicitly registered in `config/projects.json`, but new repositories do
not need manual registration before DevControl can observe and classify them.

## Autonomous levels

```text
BLOCKED   registry/path conflict or hard safety boundary
OBSERVE   collect metadata only
SHADOW    observe and learn; do not execute qualification
QUALIFY   high-confidence safe project; automatic qualification allowed
MANAGED   registered project with safe inferred qualification commands
```

## Fast install / upgrade

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
~/.local/bin/devctl
```

The `devctl` wrapper loads the same `~/.config/devcontrol/env` used by systemd, so interactive CLI
and background reconcile use the same canonical settings.

## Unified CLI

```bash
devctl status
devctl local

devctl discover
devctl sync --managed
devctl qualify --managed
devctl reconcile

devctl failures
devctl repairs
devctl auto-fix

devctl quarantine-clear <project>
devctl check
```

`devctl local` is the quickest machine-level view of discovery, autonomy, latest qualification,
known-good SHA, quarantine, learned playbook, AI failure packets, repair plans, and AutoFix
attempts.

## Dashboards

GitHub / CI dashboard:

```text
http://127.0.0.1:8787/
```

Autonomous local-development dashboard:

```text
http://127.0.0.1:8787/autonomy.html
```

The Autonomy Dashboard is rebuilt at the end of every reconcile cycle from local generated state.
Its data snapshot is ignored by git.

## Project Learner

Every qualification updates `state/playbooks.json` with per-command:

```text
samples
passes
failures
timeouts
pass rate
average duration
latest exit status
```

Qualification order can therefore prefer historically reliable and cheaper gates while staying
inside the discovery/autonomy allowlist.

## AI failure queue

Failed qualifications become standardized packets under `state/ai-queue/` with:

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

## Generated local state

All operational state stays under `state/` and is ignored by git:

```text
state/
├── discovery.json
├── project-lifecycle.json
├── playbooks.json
├── latest/
├── executions/
├── ai-queue/
├── repair-plans/
├── repair-attempts/
├── repair-validation/
├── worktrees/
├── reported-failures.json
├── reported-repair-plans.json
└── events.ndjson
```

## Configuration

The canonical service/CLI environment is `~/.config/devcontrol/env`.

Key settings:

```bash
DEVCONTROL_RECONCILE_INTERVAL_SEC=60
DEVCONTROL_QUALIFY_TIMEOUT_MS=900000

DEVCONTROL_GITHUB_FAILURE_ISSUES=0
DEVCONTROL_GITHUB_REPAIR_PLAN_COMMENTS=0

DEVCONTROL_REPAIR_PLANNER=heuristic
DEVCONTROL_REPAIR_PLAN_TIMEOUT_MS=180000

DEVCONTROL_AUTO_FIX=0
DEVCONTROL_AUTO_FIX_TIMEOUT_MS=600000
DEVCONTROL_AUTO_PUSH_REPAIR_BRANCH=0
```

Re-run `scripts/install-user-service.sh` after changing timer settings. For other EnvironmentFile
values, the next oneshot reconcile reads the updated file automatically.

## Systemd operations

```bash
systemctl --user status devcontrol.service
systemctl --user status devcontrol-reconcile.timer
systemctl --user list-timers 'devcontrol-*'

journalctl --user -u devcontrol.service -f
journalctl --user -u devcontrol-reconcile.service -n 200 --no-pager
```

## Architecture

```text
GitHub / ChatGPT
       ↕
DevControl Core (localhost)
  ├── Automatic Discovery
  ├── Autonomy Policy
  ├── Safe Git Lifecycle
  │    ├── fast-forward only
  │    ├── known-good
  │    ├── quarantine
  │    └── rollback
  ├── Unified Executor
  ├── Project Learner
  ├── Failure Intelligence
  ├── PLAN_ONLY Repair Supervisor
  ├── Isolated AutoFix (opt-in)
  │    ├── repair worktree
  │    ├── workspace-write sandbox
  │    ├── risky-path gate
  │    ├── failed-command gate
  │    └── full qualification gate
  ├── Integration Bridge
  └── Dashboards
       ↕
Local projects
  ├── Rust / Python / Node
  ├── Godot / GPU / Blender
  ├── research systems
  └── future projects
```

The service binds to `127.0.0.1:8787` by default. Keep it localhost-only unless placed behind an
authenticated reverse proxy.

## Next direction

The next step is supervised repair branch publication and PR orchestration: a validated local
repair candidate may be pushed on its dedicated branch and opened as a PR, but merge remains a
separate approval boundary. Project-specific visual/GPU acceptance adapters will also move into
the learner so Godot projects can treat real renderer screenshots as first-class qualification
artifacts instead of relying only on headless tests.
