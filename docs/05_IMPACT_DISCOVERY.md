# Impact Discovery Design

## 1. Purpose

Impact Discovery answers:

> “What code may be affected by this change even if that code is untouched in the PR?”

It is the primary custom capability of this project.

## 2. Output

```ts
type ImpactGraph = {
  nodes: ImpactNode[];
  edges: ImpactEdge[];
  candidates: ImpactCandidate[];
};

type ImpactCandidate = {
  id: string;
  location: CodeLocation;
  score: number;
  reasons: ImpactReason[];
};
```

## 3. Three levels

## L1 — Direct impact

Sources:
- changed source files;
- changed tests;
- changed configs;
- changed schemas;
- changed docs.

Direct files always enter initial scope.

## L2 — Structural impact

Prefer deterministic tools.

Signals:

### Import/dependency graph
```text
changed module
    <- imported by A
    <- imported by B
```

### Symbol references
Changed:
```ts
type PaymentStatus = "SUCCESS" | "FAILED" | "PENDING";
```

Search for:
```text
PaymentStatus
.status === "FAILED"
.status !== "SUCCESS"
switch(payment.status)
```

### Interface implementations
If an interface changes, inspect implementers and consumers.

### Call graph
If practical for the language:
- callers;
- callees;
- overridden methods;
- dependency injection bindings.

### Test relations
Find:
- tests importing changed module;
- test paths mirrored from source;
- changed fixtures;
- missing tests near impacted modules.

### Schema/config
Search:
- DB schema field consumers;
- env/config key consumers;
- OpenAPI/GraphQL schema references;
- event names;
- queue topics.

## L3 — Semantic impact

Use docs/PR description/business context to discover relationships not visible in static structure.

Example spec:

```text
Payment can remain PENDING for up to 30 minutes.
```

Potential semantic targets:
- order cancellation;
- timeout jobs;
- refund logic;
- notification;
- webhook;
- reconciliation.

LLM may generate **search concepts**, but final candidate files must be grounded by repository evidence.

## 4. Impact reasons

```ts
type ImpactReason =
  | { kind: "DIRECT_CHANGE" }
  | { kind: "IMPORTER"; source: CodeLocation }
  | { kind: "SYMBOL_REFERENCE"; symbol: string; source: CodeLocation }
  | { kind: "CALLER"; symbol: string; source: CodeLocation }
  | { kind: "IMPLEMENTATION"; symbol: string; source: CodeLocation }
  | { kind: "TEST_RELATION"; source: CodeLocation }
  | { kind: "CONFIG_REFERENCE"; key: string; source: CodeLocation }
  | { kind: "DOC_SEMANTIC"; concept: string; evidence: string }
  | { kind: "TEXT_REFERENCE"; query: string };
```

## 5. Candidate score

Start simple and deterministic.

Example:

```text
direct change                 +100
changed public symbol consumer +40
direct importer                +30
caller                         +30
test relation                  +20
config/schema reference        +25
semantic evidence              +15
distance penalty               -10 per graph hop
generated/vendor file          reject
```

Do not pretend this score is a calibrated defect probability. It is a **scope relevance score**.

## 6. Search strategy

### Step A — Extract anchors
From diff:
- exported symbols;
- interfaces;
- type names;
- enum members;
- route names;
- event/topic names;
- configuration keys;
- DB columns;
- API fields.

From docs:
- domain entities;
- changed behaviors;
- invariants;
- new states.

### Step B — deterministic search
Use:
- `git grep`;
- `rg`;
- language index/LSP;
- AST parser;
- manifest/module graph.

### Step C — graph expansion
Depth default: 1 or 2.

Avoid unbounded recursive dependency expansion.

### Step D — rank
Aggregate reasons and distance.

### Step E — Jev screening
Only after deterministic candidate generation.

## 7. Docs-only PR

If only docs change:

```text
docs -> intent -> concepts -> repository search -> impact candidates
```

Result should be presented as:
- `FEATURE_IMPACT`;
- `SPEC_MISMATCH`;
- `IMPLEMENTATION_GAP` if you later add this finding type.

Do not label a code location as a confirmed bug unless evidence supports it.

## 8. Example

Change:

```ts
export type PaymentStatus =
  | "SUCCESS"
  | "FAILED"
  | "PENDING";
```

Untouched:

```ts
if (payment.status === "SUCCESS") {
  confirmOrder();
} else {
  cancelOrder();
}
```

Impact record:

```json
{
  "path": "src/order/checkout.ts",
  "score": 82,
  "reasons": [
    {
      "kind": "SYMBOL_REFERENCE",
      "symbol": "PaymentStatus"
    },
    {
      "kind": "DOC_SEMANTIC",
      "concept": "PENDING is non-final"
    }
  ]
}
```

Deep reviewer now receives a focused question:

```text
PaymentStatus gained PENDING.
Checkout treats every non-SUCCESS state as cancellation.
Check whether PENDING now violates the documented lifecycle.
```

This is far stronger than:
```text
Review checkout.ts.
```

## 9. Language strategy

### V1
JS/TS:
- TypeScript compiler API or ts-morph optional;
- imports/exports;
- symbol text search.

Fallback:
- `rg`/`git grep` for all languages.

### V2
PHP:
- Composer namespace/import mapping;
- PHP parser or language server;
- Laravel route/container/config conventions.

### V3
Go:
- `go list`;
- package imports;
- `gopls` references/call hierarchy.

Keep each language implementation behind:

```ts
interface LanguageImpactAnalyzer {
  supports(path: string): boolean;
  analyze(input: LanguageImpactInput): Promise<ImpactFragment>;
}
```

## 10. Guardrails

Reject/limit:
- vendor;
- generated code;
- lockfiles;
- binaries;
- files above size limit;
- more than configured graph depth;
- more than `maxCandidateFiles`.

## 11. Acceptance tests

Must cover:

1. enum adds a state; untouched consumer is found;
2. interface changes; implementation is found;
3. config key changes; consumer is found;
4. changed docs mention a business concept; relevant source is found;
5. irrelevant text matches are ranked low;
6. graph expansion respects maximum depth;
7. every candidate has at least one reason.
