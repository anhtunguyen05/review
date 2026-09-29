# code-review-orchestrator

Phase 0 provides the TypeScript/Node.js bootstrap only. Provider integration,
Git range resolution, impact discovery, OCR, Jev, GitHub publication, and
GitHub Actions are intentionally deferred.

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

The Phase 0 CLI does not read or execute pull-request repository code and does
not contact external providers.

