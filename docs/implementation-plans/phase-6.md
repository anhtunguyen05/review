# Phase 6 Implementation Plan

## Purpose

Ground semantic impact candidates in PR intent and changed documentation while
keeping repository file selection deterministic and evidence-backed.

## Scope lock

### In scope

- Structured `ChangeIntent` and intent artifact contracts.
- Deterministic extraction from changed docs plus optional PR title/body.
- Concept normalization, stop-word filtering, and bounded concept count.
- Repository-wide concept evidence search for JS/TS and supported text files.
- `DOC_SEMANTIC` reasons, semantic edges, ranking, and docs-only acceptance.
- Regression tests for irrelevant matches, bounded concepts, and evidence.

### Explicitly out of scope

- Calling an LLM directly from the local review path.
- Treating an LLM-proposed filename as repository evidence.
- Finding-type changes, post-review verification, checkpoints, metrics, or
  additional languages.

## Decisions

### D6-001 - Intent is structured and inspectable

Intent retains summary, concepts, source paths, and confidence. The local
deterministic extractor is the safe baseline; a future LLM adapter can emit the
same contract behind a port.

### D6-002 - Evidence selects files

Semantic search emits a candidate only when a normalized concept occurs in a
read-only repository snapshot outside the changed file set. The candidate
includes the concept and bounded evidence text.

### D6-003 - Bound semantic fan-out

At most 12 concepts and one candidate reason per concept/path are retained.
Generic stop words and short tokens are ignored; structural analyzers remain
the source of higher-confidence impact scores.

## Action items

[x] **P6-001** Add intent contracts, port, artifact, and local flow integration.
[x] **P6-002** Implement deterministic changed-doc/title/body extraction.
[x] **P6-003** Implement evidence-backed semantic impact analyzer.
[x] **P6-004** Add docs-only and irrelevant-match acceptance fixtures.
[x] **P6-005** Update docs/README and run release gates.

## Definition of done

1. A docs-only feature PR emits structured intent and concepts.
2. Matching repository files become `DOC_SEMANTIC` candidates only with evidence.
3. Every semantic candidate has a path, concept, and bounded evidence string.
4. Generic/irrelevant text does not create unbounded candidate fan-out.
5. Existing Phase 1-5 behavior and artifacts remain compatible.

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

- Added structured `ChangeIntent` / `IntentDiscoveryResult`, `intent.json`,
  bounded deterministic concept extraction, and changed-document integration.
- Added semantic impact analysis with `DOC_SEMANTIC` evidence, `SEMANTIC`
  edges, bounded fan-out, and no filename selection without repository text
  evidence.
- Added unit extraction coverage and a docs-only repository acceptance fixture.
- Verification passed: `npm run typecheck`, `npm run lint`,
  `npm run boundaries`, `npm test` (22 files, 46 tests), and `npm audit`.
