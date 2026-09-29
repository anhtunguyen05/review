# Product Vision

## 1. Working name

`code-review-orchestrator`

The name is intentionally generic. The repo should own **orchestration and policy**, not become a fork whose identity is tied permanently to OCR or Jev.

## 2. Problem statement

Existing AI review approaches commonly have one or more of these weaknesses:

- read only the changed diff;
- read the whole repository and spend too much context;
- produce many speculative comments;
- cannot explain why an untouched file was considered relevant;
- repeat expensive review after every push;
- mix business/spec impact with confirmed code defects;
- tie orchestration tightly to one LLM/model/provider.

The target system should answer a stronger question:

> “Given what this PR intends to change, which existing code may be affected, which parts deserve deeper review, and which findings are strong enough to surface to a developer?”

## 3. Primary users

### Developer
Wants:
- useful review comments;
- low false-positive rate;
- clear evidence;
- no duplicate AI comments;
- fast enough feedback.

### Tech Lead / Reviewer
Wants:
- cross-file and cross-module impact;
- risk summary;
- visibility into skipped/suppressed findings;
- confidence that feature implications were considered.

### Platform / DevOps Team
Wants:
- one central integration for many repositories;
- policy configuration;
- predictable API/token cost;
- safe secret handling;
- observability and auditability.

## 4. Product principles

### P1 — Diff starts the analysis; it does not bound it
Changed files identify the change source. The review scope may include untouched impacted files.

### P2 — Deterministic discovery before generative reasoning
Use Git, AST/LSP, imports, references, manifests, tests and repository metadata before spending LLM tokens.

### P3 — Expensive reasoning follows evidence
Jev-style screening/routing narrows what OCR or another deep reviewer must inspect.

### P4 — Findings must identify their epistemic status
Do not present every signal as a bug.

Supported classes:

- `DEFECT`
- `REGRESSION_RISK`
- `FEATURE_IMPACT`
- `SPEC_MISMATCH`
- `TEST_GAP`
- `MAINTAINABILITY`

### P5 — Suppression is a feature
A good bot may discover 20 weak signals but publish only 3 strong findings.

### P6 — Engines are replaceable
OCR and Jev are adapters, not the domain.

### P7 — Untrusted source code is data
The review job reads PR code but must not execute arbitrary contributor code in a privileged secret-bearing job.

## 5. Differentiators

### 5.1 Impact-aware review

Example:

```text
changed:
  src/payment/payment-service.ts

untouched but impacted:
  src/order/checkout.ts
  src/refund/refund-service.ts
  src/webhook/payment-webhook.ts
```

The tool records why each file was selected.

### 5.2 Adaptive compute

```text
candidate files
    |
    +-- low relevance/risk -> skip
    +-- medium             -> lightweight review
    +-- high               -> deep OCR review
```

### 5.3 Docs/spec as intent source

Changed docs should not merely be linted as prose. They can establish:

- new states;
- changed invariants;
- renamed concepts;
- expected integrations;
- compatibility constraints.

The system can then search existing code for likely implementation impact.

### 5.4 Explainable review scope

Every selected file should have one or more `ImpactReason` records:

```text
OrderService.ts
- consumes changed type PaymentResult
- branches on changed enum PaymentStatus
- referenced by changed spec "pending payment"
```

## 6. Non-goals for the first release

Do not attempt in MVP:

- autonomous code modification;
- automatic merge/blocking based solely on AI;
- executing arbitrary PR build/test commands in the privileged review job;
- full multi-repository graph inference;
- perfect semantic call graphs for every language;
- replacing human review;
- training/calibrating custom ML models.

## 7. Success metrics

Track at least:

### Quality
- published findings accepted by developers;
- findings marked irrelevant/false positive;
- duplicate finding rate;
- confirmed regression findings in untouched files.

### Efficiency
- OCR input tokens per PR;
- Jev/screening calls per PR;
- deep-review files / candidate files ratio;
- cost per PR;
- cache/checkpoint reuse.

### Performance
- p50/p95 review latency;
- time per stage;
- queue/concurrency wait.

### Coverage
- changed files analyzed;
- candidate impacted files found;
- candidate impacted files screened;
- published indirect-impact findings.

## 8. Product hypothesis

The strongest hypothesis is not:

> “Two AI reviewers are more accurate than one.”

It is:

> “A deterministic + typed-screening + deep-reasoning pipeline can allocate context more intelligently, discover indirect impact, and publish fewer but more valuable findings than a single diff-only deep reviewer.”
