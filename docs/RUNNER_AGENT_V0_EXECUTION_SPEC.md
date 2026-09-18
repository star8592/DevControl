# Runner Agent v0 Execution Spec

## Purpose

Define the first executable stage of the local runner node.

## Lifecycle

```
start
  -> detect capabilities
  -> register node
  -> heartbeat loop
  -> receive qualified tasks
  -> execute in isolation
  -> report result
```

## Capability payload

```json
{
  "hostname": "",
  "os": "",
  "arch": "",
  "cpu": "",
  "memory": 0,
  "gpu": [],
  "tools": []
}
```

## Safety constraints

- no arbitrary remote shell execution
- isolated task workspace
- explicit capability matching
- artifact collection after execution
- report failures without destructive recovery

## v1 integration target

The runner becomes the execution layer for:

- qualification
- visual probes
- repair validation
- regression checks
