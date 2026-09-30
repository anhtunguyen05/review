# Phase 5 Implementation Plan

## Purpose

Turn Phase 4 impact candidates and screening decisions into a deterministic,
budgeted OCR scope. Direct changed source files remain required; impacted files
enter deep review only when screening and budget policy allow them.

## Source-of-truth documents

- `docs/12_IMPLEMENTATION_ROADMAP.md`: Phase 5 flow and acceptance.
- `docs/02_SCOPE_AND_REQUIREMENTS.md`: budget, explainability, artifact, and
  deep-review requirements.
- `docs/04_REVIEW_PIPELINE.md`: scope planning, screening, budget, and deep
  review stages.
- `docs/06_OCR_JEV_INTEGRATION.md`: selected files versus context and bounded
  background construction.
- `docs/07_DOMAIN_MODEL_AND_CONTRACTS.md`: `ReviewScope`, candidates, and
  exclusions.
- `docs/09_SECURITY_AND_TRUST_BOUNDARIES.md`: no execution of repository code.
- `docs/10_OBSERVABILITY_COST_AND_PERFORMANCE.md`: budget dimensions and
  token estimates.
- `docs/11_TESTING_STRATEGY.md`: fixture and local end-to-end expectations.
- `docs/implementation-plans/phase-4.md`: delivered impact graph and reasons.

## Current-state assessment

- Phase 4 persists an impact graph containing direct and untouched candidates.
- Phase 3 screening still receives only direct JS/TS candidates.
- `reviewLocalRange` still sends the entire changed-file list to OCR.
- `DeepReviewInput` has no selected target/context scope or background.
- `OcrCliAdapter` passes only range flags to the trusted OCR executable.
- There is no scope artifact, budget planner, or skip-reason contract.

## Scope lock

### In scope

- Screen all eligible direct and impacted candidates.
- Add `ReviewBudget`, `ReviewScope`, `ScopeCandidate`, exclusions, and
  background contracts.
- Implement application-owned `ScopePlanner` and deterministic priority rules.
- Estimate bounded input tokens from Git snapshot content.
- Preserve required direct files when budgets are exceeded.
- Build bounded review background from impact reasons and screening evidence.
- Pass selected review paths/context to OCR through the infrastructure adapter.
- Persist `scope.json` and expose selection/degradation counts.
- Add the 30-candidate adaptive fixture and failure/budget tests.

### Explicitly out of scope

- Queues, background workers, or persistent async jobs.
- Unlimited concurrency or provider-specific tokenizers.
- Semantic/LLM intent discovery, post-review verification, publication, and
  checkpoints.
- GitHub-specific inline location decisions.
- Changing the impact analyzer's graph semantics.

## Decisions

### D5-001 - Keep routing policy in application/domain

Screening returns bounded risk/evidence; `ScopePlanner` owns required-file
preservation, priority, budget, and exclusions. This prevents Jev-specific
routing from leaking into OCR or domain policy.

### D5-002 - Use explicit review targets and context

`DeepReviewInput` retains the original range and changed files but adds a
`ReviewScope` and bounded `ReviewBackground`. OCR receives repeatable selected
path/context flags only inside `OcrCliAdapter`.

### D5-003 - Estimate tokens deterministically

Use UTF-8 byte length divided by four, rounded up, with a minimum of one token.
This is an operational estimate, not provider billing truth. Provider usage
telemetry remains Phase 9.

### D5-004 - Degrade to direct-only scope

If impact or screening is unavailable, no impacted candidate is fabricated or
selected. Required direct files continue, the scope records
`SCREENING_UNAVAILABLE`, and adaptive runs are marked partial.

## Target contracts and flow

Add to the domain contracts:

- `ReviewBudget` with file, token, and duration limits;
- `ScopeCandidate` with ID, location, direct flag, impact score, reasons, and
  estimated tokens;
- `ScopeExclusion` with candidate/path, reason, and bounded detail;
- `ReviewScope` with required candidates, selected candidates, exclusions, and
  budget totals;
- `ReviewBackground` with selected impact summaries, screening evidence, and
  review focus;
- `ScopePlanningResult` with scope, background, status, and diagnostics.

Extend `ScreeningCandidate` so both direct and impacted candidates can be
screened while preserving stable IDs. Add `scope` and `background` to
`DeepReviewInput`.

The application flow becomes:

```text
range + changed files
  -> impact graph
  -> materialize direct/impacted screening candidates
  -> screen eligible candidates
  -> estimate tokens
  -> ScopePlanner
  -> background builder
  -> selected OCR review
  -> scope/OCR/findings artifacts
```

Priority order is required direct, impacted `DEEP`, impacted `LIGHT`; ties use
risk descending, impact score descending, estimated tokens ascending, and path
ascending. `SKIP` is excluded with `LOW_RELEVANCE`; budget drops use `BUDGET`.

## Action items

[x] **P5-001 - Add scope and budget contracts.** Extend domain types, screening
candidate identity, deep-review input, artifact envelopes, and configuration
defaults without importing infrastructure.

[x] **P5-002 - Materialize and estimate candidates.** Build direct plus impact
candidate inputs, resolve locations, read bounded Git snapshots for token
estimates, and preserve deterministic IDs.

[x] **P5-003 - Implement `ScopePlanner`.** Preserve required direct files,
apply action/risk/impact ordering, enforce file/token/duration budgets, and
emit an exclusion reason for every non-selected candidate.

[x] **P5-004 - Implement background construction.** Produce bounded structured
background from selected paths, impact reasons, screening evidence, and review
focus without executing or embedding the whole repository.

[x] **P5-005 - Integrate adaptive scope into the local application.** Screen
impacted candidates, plan scope, degrade to direct-only on unavailable stages,
pass scope/background to OCR, and update run status/counts.

[x] **P5-006 - Update the OCR adapter contract.** Pass repeatable selected and
context path flags within the adapter, keep provider-specific CLI details out
of application code, and preserve raw/failure behavior.

[x] **P5-007 - Persist configuration and artifacts.** Add budget YAML defaults,
`scope.json`, diagnostics, and README/CLI documentation.

[x] **P5-008 - Add unit and contract coverage.** Test priority ties, required
overflow, token/file budgets, all exclusion reasons, screening failures,
background bounds, OCR arguments, and no fabricated decisions.

[x] **P5-009 - Add the 30-candidate acceptance fixture.** Assert only configured
high/medium candidates enter OCR, every skipped candidate has a reason, and
the selected paths are present in the OCR request/artifact.

[x] **P5-010 - Run regression and release gates.** Verify Phase 1/3/4 behavior,
typecheck, lint, boundaries, full tests, CLI help, audit, and environment
limitations; record evidence here.

## Definition of done

1. Direct and impacted candidates reach screening with stable IDs.
2. Required direct files are always preserved.
3. A configured file/token budget limits impacted OCR targets deterministically.
4. Every excluded candidate has a machine-readable reason and bounded detail.
5. OCR receives selected review paths/context rather than the full candidate
   universe.
6. A 30-candidate fixture proves high/medium selection and skip reasons.
7. Impact/screening/OCR failure degrades to direct-only without fabricated
   decisions or findings.
8. `scope.json` shares run/head envelope identity with other artifacts.
9. No repository code, scripts, tests, or package hooks execute.
10. All available verification gates pass, with external/runtime limitations
    documented separately.

## Validation commands

```bash
npm run typecheck
npm run lint
npm run boundaries
npm test
npm run review -- --help
npm audit
```

## Implementation result

Status: Implemented and verified.

Implementation evidence:

- Added application-owned candidate materialization and deterministic scope
  planning in `src/application/review-scope-candidates.ts` and
  `src/application/plan-review-scope.ts`.
- Added budget/scope/background contracts, config defaults, `scope.json`, and
  adapter-owned repeatable `--review-path` / `--context-path` arguments.
- Added planner unit coverage for a 30-candidate fixture, all exclusion paths,
  direct-file preservation, screening degradation, and OCR argument capture.
- Verification passed: `npm run typecheck`, `npm run lint`,
  `npm run boundaries`, and `npm test` (19 files, 42 tests).
- The native CLI help and integration tests run under the current Node 26
  workspace; any environment-specific `os.userInfo()` limitation must remain
  documented if it reappears in another host.
