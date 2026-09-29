# Observability, Cost and Performance

## 1. Why this is mandatory

The central architecture claim is:

> Screening + impact-aware scope can reduce expensive deep-review work while preserving or improving useful findings.

Without telemetry, this remains speculation.

## 2. Stage metrics

Emit per run:

```text
context.duration_ms
intent.duration_ms
impact.duration_ms
screening.duration_ms
deep_review.duration_ms
policy.duration_ms
publication.duration_ms
total.duration_ms
```

Counts:

```text
changed_files
impact_candidates
screened_candidates
skip_count
light_count
deep_count
ocr_files
raw_findings
published_inline
published_summary
suppressed_findings
duplicates_removed
```

## 3. Token metrics

Track when provider exposes usage:

```text
screening.input_tokens
screening.output_tokens
deep_review.input_tokens
deep_review.output_tokens
total_tokens
```

Also calculate estimates before dispatch to enforce budgets.

## 4. Cost metrics

If pricing is configured:

```ts
interface UsageCost {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
}
```

Do not hard-code vendor prices permanently. Keep price tables versioned/configurable.

## 5. Comparison metrics

To prove value, support shadow/evaluation runs.

Compare:

### Baseline
```text
OCR full PR
```

### Adaptive
```text
impact -> screening -> selective OCR
```

Measure:

```text
deep-review tokens saved
latency difference
published finding overlap
unique accepted findings
false-positive feedback
```

## 6. Token saving formula

Simple operational metric:

```text
deep_review_reduction =
1 - adaptive_ocr_input_tokens / baseline_ocr_input_tokens
```

Do not call this total system savings unless screening token/cost is also included.

System cost reduction:

```text
1 - adaptive_total_cost / baseline_total_cost
```

## 7. Latency model

Sequential:

```text
T = impact + screening + deep_review + publish
```

Parallel opportunities:
- structural analyzers in parallel;
- screening candidates in bounded batches;
- OCR file groups concurrently;
- artifact serialization concurrent with non-dependent work.

Avoid unlimited fan-out.

## 8. Budgets

```ts
interface ReviewBudget {
  maxCandidateFiles: number;
  maxDeepReviewFiles: number;
  maxInputTokens?: number;
  maxEstimatedCostUsd?: number;
  maxDurationMs?: number;
}
```

When a budget is reached:
- preserve required/high-risk work;
- mark skipped candidates;
- publish degraded/budget status in summary.

## 9. Tracing

Use one `runId`.

Each stage event:

```json
{
  "runId": "...",
  "stage": "impact.discovery",
  "startedAt": "...",
  "durationMs": 248,
  "status": "ok",
  "attributes": {
    "changedFiles": 7,
    "candidateFiles": 31
  }
}
```

Future:
- OpenTelemetry traces;
- GitHub Actions summary;
- dashboard.

## 10. Privacy-aware logging

Never log:
- API tokens;
- authorization headers;
- full proprietary files by default.

Prefer:
- path;
- SHA;
- token counts;
- evidence hash;
- small redacted snippets when configured.

## 11. Performance targets for MVP

Initial engineering targets, not promises:

- context resolution: < 5s typical;
- deterministic impact discovery: < 15s typical medium repo;
- screening: bounded/concurrent;
- no more than configured 20 deep-review files by default;
- cancelled obsolete PR runs should terminate quickly.

Adjust after real measurements.
