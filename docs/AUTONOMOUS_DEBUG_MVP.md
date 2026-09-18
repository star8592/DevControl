# DevControl Autonomous Debug MVP

## Goal

GitHub change -> local agent -> sync -> build -> test -> collect logs -> generate report.

## MVP Flow

```
GitHub
  |
  v
DevControl Agent
  |
  +-- Sync
  +-- Detect stack
  +-- Execute build/test
  +-- Capture stdout/stderr
  +-- Generate run report
```

## Initial Commands

```bash
devctl autonomous run <project>
```

## Run Artifacts

Stored under:

```
~/.devcontrol/runs/<run-id>/
```

Contains:

- metadata.json
- command.json
- stdout.log
- stderr.log
- report.json

## Roadmap

1. Autonomous runner
2. Task queue
3. Failure context collection
4. Repair workflow
5. Pull request automation
