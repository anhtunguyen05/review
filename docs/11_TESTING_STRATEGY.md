# Testing Strategy

## 1. Testing philosophy

The project makes routing and publication decisions around probabilistic engines.

Therefore test:
- deterministic code exhaustively;
- external engines through contract tests/mocks;
- model quality through evaluation fixtures, not ordinary unit tests.

## 2. Unit tests

### Domain
Test:
- candidate scoring;
- budget selection;
- finding fingerprint;
- dedupe;
- severity mapping;
- publication policy;
- checkpoint validity.

### Intent/impact helpers
Test:
- symbol extraction;
- path filters;
- graph-depth bounds;
- reason aggregation.

## 3. Contract tests

Each adapter must prove it maps external data into internal contracts.

### OCR adapter
Fixture:
```json
raw OCR result -> ReviewFinding[]
```

Test:
- malformed output;
- missing location;
- multiple findings;
- timeout/non-zero exit;
- partial output.

### Jev adapter
Fixture:
```json
raw staged decision -> ScreeningDecision[]
```

Test:
- missing candidate;
- invalid scores;
- confidence bounds;
- fallback behavior.

## 4. GitHub adapter tests

Mock GitHub API.

Test:
- PR metadata;
- fork PR;
- comment trigger;
- duplicate summary update;
- inline comment validation;
- stale head detection.

## 5. Fixture repositories

Create `fixtures/repos/*`.

### fixture-enum-regression
Changed:
```text
PaymentStatus adds PENDING
```
Untouched:
```text
Checkout treats non-SUCCESS as FAILED
```

Expected:
- untouched Checkout enters impact candidates.

### fixture-interface-change
Changed interface.
Untouched implementations.

### fixture-docs-only
Docs change behavior.
No source changed.
Expected:
- feature impact candidates, not confirmed defect automatically.

### fixture-config-change
Changed config key.
Untouched consumer.

### fixture-noise
Many text matches.
Only structural consumers should rank high.

## 6. End-to-end local test

Run against a fixture Git repo:

```text
base commit
feature commit
      |
      v
orchestrator CLI
      |
      v
artifacts/
```

Assert:
- resolved range;
- impact candidates;
- screening routing;
- normalized findings;
- publication plan.

Do not require live GitHub.

## 7. GitHub integration test repository

Maintain a small private/public test repo with scripted PR scenarios.

Test:
- opened;
- synchronize;
- `/review`;
- `/review full`;
- fork;
- cancelled old run.

## 8. LLM evaluation tests

Separate from CI unit tests.

Dataset item:

```json
{
  "id": "enum-pending-001",
  "repoFixture": "fixture-enum-regression",
  "expectedImpactedPaths": [
    "src/order/checkout.ts"
  ],
  "expectedMechanisms": [
    "non-final state treated as failure"
  ]
}
```

Metrics:
- impact recall;
- candidate precision;
- published finding precision;
- deep-review token cost;
- latency.

## 9. Regression evaluation

Before changing:
- prompt;
- screening thresholds;
- impact scoring;
- OCR effort;
- semantic discovery;

run the fixed evaluation suite.

## 10. Shadow mode

Before enabling comments in a real repo:

```text
analyze
screen
review
policy
DO NOT publish
```

Store artifacts for manual inspection.

Then enable:
1. summary only;
2. inline comments;
3. automatic trigger.

## 11. Security tests

See `09_SECURITY_AND_TRUST_BOUNDARIES.md`.

Additionally test:
- malicious filename;
- symlink;
- huge patch;
- binary;
- prompt-injection text;
- forged bot checkpoint marker;
- stale base/head.

## 12. Minimum test gate

Every PR to orchestrator should pass:

```text
typecheck
lint
unit tests
adapter contract tests
fixture repository tests
dependency-boundary test
```
