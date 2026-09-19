# Rust Native Control Plane

DevControl is evolving from the existing Node.js autonomous project supervisor into a Rust-native local capability plane. The migration is incremental: the current production loop remains intact while Rust capabilities are introduced behind explicit policy boundaries.

## Contract

Every local action follows:

```text
Agent request
  -> capability registry
  -> workspace boundary
  -> policy authorization
  -> execution
  -> audit event
```

Initial capability namespaces:

- `system.*`
- `project.*`
- `fs.*`
- `shell.*`
- `process.*`
- `git.*`
- `audit.*`

The default Rust policy is read-only. Write, shell/process, and Git-write authority must be granted independently.

## Migration rule

Do not rewrite the working V0.12 Node control loop in one pass. Rust first becomes the hardened local execution substrate; existing discovery, qualification, visual gates and repair supervision can migrate after behavioral parity tests exist.

## Milestones

1. Rust workspace, capability types, policy engine and workspace containment.
2. Filesystem and bounded process execution.
3. Git operations and structured audit log.
4. MCP stdio server exposing the capability registry.
5. Compatibility tests against the existing DevControl behavior.
6. Promote Rust daemon/CLI to primary runtime and retire duplicated Node paths.
