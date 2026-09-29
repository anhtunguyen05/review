# Phase 0 Implementation Plan

## Purpose

This document turns Phase 0 in `12_IMPLEMENTATION_ROADMAP.md` into an
execution-ready task plan.

Phase 0 establishes a runnable TypeScript/Node.js foundation. It does not
implement Git range resolution, OCR, Jev, impact discovery, GitHub publishing,
or GitHub Actions.

## Source-of-truth documents

This plan is derived from:

- `README.md`: documentation index, product flow, and readiness questions;
- `01_PRODUCT_VISION.md`: deterministic discovery, replaceable engines, and
  untrusted source code as data;
- `02_SCOPE_AND_REQUIREMENTS.md`: TypeScript/Node.js MVP constraint,
  determinism, failure isolation, and test gates;
- `03_ARCHITECTURE.md`: hexagonal architecture and dependency direction;
- `04_REVIEW_PIPELINE.md`: explicit lifecycle and degraded-run semantics;
- `05_IMPACT_DISCOVERY.md`: deterministic-first discovery and evidence
  requirements;
- `06_OCR_JEV_INTEGRATION.md`: provider isolation behind adapters;
- `07_DOMAIN_MODEL_AND_CONTRACTS.md`: versioned contracts and stable IDs;
- `08_GITHUB_ACTIONS_AND_TRIGGERS.md`: trigger/security scope reserved for
  later phases;
- `09_SECURITY_AND_TRUST_BOUNDARIES.md`: no privileged execution of PR code;
- `10_OBSERVABILITY_COST_AND_PERFORMANCE.md`: structured stage telemetry;
- `11_TESTING_STRATEGY.md`: deterministic tests and boundary checks;
- `13_REPOSITORY_STRUCTURE.md`: proposed source tree and composition root.

## Scope lock

### In scope

- npm-based TypeScript project bootstrap;
- strict compiler configuration and reproducible scripts;
- source-layer skeleton and dependency-boundary enforcement;
- deterministic test runner;
- configuration loader with a small versioned bootstrap schema;
- structured, redacting logger;
- local `review --help` CLI entrypoint;
- unit, CLI smoke, configuration, logger, and boundary tests;
- local setup documentation.

### Out of scope

- Git adapter or base/head/merge-base resolution;
- OCR or Jev adapters and any LLM/provider calls;
- impact analyzers, screening, scope planning, findings, or publication;
- GitHub API, GitHub Actions, reusable workflows, and secrets;
- executing repository scripts, dependency hooks, tests, or builds from PR code;
- artifact persistence and checkpoint storage;
- complete review configuration for later phases.

## Runtime and tooling decisions

The current workspace provides Node `v24.19.0`, npm `12.0.2`, and Corepack
`0.35.0`. Implementation must record an explicit supported Node range in
the project rather than depending on the local runtime implicitly.

Use:

- npm and `package-lock.json`;
- ESM-compatible TypeScript settings;
- strict TypeScript checking;
- Vitest or an equivalent non-watch TypeScript test runner;
- ESLint for source/test linting;
- a deterministic dependency-graph check for layer boundaries;
- a provider-neutral local JSON-lines logger.

The exact dependency versions are implementation decisions to be pinned in
`package-lock.json`; they are not yet installed in this repository.

## Target source shape

Create only the minimum modules needed to prove the boundaries:

```text
src/
├── domain/
├── application/
│   └── ports/
├── infrastructure/
├── config/
├── composition/
└── entrypoints/
    └── cli/

tests/
├── unit/
├── cli/
└── architecture/
```

Dependency direction:

```text
entrypoints -> composition/application
composition -> infrastructure/application
infrastructure -> application ports/domain
application -> domain
domain -> no external or infrastructure modules
```

The composition root is the only place allowed to assemble concrete
implementations. Phase 0 may use placeholder/no-op components, but later
adapters must be added behind the same seams.

## Task breakdown

### P0-001 — Bootstrap project metadata

Create:

- `package.json`;
- `package-lock.json`;
- `tsconfig.json`;
- test-runner configuration;
- ESLint configuration;
- supported-runtime documentation.

Add scripts:

```text
npm run typecheck
npm run lint
npm run boundaries
npm test
npm run review -- --help
```

Acceptance:

- scripts resolve to local tools;
- typecheck runs with strict settings;
- test command is non-watch and deterministic;
- no provider, GitHub, or network dependency is required.

### P0-002 — Establish dependency boundaries

Create the layer directories and minimal importable modules. Add a static
boundary rule/check that detects forbidden imports.

Required assertions:

- domain imports no infrastructure, entrypoint, Node process, filesystem, or
  provider SDK;
- application imports domain and ports only;
- infrastructure implements inward-facing ports;
- entrypoints do not import concrete OCR, Jev, or GitHub adapters;
- composition may assemble infrastructure implementations.

Acceptance:

- allowed imports pass;
- a forbidden import is detected by a test fixture;
- the check is deterministic and does not execute application code.

### P0-003 — Define bootstrap configuration

Implement:

- `src/config/schema.ts`;
- `src/config/loader.ts`;
- a documented optional local config path.

Phase 0 schema:

```yaml
version: 1
logging:
  level: info
```

Required behavior:

- safe defaults when no config exists;
- explicit path override;
- strict version and value validation;
- actionable errors without secrets;
- no engine, budget, impact, or publication behavior hidden behind the loader.

Future GitHub execution must load security-sensitive settings from the trusted
base, not blindly from the PR head.

### P0-004 — Implement structured logging

Define a small logger interface and a local JSON-lines implementation.

Minimum event shape:

```json
{
  "timestamp": "ISO-8601",
  "level": "info",
  "event": "review.bootstrap",
  "message": "optional",
  "runId": "optional",
  "context": {}
}
```

Required behavior:

- level filtering;
- stable JSON serialization;
- safe error serialization;
- redaction of keys such as `token`, `password`, `secret`, and
  `authorization`;
- no full source payloads or authorization headers;
- logs do not pollute human-readable CLI help output.

### P0-005 — Implement local CLI contract

Create `src/entrypoints/cli/review.ts` and the Phase 0 composition root.

Required command:

```bash
npm run review -- --help
```

Help must:

- exit with status `0`;
- describe the command;
- list supported bootstrap/config options;
- perform no network access;
- not read or execute PR repository code.

Invalid options must produce a concise diagnostic and a non-zero exit code.
Arbitrary shell-like arguments are not accepted.

### P0-006 — Add deterministic tests

Add tests for:

- configuration defaults;
- valid and malformed configuration;
- invalid version and logging level;
- logger JSON shape and level filtering;
- logger error serialization and secret redaction;
- CLI help output and exit code;
- CLI invalid-option behavior;
- allowed and forbidden dependency imports.

Tests must use local fixtures/mocks only. Do not require live GitHub, OCR, Jev,
LLM, or repository fixture commits in Phase 0.

### P0-007 — Document local workflow

Update the project README with:

- supported Node/npm range;
- install command;
- test/typecheck/lint/boundary commands;
- CLI help command;
- explicit statement that Phase 0 has no review-provider integration.

## Dependency order

```text
P0-001
   |
   v
P0-002 ------+
   |         |
   v         v
P0-003    P0-004
   \         /
    v       v
      P0-005
         |
         v
      P0-006
         |
         v
      P0-007
```

P0-003 and P0-004 can be implemented independently after the project
bootstrap. P0-005 depends on both because the composition root must load config
and initialize logging without constructing future providers.

## Definition of done

Run from a clean checkout:

```bash
npm run typecheck
npm run lint
npm run boundaries
npm test
npm run review -- --help
```

All commands must pass. Additionally:

1. a forbidden layer import fails the boundary check;
2. malformed configuration fails without leaking secret-shaped values;
3. a representative log line parses as JSON and is redacted correctly;
4. CLI help is stable and provider-independent;
5. no Phase 1+ source, adapter, action, or secret is required.

## Verification record

Before starting implementation:

- [x] all files under `docs/` reviewed;
- [x] Phase 0 scope separated from later phases;
- [x] AAS capability searches performed;
- [x] AAS candidates compared for architecture, TypeScript setup, testing,
      CLI, configuration, security, and planning;
- [x] AAS stack composed for this Phase 0 plan.

After implementation, record separately:

- commands run and their results;
- checks blocked by environment;
- checks not rerun after the latest change;
- files changed;
- any scope deviation.

## Implementation result

Status: Phase 0 implementation complete.

Implemented:

- npm project metadata and lockfile;
- strict ESM TypeScript configuration;
- deterministic dependency-boundary checker;
- bootstrap YAML schema and loader;
- redacting JSON-lines logger;
- provider-independent local CLI;
- unit, CLI smoke, and architecture tests;
- root README with local workflow.

Final verification on 2026-09-29:

- `npm run typecheck` — pass;
- `npm run lint` — pass;
- `npm run boundaries` — pass: 7 source files;
- `npm test` — pass: 4 test files, 9 tests;
- `npm run review -- --help` — pass;
- `npm audit` — pass: 0 vulnerabilities;
- `npm audit --omit=dev` — pass: 0 vulnerabilities;
- `git diff --check` — pass.

Known environment note: npm reports that the `esbuild` install script was
blocked by the workspace allowlist. Phase 0 does not execute repository code
or depend on that postinstall hook; the TypeScript, lint, boundary, test, CLI,
and audit gates all pass.

Phase 2+ work remains intentionally unimplemented: Jev, impact discovery,
GitHub publication, Actions, and provider secrets.

## AAS skill selection

Selected from the local AAS catalog
`agentic-awesome-skills@16.5.0`:

- `architecture-patterns` — hexagonal/layered architecture;
- `javascript-typescript-typescript-scaffold` — Node/TypeScript bootstrap;
- `cc-skill-coding-standards` — TypeScript/Node coding conventions;
- `javascript-testing-patterns` — deterministic test strategy;
- `ai-native-cli` — CLI help, exit codes, and structured output;
- `deployment-validation-config-validate` — configuration validation;
- `007` — security/threat-boundary review;
- `blueprint` — dependency-aware execution plan.

These selections guide planning only. They are not installed, and their prose
does not override this repository's documents or acceptance criteria.

