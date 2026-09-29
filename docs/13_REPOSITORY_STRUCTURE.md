# Proposed Repository Structure

## 1. Structure

```text
code-review-orchestrator/
├── .github/
│   ├── workflows/
│   │   ├── review.yml
│   │   ├── ci.yml
│   │   └── release.yml
│   └── actions/
│       └── review/
│
├── docs/
│   └── ...
│
├── src/
│   ├── domain/
│   │   ├── review/
│   │   │   ├── finding.ts
│   │   │   ├── severity.ts
│   │   │   ├── fingerprint.ts
│   │   │   └── publication-policy.ts
│   │   ├── impact/
│   │   │   ├── graph.ts
│   │   │   ├── reason.ts
│   │   │   └── scoring.ts
│   │   ├── scope/
│   │   │   ├── candidate.ts
│   │   │   └── budget.ts
│   │   └── run/
│   │       └── state.ts
│   │
│   ├── application/
│   │   ├── ports/
│   │   │   ├── git-repository.ts
│   │   │   ├── pull-request-provider.ts
│   │   │   ├── impact-analyzer.ts
│   │   │   ├── screening-engine.ts
│   │   │   ├── deep-review-engine.ts
│   │   │   ├── publisher.ts
│   │   │   └── artifact-store.ts
│   │   ├── review-pull-request.ts
│   │   ├── discover-impact.ts
│   │   ├── plan-review-scope.ts
│   │   └── publish-review.ts
│   │
│   ├── infrastructure/
│   │   ├── git/
│   │   │   └── git-cli-adapter.ts
│   │   ├── github/
│   │   │   ├── github-pr-adapter.ts
│   │   │   └── github-publisher.ts
│   │   ├── impact/
│   │   │   ├── composite-impact-analyzer.ts
│   │   │   ├── text-reference-analyzer.ts
│   │   │   ├── test-relation-analyzer.ts
│   │   │   └── languages/
│   │   │       ├── typescript-analyzer.ts
│   │   │       ├── php-analyzer.ts
│   │   │       └── go-analyzer.ts
│   │   ├── engines/
│   │   │   ├── ocr/
│   │   │   │   ├── ocr-cli-adapter.ts
│   │   │   │   └── ocr-normalizer.ts
│   │   │   └── jev/
│   │   │       ├── jev-screening-adapter.ts
│   │   │       └── judgments/
│   │   ├── storage/
│   │   │   └── filesystem-artifact-store.ts
│   │   └── telemetry/
│   │       └── review-telemetry.ts
│   │
│   ├── entrypoints/
│   │   ├── cli/
│   │   │   └── review.ts
│   │   └── github-action/
│   │       └── main.ts
│   │
│   ├── config/
│   │   ├── schema.ts
│   │   └── loader.ts
│   │
│   └── composition/
│       └── build-review-application.ts
│
├── tests/
│   ├── unit/
│   ├── contract/
│   ├── integration/
│   └── fixtures/
│       └── repos/
│
├── action.yml
├── package.json
├── tsconfig.json
└── README.md
```

## 2. Important boundaries

Allowed:

```text
entrypoints -> application
composition -> application + infrastructure
infrastructure -> application ports + domain
application -> domain
domain -> nothing external
```

Forbidden:

```text
domain -> github
domain -> OCR
domain -> Jev
application -> OCR concrete adapter
application -> Octokit concrete adapter
```

## 3. Why not put everything under `review/`

Because the project has three distinct concerns:

```text
discovery
decision
publication
```

They will evolve independently.

## 4. `impact/` is first-class

Do not hide impact discovery inside OCR adapter.

If you do, the main product differentiation becomes impossible to:
- test separately;
- benchmark separately;
- replace;
- reuse for multiple engines.

## 5. Engine directory rule

`infrastructure/engines/ocr` may know OCR JSON/CLI.

`infrastructure/engines/jev` may know Jev SDK/types.

Nothing outside those directories should need upstream-specific imports.

## 6. Configuration file

Repository-local optional file:

```text
.review-orchestrator.yml
```

Central defaults live in orchestrator.

Resolution:

```text
central defaults
    +
organization defaults
    +
repository config
    +
manual run overrides
```

Security-sensitive settings cannot be overridden by untrusted PR changes.

Important: read configuration from the trusted base by default, not the PR head, unless a specific field is explicitly allowed to vary.

## 7. Artifacts

Suggested local/run output:

```text
.review-artifacts/<run-id>/
├── context.json
├── intent.json
├── direct-diff.json
├── impact-graph.json
├── screening.json
├── ocr.raw.json
├── findings.normalized.json
├── publication-plan.json
└── metrics.json
```

## 8. First files to implement

Start in this exact order:

```text
src/domain/review/finding.ts
src/domain/impact/reason.ts
src/application/ports/deep-review-engine.ts
src/application/ports/screening-engine.ts
src/application/ports/impact-analyzer.ts
src/infrastructure/git/git-cli-adapter.ts
src/infrastructure/engines/ocr/ocr-cli-adapter.ts
src/application/review-pull-request.ts
src/entrypoints/cli/review.ts
```

This gives you the smallest architecture skeleton with useful boundaries.
