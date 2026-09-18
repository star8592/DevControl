# DevControl Event Log Implementation Plan

## Goal

Remove manual log copy/paste from the development loop.

## Architecture

```
devctl run
    |
    v
Local Agent
    |
    + stdout capture
    + stderr capture
    + exit code
    + environment snapshot
    + git snapshot
    + artifacts
    |
    v
Run Record
```

## Storage

Default:

```
~/.devcontrol/runs/<run-id>/
```

Files:

- metadata.json
- command.json
- stdout.log
- stderr.log
- system.json
- git.json
- report.json

## CLI targets

```
devctl run <workflow>
devctl logs latest
devctl report latest
```

## Design rules

- Every execution produces a machine-readable record.
- AI analysis consumes records directly.
- Human log forwarding is not required.
- Failed runs become repair candidates.
