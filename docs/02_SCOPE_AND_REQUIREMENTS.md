# Scope and Requirements

## 1. Functional requirements

### FR-01 — PR context resolution
The system shall resolve:

- repository;
- PR number;
- base ref/SHA;
- head ref/SHA;
- merge base;
- PR title/body;
- changed files;
- changed docs;
- optional issue/ticket/spec context.

### FR-02 — Direct change extraction
The system shall produce normalized changed-file records containing:

```ts
type ChangedFile = {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  previousPath?: string;
  additions?: number;
  deletions?: number;
  patch?: string;
};
```

### FR-03 — Intent discovery
The system shall derive a `ChangeIntent` from:

1. explicit config/context;
2. PR title/body;
3. changed documentation;
4. changed code symbols.

LLM extraction may be used, but raw sources and confidence must be retained.

### FR-04 — Impact discovery
The system shall identify candidate untouched files using:

- imports/dependencies;
- symbol references;
- callers/callees where available;
- interface/type/enum consumers;
- tests;
- config/schema references;
- code search;
- optional semantic search.

### FR-05 — Impact reason recording
Every untouched candidate must include at least one reason.

No candidate is accepted merely because an LLM returned a filename.

### FR-06 — Screening
The system shall assign candidate relevance/risk through a screening engine.

Initial dimensions:

- correctness;
- security;
- reliability;
- compatibility;
- test gap;
- change relevance.

### FR-07 — Deep review
The system shall call OCR for:
- all mandatory changed files that pass file-type policy;
- selected impacted files;
- context files required by the deep reviewer.

### FR-08 — Finding normalization
All engines shall map to a common `ReviewFinding`.

### FR-09 — Deduplication
The system shall merge or suppress findings that refer to the same:
- file/line region;
- mechanism;
- root cause.

### FR-10 — Publication policy
A finding may be:
- inline comment;
- summary-only;
- suppressed;
- internal telemetry only.

### FR-11 — Manual trigger
Support at least:
- `/review`;
- `/review full`;
- `workflow_dispatch`.

Automatic PR triggers may be enabled separately.

### FR-12 — Incremental/checkpoint review
The pipeline shall support reviewing only new ranges after a trusted checkpoint, while allowing a forced full review.

### FR-13 — Budget enforcement
The pipeline shall support:
- maximum deep-review files;
- maximum candidate files;
- token budget;
- maximum wall-clock duration;
- maximum concurrent deep reviews.

### FR-14 — Artifact retention
Each run should optionally persist:
- normalized PR context;
- impact graph;
- screening decisions;
- OCR raw result;
- final findings;
- stage timing/token usage.

## 2. Non-functional requirements

### NFR-01 — Security
Untrusted PR code must not execute in a secret-bearing privileged job.

### NFR-02 — Determinism
Repository-discovery logic should be deterministic where possible.

### NFR-03 — Explainability
A reviewer must be able to answer:
- why a file was included;
- why a file was skipped;
- why a finding was published.

### NFR-04 — Extensibility
Adding a new deep-review engine must not require changing domain types.

### NFR-05 — Failure isolation
If Jev fails, configurable fallback may still run OCR.
If OCR fails, the pipeline must not publish fabricated findings.

### NFR-06 — Idempotent publication
Re-running the same head should not spam duplicate comments.

### NFR-07 — Observability
Each stage emits duration, status and key counts.

### NFR-08 — Reproducibility
Pin third-party GitHub Actions/releases by tag or commit SHA in production.

## 3. MVP constraints

Recommended:
- TypeScript/Node.js for orchestrator.
- Single repository per run.
- GitHub Actions first.
- JS/TS impact analysis first.
- Generic text search fallback for other languages.
- OCR used as external CLI/action.
- Jev code adapted behind your own port.

Do not block future PHP/Go support in the domain model.

## 4. Configuration

Suggested repository config:

```yaml
version: 1

review:
  mode: adaptive
  publish:
    minConfidenceInline: 0.78
    minConfidenceSummary: 0.55
  budgets:
    maxCandidateFiles: 80
    maxDeepReviewFiles: 20
    maxTokens: 150000
    maxDurationSeconds: 600

impact:
  maxDepth: 2
  includeTests: true
  includeDocs: true
  semanticDiscovery: false

engines:
  screening:
    provider: jev
  deepReview:
    provider: ocr

paths:
  ignore:
    - "**/vendor/**"
    - "**/node_modules/**"
    - "**/dist/**"
    - "**/*.lock"
```

## 5. Acceptance criteria for first usable release

A PR is considered successfully reviewed when:

1. the exact base/head pair is recorded;
2. changed files are resolved;
3. OCR runs against the intended range;
4. OCR result maps to `ReviewFinding[]`;
5. comments are published idempotently;
6. raw output is retained as an artifact;
7. no PR code is executed with secrets.

Impact discovery and Jev screening are then added incrementally.
