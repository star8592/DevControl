# DevControl Control Center

V0.13 adds a localhost-only management interface:

```text
http://127.0.0.1:8787/control.html
```

It is the human-facing control surface for the same discovery, qualification, visual and repair
state used by the CLI and background reconcile loop. It is not a second automation system.

## What the page can do

Global actions:

```text
Discover
Visual Probe
Sync eligible projects
Qualify eligible projects
Reconcile
Build Failure Packets
Build Repair Plans
```

Project actions:

```text
Visual Probe
Visual Enable / Disable / Status / Run for registered Godot projects
Sync
Qualify
Repair PR Review
Post-merge Cleanup
```

Auto-discovered projects do not need to be manually registered before project-key-based Sync,
Qualify or Visual Probe can be requested. The browser never supplies a filesystem path; discovery
resolves the project key to the real checkout.

Visual override writes remain registration-only because `visual-enable` persists an explicit local
policy in `~/.config/devcontrol/projects.local.json`.

## Intentionally absent authority

The browser allowlist does not expose:

```text
AutoFix
repair branch push
Draft PR creation
approve
merge
release
Steam publish
production deploy
trading / live-money actions
arbitrary shell commands
```

Those remain separate explicit authority layers.

The server rejects request bodies containing `command`, `shell` or `argv`, and local actions are
mapped to fixed Node scripts with `shell:false`. Project selectors must be bounded project keys;
path-like selectors are rejected.

## Concurrency

Only one Control Center local operation may execute at once. A second request receives HTTP 409
until the active operation finishes. This prevents the UI from racing a Sync, Qualification,
Visual Run or Reconcile against another UI-triggered operation.

The normal background `devcontrol-reconcile.timer` remains the autonomous scheduler. Existing Git
clean-tree, fast-forward, quarantine, known-good and qualification gates still apply to
UI-triggered actions.

## APIs

Read-only:

```text
GET /api/local-state
GET /api/local-operations
GET /api/local-operations/<id>
```

Bounded write/control:

```text
POST /api/local-control
```

Example request shape:

```json
{
  "action": "qualify",
  "project": "dandao",
  "force": false
}
```

No command text is accepted.

## Audit and output

Control requests and outcomes are written to the existing audit stream when write-action auditing
is enabled. Recent operation stdout/stderr is kept in memory for the management page and passed
through DevControl secret redaction before being returned to the browser.

Long-lived qualification and visual evidence still lives in the normal generated state tree, such
as `state/executions/`, `state/latest/` and `state/visual/`.

## Network boundary

The Control Center is intended for localhost use only. DevControl's integration security policy
already refuses a non-loopback bind when `bindLocalhostOnly` is enabled. Do not expose the page
publicly without a separate authenticated reverse proxy and an explicit security review.
