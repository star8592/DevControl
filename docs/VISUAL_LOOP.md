# VisualLoop

VisualLoop is DevControl's reusable visual-development and production-qualification subsystem for games and graphics-heavy applications.

It is conceptually inspired by `achimala/dream-loop`: freeze a strong visual target, build toward it, compare live output with an independent visual judge, and iterate until the gap is closed. VisualLoop extends that idea for long-lived production projects by adding multi-view evidence, regression tracking, stall detection, runtime/performance gates, and auditable qualification artifacts.

## Why this belongs in DevControl

DevControl already treats GitHub as the control/audit plane and self-hosted runners as the authority for heavyweight qualification. VisualLoop follows the same boundary:

- GitHub stores versioned contracts, issues, commits, reviews, and evidence metadata.
- self-hosted runners launch the real engine and capture production evidence.
- AI adapters propose changes and judge visual deltas through capability-scoped integrations.
- the browser never receives arbitrary shell execution capability.
- a runtime smoke pass proves that a build runs; it never proves that the art is production-ready.

VisualLoop is a subsystem, not a game-specific fork. DaoLife, DanDao, Tidebound, HIDDEN-LOT, and future projects should integrate through per-project configuration.

## Core loop

```text
Current Product
      |
      v
Freeze / refine Visual Contract
      |
      v
Implement highest-leverage gaps
      |
      v
Runtime Smoke Gate
      |
      v
Production Capture Set
      |
      v
Independent Visual Judge
      |
      +----> Regression check
      |
      +----> Stall detector
      |
      v
Performance Gate
      |
      v
Evidence Gate
      |
      +---- pass ---> qualified
      |
      +---- fail ---> next iteration
```

## Visual Contract

A Visual Contract is the frozen acceptance target for one qualification cycle. It must be achievable in-engine and must not be described as concept art.

For an existing product, the preferred target-generation flow is:

1. capture the current production screenshot;
2. refine that screenshot toward the desired result using image generation or a human-provided reference;
3. freeze the result as the target for the current qualification cycle;
4. do not silently move the target during implementation.

A contract should normally contain more than one view so the system cannot optimize a single camera while hiding broken geometry elsewhere.

Recommended capture roles:

- `gameplay_hero`: primary composition and scene readability;
- `character_close`: character silhouette, costume, face, held props, readability;
- `architecture_close`: hero building and structural detail;
- `alternate_45`: multi-view consistency and scale;
- `rear_or_side`: hidden-surface completeness;
- `motion`: animation and temporal artifacts;
- `lighting`: exposure, shadow, reflection, atmosphere;
- `performance`: FPS, frame-time, memory, draw/dispatch evidence.

## Judge model

The judge must be independent of the worker context whenever practical. It receives at minimum:

- frozen target images;
- current live production captures;
- previous round captures and verdict when available;
- the Visual Contract;
- performance measurements;
- a request for actionable blockers rather than aesthetic adjectives.

VisualLoop scores each view on a 0-10 scale and aggregates dimensions with configurable weights. The initial default dimensions are:

| Dimension | Default weight |
| --- | ---: |
| composition | 0.22 |
| scale | 0.13 |
| character | 0.15 |
| architecture | 0.15 |
| materials | 0.12 |
| lighting | 0.10 |
| detail | 0.08 |
| motion | 0.05 |

Projects may override weights. A project with no character, for example, should redistribute that weight rather than invent a character score.

## Regression model

Every new verdict is compared against the previous qualified attempt.

Visual regression states:

- `improved`: score delta is greater than the configured epsilon;
- `neutral`: absolute delta is within epsilon;
- `regressed`: score delta is below negative epsilon.

Performance changes are evaluated separately so a visual win cannot conceal a severe FPS or frame-time regression.

## Stall detection

Incremental tweaking must stop when the loop is no longer producing meaningful progress.

The initial stall signals are:

- the best visual score fails to improve by the configured minimum over the configured number of recent rounds; or
- the same normalized blocker appears for the configured number of consecutive rounds.

When stall is approaching, the next iteration must be architectural rather than cosmetic. Candidate resets include:

- camera/framing;
- asset replacement;
- character or building proportions;
- scene layout and density;
- lighting architecture;
- material pipeline;
- LOD/occlusion strategy.

If a deliberate architectural reset still produces no improvement, the loop should stop automatically and request review instead of burning tokens indefinitely.

## Runtime and production evidence

VisualLoop separates four gates:

1. **Runtime Smoke** — engine launches, project loads, expected scene is reachable, no fatal runtime errors.
2. **Visual Gate** — current production captures meet the contract score and no blocking visual defects remain.
3. **Performance Gate** — project-specific frame-rate/frame-time/memory thresholds pass on the authoritative runner.
4. **Evidence Gate** — every pass is backed by current production artifacts from the intended engine, renderer, resolution, commit SHA, and runner.

Fallback screenshots, Blender previews, generated target images, editor previews, or smoke-only images must never be reported as Production Art Qualification evidence.

## Godot reference profile

For current Godot projects, the expected production profile is configurable but should record at least:

```text
engine=Godot
engine_version=4.7.2
renderer=Vulkan Forward+
resolution=1920x1080
commit_sha=<exact tested commit>
runner=<self-hosted runner identity>
```

The first integration target should be DaoLife because it already has a production-art qualification problem that requires real 1920x1080 engine captures and character close-up evidence.

## Artifact layout

Project-local transient work should not pollute source assets. Recommended default:

```text
.devcontrol/visual-loop/
  contract.json
  targets/
  rounds/
    0001/
      captures/
      metrics.json
      verdict.json
      blockers.json
    0002/
      ...
  latest.json
```

GitHub Actions artifacts may carry the heavy screenshots/videos. Git should keep the small contract, schemas, summaries, and selected long-term visual baselines when explicitly approved.

## Asset sourcing policy

VisualLoop should prefer the highest-quality viable source rather than procedural geometry by default:

1. approved external production asset;
2. image-to-3D for a target-aligned major asset;
3. Blender/scripted modeling with proper materials and textures;
4. procedural geometry only when it is genuinely the best option or the remaining viable option.

Generated/downloaded GLB files are not automatically accepted. They must be previewed, oriented, scaled, materially checked, integrated into the actual engine scene, and re-qualified through production captures.

## Safety and control boundaries

VisualLoop inherits DevControl's deny-by-default write policy.

- no arbitrary browser-to-shell bridge;
- no automatic merge as a consequence of a visual score;
- no asset API spending without an explicit configured adapter/budget policy;
- no secret values in verdicts, logs, screenshots, or artifacts;
- no claim of qualification without matching commit and evidence metadata.

## Initial implementation phases

### P0 — contract evaluator

- configuration schema/example;
- weighted score calculation;
- visual regression classifier;
- stall detection;
- pure unit tests.

### P1 — Godot capture adapter

- bounded self-hosted command adapter;
- deterministic capture roles and camera presets;
- runtime smoke result;
- 1920x1080 production captures;
- engine/renderer/GPU metadata.

### P2 — independent judge adapter

- image-capable judge provider;
- fresh-context verdicts;
- normalized blocker output;
- score/history persistence.

### P3 — DevControl dashboard

- per-project VisualLoop state;
- target/current/previous evidence links;
- score trend;
- top blockers;
- performance status;
- `improved / neutral / regressed / stalled / qualified` state.

### P4 — asset pipeline

- target-derived asset extraction;
- optional image-to-3D provider adapter;
- Blender fallback/cleanup path;
- orientation/scale/material validation;
- budget and audit records.

## Attribution

The closed-loop target/screenshot/critic concept and the emphasis on avoiding low-quality procedural fallbacks were informed by the MIT-licensed `achimala/dream-loop` project. VisualLoop's production architecture, schemas, multi-view qualification, performance/evidence gates, and DevControl integration are implemented independently. If source code is later vendored or adapted, preserve the upstream MIT license and attribution for the reused portions.
