# Phase 2 Implementation Plan

## Purpose

Add the first safe GitHub publication vertical slice: resolve a pull request,
create one idempotent sticky summary, publish eligible inline findings without
duplicating existing comments, and retain the reviewed head SHA.

## Source of truth

- `docs/12_IMPLEMENTATION_ROADMAP.md`: Phase 2 deliverables and acceptance.
- `docs/02_SCOPE_AND_REQUIREMENTS.md`: PR context, publication, security, and
  idempotency requirements.
- `docs/03_ARCHITECTURE.md`: inward ports and composition-root rule.
- `docs/04_REVIEW_PIPELINE.md`: publication policy and stale-head behavior.
- `docs/07_DOMAIN_MODEL_AND_CONTRACTS.md`: publication plan and fingerprints.
- `docs/08_GITHUB_ACTIONS_AND_TRIGGERS.md`: sticky summary, inline constraints,
  permissions, and manual triggers.
- `docs/09_SECURITY_AND_TRUST_BOUNDARIES.md`: token and untrusted-code rules.
- `docs/11_TESTING_STRATEGY.md`: fake GitHub API and no-live-network tests.

## Scope lock

### In scope

- Pull request context and changed-file resolution through GitHub REST.
- Pure publication policy and publication-plan construction.
- Stable finding fingerprints and marker-based idempotency.
- Sticky summary update/create and inline comment create/skip behavior.
- Reviewed head SHA verification before mutation.
- A `publish-review` CLI and manual `workflow_dispatch` example.
- Unit and fake-transport acceptance coverage.

### Explicitly out of scope

- Automatic pull-request triggers and `/review` comment parsing.
- GitHub App installation/authentication lifecycle.
- Check runs, labels, reactions, or branch protection decisions.
- Live GitHub integration tests.
- Post-review deduplication and verifier policy (Phase 7).

## Decisions

### D2-001 - REST transport stays behind infrastructure

The application depends on `PullRequestProvider` and `ReviewPublisher`; the
GitHub adapter owns URLs, headers, pagination, and response mapping.

### D2-002 - Publication is fail-closed

The publisher re-resolves the PR immediately before mutation and aborts if its
head SHA differs from the reviewed SHA. It never publishes raw or failed OCR
output.

### D2-003 - Idempotency uses explicit markers and fingerprints

Summary and inline bodies contain a stable marker plus SHA-256 fingerprint.
Existing matching markers are treated as already published; one summary marker
is updated rather than creating a second sticky comment.

### D2-004 - Inline comments require changed-file locations

Only actionable findings with confidence at least 0.80 and a valid line on a
changed file are inline-capable. Other findings are summary-only or suppressed.

## Action items

[x] **P2-001** Add PR context, publication, and fingerprint contracts.
[x] **P2-002** Add pure publication policy and plan construction.
[x] **P2-003** Add GitHub REST context adapter with changed files and merge base.
[x] **P2-004** Add idempotent summary and inline publisher with head guard.
[x] **P2-005** Add publish-review CLI and manual workflow dispatch entrypoint.
[x] **P2-006** Add fake-transport unit/acceptance tests.
[x] **P2-007** Run all release gates and record limitations.

## Definition of done

1. Context includes repository, PR number, base/head refs and SHAs, merge base,
   title/body, and normalized changed files.
2. Publication creates or updates exactly one sticky summary for a run/head.
3. Repeating the same publication does not duplicate summary or inline comments.
4. Inline comments carry a stable fingerprint and current reviewed head SHA.
5. A changed head aborts publication before any mutation.
6. Failed OCR or empty findings produce no fabricated publication.
7. Tests use a fake transport only; no live GitHub credentials are required.

## Validation commands

```bash
npm run typecheck
npm run lint
npm run boundaries
npm test
npm run review -- --help
npm run publish-review -- --help
npm audit
```

## Implementation result

Status: Implemented and verified.

Implementation evidence:

- Added `PullRequestProvider`, `ReviewPublisher`, PR context and publication
  contracts, deterministic publication policy, and plan construction.
- Added REST-based `GitHubApiAdapter` with changed-file pagination, merge-base
  resolution, sticky summary update/create, inline comments, SHA-256 finding
  markers, and stale-head fail-closed behavior.
- Added `publish-review` CLI and manual `.github/workflows/review.yml` entrypoint.
- Fake transport acceptance passed for context mapping, one-summary/one-inline
  idempotency, and stale-head mutation prevention.
- Verification passed: `npm run typecheck`, `npm run lint`,
  `npm run boundaries`, `npm test` (20 files, 44 tests),
  `npm run publish-review -- --help`, and `npm audit`.
- Live GitHub API and production Action execution remain environment-dependent;
  no live credentials or network mutation was used by the test suite.
