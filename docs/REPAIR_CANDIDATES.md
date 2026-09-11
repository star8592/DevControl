# Repair Candidates and Draft PR Promotion

DevControl repair automation is deliberately split into separate authority layers.

```text
Failure Packet
  -> PLAN_ONLY Repair Supervisor
  -> isolated worktree AutoFix          (opt-in)
  -> safe qualification PASS
  -> local repair commit
  -> Repair Candidate
  -> push devcontrol/repair/* branch    (separate opt-in)
  -> create Draft PR                    (separate opt-in)
  -> read-only PR Review Gate
  -> human / external reviewer
  -> merge                              (never performed by DevControl)
  -> normal main sync + qualification
  -> known-good                         (only after local qualification PASS)
```

## Default behavior

All external repair publication is disabled by default:

```bash
DEVCONTROL_AUTO_FIX=0
DEVCONTROL_AUTO_PUSH_REPAIR_BRANCH=0
DEVCONTROL_AUTO_CREATE_REPAIR_PR=0
```

With these defaults DevControl can discover failures, build AI failure packets, and produce
repair plans without changing source repositories or GitHub state.

## Isolated AutoFix

`DEVCONTROL_AUTO_FIX=1` allows the repair executor to create a dedicated Git worktree and
branch at the failed SHA. Codex may edit only that isolated worktree.

Before a repair becomes a candidate, DevControl requires:

- the project is `QUALIFY` or `MANAGED` and automatic qualification is enabled;
- the failed command belongs to the project's safe qualification allowlist;
- the source working tree is clean;
- the failure packet and repair plan signatures match;
- no blocked high-risk path is modified;
- the original failed command passes after the repair;
- the remaining safe qualification commands pass;
- the repair is committed locally on a `devcontrol/repair/*` branch.

Blocked path classes include CI/CD, deploy/release/production/Steam, secrets/credentials,
`.env`, dependency manifests, and lock files.

## Push repair branch

Enable only after isolated repairs have been observed successfully:

```bash
DEVCONTROL_AUTO_PUSH_REPAIR_BRANCH=1
```

This permits DevControl to push only the already validated `devcontrol/repair/*` branch.
It does not create or merge a pull request by itself.

Before each push, DevControl re-verifies actual Git state rather than trusting saved JSON:

- repair worktree HEAD equals the recorded repair SHA;
- repair branch matches the `devcontrol/repair/*` namespace;
- worktree is clean;
- `origin` resolves to the expected GitHub repository;
- repair SHA descends from the recorded failed SHA;
- exactly one repair commit exists between failed and repair SHA;
- committed diff paths exactly match the previously validated changed-path set;
- the committed diff is rechecked against the high-risk path denylist.

## Draft PR creation

Draft PR creation requires branch push to be enabled as well:

```bash
DEVCONTROL_AUTO_PUSH_REPAIR_BRANCH=1
DEVCONTROL_AUTO_CREATE_REPAIR_PR=1
```

The GitHub token must have permission to push the repository branch and create pull requests.
DevControl first checks for an existing pull request from the same repair branch, so repeated
reconcile runs do not intentionally create duplicates.

A generated Draft PR contains:

- failure signature and failed SHA;
- repair SHA;
- failed qualification command and failure categories;
- repair-plan summary and steps;
- changed path list;
- local qualification commands and PASS/FAIL state;
- explicit statement that DevControl never auto-merges.

Failure log excerpts are intentionally omitted from the PR body even though executor logs are
already redacted. This minimizes accidental disclosure of project details.

## Read-only PR Review Gate

Every recorded repair Draft PR is re-read from GitHub by `devctl repair-review`. The gate has
no approve, ready-for-review, merge, close, or branch-update capability.

The review states are:

- `AWAITING_CI`: no GitHub checks are visible yet or at least one check is still pending;
- `CI_FAILED`: at least one GitHub check/status failed, timed out, was cancelled, or needs action;
- `REVIEWABLE`: PR head SHA and branch still match the validated repair candidate and every
  observed GitHub check/status is passing;
- `STALE`: repair SHA/branch drifted, the PR branch is behind the base branch, or it conflicts;
- `CLOSED`: PR was closed without merge;
- `MERGED`: GitHub reports the PR as merged;
- `ERROR`: the read-only GitHub inspection itself failed.

`REVIEWABLE` is deliberately not an authorization to merge. It means the repair is ready for a
human or external reviewing agent to inspect.

A `MERGED` repair is also not immediately trusted. The next normal reconcile cycle must sync the
updated main branch and run the normal local qualification. Only that normal PASS may advance
the project's `knownGoodSha`.

## State

Repair state is written under:

```text
state/
├── ai-queue/             failure packets
├── repair-plans/         PLAN_ONLY repair plans
├── repair-attempts/      isolated AutoFix results
├── repair-candidates/    pushed branch / Draft PR records
└── repair-reviews/       read-only Draft PR / GitHub CI classifications
```

`Autonomy Dashboard` displays the latest repair attempt, candidate, PR URL and review state for
every project.

## Commands

```bash
devctl failures
devctl repairs
devctl auto-fix
devctl repair-publish
devctl repair-review
devctl local
```

`devctl reconcile` runs the complete serialized loop. When external-write switches are off,
AutoFix publication is a no-op, while the rest of the discovery/qualification/analysis loop
continues normally.

## Non-goals

DevControl does not automatically:

- merge a repair PR;
- mark a Draft PR ready for review;
- approve its own PR;
- modify branch protection;
- deploy or release from the repair branch;
- publish to Steam or other stores;
- execute production writes or financial/trading actions.

Those boundaries are intentional. A repair can be fully automated up to a validated Draft PR
and read-only review status without granting the control plane authority to ship the change to
production.
