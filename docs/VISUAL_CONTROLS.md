# DevControl V0.13 Visual Controls

V0.13 keeps repository defaults and machine-specific renderer policy separate.

Repository defaults remain in `config/projects.json`. The installer creates a private local file at:

```text
~/.config/devcontrol/projects.local.json
```

and exports it through `DEVCONTROL_PROJECT_OVERRIDES_FILE`.

The local file may override only `visualQualification`. It cannot change repository identity, local checkout path, release policy, workflows, deployment policy, or any other project metadata.

## Commands

Read-only discovery/probe:

```bash
devctl visual-probe
devctl visual-status dandao
```

Enable the visual gate on this workstation only:

```bash
devctl visual-enable dandao
```

When discovery finds exactly one `project.godot`, `projectPath` is inferred. Multiple roots are never guessed:

```bash
devctl visual-enable daolife --project-path godot
```

Machine-specific GPU settings are also local:

```bash
devctl visual-enable dandao \
  --gpu-index 0 \
  --gpu-pattern 'RTX 5070 Ti' \
  --width 1920 \
  --height 1080 \
  --frames 90 \
  --fps 30
```

Use a specific Godot executable when required:

```bash
devctl visual-enable dandao --godot-bin /home/master/.local/bin/godot
```

Run one manual renderer qualification without changing known-good state:

```bash
devctl visual-run dandao
```

A manual run writes evidence below `state/visual/` but never promotes a SHA. Promotion still requires the normal qualification pipeline:

```bash
devctl qualify --project dandao --managed --force
```

That command combines safe code gates and the enabled visual gate into one final PASS/FAIL result. Only the full normal pipeline may promote `knownGoodSha`.

Disable the local visual gate while keeping other local settings:

```bash
devctl visual-disable dandao
```

Remove the local override entirely and return to repository defaults:

```bash
devctl visual-reset dandao
```

## Safety

- `visual-probe` does not start the game.
- `visual-enable` changes only the private local override file.
- `visual-run` cannot promote known-good.
- Multiple Godot roots require an explicit relative `projectPath`.
- The built-in adapter is `godot-vulkan-frame-capture`; arbitrary commands are not accepted.
- Secret-like environment variables are stripped before renderer execution.
- Project paths must stay inside the registered checkout.
- AutoFix repair worktrees must pass the same enabled visual gate before becoming repair candidates.

## Recommended first rollout

For the current workstation, start with DanDao because it has a small single-scene vertical slice:

```bash
devctl visual-probe --project dandao
devctl visual-enable dandao --gpu-pattern 'RTX 5070 Ti'
devctl visual-run dandao
```

After the manual frame gate passes, run the full project qualification:

```bash
devctl qualify --project dandao --managed --force
```

Then repeat the same policy for DaoLife and Tidebound. Do not enable all game projects before the first real renderer gate is proven on the workstation.
