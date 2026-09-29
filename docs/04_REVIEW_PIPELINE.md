# Review Pipeline

## 1. Pipeline goals

The pipeline must optimize three things simultaneously:

- review quality;
- token/cost efficiency;
- developer signal-to-noise.

The pipeline therefore separates:
- discovery;
- screening;
- deep reasoning;
- publication.

## 2. Full flow

```text
1. Trigger
2. Resolve trusted PR metadata
3. Resolve base/head/merge-base
4. Build direct diff
5. Extract change intent
6. Discover impacted code
7. Build candidate review scope
8. Screen/rank candidates
9. Apply budget policy
10. Run deep review
11. Normalize findings
12. Cross-check / verify
13. Deduplicate
14. Publication policy
15. Post inline comments + sticky summary
16. Store artifacts + metrics
17. Advance checkpoint if eligible
```

## 3. Stage 1 — Trigger

Supported events:

```text
pull_request_target:
- opened
- synchronize
- reopened
- ready_for_review

issue_comment:
- /review
- /review full

workflow_dispatch:
- PR number
- full review flag
```

## 4. Stage 2 — Context resolution

Output:

```ts
type PullRequestContext = {
  repository: RepositoryId;
  prNumber: number;
  title: string;
  body?: string;
  baseSha: string;
  headSha: string;
  mergeBaseSha: string;
  authorAssociation?: string;
  isFork: boolean;
};
```

Invariant:

```text
all later artifacts are tied to baseSha + headSha
```

If head changes during the run, publication must detect the mismatch or attach the original reviewed SHA.

## 5. Stage 3 — Direct diff

Produce:
- changed paths;
- status;
- hunks;
- changed symbols if available;
- docs/spec files;
- tests.

Deleted files still matter because removed contracts may impact consumers.

## 6. Stage 4 — Intent discovery

Sources, in priority order:

```text
explicit review context
PR body/title
changed docs/spec
changed public interfaces/types/config
changed implementation
```

Output example:

```json
{
  "summary": "Payment may now remain pending before final settlement.",
  "concepts": ["PaymentStatus", "PENDING", "settlement"],
  "changedBehaviors": [
    "non-final payment state introduced"
  ],
  "invariants": [
    "PENDING must not be treated as FAILED"
  ],
  "confidence": 0.86
}
```

Intent is context, not proof.

## 7. Stage 5 — Impact discovery

Build candidates from three levels:

```text
L1 Direct
L2 Structural
L3 Semantic
```

See `05_IMPACT_DISCOVERY.md`.

## 8. Stage 6 — Scope planning

Each candidate receives:

```ts
type ScopeCandidate = {
  location: CodeLocation;
  directChange: boolean;
  impactScore: number;
  reasons: ImpactReason[];
  required: boolean;
};
```

`required=true` examples:
- directly changed source;
- changed public API;
- changed security-critical policy;
- explicitly configured path.

## 9. Stage 7 — Screening

Jev-style screener answers bounded questions.

Example dimensions:

```text
relevance
correctness risk
security risk
reliability risk
compatibility risk
test gap
```

Output:

```ts
type ScreeningDecision = {
  candidateId: string;
  relevance: number;
  risk: number;
  dimensions: Record<string, number>;
  action: "SKIP" | "LIGHT" | "DEEP";
  confidence: number;
};
```

## 10. Stage 8 — Budget planner

Budget is applied after screening.

Example policy:

```text
required files -> always preserve
high-risk      -> priority 1
medium-risk    -> priority 2
low-risk       -> skip if budget exhausted
```

Budget dimensions:
- file count;
- token estimate;
- elapsed time;
- API cost;
- engine concurrency.

## 11. Stage 9 — Deep review

OCR receives:
- exact review range;
- selected paths if supported by adapter strategy;
- business/change background;
- selected relevant untouched context;
- review rules;
- token budget;
- effort.

Do not blindly stuff all candidate files into a single prompt.

## 12. Stage 10 — Normalize

OCR and any other reviewer map to:

```text
ReviewFinding[]
```

No publication occurs from raw engine output.

## 13. Stage 11 — Verify

V1:
- deterministic validation only:
  - file exists at reviewed SHA;
  - line belongs to valid diff for inline comment where required;
  - evidence is present.

V2:
- Jev-style post-review verifier:
  - is claim supported?
  - is severity plausible?
  - is issue actionable?
  - is finding duplicate/overlapping?

## 14. Stage 12 — Publish policy

Example:

```text
confidence >= 0.80 AND actionable AND inline-capable
  -> inline

confidence >= 0.58
  -> summary

otherwise
  -> suppress
```

For `FEATURE_IMPACT`, use stricter wording than `DEFECT`.

## 15. Full vs incremental review

### Full
```text
merge-base..head
```

### Incremental
```text
checkpoint..head
```

But impact discovery may still inspect unchanged repository files.

Therefore:

> incremental diff range != incremental context universe

This distinction is critical.

## 16. Failure behavior

### Impact discovery fails
Fallback:
- direct changed files only;
- mark run degraded.

### Jev fails
Configurable:
- fallback directly to OCR;
- mark screening unavailable.

### OCR fails
- do not invent findings;
- publish optional run-failure summary;
- retain diagnostics.

### Publication partially fails
- record which comments were posted;
- do not advance checkpoint if policy says run is incomplete.
