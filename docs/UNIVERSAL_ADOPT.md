# Universal Adopt Flow

## Goal

Manage arbitrary GitHub repositories through a common DevControl lifecycle.

```text
GitHub URL
  -> clone
  -> detect stack
  -> build ProjectProfile
  -> register project
  -> generate qualification workflow
  -> run local validation
```

## Project Profile

A project profile records:

- repository
- local path
- detected language
- framework
- install command
- test command
- build command
- runner requirements

## Safety

Adopt is observation-first. It does not publish, deploy, merge, or modify upstream code automatically.

## Future adapters

- Rust
- Node.js
- Python
- Go
- Java
- Godot
- Docker
