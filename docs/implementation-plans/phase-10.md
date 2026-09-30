# Phase 10 Implementation Plan

## Purpose

Extend deterministic structural impact discovery beyond JS/TS through a
language-analyzer boundary. The first analyzers cover PHP/Laravel and Go, with
the same conservative symbol-reference fallback available for Python and Java.

## Scope lock

### In scope

- `LanguageImpactAnalyzer` interface and composition registration.
- PHP/Laravel class/interface/trait/function references.
- Go type/function references and package-local consumers.
- Python class/function and Java class/interface/enum references through the
  generic text fallback.
- Evidence-backed nodes/edges/candidates with existing budgets and reasons.
- Fixture tests proving untouched consumers are discovered.

### Explicitly out of scope

- Full compiler/LSP call graphs, framework container resolution, or type
  inference.
- Installing language runtimes or executing repository code.
- Language-specific semantic intent or publication policy changes.

## Decisions

### D10-001 - Additive analyzer boundary

Language analyzers implement the existing `ImpactFragment` contract and are
registered in the composite analyzer. Existing JS/TS analyzers remain
unchanged.

### D10-002 - Conservative text evidence

When a parser/LSP is unavailable, exported declaration anchors and consumer
text references produce candidates. Every candidate includes a symbol and
source path reason; no runtime/framework code is executed.

### D10-003 - Preserve language scope in paths

Analyzers only compare files within the same supported language family, which
prevents generic words in unrelated languages from creating cross-language
fan-out.

## Action items

[x] **P10-001** Add language analyzer interface and generic reference helper.
[x] **P10-002** Implement PHP/Laravel and Go analyzers.
[x] **P10-003** Add Python/Java fallback registrations.
[x] **P10-004** Add multi-language fixture and regression coverage.
[x] **P10-005** Run final release gates and update support documentation.

## Definition of done

1. Untouched PHP and Go consumers become deterministic impact candidates.
2. Python and Java source references use the same safe fallback boundary.
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
npm audit
```

## Implementation result

Status: Implemented and verified.

Implementation evidence:

- Added the `LanguageImpactAnalyzer` boundary and registered additive PHP,
  Go, Python, and Java reference analyzers in the composite graph.
- Added four language fixtures proving untouched consumer nodes, references,
  and source-path evidence without executing a language runtime.
- Verification passed: `npm run typecheck`, `npm run lint`,
  `npm run boundaries`, `npm test` (27 files, 57 tests),
  `npm run evaluate`, and `npm audit`.
