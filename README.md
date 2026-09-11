# DevControl

Local-first, AI-ready multi-project development control plane.

DevControl is designed for one workstation running many repositories. It discovers projects,
matches GitHub remotes, infers low-risk qualification commands, safely fast-forwards eligible
clean checkouts, executes local qualification, learns project-specific playbooks, quarantines bad
synced SHAs, rolls back only DevControl-owned failed updates, packages failures for AI analysis,
and can optionally take a repair all the way to a locally validated **Draft PR** without granting
it merge or production authority.

For Godot projects, V0.12 adds an explicit opt-in **Visual Qualification Gate**. Code/tests and
real renderer evidence now form one final qualification result, so a project cannot become
known-good merely because headless tests pass while its captured production frame fails.

GitHub is the control/audit plane. The local workstation remains the authority for heavy
qualification, GPU/Godot/Blender work, runtime acceptance, visual evidence, and known-good
promotion.

## V0.12 autonomous loop

```text
local disks / GitHub
  -> automatic repository discovery
       -> stack + safe-command inference
       -> nested project.godot discovery (depth <= 2 inside each Git repo)
  -> OBSERVE / SHADOW / QUALIFY / MANAGED
  -> safe fast-forward sync
  -> Code Gate
  -> optional registered Visual Gate
       Godot Forward+ / selected GPU
       requested capture resolution
       PNG frame evidence
       renderer/GPU evidence from logs
       process / frame / resolution / Vulkan / GPU gates
  -> one final qualification result
       PASS -> known-good
       FAIL after DevControl-owned sync -> quarantine + safe rollback
  -> Project Learner
  -> AI Failure Packet
       command or structured visual evidence
  -> PLAN_ONLY Repair Supervisor
  -> optional isolated AutoFix worktree
       -> blocked-path gate
       -> Code Gate PASS
       -> Visual Gate PASS when enabled
       -> one local devcontrol/repair/* commit
  -> optional push repair branch
  -> optional Draft PR
  -> read-only PR Review Gate
       AWAITING_CI / CI_FAILED / REVIEWABLE / STALE / CLOSED / MERGED
  -> after MERGED: normal main sync + full qualification
  -> only qualified merged main becomes known-good
  -> safe local repair-worktree cleanup
  -> Autonomy Dashboard
```

The loop is serialized by one `devcontrol-reconcile.timer`, avoiding races between discovery,
sync, qualification, reporting, repair and cleanup.

## Safe defaults

```text
automatic discovery                         ON
automatic safe fast-forward sync            ON for eligible projects
automatic local qualification               ON for eligible projects
Godot Visual Gate                           OFF per project until explicit opt-in
known-good / quarantine / owned rollback    ON
AI failure packet generation                ON
heuristic PLAN_ONLY repair planning         ON
GitHub failure issues                       OFF
GitHub repair-plan comments                 OFF
Codex read-only repair planner              OFF
automatic code modification                 OFF
repair branch push                          OFF
Draft PR creation                           OFF
automatic approve / merge                   NEVER
production/deploy/release/Steam/trading     NEVER
```

External repair writes have independent switches:

```bash
DEVCONTROL_AUTO_FIX=0
DEVCONTROL_AUTO_PUSH_REPAIR_BRANCH=0
DEVCONTROL_AUTO_CREATE_REPAIR_PR=0
```

Turning on one does not silently grant the next authority layer.

## Visual Qualification Gate

Visual execution is **not** enabled merely because DevControl discovers a Godot project. The
registered project must explicitly set `visualQualification.enabled=true`.

Before enabling anything, run the read-only probe:

```bash
devctl discover
devctl visual-probe
```

The probe invokes only `godot --version`; it does not start the project. Its states include:

```text
NOT_APPLICABLE      not a discovered Godot project
GODOT_UNAVAILABLE   configured Godot executable cannot be probed
NEEDS_OPT_IN        Godot is available but visual execution is disabled
NEEDS_PROJECT_PATH  policy is enabled but multiple/no Godot roots make selection ambiguous
READY               executable and project-root policy are ready for capture
```

A project can then opt in through `config/projects.json`:

```json
{
  "visualQualification": {
    "enabled": true,
    "adapter": "godot-vulkan-frame-capture",
    "renderer": "forward_plus",
    "gpuIndex": 0,
    "frames": 90,
    "fps": 30,
    "minFrames": 1,
    "minWidth": 1920,
    "minHeight": 1080,
    "minBytes": 4096,
    "headless": true,
    "requireVulkan": true,
    "gpuPattern": "NVIDIA"
  }
}
```

`projectPath` may be omitted when discovery finds exactly one `project.godot` root. If more than
one root exists, DevControl refuses to guess and requires an explicit relative `projectPath`.

The V0.12 Godot adapter uses engine CLI capabilities instead of injecting project-specific capture
code. It starts the configured project with `forward_plus`, selected `gpuIndex`, requested
resolution, fixed FPS, bounded frame count, verbose logging and `--write-movie ...png`. It then
reads the generated PNG headers back and checks the actual frame dimensions/size. Renderer and GPU
evidence must also satisfy the configured gates.

Visual evidence is stored locally under:

```text
state/visual/<project>/<qualification-run-id>/
├── capture*.png
├── godot.log
├── capture.log
└── visual-result.json
```

A visual failure changes the **whole** qualification to FAIL with a gate such as:

```text
visual:godot-vulkan-frame-capture
```

The Failure Packet contains gate results, failure reasons, requested renderer/resolution and frame
metadata. If isolated AutoFix is later enabled, its repaired worktree must pass the same visual gate
before it can become `CANDIDATE_READY`.

Current central templates for DaoLife, DanDao and Tidebound are staged but remain `enabled:false`.
The intended rollout is probe first, then enable one project at a time after the real local Godot
root/version is confirmed.

## Safety boundaries

DevControl never treats arbitrary repository scripts as trusted automation. Only commands inferred
by discovery and admitted by the autonomy policy can enter automatic qualification. Deployment,
publishing, production, live-money, trading, wallet, release, Steam and secret-related actions are
excluded.

Visual policy is also constrained: V0.12 accepts only the built-in
`godot-vulkan-frame-capture` adapter, validates project paths and numeric limits, and restricts a
custom Godot executable to a Godot-named binary. Secret-like environment variables are removed
before the renderer process is started.

Automatic Git sync requires a clean named branch, strict fast-forward ancestry and a non-
quarantined target SHA. Automatic rollback is allowed only when DevControl itself just performed
the clean fast-forward that subsequently failed qualification. Local uncommitted work is never
hard-reset.

DevControl itself is always `OBSERVE`: the control plane cannot automatically sync, qualify or
repair its own checkout.

## Repair safety model

AutoFix is experimental and disabled by default. When enabled, Codex edits only an isolated Git
worktree under `state/worktrees/` and never the ordinary project checkout. Credentials are removed
from its environment and high-risk paths are denied, including CI/CD, deploy/release/Steam,
production/secrets, `.env`, dependency manifests and lockfiles.

A repair becomes a candidate only after the original failure gate and every remaining safe
qualification gate pass. For projects with Visual Qualification enabled, that includes the real
renderer gate. Before branch push, DevControl re-verifies real Git provenance:

- worktree HEAD and repair branch match the recorded candidate;
- the worktree is clean and registered by Git;
- `origin` matches the expected GitHub repository;
- repair SHA descends from the failed SHA;
- exactly one DevControl repair commit exists;
- committed diff paths exactly match the validated path set;
- the actual committed diff is rechecked against the risky-path denylist.

Draft PRs are never automatically marked ready, approved or merged.

## Read-only PR Review Gate

`devctl repair-review` reads the recorded Draft PR and GitHub checks and classifies it:

```text
AWAITING_CI   no checks yet or checks still pending
CI_FAILED     a check/status failed, timed out, was cancelled, or needs action
REVIEWABLE    repair SHA/branch still match and every observed check passes
STALE         head drift, base lag, or merge conflicts
CLOSED        closed without merge
MERGED        merged on GitHub
ERROR         review inspection failed
```

`REVIEWABLE` means only “ready for human/ChatGPT review.” It is never merge authorization.

## Post-merge cleanup

A GitHub `MERGED` state is not trusted as known-good. A later reconcile must first sync normal
main, run its normal local qualification (including Visual Gate when enabled), and promote that
exact mainline SHA to `knownGoodSha`. Only then can DevControl remove the local repair worktree and
local `devcontrol/repair/*` branch. The remote repair branch is retained by default.

Cleanup additionally verifies the worktree real path, Git worktree registration, repair HEAD and
branch so a modified state file or symlink cannot redirect deletion outside `state/worktrees/`.

## Zero-config discovery

Default roots:

```text
/mnt/disk1/Code
/mnt/disk2
```

Override with:

```bash
DEVCONTROL_DISCOVERY_ROOTS=/mnt/disk1/Code:/mnt/disk2
DEVCONTROL_DISCOVERY_MAX_DEPTH=3
```

Detected stacks include Rust, Python, Node.js, Godot, Go, JVM, and CMake. Within a discovered Git
repository, V0.12 also searches up to two directory levels for nested `project.godot` roots so
mixed Rust/Godot repositories are represented as one project rather than split into unrelated
checkouts.

Projects may still be registered explicitly in `config/projects.json`, but new repositories do not
need registration before DevControl can observe and classify them.

## Autonomy levels

```text
BLOCKED   registry/path conflict or hard safety boundary
OBSERVE   metadata only
SHADOW    observe and learn; no qualification execution
QUALIFY   high-confidence project with safe automatic qualification
MANAGED   registered project with safe inferred qualification commands
```

## Install / upgrade

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

The wrapper loads the same `~/.config/devcontrol/env` used by systemd.

## Unified CLI

```bash
devctl status
devctl local

devctl discover
devctl visual-probe
devctl sync --managed
devctl qualify --managed
devctl reconcile

devctl failures
devctl repairs
devctl auto-fix
devctl repair-publish
devctl repair-review
devctl repair-cleanup

devctl quarantine-clear <project>
devctl check
```

## Dashboards

```text
GitHub / CI:       http://127.0.0.1:8787/
Autonomy pipeline: http://127.0.0.1:8787/autonomy.html
```

The Autonomy Dashboard is regenerated at the end of every reconcile cycle. Its data snapshot is
ignored by git and includes discovered Godot roots, Visual policy/result/evidence counts,
qualification, known-good/quarantine, learner history, Failure Packets, Repair Plans, AutoFix
attempts, Repair Candidates, Draft PR review state and post-merge cleanup state.

## Project Learner

Each command qualification updates `state/playbooks.json` with command samples,
pass/fail/timeout counts, pass rate, average duration and latest result. The final project
qualification may still fail afterward at the Visual Gate; known-good promotion uses the final
combined result, not the preliminary command result.

## GitHub / ChatGPT bridge

Local failure packets and repair plans are always generated. GitHub reporting is opt-in:

```bash
DEVCONTROL_GITHUB_FAILURE_ISSUES=0
DEVCONTROL_GITHUB_REPAIR_PLAN_COMMENTS=0
```

When enabled, ChatGPT can consume compact GitHub issues/comments containing the failing SHA,
gate, redacted evidence, visual metadata when relevant, history, repair plan and acceptance gates
without you copying terminal logs manually.

## Generated local state

```text
state/
├── discovery.json
├── project-lifecycle.json
├── playbooks.json
├── latest/
├── executions/
├── visual/
├── ai-queue/
├── repair-plans/
├── repair-attempts/
├── repair-candidates/
├── repair-reviews/
├── repair-cleanups/
├── repair-validation/
├── worktrees/
├── reported-failures.json
├── reported-repair-plans.json
└── events.ndjson
```

All operational state is ignored by git.

## Configuration

Canonical configuration: `~/.config/devcontrol/env`.

```bash
DEVCONTROL_RECONCILE_INTERVAL_SEC=60
DEVCONTROL_QUALIFY_TIMEOUT_MS=900000
DEVCONTROL_GODOT_BIN=godot
DEVCONTROL_VISUAL_TIMEOUT_MS=300000

DEVCONTROL_REPAIR_PLANNER=heuristic
DEVCONTROL_REPAIR_PLAN_TIMEOUT_MS=180000

DEVCONTROL_AUTO_FIX=0
DEVCONTROL_AUTO_FIX_TIMEOUT_MS=600000
DEVCONTROL_AUTO_PUSH_REPAIR_BRANCH=0
DEVCONTROL_AUTO_CREATE_REPAIR_PR=0
```

## Operations

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
DevControl Core
  ├── Automatic Discovery + Autonomy Policy
  │    └── nested Godot root discovery
  ├── Safe Git Lifecycle
  │    ├── fast-forward only
  │    ├── known-good
  │    ├── quarantine
  │    └── owned rollback
  ├── Qualification Pipeline
  │    ├── safe command gates
  │    └── opt-in Godot Visual Gate
  │         ├── Forward+ / GPU selection
  │         ├── bounded frame capture
  │         ├── PNG evidence verification
  │         └── renderer/GPU/resolution gates
  ├── Project Learner
  ├── Failure Intelligence
  ├── PLAN_ONLY Repair Supervisor
  ├── Isolated AutoFix (opt-in; same qualification pipeline)
  ├── Repair Candidate Publisher (opt-in)
  ├── Read-only PR Review Gate
  ├── Post-merge Mainline Qualification Gate
  ├── Safe Local Repair Cleanup
  ├── Integration Bridge
  └── Dashboards
       ↕
Local projects
  ├── Rust / Python / Node
  ├── Godot / GPU / Blender
  ├── research systems
  └── future repositories
```

The service binds to `127.0.0.1:8787` by default. Keep it localhost-only unless placed behind an
authenticated reverse proxy.

See `docs/AUTODISCOVERY.md`, `docs/INTEGRATIONS.md`, and `docs/REPAIR_CANDIDATES.md` for detailed
policies.
