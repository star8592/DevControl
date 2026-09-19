# Autonomous Development Loop

## Goal

DevControl evolves toward a controlled AI development runtime:

1. Discover project state.
2. Plan minimal change.
3. Modify through audited capabilities.
4. Run build and tests.
5. Review failures.
6. Commit only verified changes.

## Safety boundaries

- Git is the source of truth.
- Mutations require explicit capabilities.
- Every action should produce an audit record.
- Local machines execute verification; GitHub stores history.

## Current milestone

- Rust workspace baseline
- Capability policy model
- GitHub CI verification
