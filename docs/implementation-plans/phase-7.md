# Phase 7 Implementation Plan

## Purpose

Verify and consolidate raw engine findings before publication. The stage must
remove unsupported claims, merge equivalent cross-engine reports, normalize
severity, and leave an auditable diagnostic trail.

## Scope lock

### In scope

- Evidence/support validation for normalized findings.
- Deterministic duplicate clustering by fingerprint and normalized mechanism.
- Cross-engine source correlation and evidence/related-location union.
- Confidence-aware severity normalization.
- Integration before findings artifact and publication.
- Tests for duplicate OCR/Jev findings, unsupported findings, and severity.

### Explicitly out of scope

- New provider integrations, LLM verification, or human feedback loops.
- Persistent suppression configuration and historical clustering.
- Checkpointing, metrics, or additional language analyzers.

## Decisions

### D7-001 - Verify normalized findings only

Raw provider payloads remain in `ocr.raw.json`; verifier input is the typed
`ReviewFinding[]` produced by trusted normalizers.

### D7-002 - Evidence is mandatory for publication eligibility

Findings without a message, primary path, or concrete evidence are suppressed
from developer-facing findings and produce a diagnostic. No finding is
fabricated to replace it.

### D7-003 - Merge conservatively

Exact fingerprints merge first. A second cluster key combines type, path,
symbol/line, and normalized title/message root. The strongest finding survives;
engine names, evidence, and related locations are unioned.

## Action items

[x] **P7-001** Add verification result and verifier contracts.
[x] **P7-002** Implement support checks, clustering, merge, and severity policy.
[x] **P7-003** Integrate verified findings into artifacts and publication input.
[x] **P7-004** Add duplicate/cross-engine/security regression tests.
[x] **P7-005** Run release gates and update documentation.

## Definition of done

1. Equivalent raw findings produce one developer-facing finding.
2. The merged finding preserves all contributing engines and evidence.
3. Unsupported findings cannot reach publication artifacts.
4. Severity is bounded by confidence and security risk policy.
5. Existing OCR failure behavior remains fail-closed.

## Validation commands

```bash
npm run typecheck
npm run lint
npm run boundaries
npm test
npm audit
```

## Implementation result

Status: Implemented and verified.

Implementation evidence:

- Added `verifyReviewFindings` before findings serialization and publication.
- Equivalent fingerprints/mechanisms merge deterministically while retaining
  contributing engines, evidence, and related locations.
- Unsupported findings are suppressed with diagnostics; severity is bounded by
  confidence; OCR raw output remains preserved separately.
- Verification passed: `npm run typecheck`, `npm run lint`,
  `npm run boundaries`, `npm test` (23 files, 48 tests), and `npm audit`.
