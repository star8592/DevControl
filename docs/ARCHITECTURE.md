# Architecture

```text
AI Agent
   |
   v
MCP Server
   |
   v
Capability Registry
   |
   v
Policy Engine
   |
   +-- Filesystem
   +-- Shell / Process
   +-- Git
   +-- Browser / Desktop (later)
   |
   v
Audit Log
```

DevControl core contains no project-specific game, trading, deployment, Steam, Godot, or product-delivery logic. Those belong to agents or project adapters above the generic capability layer.
