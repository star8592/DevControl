# DevControl Run Log API v0

## Goal

Eliminate manual terminal log copying. All execution results must become machine-readable run records.

## Run lifecycle

```
start run
  -> create run id
  -> capture stdout/stderr
  -> capture exit code
  -> store metadata
  -> generate report
  -> expose result to MCP
```

## Storage layout

```
~/.devcontrol/runs/<run-id>/
  metadata.json
  stdout.log
  stderr.log
  report.json
```

## CLI target

```
devctl run <workflow>
devctl logs <run-id>
devctl report <run-id>
```

## First implementation boundary

- Rust core owns event collection.
- CLI only invokes core services.
- MCP reads structured reports instead of raw terminal output.
- Failed runs become repair candidates.
