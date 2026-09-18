# DevControl Event Log System v0

## Goal

Eliminate manual terminal log copy/paste. All execution results must become machine-readable artifacts.

## Pipeline

```
Command Execution
        |
        v
Local Agent
        |
        +-- stdout capture
        +-- stderr capture
        +-- exit code
        +-- environment snapshot
        +-- git snapshot
        |
        v
Run Record
        |
        v
Analysis / Repair Loop
```

## Run Directory

```
~/.devcontrol/runs/<run-id>/

metadata.json
command.json
stdout.log
stderr.log
system.json
git.json
report.json
artifacts/
```

## CLI Target

```
devctl run <workflow>
devctl logs latest
devctl report latest
```

## Design Rules

- Every command execution produces a Run Record.
- Human copy/paste is not required.
- AI consumes structured reports instead of raw terminal output only.
- Failed runs can automatically enter Failure Analyzer and Repair Planner.
