# Phase 10 Implementation Plan

## Purpose

Extend deterministic structural impact discovery beyond JS/TS through a
language-agnostic repository classifier and reference index. PHP/Laravel, Go,
Python, Java, and new text-based languages use the same conservative fallback;
language-specific analyzers are optional precision plugins.

## Scope lock

### In scope

- repository file classification without a JS/TS extension whitelist;
- generic identifier/text reference indexing and candidate generation;
- optional language-specific precision analyzers behind the same fragment
  contract.
- Evidence-backed nodes/edges/candidates with existing budgets and reasons.
- Fixture tests proving untouched consumers are discovered.

### Explicitly out of scope

- Full compiler/LSP call graphs, framework container resolution, or type
  inference.
- Installing language runtimes or executing repository code.
- Language-specific semantic intent or publication policy changes.

## Decisions

### D10-001 - Generic reference baseline

The default composite path uses one generic reference analyzer. Existing
language analyzers remain available as optional precision plugins and are not
required for baseline multi-language support.

### D10-002 - Conservative text evidence

When a parser/LSP is unavailable, exported declaration anchors and consumer
text references produce candidates. Every candidate includes a symbol and
source path reason; no runtime/framework code is executed.

### D10-003 - Classify repository files, not languages

The classifier filters binary, generated, vendor, lock, and other data files.
Generic code references may be compared across text-based source files, while
config/event/string evidence can intentionally cross language boundaries.

## Action items

[x] **P10-001** Add generic repository file classification.
[x] **P10-002** Implement generic anchor extraction and reference indexing.
[x] **P10-003** Register the generic analyzer in the composite graph.
[x] **P10-004** Remove JS/TS-only screening and scope gates.
[x] **P10-005** Add multi-language and unknown-extension regression coverage.
[x] **P10-006** Run final release gates and update support documentation.

## Definition of done

1. Untouched consumers in PHP, Go, Python, Java, and an unknown source
   extension become deterministic impact candidates.
2. No dedicated analyzer is required for the generic path.
3. Existing JS/TS, semantic, scope, verifier, checkpoint, and metrics behavior
   remains green.
4. No repository code is executed by discovery.

## Validation commands

```bash
npm run typecheck
npm run lint
npm run boundaries
npm test
npm run evaluate
npm audit --offline
```

## Implementation result

Status: Implemented and verified.

Implementation evidence:

- Added a repository file classifier, generic anchor extractor, and reference
  index to the composite graph.
- Removed JS/TS-only gates from discovery, screening, and OCR scope planning.
- Added PHP, Go, Python, Java, and unknown-extension fixtures proving
  untouched consumer nodes and source-path evidence without executing a
  language runtime.
- Verification passed: `npm run typecheck`, `npm run lint`,
  `npm run boundaries`, `npm run evaluate`, `npm audit --offline`, and the
  full test suite (29 files, 72 tests). The CLI child-process tests required a
  temporary preload that supplies `os.userInfo()` because this Windows sandbox
  returns `uv_os_get_passwd ... ENOMEM`; the preload was removed after the run.
