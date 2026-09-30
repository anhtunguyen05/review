# Phase 9 Implementation Plan

## Purpose

Make the adaptive pipeline measurable and reproducible. Each run records stage
durations and routing counts, while a fixture runner validates evaluation cases
without requiring live providers.

## Scope lock

### In scope

- Stage timing and count metrics in `run.json`.
- Estimated OCR tokens, deep-review file count, duplicate/suppression counts.
- Deterministic evaluation fixture schema and runner command.
- One baseline/adaptive fixture manifest for future experiments.
- Regression tests for metrics emission and fixture validation.

### Explicitly out of scope

- Provider billing truth, model-specific tokenizers, or live pricing.
- Claims of accuracy/cost improvement without a completed corpus experiment.
- OpenTelemetry/exporters/dashboards.

## Decisions

### D9-001 - Operational estimates are labeled estimates

Token values remain the Phase 5 UTF-8 estimate and are never presented as
provider usage or cost.

### D9-002 - Metrics share run identity

Metrics are embedded in `run.json` under the existing run/head envelope so a
single `runId` correlates artifacts.

### D9-003 - Fixture runner is provider-free

Evaluation manifests describe expected candidates and routing; the runner only
validates deterministic fixture structure. Live OCR/Jev calls belong to a
separate experiment environment.

## Action items

[x] **P9-001** Add metrics contracts and stage instrumentation.
[x] **P9-002** Add deterministic evaluation fixture schema and runner.
[x] **P9-003** Add metrics/fixture tests and documentation.
[x] **P9-004** Run release gates.

## Definition of done

1. `run.json` exposes stage durations and routing/count metrics.
2. Metrics include estimated OCR tokens, raw/verified/duplicate/suppressed
   finding counts, and degraded stages.
3. `npm run evaluate` validates the checked-in fixture manifest.
4. No cost or accuracy claim is made without baseline data.

## Validation commands

```bash
npm run typecheck
npm run lint
npm run boundaries
npm test
npm run evaluate
npm audit
```

## Implementation result

Status: Implemented and verified.

Implementation evidence:

- Added stage durations, routing counts, token estimates, finding lifecycle
  counts, degraded stages, and total duration to `run.json`.
- Added provider-free `npm run evaluate` fixture validation and a baseline
  manifest; no accuracy/cost improvement claim is made from it.
- Verification passed: `npm run typecheck`, `npm run lint`,
  `npm run boundaries`, `npm test` (26 files, 53 tests), `npm run evaluate`,
  and `npm audit`.
