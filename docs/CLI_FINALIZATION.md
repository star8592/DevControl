# DevControl CLI Finalization

## v1.0 target commands

```bash
devctl status
devctl discover
devctl qualify
devctl report
devctl repair
devctl mcp start
```

## Final integration goals

- CLI and MCP use the same core runtime.
- No duplicated business logic between interfaces.
- Runner registration is handled independently from project workflows.
- Release validation must run against real local projects before v1.0 tagging.
