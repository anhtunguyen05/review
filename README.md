# code-review-orchestrator

The repository now provides a local Phase 5 slice: Git range resolution,
deterministic JS/TS structural impact discovery, screening through a trusted
Jev-compatible executable, deterministic adaptive OCR scope planning, OCR
normalization, versioned local artifacts, and idempotent GitHub publication.

## Runtime

- Node.js >= 22
- npm 12 recommended for the current workspace

## Setup

```bash
npm install
```

## Verification

```bash
npm run typecheck
npm run lint
npm run boundaries
npm test
npm run review -- --help
```

The local CLI does not execute pull-request repository code. OCR and screening
are invoked only through explicitly configured trusted executables. Impact
discovery reads Git snapshots through bounded, read-only commands.

## Local impact discovery

Impact discovery runs before screening and writes:

```text
artifacts/impact-graph.json
```

The artifact contains deterministic nodes, structural edges, candidate scores,
and evidence-backed reasons for JS/TS importers, symbol references, related
tests, and config/schema consumers. Adaptive scope consumes those candidates
and screening decisions before OCR.

Impact limits can be supplied through the trusted `--config` YAML file:

```yaml
version: 1
impact:
  maxDepth: 2
  maxCandidateFiles: 80
  maxFileBytes: 524288
  includeTests: true
  includeDocs: true
```

Adaptive OCR budgets can be configured separately:

```yaml
scope:
  maxCandidateFiles: 80
  maxDeepReviewFiles: 20
  maxInputTokens: 150000
  maxDurationMs: 600000
```

## Local screening review

Provide trusted OCR and screening executables explicitly:

```bash
npm run review -- \
  --repo ./fixture \
  --from main \
  --to feature \
  --ocr-command /path/to/ocr \
  --screening-command /path/to/jev-screening
```

The screening adapter receives the resolved range and direct plus impacted
JS/TS candidates and writes `artifacts/screening.json`. It produces `DEEP`,
`LIGHT`, or `SKIP` decisions. The scope planner preserves direct changes,
selects impacted files within configured budgets, records an exclusion reason
for every skipped candidate, and writes `artifacts/scope.json`. If no screening
command is configured, screening is explicitly disabled; impacted files then
degrade to direct-only review without fabricated candidates or decisions.

## GitHub publication

The manual publication entrypoint resolves PR context through GitHub REST,
updates one sticky summary, and publishes eligible changed-file findings as
idempotent inline comments:

```bash
npm run publish-review -- --artifacts artifacts --owner acme --repo demo --pr 7
```

Set `GITHUB_TOKEN` for authentication. The publisher re-checks the PR head SHA
before writing and skips stale runs. A manual `workflow_dispatch` example is in
`.github/workflows/review.yml`.

