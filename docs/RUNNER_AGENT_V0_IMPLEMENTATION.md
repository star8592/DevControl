# Runner Agent v0 Implementation

## Goal

Provide a lightweight local execution agent for DevControl.

## Lifecycle

```
start
  -> detect capabilities
  -> register runner
  -> heartbeat loop
  -> receive qualification tasks
  -> execute safely
  -> report result
```

## Components

- capability detector
- registry client
- heartbeat worker
- task executor
- result reporter

## Safety Rules

- never execute unknown destructive commands
- respect project qualification policy
- isolate repair workloads
- keep execution logs

## First target

Local Ubuntu development host as the reference runner.
