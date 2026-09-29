# Code Review Orchestrator — Documentation Index

> Status: implementation-ready draft  
> Date: 2026-09-29  
> Goal: build a GitHub PR review pipeline that combines **OpenCodeReview (OCR)**, **Jev-style staged judgments**, and a custom **Impact Discovery** layer.

## 1. Problem

A normal PR reviewer often starts from `git diff` and focuses on changed files. That is insufficient for feature work where:

- a new contract affects old consumers that were not edited;
- documentation/spec changes imply implementation impact;
- a type/enum/state-machine change breaks untouched branches;
- config/schema/API changes affect callers across modules;
- a new feature changes business invariants beyond direct imports.

This project treats the diff as the **starting signal**, not the complete review scope.

## 2. Core product idea

```text
PR / manual trigger
        |
        v
Intent Discovery
        |
        v
Impact Discovery
        |
        v
Candidate Review Scope
        |
        v
Jev-style Screening / Routing
        |
        v
OpenCodeReview Deep Review
        |
        v
Validation + Policy + Deduplication
        |
        v
GitHub Inline Comments + Summary
```

The project is not a wrapper that simply runs two reviewers in parallel. Its differentiation is:

1. **Impact-aware review**: review code that may be affected even if it was not changed.
2. **Adaptive compute**: spend expensive LLM reasoning only where risk/relevance warrants it.
3. **Noise control**: separate defect findings from feature-impact candidates and suppress weak signals.
4. **Explainable scope**: every indirectly reviewed file carries a reason such as caller, import, contract consumer, test relation, semantic match, or documented business impact.

## 3. Recommended first release

Do not implement the final hybrid pipeline at once.

### V0
- GitHub Action trigger.
- Resolve base/head safely.
- OpenCodeReview only.
- Normalize OCR output into your own `ReviewFinding`.

### V1
- Add Jev-derived screening as a second engine.
- Run OCR and Jev independently.
- Normalize + deduplicate + publish.

### V2
- Add deterministic Impact Discovery.
- Expand review scope beyond changed files.
- Jev screens candidate impacted files.
- OCR reviews selected files deeply.

### V3
- Add semantic/docs-driven impact analysis.
- Add post-OCR verifier/policy.
- Add token/cost/latency observability.

## 4. Documents

1. `01_PRODUCT_VISION.md` — product idea, users, differentiators, success metrics.
2. `02_SCOPE_AND_REQUIREMENTS.md` — functional and non-functional requirements.
3. `03_ARCHITECTURE.md` — components, boundaries, dependency direction.
4. `04_REVIEW_PIPELINE.md` — full execution flow and state machine.
5. `05_IMPACT_DISCOVERY.md` — direct, structural and semantic impact analysis.
6. `06_OCR_JEV_INTEGRATION.md` — how the two engines should be combined.
7. `07_DOMAIN_MODEL_AND_CONTRACTS.md` — TypeScript interfaces and JSON contracts.
8. `08_GITHUB_ACTIONS_AND_TRIGGERS.md` — automatic/manual triggers and reusable workflow.
9. `09_SECURITY_AND_TRUST_BOUNDARIES.md` — secrets, untrusted PR code, fork safety.
10. `10_OBSERVABILITY_COST_AND_PERFORMANCE.md` — tokens, latency, traces, budgets.
11. `11_TESTING_STRATEGY.md` — unit, contract, integration, fixture-repo and evaluation tests.
12. `12_IMPLEMENTATION_ROADMAP.md` — coding order and acceptance criteria.
13. `13_REPOSITORY_STRUCTURE.md` — proposed source tree and module responsibilities.

## 5. Upstream projects used as references

- OpenCodeReview: https://github.com/alibaba/open-code-review
- Jev Review: https://github.com/devagrawal09/jev-review

Important upstream facts as of 2026-09-29:

- OCR supports branch-range review (`--from`, `--to`), JSON output, background context, concurrency control, token budgets, and a GitHub Action that can post inline comments and summaries.
- `jev-review` is an experimental staged-review workflow with typed/bounded judgments and code-driven policy. Its current scope does not include repository indexing/static analyzers/generated explanations, and its current language handling is JS/TS-oriented.
- Therefore this project must treat both as replaceable adapters rather than allowing upstream-specific types to leak into the domain layer.

## 6. Key architectural rule

> `domain` and `application` never depend directly on OCR, Jev, GitHub Actions, or a specific LLM vendor.

This is what allows the pipeline to evolve later into:
- a GitHub App;
- a self-hosted review service;
- a multi-repository reviewer;
- another screening engine;
- a different deep-review engine.

## 7. Definition of “ready to code”

You are ready to start implementation when you can answer these questions from the docs:

- What exactly is a `ReviewFinding`?
- What is a `ReviewScope`?
- Why was an untouched file included?
- Who decides whether OCR is called?
- How is a PR base/head resolved?
- What data is allowed to cross the untrusted-code boundary?
- When is a comment inline vs summary-only vs suppressed?
- How are token and latency budgets enforced?
- How can the same pipeline later support multiple repositories?

All answers are specified in the following files.
