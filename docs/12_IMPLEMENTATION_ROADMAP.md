# Implementation Roadmap

## Principle

Implement the simplest vertical slice first, then add intelligence.

Do not begin by building semantic impact search + Jev + OCR + GitHub publishing simultaneously.

---

# Phase 0 — Repository bootstrap

## Deliverables
- Node.js + TypeScript project.
- dependency-boundary rules;
- test runner;
- CLI entrypoint;
- configuration loader;
- structured logger.

## Done when
```bash
npm run typecheck
npm test
npm run review -- --help
```
all work.

---

# Phase 1 — PR range + OCR vertical slice

## Tasks

1. Implement `GitRepositoryPort`.
2. Resolve:
   - base SHA;
   - head SHA;
   - merge-base.
3. Implement OCR CLI adapter.
4. Request JSON output.
5. Normalize to `ReviewFinding`.
6. Write artifacts locally.
7. No GitHub comments yet.

## Done when

Given a local test repository with two branches:

```bash
review-orchestrator review \
  --repo ./fixture \
  --from main \
  --to feature
```

produces:

```text
artifacts/run.json
artifacts/ocr.raw.json
artifacts/findings.json
```

---

# Phase 2 — GitHub publication

## Tasks
- GitHub PR context adapter;
- summary publisher;
- inline publisher;
- finding fingerprint;
- idempotency;
- GitHub Action entrypoint.

## First mode
Use manual `/review` or `workflow_dispatch` before automatic triggers.

## Done when
A test PR receives:
- one sticky summary;
- non-duplicated inline comments;
- review head SHA.

---

# Phase 3 — Jev screening adapter

## Tasks
1. Define `ScreeningEngine`.
2. Adapt/fork Jev review logic.
3. Remove assumption that input is only `git diff HEAD`.
4. Accept explicit candidates and PR range.
5. Map result to `ScreeningDecision`.
6. Add fallback policy.

## Initially
Run only on directly changed source files.

## Done when
The pipeline can produce:

```text
file A -> DEEP
file B -> LIGHT
file C -> SKIP
```

without OCR-specific code knowing how the decision was created.

---

# Phase 4 — Structural Impact Discovery

This is the first major differentiating feature.

## V1 analyzers
- import graph;
- symbol/text references;
- tests;
- config/schema keys.

## Scope
Start JS/TS.

## Done when
Fixture `enum-regression` finds an untouched consumer.

---

# Phase 5 — Adaptive OCR scope

## Flow

```text
direct + impacted
       |
       v
screen
       |
       v
budget
       |
       v
OCR
```

## Tasks
- `ScopePlanner`;
- token/file budget;
- priority queue;
- background builder.

## Done when
For a fixture with 30 candidates:
- only configured high/medium subset enters deep review;
- reason for every skip is recorded.

---

# Phase 6 — Docs / intent discovery

## Tasks
- PR title/body parser;
- changed docs extraction;
- LLM structured intent adapter;
- deterministic concept search;
- semantic impact reasons.

## Guardrail
LLM can propose search concepts.
Repository evidence selects actual files.

## Done when
A docs-only feature PR produces grounded `FEATURE_IMPACT` candidates.

---

# Phase 7 — Post-review policy/verifier

## Tasks
- cross-engine correlation;
- duplicate clustering;
- support/evidence checks;
- severity normalization;
- inline/summary/suppression policy.

## Done when
Multiple equivalent raw findings result in one developer-facing finding.

---

# Phase 8 — Checkpoints and incremental review

## Tasks
- sticky summary marker;
- config fingerprint;
- ancestry verification;
- full-review fallback;
- `/review full`.

## Done when
Second push reviews only new change range while still allowing impact discovery against existing source.

---

# Phase 9 — Observability + evaluation

## Tasks
- token/cost tracking;
- stage timings;
- evaluation fixture runner;
- baseline OCR-only comparison.

## Required experiment

Run the same PR corpus in:

```text
A: OCR full
B: adaptive pipeline
```

Compare:
- useful findings;
- tokens;
- cost;
- latency;
- noise.

Only after this should you claim token/accuracy improvements.

---

# Phase 10 — Additional languages

Use a repository file classifier and generic reference index as the default
path. PHP/Laravel, Go, Python, Java, Rust, and future text-based languages do
not require a dedicated analyzer. Add a language-specific parser or LSP only
as an optional precision plugin when generic evidence is insufficient.

---

# Suggested first 15 implementation tickets

1. `CORE-001` Bootstrap TS project and dependency boundaries.
2. `CORE-002` Define domain contracts.
3. `GIT-001` Implement Git range resolver.
4. `OCR-001` Implement OCR CLI adapter.
5. `OCR-002` Normalize OCR result.
6. `RUN-001` Implement local review CLI.
7. `GH-001` Resolve PR context.
8. `GH-002` Publish sticky summary.
9. `GH-003` Publish idempotent inline findings.
10. `JEV-001` Create screening port/adapter.
11. `JEV-002` Accept explicit candidate files/range.
12. `IMP-001` Implement direct change collector.
13. `IMP-002` Implement JS/TS import/reference analyzer.
14. `IMP-003` Implement impact scoring/reasons.
15. `PLAN-001` Implement adaptive scope planner.

Do not start semantic embeddings before tickets 1–15 are stable.

---

# First coding milestone

A strong first milestone is:

```text
GitHub PR
  -> centralized action
  -> trusted base/head resolution
  -> OCR review
  -> normalized findings
  -> sticky summary + inline comments
```

Then insert Jev/Impact Discovery behind stable ports.

That order minimizes integration risk.
