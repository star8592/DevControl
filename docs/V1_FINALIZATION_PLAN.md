# DevControl v1.0 Finalization Plan

## Goal

Move from feature expansion to integration, validation and release.

## Final integration order

1. MCP tool binding
2. Unified CLI/Core routing
3. Local runner registration
4. Full workspace discovery test
5. Qualification regression
6. Service installation verification
7. v1.0 release checklist

## Release acceptance

- discover works on real repositories
- qualify produces deterministic reports
- failures produce packets
- repair remains gated and isolated
- no automatic merge/deploy authority
- local workstation remains execution authority

## v1.0 scope freeze

Avoid adding new subsystems until:

- end-to-end pipeline passes
- documentation matches implementation
- local runner has been validated
- regression projects are recorded
