# Security model

DevControl treats the local workstation as a privileged execution environment.

## Baseline

- Mutation is denied by default.
- Agent paths are workspace-relative.
- Absolute paths and parent traversal are rejected.
- Existing paths are canonicalized to detect symlink escapes.
- Writes require a canonical parent inside the workspace.
- Shell/process and Git mutation are separate capabilities.
- Privileged actions will emit structured audit events.

Filesystem access is implemented as a capability, not as an unrestricted shell shortcut.
