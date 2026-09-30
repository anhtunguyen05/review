# Phase 4 Implementation Plan

## Purpose

Implement the first structural impact-discovery slice for JavaScript and
TypeScript repositories. The slice must find untouched consumers of changed
files or symbols, explain every candidate with deterministic evidence, and
make the result available to the existing local review artifacts.

Phase 4 adds discovery only. It does not yet use discovery results to reduce
the OCR input set; selective OCR routing belongs to Phase 5.

## Source-of-truth documents

- `docs/12_IMPLEMENTATION_ROADMAP.md`: Phase 4 deliverables and acceptance.
- `docs/02_SCOPE_AND_REQUIREMENTS.md`: impact, explainability, determinism,
  security, and artifact requirements.
- `docs/03_ARCHITECTURE.md`: ports-and-adapters boundaries and composition
  root rules.
- `docs/04_REVIEW_PIPELINE.md`: impact-discovery position and direct-file
  fallback behavior.
- `docs/05_IMPACT_DISCOVERY.md`: V1 analyzers, reasons, scoring, search
  strategy, and acceptance fixtures.
- `docs/07_DOMAIN_MODEL_AND_CONTRACTS.md`: impact graph and candidate shapes.
- `docs/09_SECURITY_AND_TRUST_BOUNDARIES.md`: read-only repository handling,
  path safety, and untrusted-source rules.
- `docs/10_OBSERVABILITY_COST_AND_PERFORMANCE.md`: bounded discovery and
  performance targets.
- `docs/11_TESTING_STRATEGY.md`: fixture, integration, and security coverage.
- `docs/13_REPOSITORY_STRUCTURE.md`: intended impact module placement.

## Current-state assessment

Phase 3 is implemented as a local screening slice:

- `src/domain/review/contracts.ts` contains the current review, screening,
  artifact, and range contracts.
- `src/application/review-local-range.ts` resolves the range, gets changed
  files, screens direct JS/TS files, and sends the complete changed-file list
  to OCR.
- `src/application/ports/screening-engine.ts` and the Jev adapter establish
  the existing provider boundary.
- `src/infrastructure/git/git-cli-adapter.ts` resolves ranges and changed
  paths, but no application port currently reads a repository snapshot for
  impact analysis.
- `FileSystemArtifactStore` persists `run.json`, `screening.json`,
  `ocr.raw.json`, and `findings.json`; it has no impact artifact yet.
- Existing tests cover direct screening and local fallback, but no untouched
  consumer or structural impact graph exists.

## Understanding summary

- Build structural impact discovery for JS/TS as the first major
  differentiating feature.
- Discover importers, symbol/text references, related tests, and config/schema
  consumers using repository evidence.
- Return deterministic graph nodes, edges, candidates, scores, and reasons.
- Integrate discovery after range resolution and before screening.
- Preserve the Phase 3 OCR input behavior; Phase 4 must not implement adaptive
  OCR scope.
- Persist a versioned `impact-graph.json` artifact with the reviewed head SHA.
- Prove the feature with an `enum-regression` fixture where an untouched
  consumer is discovered.

## Scope lock

### In scope

- Impact graph, edge, reason, candidate, and discovery-result contracts.
- A read-only repository-content port backed by Git snapshot reads.
- JS/TS static import and re-export discovery.
- Bounded symbol/text reference search.
- Test relation discovery.
- Config/schema key reference discovery.
- Composite result merging, reason deduplication, deterministic scoring, and
  graph-depth/candidate limits.
- Local review integration and `impact-graph.json` persistence.
- Typed impact policy defaults and trusted local configuration support.
- Unit, analyzer contract, integration, fixture, failure, security, and
  architecture-boundary tests.
- README and implementation-plan index updates.

### Explicitly out of scope

- Selective OCR input, budget planning, priority queues, or concurrency
  planning; these are Phase 5.
- Semantic/LLM intent discovery; this is Phase 6.
- GitHub context, comments, publication, or Actions; these remain separate
  roadmap work.
- PHP, Go, or other language-specific analyzers.
- Full call-graph/data-flow analysis.
- A new AST/compiler dependency in this phase. The initial implementation uses
  bounded deterministic parsing/search and leaves AST precision as a follow-up.
- Checkpoints, incremental review, post-review verification, deduplication, or
  publication policy.
- Execution of repository scripts, tests, builds, package hooks, or workflows.

## Assumptions and non-functional defaults

- Discovery reads the reviewed Git snapshots and does not checkout or execute
  the target repository.
- Added/modified files are inspected at `headSha`; deleted files and the old
  side of renames are inspected at `baseSha` when available.
- Repository-relative paths must remain inside the repository and must not be
  absolute, traversal-based, binary, generated, vendor, dependency, lock, or
  oversized paths.
- Default maximum graph depth is `2`.
- Default maximum candidate count is `80`.
- Default per-file read limit is a named bounded policy value (initially
  `512 KiB`) and must be enforced before parsing/searching.
- Tests are included by default; documentation is searchable for textual and
  config evidence but is not treated as source code.
- The target is deterministic discovery in under approximately 15 seconds for
  a medium repository; this is an engineering target, not a guarantee.
- Impact scores rank review scope and are not defect probabilities.
- If impact discovery fails, the run continues over direct changed files,
  records the failure, and becomes `partial` unless a later stage already
  fails the run.

## Decision log

### D4-001 - Use composite deterministic analyzers

**Decision:** Define one `ImpactAnalyzer` application port and compose
independent infrastructure analyzers for imports, references, tests, and
config/schema keys.

**Alternatives:** Put all logic in one structural analyzer, or make an AST
engine the primary implementation.

**Reason:** The composite keeps signal-specific logic replaceable and
testable, matches the existing ports-and-adapters architecture, and avoids
adding parser complexity before the contract is proven.

### D4-002 - Read repository content through a dedicated port

**Decision:** Add a read-only repository-content port. The Git adapter will
list and read files at explicit commits using Git commands with bounded output.

**Alternatives:** Let analyzers use filesystem APIs directly, or extend every
existing Git operation with ad-hoc content behavior.

**Reason:** The port preserves application boundaries, makes analyzer tests
fully deterministic, and prevents accidental execution or working-tree reads.

### D4-003 - Analyze the correct snapshot for deletes and renames

**Decision:** Analyze new content at `headSha`; use `baseSha` for deleted paths
and previous rename paths when the anchor exists only before the change.

**Alternatives:** Analyze only `headSha`, or reject deleted/renamed files.

**Reason:** Removed contracts can still affect untouched consumers, and rename
  identity must retain both sides without losing pre-change anchors.

### D4-004 - Keep discovery separate from OCR routing

**Decision:** Persist impact candidates and reasons, but continue passing the
Phase 3 changed-file set to OCR.

**Alternatives:** Immediately pass impacted files to OCR or make screening
decisions control OCR scope.

**Reason:** Adaptive scope requires Phase 5 budgets and priority policy; mixing
it into Phase 4 would make acceptance and failure behavior ambiguous.

### D4-005 - Fail conservatively with direct-file fallback

**Decision:** A discovery failure yields no fabricated impact candidates,
retains direct files, records bounded diagnostics, and marks the run partial.

**Alternatives:** Treat missing discovery as success with an empty graph, or
fail the whole run before OCR.

**Reason:** Empty success would hide coverage loss, while a hard failure would
discard useful Phase 3 review output.

## Contract and design

### Domain contracts

Extend `src/domain/review/contracts.ts` with the shapes already established in
the design documents:

- `ImpactNode`: stable node ID, repository-relative `CodeLocation`, and
  `directChange`.
- `ImpactEdge`: source/target node IDs, structural relation kind, and bounded
  evidence.
- `ImpactReason`: direct, importer, symbol reference, caller, implementation,
  test relation, config reference, or text reference.
- `ImpactCandidate`: stable candidate ID, node ID, deterministic score, and
  non-empty reasons.
- `ImpactGraph`: nodes, edges, and candidates.
- `ImpactDiscoveryInput`: `GitReviewRange`, changed files, and impact policy.
- `ImpactDiscoveryResult`: `ok` or `failed`, graph, diagnostics, and optional
  error.

Keep locations compatible with the current local contract. Do not introduce
GitHub-only repository identifiers into the local Phase 4 path.

### Application ports and policy

Add:

- `src/application/ports/impact-analyzer.ts` with `discover(input)`;
- `src/application/ports/repository-content.ts` for explicit commit-based
  file listing and reads;
- `src/application/discover-impact.ts` for orchestration and conservative
  result handling;
- a domain/application impact policy module for ignored paths, size limits,
  graph depth, candidate cap, and deterministic score constants.

The application layer must depend only on the domain contracts and ports. It
must not import `node:fs`, `node:child_process`, `rg`, or analyzer classes.

### Infrastructure analyzers

Create a bounded impact module with:

- `src/infrastructure/impact/languages/typescript-analyzer.ts` for static
  imports, exports, re-exports, and module resolution;
- `src/infrastructure/impact/text-reference-analyzer.ts` for changed symbol
  and key references;
- `src/infrastructure/impact/test-relation-analyzer.ts` for test imports and
  mirrored test paths;
- `src/infrastructure/impact/config-schema-analyzer.ts` for config/schema key
  consumers;
- `src/infrastructure/impact/composite-impact-analyzer.ts` for fragment merge,
  graph expansion, reason aggregation, scoring, and limits.

`src/infrastructure/git/git-cli-adapter.ts` or a small adjacent Git content
adapter will implement the repository-content port. All process invocation
must use argument arrays, `shell: false`, timeouts, output limits, and redacted
diagnostics.

### Application integration

Update:

- `src/application/review-local-range.ts` to run discovery before screening;
- `src/application/review-local-range.ts` result/status contracts to expose
  impact state without changing OCR input;
- `src/domain/review/contracts.ts` and
  `src/infrastructure/storage/filesystem-artifact-store.ts` for
  `impact-graph.json`;
- `src/composition/build-local-review.ts` to assemble the content port and
  composite analyzer;
- `src/config/schema.ts`, `src/config/loader.ts`, and CLI/bootstrap wiring for
  trusted impact defaults/overrides, without reading untrusted PR-head config;
- `src/entrypoints/cli/review.ts` help text and diagnostics to mention impact
  discovery and degraded fallback.

## Action items

[x] **P4-001 - Freeze the impact contract and policy.** Extend the domain
contracts, define `ImpactAnalyzer` and repository-content ports, name all
limits/reason kinds, and add tests for candidate/reason invariants.

[x] **P4-002 - Add safe Git snapshot content access.** Implement file listing
and bounded reads at explicit base/head commits, including path validation,
delete/rename snapshot selection, timeout handling, and secret-safe errors.

[x] **P4-003 - Implement JS/TS import discovery.** Resolve relative static
imports, exports, re-exports, and supported `require` forms without executing
source; emit deterministic importer/reference edges and evidence.

[x] **P4-004 - Implement deterministic reference analyzers.** Extract bounded
changed anchors and search symbol/text references, test relations, and
config/schema keys while applying ignored/generated/binary/size filters.

[x] **P4-005 - Implement composite graph construction.** Merge analyzer
fragments, deduplicate nodes/edges/reasons, enforce maximum depth and candidate
count, calculate named scope-relevance scores, and require a reason per
candidate.

[x] **P4-006 - Integrate discovery into the local flow.** Invoke discovery
after changed-file resolution, preserve direct files, keep OCR input unchanged,
record partial fallback behavior, and expose impact diagnostics in the result.

[x] **P4-007 - Persist and configure impact artifacts.** Add the versioned
`impact-graph.json` envelope, wire the composite in the composition root, add
trusted config defaults/overrides, and update CLI help/output.

[x] **P4-008 - Add analyzer and contract coverage.** Add unit and contract tests
for import resolution, anchor extraction, reason aggregation, scoring,
deduplication, snapshot selection, depth/candidate limits, and malformed or
bounded repository content.

[x] **P4-009 - Add fixture and local integration proof.** Create the
`enum-regression` scenario, run the CLI over a temporary Git repository, assert
the untouched consumer and reason, verify artifact envelope identity, and
prove OCR still receives the original Phase 3 changed-file set.

[x] **P4-010 - Close security, regression, and documentation gates.** Add
failure, path/symlink, binary/large-file, architecture-boundary, and Phase 3
regression tests; update README and the plan index; run all documented checks
and record evidence or environment limitations.

## Dependency order

```text
P4-001
   |
   +--> P4-002 ------+
   |                 |
   +--> P4-003 ------+
   |                 |
   +--> P4-004 ------+--> P4-005 --> P4-006 --> P4-007
                     |                 |
                     +--> P4-008 ------+
                                       v
                                  P4-009 --> P4-010
```

The contract and policy must be stable before analyzer implementation. Git
snapshot access is an independent prerequisite for every infrastructure
analyzer. Composite behavior must be proven before application wiring, and
the fixture/integration gate is required before calling the phase complete.

## Definition of done

Phase 4 is complete only when:

1. An application-level `ImpactAnalyzer` port exists and concrete analyzers
   remain in infrastructure.
2. Repository content is read at explicit commits through a bounded,
   read-only port; reviewed source is never executed.
3. V1 discovers JS/TS imports/re-exports, symbol/text references, test
   relations, and config/schema references with deterministic evidence.
4. Every impact candidate has at least one reason, and scores are documented
   as scope relevance rather than defect probability.
5. Graph expansion respects configured depth, ignored paths, file-size limits,
   and maximum candidate count.
6. The `enum-regression` fixture finds the untouched consumer of the changed
   enum/state and records the structural reason.
7. `impact-graph.json` carries the same `runId`, `createdAt`, and
   `reviewedHeadSha` identity as the existing artifacts.
8. Discovery failure preserves direct-file OCR review, emits bounded
   diagnostics, and marks the run `partial` without fabricated candidates.
9. Phase 3 OCR behavior and screening boundaries remain unchanged; discovery
   does not select the OCR file set.
10. Typecheck, lint, dependency-boundary, unit, contract, fixture integration,
    CLI, regression, and security checks pass in the implementation
    environment.

## Validation plan

Focused checks during implementation:

```bash
npm run typecheck
npm run lint
npm run boundaries
npm test -- --run tests/unit tests/architecture
```

Phase acceptance checks:

```bash
npm test
npm run review -- --help
npm audit
```

The final verification record must separately report passed checks, blocked
checks, fixture/artifact evidence, and any environment-specific limitation.
Do not claim live GitHub or production runtime proof from this local phase.

## Risks and follow-ups

- **Lexical false positives:** keep evidence and reason kinds explicit, rank
  weak text matches below structural edges, and defer AST precision to a
  follow-up with evaluation fixtures.
- **Import resolution differences:** support the documented JS/TS forms and
  record unresolved imports as diagnostics instead of inventing edges.
- **Deleted/renamed content:** select the correct base/head snapshot and test
  both paths explicitly.
- **Large repositories:** enforce file, graph, candidate, output, and time
  limits; record exclusions rather than silently truncating.
- **Security boundary drift:** keep all process execution in infrastructure,
  use `shell: false`, and add regression tests for traversal and symlink
  escape.
- **Scope creep into Phase 5:** do not alter `DeepReviewInput` or OCR routing
  until budget and scope-planner contracts are introduced.

## Open questions

No blocking questions remain for Phase 4. The exact lexical grammar supported
by the TypeScript analyzer may be narrowed during implementation as long as
unsupported constructs produce diagnostics and the `enum-regression`
acceptance remains covered.

## Implementation result

Status: Phase 4 implementation complete for the local structural impact slice.

Implemented:

- impact graph, edge, reason, candidate, policy, analyzer, and result
  contracts;
- bounded Git snapshot content access with explicit commit/path inputs,
  binary/size checks, and read-only process execution;
- deterministic JS/TS import/re-export/require discovery;
- symbol/text reference, test relation, and config/schema analyzers;
- composite graph merge, reason deduplication, score aggregation, depth and
  candidate limits;
- local review integration with conservative direct-file fallback and
  `partial` impact status;
- versioned `impact-graph.json` artifact and trusted impact configuration;
- enum-regression acceptance coverage using a real temporary Git repository;
- unit, architecture, fallback, security-boundary, and Phase 1/3 regression
  coverage;
- README and implementation-plan index updates.

Verification evidence on 2026-09-30:

- `npm run typecheck` - pass;
- `npm run lint` - pass;
- `npm run boundaries` - pass for 35 source files;
- full Vitest suite - 18 files, 38 tests passed when run with a temporary
  Node 26 `os.userInfo()` compatibility shim; the shim was removed after the
  run and is not part of the implementation;
- `npm run review -- --help` - pass with the same temporary runtime shim;
- Phase 4 integration proof - passed: untouched `src/checkout.ts` was found
  from the changed `src/status.ts` and persisted with `IMPORTER` and
  `SYMBOL_REFERENCE` reasons;
- native CLI/full-test execution without the shim remains environment-limited
  by Node 26 `tsx` failing at `uv_os_get_passwd returned ENOMEM`;
- `npm audit` remains environment-limited because the npm audit endpoint
  returned an error; no audit result is claimed;
- `git diff --check` passed; no generated compatibility shim remains.

Scope preserved: no GitHub publication, semantic/LLM discovery, or adaptive
OCR scope selection was added.
