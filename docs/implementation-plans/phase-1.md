# Phase 1 Implementation Plan

## Purpose

This document turns Phase 1 in `docs/12_IMPLEMENTATION_ROADMAP.md` into an
execution-ready local vertical-slice plan.

The slice starts from an explicit local repository range, invokes OCR through a
trusted adapter, normalizes the result into the project's finding contract, and
writes inspectable local artifacts. It deliberately stops before GitHub
publication, Jev screening, impact discovery, and automatic triggers.

## Source-of-truth documents

- `docs/12_IMPLEMENTATION_ROADMAP.md`: Phase 1 tasks and artifact acceptance;
- `docs/02_SCOPE_AND_REQUIREMENTS.md`: PR context, changed files, finding
  normalization, artifact retention, and failure behavior;
- `docs/03_ARCHITECTURE.md`: ports-and-adapters and composition root;
- `docs/04_REVIEW_PIPELINE.md`: context/range resolution and deep-review
  failure semantics;
- `docs/06_OCR_JEV_INTEGRATION.md`: OCR adapter boundary and JSON request;
- `docs/07_DOMAIN_MODEL_AND_CONTRACTS.md`: `ReviewFinding`, locations, IDs,
  and versioned artifacts;
- `docs/09_SECURITY_AND_TRUST_BOUNDARIES.md`: read-only PR data and no
  repository-script execution;
- `docs/11_TESTING_STRATEGY.md`: adapter contract and fixture-repository tests;
- `docs/13_REPOSITORY_STRUCTURE.md`: source placement and artifact layout;
- `docs/implementation-plans/phase-0.md`: completed bootstrap constraints.

## Scope lock

### In scope

- local `GitRepositoryPort` and Git CLI adapter;
- explicit `--repo`, `--from`, and `--to` CLI inputs;
- base SHA, head SHA, and merge-base resolution;
- changed-file extraction for the resolved range;
- OCR CLI adapter with JSON output, timeout, and non-zero-exit handling;
- normalized `ReviewFinding[]` output;
- local artifacts:
  `artifacts/run.json`, `artifacts/ocr.raw.json`, and
  `artifacts/findings.json`;
- fixture Git repository with `main` and `feature` branches;
- trusted fake OCR executable for deterministic tests;
- Phase 0 verification gates.

### Explicitly out of scope

- GitHub API, PR comments, summaries, inline publication, and Actions;
- Jev screening or any impact discovery;
- semantic intent extraction;
- OCR model/provider credentials in the fixture repository;
- execution of package scripts, tests, builds, hooks, or arbitrary commands from
  the target repository;
- incremental checkpoints and multi-repository support;
- production deployment or automatic triggers.

## Contract decisions

### Local review command

The Phase 1 command is:

```bash
npm run review -- \
  --repo ./tests/fixtures/repos/pr-range \
  --from main \
  --to feature
```

The command must resolve refs inside the selected repository and record the
resulting immutable SHAs. Branch names are input labels; SHA pairs are the
identity of the run.

The trusted OCR executable is supplied with `--ocr-command <path>` or the
`OCR_COMMAND` environment variable; `--ocr-arg` may be repeated for fixed
executable arguments. The adapter never invokes a shell.

### Git range semantics

The adapter must resolve:

```text
baseSha      = rev-parse(from)
headSha      = rev-parse(to)
mergeBaseSha = merge-base(baseSha, headSha)
reviewRange  = mergeBaseSha..headSha
```

The initial changed-file list is derived from
`git diff --name-status --find-renames mergeBaseSha headSha`. Deleted and
renamed paths remain part of the normalized context.

All Git commands use argument arrays and a selected `cwd`; no shell string is
constructed. Ref resolution must reject missing, ambiguous, or non-commit refs
with an actionable error.

### OCR process boundary

Define a domain-neutral port:

```ts
interface DeepReviewEngine {
  review(input: DeepReviewInput): Promise<DeepReviewResult>;
}
```

The infrastructure adapter owns OCR-specific flags and JSON shape. The
application layer sees neither OCR CLI flags nor upstream types.

The process runner must:

- invoke a configured trusted executable with `shell: false`;
- pass arguments as an array;
- set the repository as read-only input context;
- enforce timeout and output-size limits;
- capture stdout as raw artifact data;
- capture stderr as diagnostics without secrets;
- return a typed failure on non-zero exit or invalid JSON.

The adapter must not install dependencies or execute repository-defined scripts.

### Normalized finding contract

Phase 1 uses the `ReviewFinding` contract from
`docs/07_DOMAIN_MODEL_AND_CONTRACTS.md`. The OCR normalizer must populate at
least:

- `id`;
- stable `fingerprint`;
- `sourceEngines: ["ocr"]`;
- `type`;
- `severity`;
- `confidence`;
- `title`;
- `message`;
- `primaryLocation`;
- `evidence`;
- `actionable`.

A finding with an invalid type, severity, confidence, or message is rejected
with a normalization diagnostic. Missing optional line information is allowed;
missing path or message is not. No finding is fabricated from malformed output.

Use a deterministic fingerprint based on normalized type, path, symbol or
mechanism, and normalized root-cause text. Do not use the mutable line number
as the only identity component.

### Artifact contract

Write the three roadmap-required files under an output directory:

```text
artifacts/
├── run.json
├── ocr.raw.json
└── findings.json
```

Every file includes:

```json
{
  "schemaVersion": 1,
  "runId": "...",
  "createdAt": "...",
  "reviewedHeadSha": "..."
}
```

`run.json` records repository path, input refs, resolved SHAs, merge-base,
changed-file count, OCR status, and degraded status. The raw OCR file preserves
the exact stdout bytes as parsed JSON plus bounded diagnostics metadata.
`findings.json` contains normalized findings only.

Artifact writes must create the output directory, write UTF-8 JSON, and avoid
including tokens, authorization headers, or full stderr by default.

## Task breakdown

### P1-001 — Add domain and application contracts

Create or extend:

- `RepositoryPath` / local repository input contract;
- `GitReviewRange`;
- `ChangedFile`;
- `DeepReviewInput`;
- `RawEngineFinding`;
- `ReviewFinding`;
- run/artifact metadata contracts;
- failure/result types that distinguish invalid input, process failure, and
  malformed OCR output.

Acceptance:

- contracts contain no Node.js, child-process, filesystem, OCR SDK, or GitHub
  imports;
- optional fields preserve the distinctions in `docs/07`;
- artifact schema version is explicit from the first write.

### P1-002 — Implement Git repository adapter

Add `GitRepositoryPort` and a `GitCliAdapter` using a small process runner.

Implement:

1. repository path validation;
2. ref-to-commit resolution;
3. merge-base resolution;
4. changed-file extraction;
5. stable error mapping.

Acceptance:

- same fixture range always produces the same SHA pair and changed paths;
- missing ref, non-repository path, and failed Git command are differentiated;
- no shell interpolation is used.

### P1-003 — Implement OCR process and normalizer

Add:

- OCR request/response adapter;
- trusted process runner;
- JSON parser/validator;
- normalizer to `ReviewFinding[]`;
- bounded stderr and diagnostic handling.

Contract tests must cover:

- valid JSON with one finding;
- multiple findings;
- malformed JSON;
- missing location;
- invalid severity/confidence;
- timeout;
- non-zero exit;
- partial stdout.

OCR failure must stop normal finding publication for the run and preserve a
failure artifact; it must never produce fabricated findings.

### P1-004 — Implement artifact store

Add a local filesystem artifact store for the three required files.

Acceptance:

- output is deterministic apart from `runId` and timestamps;
- all artifacts carry schema version and reviewed head SHA;
- raw and normalized artifacts are distinguishable;
- sensitive process data is excluded by default;
- partial artifact writes are reported as run failure.

### P1-005 — Extend the local CLI

Add:

```text
--repo <path>
--from <ref>
--to <ref>
--output <path>    optional, defaults to artifacts
```

The CLI must:

1. validate arguments;
2. resolve the Git range;
3. collect changed files;
4. invoke OCR;
5. normalize findings;
6. write artifacts;
7. exit non-zero on invalid input, Git failure, OCR failure, or artifact failure.

The CLI must not publish comments or invoke GitHub APIs.

### P1-006 — Add fixture repository and integration test

Create a trusted fixture repository with:

- a `main` branch;
- a `feature` branch;
- one changed source file;
- one changed or added test;
- a deterministic fake OCR executable that emits JSON;
- a failure mode for malformed JSON or non-zero exit.

The integration test invokes the CLI against the fixture and asserts:

- resolved base/head/merge-base;
- changed file status;
- OCR raw artifact;
- normalized finding;
- reviewed head SHA;
- failure behavior and absence of fabricated findings.

The fixture executable is orchestrator-owned test code. It is not representative
permission to execute arbitrary scripts from a target repository.

### P1-007 — Preserve Phase 0 and security gates

Run:

```bash
npm run typecheck
npm run lint
npm run boundaries
npm test
npm run review -- --help
npm audit
```

Add focused checks for:

- path traversal in `--repo` and `--output`;
- symlink or output-path escape where applicable;
- shell metacharacters passed as data, not interpreted;
- secret-shaped stderr and environment values are not written to artifacts;
- OCR timeout terminates the child process;
- target repository scripts are never invoked.

## Dependency order

```text
P1-001
   |
   +--> P1-002 ------+
   |                 |
   +--> P1-003 ------+--> P1-005 --> P1-006
   |                 |                 |
   +--> P1-004 ------+                 v
   +--------------------------------> P1-007
```

P1-002, P1-003, and P1-004 can be developed behind the contracts in parallel.
P1-005 integrates them. P1-006 is the first end-to-end proof and P1-007 is the
final gate.

## Definition of done

From a clean checkout:

```bash
npm run typecheck
npm run lint
npm run boundaries
npm test
npm run review -- \
  --repo ./tests/fixtures/repos/pr-range \
  --from main \
  --to feature
```

The run must produce:

```text
artifacts/run.json
artifacts/ocr.raw.json
artifacts/findings.json
```

The run is accepted only if:

1. the exact base SHA, head SHA, and merge-base are recorded;
2. OCR was invoked through the adapter and requested JSON;
3. normalized findings are valid `ReviewFinding[]`;
4. raw OCR output is retained separately;
5. malformed or failed OCR produces no fabricated finding;
6. no GitHub comment, Action, Jev, or impact analyzer is required.

## Risks and explicit follow-ups

- OCR CLI flags may drift: keep them inside the adapter and add an adapter
  contract test;
- OCR output shape may differ from the assumed fixture: treat the fixture as a
  contract, not as proof of upstream behavior;
- local Git refs may be ambiguous: resolve to commits before artifact creation;
- large stdout/stderr can exhaust memory: enforce bounded capture;
- artifact paths may escape the workspace: validate and resolve them before
  writing;
- full repository execution remains prohibited until a separately reviewed
  privileged/untrusted execution design exists.

## AAS selection

Phase 1 used the local AAS catalog
`agentic-awesome-skills@16.5.0` and composed stack
`code-review-orchestrator-phase-1`.

Selected skills:

- `architecture-patterns` — keep Git/OCR behind ports and adapters;
- `javascript-pro` — Node.js process and async API patterns;
- `ai-native-cli` — explicit CLI inputs, errors, exit codes, and JSON output;
- `frontend-data-contracts` — parse wire JSON before trusting domain data;
- `atlas-contract` — preserve stable contracts and validation boundaries;
- `javascript-testing-patterns` — unit, contract, and fixture tests;
- `007` — threat boundary and read-only execution review;
- `blueprint` — dependency-aware implementation order.

Catalog gap: no focused AAS skill matched local Git
`merge-base`/range semantics. That part remains grounded in Git commands,
repository fixtures, and the project's own contract tests.

AAS content is advisory and untrusted; repository documents and the acceptance
criteria above remain authoritative.

## Implementation result

Phase 1 local vertical slice is implemented in the current tree:

- Git adapter resolves `from`, `to`, and `merge-base`, then parses changed files;
- OCR runs through `execFile` with `shell: false`, bounded output, timeout, and
  JSON normalization;
- normalized findings follow the domain contract with deterministic fingerprints;
- filesystem artifact store writes `run.json`, `ocr.raw.json`, and `findings.json`;
- CLI supports `--repo`, `--from`, `--to`, `--output`, `--ocr-command`, and
  repeated `--ocr-arg`;
- success and malformed-JSON failure paths are covered by fixture integration tests.

Verification on 2026-09-29:

- `npm run typecheck` — pass;
- `npm run lint` — pass;
- `npm run boundaries` — pass: 19 source files;
- `npm test` — pass: 7 test files, 14 tests;
- `npm run review -- --help` — pass;
- `git diff --check` — pass.

Known boundary: this phase does not execute target-repository scripts, and it
does not implement Jev, impact analysis, GitHub publication, Actions, or
provider credentials.

