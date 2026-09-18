# Local Agent Implementation v0

## Goal

Eliminate manual log copy/paste. All executions should produce machine-readable run records.

## Pipeline

```
devctl run
  -> local agent
  -> executor
  -> event recorder
  -> artifact storage
  -> report.json
```

## Required capture

- command
- stdout
- stderr
- exit code
- duration
- environment
- git state
- artifacts

## Storage

```
~/.devcontrol/runs/<run-id>/
  metadata.json
  stdout.log
  stderr.log
  report.json
```

## Next implementation steps

1. Rust run module
2. CLI run command
3. MCP read APIs
4. autonomous repair loop
