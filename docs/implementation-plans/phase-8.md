# Phase 8 Implementation Plan

## Purpose

Support safe incremental reviews across pushes without trusting stale
checkpoints. A checkpoint is usable only when the current head descends from
it and the relevant configuration fingerprint is unchanged; otherwise the
pipeline falls back to the requested full range.

## Scope lock

### In scope

- Checkpoint contract, file store, and config fingerprint.
- Git ancestry verification.
- Deterministic incremental/full range decision and fallback diagnostics.
- CLI `--checkpoint` and `--full` controls.
- Save checkpoint only after an `ok` review.
- Unit tests for valid, stale, changed-config, and forced-full paths.

### Explicitly out of scope

- Concurrent OCR groups or unlimited fan-out.
- `/review` issue-comment parsing (manual workflow remains Phase 2).
- Remote checkpoint storage, database persistence, and cross-repository state.
- Performance telemetry (Phase 9).

## Decisions

### D8-001 - Fail closed on checkpoint uncertainty

Missing or unreadable checkpoint, unavailable ancestry verification, stale head,
or changed config all select the caller's requested full range.

### D8-002 - Advance only successful runs

`partial` and `failed` runs do not advance the checkpoint. This prevents a
degraded result from becoming the trusted baseline for the next push.

### D8-003 - Make mode explicit

`--full` always uses the requested `--from`; `--checkpoint` opts into
incremental selection. The resolved range remains visible in `run.json`.

## Action items

[x] **P8-001** Add checkpoint contracts, port, store, and fingerprint helper.
[x] **P8-002** Add Git ancestry verification and range decision policy.
[x] **P8-003** Integrate CLI controls and successful-run checkpoint save.
[x] **P8-004** Add unit/integration coverage and documentation.
[x] **P8-005** Run release gates.

## Definition of done

1. A valid checkpoint reviews only `checkpoint.headSha..currentHead`.
2. Stale, non-ancestor, unreadable, or config-mismatched checkpoints use full
   requested range and emit a diagnostic.
3. `--full` bypasses checkpoints deterministically.
4. Only `ok` runs write a new checkpoint.
5. Existing artifacts and publication behavior remain compatible.

## Validation commands

```bash
npm run typecheck
npm run lint
npm run boundaries
npm test
npm audit
```

## Implementation result

Status: Implemented and verified.

Implementation evidence:

- Added checkpoint contracts/store, deterministic config fingerprint, ancestry
  verification, and full-range fallback policy.
- Added CLI `--checkpoint` and `--full`; only successful runs advance the
  checkpoint. The manual workflow persists its checkpoint under artifacts.
- Added unit coverage and a real temporary Git repository acceptance test that
  confirms the second push reviews from the first successful head.
- Verification passed: `npm run typecheck`, `npm run lint`,
  `npm run boundaries`, `npm test` (26 files, 53 tests), `npm run review --
  --help`, and `npm audit`.
