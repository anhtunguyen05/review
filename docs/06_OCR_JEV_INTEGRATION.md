# OCR + Jev Integration

## 1. Roles

### OpenCodeReview
Treat OCR as:
- deep reviewer;
- context-aware investigator;
- explanation/finding generator;
- optional existing GitHub publication capability during early MVP.

OCR already supports:
- branch-range review;
- JSON output;
- background context;
- concurrency;
- effort levels;
- token budget controls;
- GitHub Action integration.

### Jev-derived engine
Treat Jev as:
- bounded screener;
- risk/relevance classifier;
- evidence selector;
- severity/routing helper;
- optional post-review verifier.

Do not treat both as two equal full reviewers.

## 2. Integration evolution

## V1 — Parallel adapters

```text
PR
+--> OCR
+--> Jev
      |
      v
normalize
      |
      v
dedupe
      |
      v
publish
```

Purpose:
- integration learning;
- contract stabilization.

Weakness:
- extra token/cost;
- duplicated analysis.

## V2 — Jev before OCR

```text
impact candidates
      |
      v
Jev screening
      |
      +-- skip
      +-- light
      +-- deep -> OCR
```

Primary benefits:
- lower OCR context;
- lower cost;
- better scaling.

## V3 — Hybrid verifier

```text
impact candidates
      |
      v
Jev screening
      |
      v
OCR deep review
      |
      v
candidate findings
      |
      v
Jev/policy verification
      |
      v
publish
```

Primary benefits:
- reduce noisy findings;
- confidence-aware publication.

## 3. Upstream adaptation requirements

### Jev
Do not rely permanently on current-diff CLI behavior.

Create your own adapter with explicit input:

```ts
type ScreeningInput = {
  repositoryPath: string;
  baseSha: string;
  headSha: string;
  candidates: ScopeCandidate[];
  intent?: ChangeIntent;
};
```

The adapter may reuse/fork Jev judgment logic internally.

Reason:
- CI needs explicit PR range;
- impacted files may be untouched;
- the local pipeline supplies generic evidence and does not require a
  language-specific analyzer before Jev/OCR are called.

### OCR
Prefer an adapter around CLI invocation:

```ts
type OcrReviewRequest = {
  repositoryPath: string;
  from: string;
  to: string;
  background?: string;
  rulePath?: string;
  concurrency?: number;
  maxTokensBudget?: number;
  effort?: "low" | "medium" | "high";
};
```

Do not expose CLI flags throughout application code.

## 4. The untouched-file problem

OCR's main range is still the PR range. An untouched impacted file may be:
- context;
- an externally identified concern;
- not directly inline-commentable as a changed line.

Therefore distinguish:

```text
review target
vs
context file
vs
publication location
```

A cross-file finding may need to be published in the PR summary rather than inline if GitHub cannot attach it to the diff.

## 5. Background construction

Build structured background:

```text
PR intent:
- ...

Changed behavior:
- ...

Known invariants:
- ...

Impact candidates:
- CheckoutService consumes PaymentStatus
- RefundService branches on non-success statuses

Review focus:
- compatibility/regression across new PENDING state
```

Do not feed raw entire docs when a compact extracted intent is sufficient.

## 6. Screening policy example

```ts
function route(decision: ScreeningDecision): "SKIP" | "LIGHT" | "DEEP" {
  if (decision.relevance < 0.35 && decision.risk < 0.45) return "SKIP";
  if (decision.risk >= 0.75) return "DEEP";
  return "LIGHT";
}
```

Thresholds are policy parameters, not universal truths.

## 7. Post-review validation

Before publish:

```text
Is evidence concrete?
Is finding actionable?
Does it contradict known intent?
Is it duplicate?
Can it be attached inline?
Is wording proportional to confidence?
```

Example wording:

### High confidence defect
```text
This branch treats PENDING as terminal failure, so an order can be cancelled while settlement is still active.
```

### Feature impact candidate
```text
Potential impact: this branch currently treats every non-SUCCESS status as terminal. With the new PENDING state, verify whether cancellation remains intended.
```

## 8. Fallback modes

Configuration:

```yaml
fallback:
  screeningFailure: deep_review_changed_files
  impactFailure: direct_diff_only
  deepReviewFailure: publish_failure_summary
```

Never silently convert a degraded run into a normal successful run.

## 9. Engine metadata

Each engine result stores:

```ts
type EngineMetadata = {
  engine: "jev" | "ocr";
  version: string;
  model?: string;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
};
```

This is essential for later proving whether the combined pipeline actually saves money.
