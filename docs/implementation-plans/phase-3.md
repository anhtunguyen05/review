# Phase 3 Implementation Plan

## Purpose

This document turns Phase 3 in `docs/12_IMPLEMENTATION_ROADMAP.md` into an
execution-ready plan for adding a Jev-style screening stage to the local
review pipeline.

The phase introduces a domain-neutral `ScreeningEngine` port, an isolated Jev
adapter, explicit candidate/range input, validated `ScreeningDecision` output,
and a local screening artifact. It keeps OCR behind its existing
`DeepReviewEngine` port and proves that screening decisions do not leak
provider-specific types into application code.

Phase 3 is intentionally usable without GitHub publication. The current
repository has no GitHub adapter or Phase 2 implementation, so the acceptance
proof is local and artifact-based. Phase 2 is therefore not a prerequisite for
the screening contract, but Phase 2 publication remains out of scope.

## Source-of-truth documents

- `docs/12_IMPLEMENTATION_ROADMAP.md`: Phase 3 tasks, direct-file initial
  scope, and routing acceptance;
- `docs/02_SCOPE_AND_REQUIREMENTS.md`: screening, failure isolation,
  determinism, and security requirements;
- `docs/03_ARCHITECTURE.md`: ports-and-adapters boundaries, composition root,
  and engine isolation;
- `docs/04_REVIEW_PIPELINE.md`: screening input/output, routing policy, and
  Jev failure behavior;
- `docs/06_OCR_JEV_INTEGRATION.md`: Jev's bounded role, explicit PR-range
  input, adapter isolation, and fallback modes;
- `docs/07_DOMAIN_MODEL_AND_CONTRACTS.md`: screening contracts, candidate
  shape, score bounds, and versioned artifacts;
- `docs/09_SECURITY_AND_TRUST_BOUNDARIES.md`: untrusted repository data,
  trusted engine execution, path safety, and secret handling;
- `docs/10_OBSERVABILITY_COST_AND_PERFORMANCE.md`: screening counts and
  bounded execution expectations;
- `docs/11_TESTING_STRATEGY.md`: Jev contract tests and local pipeline tests;
- `docs/13_REPOSITORY_STRUCTURE.md`: target locations for screening ports,
  Jev adapter, and `screening.json`.

## Current-state assessment

The existing tree provides the seams needed for a narrow Phase 3 change:

- `src/application/ports/deep-review-engine.ts` already isolates OCR from the
  application layer;
- `src/application/review-local-range.ts` currently resolves the range,
  collects changed files, invokes OCR, and writes three artifacts;
- `src/domain/review/contracts.ts` already contains `sourceEngines: "jev"`
  but has no screening input, decision, or result contracts;
- `src/composition/build-local-review.ts` is the concrete assembly point for
  Git, OCR, and artifact storage;
- `src/infrastructure/process/exec-file-process-runner.ts` already provides a
  non-shell, timeout-bounded process boundary suitable for a trusted Jev
  executable;
- there is no Jev source, dependency, adapter, screening fixture, screening
  artifact, or screening stage in the current repository;
- the current `DeepReviewInput` contains the full changed-file list, and the
  OCR adapter owns only OCR flags and normalization.

Implication: Phase 3 must add the screening seam and orchestration around the
current local flow. It must not hide screening inside `OcrCliAdapter`, and it
must not introduce impact discovery or selective OCR routing ahead of Phase 5.

## Scope lock

### In scope

- `ScreeningEngine`, `ScreeningInput`, `ScreeningCandidate`,
  `ScreeningDecision`, and `ScreeningResult` contracts;
- deterministic direct-file candidate collection for JS/TS source paths;
- a Jev adapter behind `src/infrastructure/engines/jev/`;
- explicit repository path, base ref/SHA, head ref/SHA, merge-base, and
  candidate input to the adapter;
- removal of any adapter dependence on implicit `git diff HEAD` behavior;
- validation and mapping of raw Jev output into `ScreeningDecision[]`;
- deterministic routing policy for `SKIP`, `LIGHT`, and `DEEP`;
- screening failure fallback that keeps the existing direct OCR review alive,
  records a degraded/partial run, and never fabricates risk scores;
- `screening.json` artifact with versioned envelope and bounded diagnostics;
- local CLI/configuration wiring for a trusted screening executable;
- unit, adapter contract, application, fixture, failure, and architecture
  tests;
- updates to local documentation and verification records.

### Explicitly out of scope

- GitHub PR context, comments, sticky summaries, or Actions (Phase 2);
- structural or semantic impact discovery and untouched-file candidates (Phase
  4 and Phase 6);
- budget planning, priority queues, and making screening decisions select the
  OCR file set (Phase 5);
- post-review Jev verification, deduplication, severity normalization, and
  publication policy (Phase 7);
- checkpoints, incremental review, or cancellation coordination (Phase 8);
- token/cost evaluation experiments or OpenTelemetry (Phase 9);
- support for PHP, Go, or non-JS/TS language analyzers;
- arbitrary execution of scripts, tests, builds, package hooks, or commands
  supplied by the reviewed repository;
- copying a large upstream Jev tree into this repository without a reviewed
  source/license decision.

## Contract decisions

### Screening candidate identity and initial scope

Phase 3 screens only direct changed source files. Candidate collection is a
small deterministic application helper, not an impact analyzer.

Use these extensions to the domain contracts:

```ts
export interface ScreeningCandidate {
  id: string;
  path: string;
  status: ChangedFileStatus;
  previousPath?: string;
  directChange: true;
}

export interface ScreeningInput extends GitReviewRange {
  candidates: ScreeningCandidate[];
}
```

Candidate IDs must be deterministic for the same reviewed path/status. A
rename uses the new path plus its previous path in the identity material.
Candidate paths remain repository-relative and must pass the same traversal
guard used for trusted review input.

The initial source policy includes `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`,
`.tsx`, `.mts`, and `.cts`, including test files. It excludes vendor,
generated, dependency, build-output, lockfile, and binary paths. A skipped
non-source changed file is recorded as a diagnostic, not silently treated as a
screening decision.

### Screening decision and routing

Use the contract shape from `docs/07_DOMAIN_MODEL_AND_CONTRACTS.md`:

```ts
export interface ScreeningDecision {
  candidateId: string;
  relevance: number;
  correctnessRisk: number;
  securityRisk: number;
  reliabilityRisk: number;
  compatibilityRisk: number;
  testGapRisk: number;
  confidence: number;
  action: "SKIP" | "LIGHT" | "DEEP";
  evidence?: string[];
}
```

All numeric values must be finite and in `[0, 1]`. The adapter maps raw Jev
fields into the dimensions; the application policy owns the action so that
provider-specific routing cannot leak into OCR or other engines.

For the first policy version, define `overallRisk` as the maximum of the five
risk dimensions. Route as follows:

```text
relevance < 0.35 AND overallRisk < 0.45 -> SKIP
overallRisk >= 0.75                       -> DEEP
otherwise                                 -> LIGHT
```

Security risk therefore cannot be averaged away by low values in other
dimensions. Thresholds are named policy constants and tested at their exact
boundaries. They are routing parameters, not calibrated defect probabilities.

### Engine result and fallback semantics

The port returns a typed result rather than exposing raw Jev output:

```ts
export interface ScreeningResult {
  status: "ok" | "failed" | "disabled";
  decisions: ScreeningDecision[];
  rawOutput: string;
  rawJson: unknown;
  diagnostics: string[];
  error?: string;
}

export interface ScreeningEngine {
  screen(input: ScreeningInput): Promise<ScreeningResult>;
}
```

The adapter must reject malformed top-level JSON, out-of-range values,
unknown/duplicate candidate IDs, and missing decisions for requested
candidates. A structural validation failure returns `failed` with no partial
decisions; this prevents a missing candidate from being mistaken for `SKIP`.

When screening fails, the application continues the existing OCR path over
the Phase 1 direct range, records screening as degraded, and does not create
synthetic `ScreeningDecision` values. Phase 5 may later interpret this state
as “review direct files deeply”; Phase 3 does not implement that scope planner.

When screening is disabled because no trusted command is configured, the local
run records `screening: disabled` distinctly from `screening: failed`. A Phase
3 acceptance run must use the fixture screening command, so disabled screening
cannot be mistaken for proof of the adapter.

### Jev integration boundary

The default implementation is a trusted executable adapter using the existing
`ProcessRunner`. The application contract is fixed independently of the
upstream command-line shape. Jev-specific flags, raw JSON field names, and
version details remain inside `JevScreeningAdapter`.

The adapter request must carry explicit:

- repository path;
- resolved base/head/merge-base values;
- candidate IDs and repository-relative paths;
- JSON output mode.

It must not infer the review range from the current working tree or run
`git diff HEAD` implicitly. If the selected upstream Jev source requires a
fork to accept explicit range/candidate input, that fork is limited to the
input contract and must preserve its license notice. The fork/source decision
is a pre-implementation checkpoint; no upstream code is fabricated in this
plan.

### Artifact compatibility

Extend `ReviewRunArtifacts` with a versioned screening envelope while
preserving the existing `run.json`, `ocr.raw.json`, and `findings.json`
contracts. Add:

```text
artifacts/screening.json
```

The artifact contains candidate IDs/paths, decisions when status is `ok`,
status, bounded raw/diagnostic data, and the same `runId`, `createdAt`, and
`reviewedHeadSha` envelope fields. It must not contain authorization headers,
provider tokens, or full repository source payloads.

The run status expands to `ok | partial | failed` for application reporting:

- `ok`: screening and OCR succeeded, or screening was explicitly disabled;
- `partial`: OCR succeeded but screening failed;
- `failed`: range, OCR, or artifact persistence failed.

The CLI returns a non-zero exit code for `partial` and `failed`, while still
retaining the fallback artifacts. This makes degraded operation visible to
automation without discarding useful OCR output.

## Task breakdown

### P3-001 — Confirm Jev source and provider contract

Before implementation, inspect the selected Jev source/version and record:

- whether it is available as a trusted executable or library;
- its current input assumptions, especially `git diff HEAD` behavior;
- its raw decision JSON shape and score semantics;
- version and license obligations;
- whether explicit candidate paths can be passed without executing the target
  repository.

Choose one bounded integration mode:

1. invoke a trusted Jev executable through `ProcessRunner`; or
2. adapt a reviewed, license-compatible Jev judgment module behind the same
   `ScreeningEngine` port.

Do not change the application contract based on upstream types. If an input
contract fork is needed, keep it inside `infrastructure/engines/jev/` and
document the exact delta.

Acceptance:

- the chosen mode and version are recorded in the implementation result;
- no Jev dependency is added without a source/license decision;
- the adapter fixture contract is stable enough for deterministic tests.

### P3-002 — Add domain screening contracts and policy

Create or extend:

- `src/domain/review/contracts.ts` for candidate, input, decision, result,
  screening artifact, and `partial` run status;
- `src/application/ports/screening-engine.ts` for the inward-facing port;
- a domain/application policy module for validation-independent route
  selection and the named thresholds;
- a direct-source candidate collector under `src/application/`.

Acceptance:

- domain/application code imports no Node.js, filesystem, process, Jev, or
  provider module;
- candidate IDs are deterministic;
- score and confidence bounds are explicit;
- routing is unit-testable without a Jev process;
- direct candidate collection does not discover untouched files.

### P3-003 — Implement Jev adapter and raw-output validation

Add:

- `src/infrastructure/engines/jev/jev-screening-adapter.ts`;
- a Jev raw-output validator/normalizer;
- bounded diagnostics and timeout/output-limit handling using
  `ProcessRunner`;
- provider-specific request construction with explicit range and candidates.

The adapter must:

1. pass arguments as an array with `shell: false` through the existing process
   boundary;
2. avoid installing dependencies or invoking repository scripts;
3. preserve bounded stdout as the raw artifact input;
4. map valid records to `ScreeningDecision[]`;
5. fail conservatively on malformed or incomplete decisions;
6. include no upstream types outside the Jev infrastructure directory.

Contract tests must cover valid decisions, malformed JSON, invalid score,
invalid confidence, unknown candidate, duplicate candidate, missing candidate,
timeout, output limit, non-zero exit, and partial stdout.

### P3-004 — Insert screening into the local application flow

Extend `LocalReviewDependencies` and `reviewLocalRange` so the flow becomes:

```text
resolve range
  -> collect changed files
  -> collect direct JS/TS screening candidates
  -> screen candidates
  -> continue existing direct OCR review
  -> write run + screening + OCR + findings artifacts
```

The Phase 3 application stage must not pass Jev objects to
`OcrCliAdapter`. OCR continues to receive `DeepReviewInput` through its own
port. Screening decisions are observable in the application result and
artifact, but they do not yet change the OCR file set; selective deep-review
scope belongs to Phase 5.

Failure behavior:

- no screenable source files: screening succeeds with an empty decision list;
- screening disabled: record disabled state and preserve the legacy OCR path;
- screening failure: continue OCR, mark the run `partial`, preserve
  diagnostics, and emit no fabricated decisions;
- OCR failure: keep existing no-fabricated-findings behavior and mark the run
  `failed`;
- artifact failure: mark the command failed after reporting the persistence
  diagnostic.

Acceptance:

- a stub screening engine can return `DEEP`, `LIGHT`, and `SKIP` for three
  direct files;
- the OCR engine remains replaceable and receives no Jev-specific type;
- a screening failure still produces OCR artifacts and an explicit partial
  status.

### P3-005 — Wire composition and CLI configuration

Extend `src/composition/build-local-review.ts` to assemble the screening
adapter without moving concrete imports into application or entrypoint code.

Add explicit local options:

```text
--screening-command <path>
--screening-arg <arg>        repeatable
```

Use `SCREENING_COMMAND` only as a trusted environment fallback. Keep
screening command arguments separate from OCR arguments. If no command is
provided, use the explicit disabled mode described in the contract decisions;
do not silently substitute a fake or heuristic Jev result.

Update help and diagnostics so users can distinguish:

- missing range/OCR input;
- screening disabled;
- screening failed with OCR fallback;
- full run failure.

### P3-006 — Add artifacts, fixtures, and integration coverage

Add a trusted orchestrator-owned fixture screening executable and a local
fixture scenario with three changed JS/TS files. The fixture should emit a
deterministic decision for each candidate so the test can assert:

```text
file A -> DEEP
file B -> LIGHT
file C -> SKIP
```

Add tests for:

- policy threshold boundaries and security-risk precedence;
- direct-source candidate filtering and deterministic IDs;
- Jev adapter request arguments and output normalization;
- missing/invalid/duplicate candidate decisions;
- screening artifact envelope and reviewed head SHA;
- successful local run with all three actions;
- screening failure with OCR fallback and `partial` status;
- no screenable files;
- CLI help, command/env configuration, and exit codes;
- updated architecture boundary expectations.

The fixture process is test-owned and trusted. Its presence does not grant
permission to execute scripts from a reviewed repository.

### P3-007 — Preserve existing gates and documentation

Update:

- `README.md` with the current local Phase 3 invocation and the explicit
  distinction between screening and adaptive OCR scope;
- `docs/implementation-plans/README.md` with the Phase 3 plan link;
- the implementation result section below after coding.

Run the existing gates plus focused checks:

```bash
npm run typecheck
npm run lint
npm run boundaries
npm test
npm run review -- --help
npm audit
```

Review security properties for shell metacharacters, path traversal, bounded
provider output, secret-shaped diagnostics, and absence of target-repository
script execution.

## Dependency order

```text
P3-001
   |
   v
P3-002 ------+----------------+
   |         |                |
   v         v                v
P3-003    P3-004           P3-005
   |         |                |
   +---------+----------------+
             v
          P3-006
             |
             v
          P3-007
```

P3-001 is the only external/source decision gate. After it, P3-002 defines
the stable inward contracts. P3-003 can proceed independently of the local
orchestration once those contracts exist. P3-004 and P3-005 integrate the
stage, P3-006 provides the first end-to-end proof, and P3-007 is the release
gate.

## Definition of done

Phase 3 is complete only when, from a clean checkout with the selected trusted
screening fixture available:

1. `ScreeningEngine` is defined behind an application port;
2. Jev-specific imports/types are confined to the Jev infrastructure adapter;
3. explicit base/head/merge-base and direct candidate paths reach the adapter;
4. no screening logic assumes `git diff HEAD` or the current working tree;
5. raw results map to validated `ScreeningDecision[]` with bounded scores;
6. a local run produces `DEEP`, `LIGHT`, and `SKIP` decisions for three direct
   source files;
7. `artifacts/screening.json` carries the same reviewed head/envelope identity
   as the existing artifacts;
8. a Jev failure falls back to OCR without fabricated decisions and is marked
   `partial`;
9. OCR code remains unaware of Jev or screening-provider details;
10. screening does not yet select the OCR scope, discover untouched files, or
    publish GitHub comments;
11. typecheck, lint, boundary, unit/contract/integration tests, CLI help, and
    audit gates pass.

Expected local artifact set:

```text
artifacts/run.json
artifacts/screening.json
artifacts/ocr.raw.json
artifacts/findings.json
```

## Risks and explicit follow-ups

- **Jev source unavailable or input contract drift:** keep the adapter
  contract stable, pin the selected version, and make the source/license
  checkpoint block only the provider implementation, not the domain tests.
- **Ambiguous score semantics:** preserve raw bounded fields and document the
  mapping; do not call routing scores defect probabilities.
- **Partial provider output:** fail the screening stage conservatively and
  continue direct OCR rather than turning missing decisions into `SKIP`.
- **Phase 2 absence:** validate locally and keep publication untouched; add a
  later publisher integration only in the Phase 2 plan.
- **Scope creep into Phase 5:** do not alter `DeepReviewInput` to carry a
  screened file subset until budget and scope planning are explicitly added.
- **Artifact privacy:** bound provider output and diagnostics; never persist
  authorization headers or full source payloads by default.
- **Environment reproducibility:** the current workspace has no installed
  `tsc`, `eslint`, or `vitest` binaries, so final gates require dependency
  installation in the implementation environment.

## Verification record

Before implementation:

- [x] `docs/12_IMPLEMENTATION_ROADMAP.md` Phase 3 reviewed;
- [x] architecture, pipeline, Jev/OCR integration, contracts, security,
      observability, testing, and repository-structure documents reviewed;
- [x] current Phase 0/1 source and tests reviewed;
- [x] current boundary check passes for 19 source files;
- [x] upstream Jev repository reviewed: staged typed judgments, current-diff
      CLI, MIT license; adapter remains subprocess-based and does not vendor it;
- [x] typecheck, lint, boundary, unit, CLI, and local integration gates run
      after dependency installation;
- [ ] native CLI/full-test command rerun without the temporary Node 26 runtime
      shim; current environment fails in `tsx` at `os.userInfo()` with
      `uv_os_get_passwd returned ENOMEM`.

After implementation, record separately:

- selected Jev integration mode and version/license evidence;
- commands run and results;
- files changed;
- screening fixture and artifact evidence;
- failure/fallback evidence;
- checks blocked by environment;
- any scope deviation.

## Implementation result

Status: Phase 3 implementation complete for the local screening slice.

Implemented:

- domain screening contracts and deterministic direct JS/TS candidate
  collection;
- routing policy with bounded scores and `SKIP`/`LIGHT`/`DEEP` actions;
- Jev-compatible subprocess adapter with explicit range/candidate arguments,
  conservative validation, bounded diagnostics, and secret redaction;
- local pipeline screening stage, disabled mode, OCR fallback, and `partial`
  run status;
- `screening.json` artifact and trusted screening fixture;
- Windows-safe execution of trusted `.js`/`.mjs` process fixtures without
  enabling shell execution;
- unit, adapter contract, architecture, CLI, Phase 1 regression, and Phase 3
  integration tests.

Verification evidence on 2026-09-30:

- `npm run typecheck` — pass;
- `npm run lint` — pass after removing temporary verification harness;
- `npm run boundaries` — pass: 25 source files;
- full `vitest` suite — 12 files, 27 tests passed when run with a temporary
  Node 26 `os.userInfo()` compatibility shim;
- `npm audit` — dependency audit request was blocked by the registry endpoint
  in this environment after install reported 0 vulnerabilities;
- native `npm run review -- --help` and child-process CLI tests remain
  environment-limited by the same Node 26 `tsx` `uv_os_get_passwd` error;
- no GitHub publication, impact discovery, or adaptive OCR scope was added.
