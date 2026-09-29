# code-review-orchestrator

The repository now provides a local Phase 3 slice: Git range resolution,
direct JS/TS screening through a trusted Jev-compatible executable, OCR
normalization, and versioned local artifacts. GitHub publication, impact
discovery, and adaptive OCR scope remain deferred.

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
are invoked only through explicitly configured trusted executables.

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
decisions, but Phase 3 does not yet use those decisions to reduce the OCR file
set. If no screening command is configured, screening is explicitly disabled;
if it fails, OCR continues and the run is marked `partial` without fabricated
decisions.

