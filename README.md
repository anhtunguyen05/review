# code-review-orchestrator

The repository now provides a local Phase 4 slice: Git range resolution,
deterministic JS/TS structural impact discovery, direct screening through a
trusted Jev-compatible executable, OCR normalization, and versioned local
artifacts. GitHub publication and adaptive OCR scope remain deferred.

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
tests, and config/schema consumers. Discovery keeps direct changed files and
does not yet reduce the OCR file set; adaptive OCR scope is Phase 5.

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

The screening adapter receives the resolved range and direct JS/TS candidates
and writes `artifacts/screening.json`. It produces `DEEP`, `LIGHT`, or `SKIP`
decisions, but Phase 4 does not yet use those decisions or impact candidates
to reduce the OCR file set. If no screening command is configured, screening
is explicitly disabled; if discovery or screening fails, OCR continues and
the run is marked `partial` without fabricated candidates or decisions.

