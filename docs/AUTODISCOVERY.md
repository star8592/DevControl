# DevControl Autodiscovery and Autonomy

## Goal

DevControl should manage a machine full of projects without requiring a hand-written registry entry for every repository.

The discovery plane is deliberately separate from the execution plane:

```text
filesystem roots
  -> git repository discovery
  -> GitHub remote matching
  -> stack fingerprinting
  -> safe command inference
  -> confidence + risk scoring
  -> autonomy planner
  -> OBSERVE / SHADOW / QUALIFY / MANAGED / BLOCKED
```

Discovery never treats a guessed command as permission to deploy, publish, release, trade, move money, expose secrets, or perform another irreversible action.

## Scan roots

Default roots:

```text
/mnt/disk1/Code
/mnt/disk2
```

Override them with:

```bash
export DEVCONTROL_DISCOVERY_ROOTS=/mnt/disk1/Code:/mnt/disk2:/home/master/projects
export DEVCONTROL_DISCOVERY_MAX_DEPTH=3
npm run discover
```

The generated local report is written to `state/discovery.json` and is intentionally git-ignored.

## What is detected

V0.4 identifies Git repositories and fingerprints common project types from evidence already present on disk:

- Rust: `Cargo.toml`
- Python: `pyproject.toml`
- Node: `package.json`
- Godot: `project.godot`
- C/C++: `CMakeLists.txt`
- Go: `go.mod`
- JVM: Maven/Gradle markers
- existing project-local autonomous loops: `scripts/auto_dev.sh`
- GitHub workflow presence: `.github/workflows`

For each project it records:

- local path;
- GitHub `owner/name` when the origin remote is GitHub;
- current branch and SHA;
- dirty working-tree state;
- detected stacks;
- evidence used for inference;
- discovery confidence;
- proposed qualification commands with command-level confidence;
- risk flags;
- relationship to the existing static registry.

## Safe qualification inference

Only conventionally non-destructive checks are proposed automatically.

Examples:

```text
Rust   -> cargo check --workspace
          cargo test --workspace
Python -> python -m pytest -q
          python -m ruff check .
Node   -> npm run check
          npm test
Go     -> go test ./...
Godot  -> godot --headless --path . --quit
```

A command is not automatically considered safe merely because its name came from `package.json` or a Makefile. Scripts named `deploy`, `publish`, and `release` are explicitly risk flagged and are never auto-run by discovery.

## Autonomy levels

### OBSERVE

DevControl found a repository but lacks enough evidence for autonomous qualification. It may collect metadata and health/log information only.

Typical causes:

- no GitHub remote;
- discovery confidence below 0.70.

### SHADOW

DevControl understands the project but does not execute inferred qualification commands yet.

Typical causes:

- dirty working tree;
- existing project-local `auto_dev` loop that should be migrated first;
- no high-confidence safe check;
- medium discovery confidence.

This is the default onboarding mode for uncertain projects.

### QUALIFY

A clean new project with a GitHub remote, high discovery confidence, and at least one high-confidence safe qualification command may enter automated qualification without a manually written registry entry.

It is still not authorized to publish or deploy.

### MANAGED

The project already exists in DevControl's canonical registry. Discovery becomes continuous drift detection: path changes, remote changes, new stacks, new workflows, and project-local automation drift can all be surfaced.

### BLOCKED

A registry/path/repository conflict exists. No autonomous execution is allowed until the conflict is resolved.

## Relationship with AI

The deterministic discovery engine is the evidence layer. The future AI Planner operates above it rather than replacing it.

```text
Deterministic evidence
   -> manifest + git + workflow + logs + history
   -> AI Planner proposes execution plan
   -> Policy Engine removes unsafe actions
   -> Executor runs permitted actions
   -> results + artifacts + logs
   -> Learner updates confidence and project playbook
```

This prevents the language model from hallucinating project structure or permissions.

The AI Planner will be allowed to choose among known-safe tools, diagnose failures, rank likely root causes, propose patches, and select the next qualification probe. It will not be allowed to silently widen its own permissions.

## Toward zero-configuration management

The intended mature flow is:

```text
new folder appears on disk
  -> DevControl discovers git repository
  -> matches GitHub remote
  -> fingerprints stack
  -> infers safe checks
  -> auto-registers shadow project
  -> watches commits and health
  -> gathers successful/failed execution history
  -> promotes to automatic qualification when confidence is sufficient
  -> reports failures to GitHub/ChatGPT
  -> AI proposes/fixes patch
  -> local agent qualifies patch
  -> known-good SHA becomes runtime candidate
```

Adding the twentieth project should therefore be a filesystem/Git event, not a new hand-built automation project.

## Current boundary

V0.4 implements discovery, evidence collection, safe command inference, registration matching, and autonomy planning.

The next implementation layer is the unified multi-project executor and learner:

- execute `safeCommands` through one DevControl worker pool;
- per-project locks and GPU/resource scheduling;
- standard run/log/artifact schema;
- rollback/quarantine known-bad SHA;
- dynamic shadow registration in the dashboard;
- GitHub status and issue reporting;
- AI root-cause planning from standardized failure bundles;
- successful-run history used to raise/lower command confidence.
