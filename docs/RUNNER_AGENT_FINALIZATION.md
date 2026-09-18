# Runner Agent Finalization

## Goal

Register local machines as trusted DevControl execution nodes.

## Runner identity

Each runner reports:

- hostname
- operating system
- architecture
- CPU
- memory
- GPU
- available toolchains

## Lifecycle

```text
start
  |
collect capabilities
  |
register
  |
heartbeat
  |
accept qualification jobs
```

## Safety

Runner execution remains controlled by qualification policies. Repository scripts are not treated as trusted automation by default.
