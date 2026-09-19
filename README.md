# DevControl

A clean-room Rust control plane that gives AI agents a safe, structured and auditable API for operating a local workstation.

## Principles

- Rust-native.
- Local-first.
- Default-deny for mutation and command execution.
- Workspace-bounded filesystem access.
- Structured capabilities instead of arbitrary remote desktop actions.
- Every privileged action is auditable.
- MCP is the primary agent protocol.

## Roadmap

1. Core capability and policy model.
2. Filesystem operations.
3. Bounded shell/process execution.
4. Git operations and audit log.
5. MCP stdio server.
6. Project discovery.
7. Browser/desktop adapters.
8. Autonomous development loop.

The previous implementation was intentionally removed from the working tree on 2026-09-19. Git history remains available for reference, but V1 is built from scratch rather than carrying forward the old architecture.
