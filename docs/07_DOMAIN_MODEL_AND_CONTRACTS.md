# Domain Model and Contracts

## 1. IDs

```ts
export type ReviewRunId = string;
export type CandidateId = string;
export type FindingId = string;
```

## 2. Repository

```ts
export interface RepositoryId {
  host: "github";
  owner: string;
  name: string;
}
```

## 3. Code location

```ts
export interface CodeLocation {
  repository: RepositoryId;
  commitSha: string;
  path: string;
  startLine?: number;
  endLine?: number;
  symbol?: string;
}
```

## 4. PR context

```ts
export interface PullRequestContext {
  repository: RepositoryId;
  prNumber: number;
  title: string;
  body?: string;

  baseRef: string;
  baseSha: string;
  headRef: string;
  headSha: string;
  mergeBaseSha: string;

  isFork: boolean;
}
```

## 5. Change intent

```ts
export interface ChangeIntent {
  summary: string;
  concepts: string[];
  changedBehaviors: string[];
  invariants: string[];
  sourceRefs: IntentSourceRef[];
  confidence: number;
}

export type IntentSourceRef =
  | { kind: "PR_TITLE" }
  | { kind: "PR_BODY" }
  | { kind: "DOC"; path: string }
  | { kind: "CODE"; path: string; symbol?: string };
```

## 6. Impact graph

```ts
export interface ImpactNode {
  id: string;
  location: CodeLocation;
  directChange: boolean;
}

export interface ImpactEdge {
  from: string;
  to: string;
  kind:
    | "IMPORTS"
    | "CALLS"
    | "REFERENCES"
    | "IMPLEMENTS"
    | "TESTS"
    | "CONFIGURES"
    | "SEMANTIC";
  evidence?: string;
}

export interface ImpactCandidate {
  id: CandidateId;
  nodeId: string;
  score: number;
  reasons: ImpactReason[];
}

export type ImpactReason =
  | { kind: "DIRECT_CHANGE" }
  | { kind: "IMPORTER"; sourcePath: string }
  | { kind: "SYMBOL_REFERENCE"; symbol: string; sourcePath: string }
  | { kind: "CALLER"; symbol: string; sourcePath: string }
  | { kind: "IMPLEMENTATION"; symbol: string; sourcePath: string }
  | { kind: "TEST_RELATION"; sourcePath: string }
  | { kind: "CONFIG_REFERENCE"; key: string; sourcePath: string }
  | { kind: "DOC_SEMANTIC"; concept: string; evidence: string }
  | { kind: "TEXT_REFERENCE"; query: string };
```

## 7. Review scope

```ts
export interface ReviewScope {
  required: ScopeCandidate[];
  candidates: ScopeCandidate[];
  excluded: ScopeExclusion[];
}

export interface ScopeCandidate {
  id: CandidateId;
  location: CodeLocation;
  directChange: boolean;
  impactScore: number;
  reasons: ImpactReason[];
  estimatedTokens?: number;
}

export interface ScopeExclusion {
  path: string;
  reason:
    | "IGNORED_PATH"
    | "GENERATED"
    | "BINARY"
    | "TOO_LARGE"
    | "BUDGET"
    | "LOW_RELEVANCE";
}
```

## 8. Screening

```ts
export interface ScreeningDecision {
  candidateId: CandidateId;

  relevance: number;
  correctnessRisk: number;
  securityRisk: number;
  reliabilityRisk: number;
  compatibilityRisk: number;
  testGapRisk: number;

  confidence: number;
  action: "SKIP" | "LIGHT" | "DEEP";

  evidence?: string[];
}
```

## 9. Finding

```ts
export type FindingType =
  | "DEFECT"
  | "REGRESSION_RISK"
  | "FEATURE_IMPACT"
  | "SPEC_MISMATCH"
  | "TEST_GAP"
  | "MAINTAINABILITY";

export type Severity =
  | "INFO"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

export interface ReviewFinding {
  id: FindingId;
  fingerprint: string;

  sourceEngines: Array<"ocr" | "jev" | "deterministic">;

  type: FindingType;
  severity: Severity;
  confidence: number;

  title: string;
  message: string;

  primaryLocation: CodeLocation;
  relatedLocations?: CodeLocation[];

  evidence: FindingEvidence[];
  impactReasons?: ImpactReason[];

  actionable: boolean;
  suggestion?: string;

  publication?: {
    disposition: "INLINE" | "SUMMARY" | "SUPPRESSED";
    reason: string;
  };
}

export type FindingEvidence =
  | { kind: "DIFF"; text: string }
  | { kind: "SOURCE"; text: string; location: CodeLocation }
  | { kind: "DOC"; path: string; text: string }
  | { kind: "RELATION"; text: string };
```

## 10. Fingerprint

Start simple:

```text
sha256(
  normalized finding type
  + repository
  + primary path
  + normalized symbol/mechanism
  + normalized message root cause
)
```

Do not include exact mutable line number alone, because lines move across pushes.

## 11. Publication plan

```ts
export interface PublicationPlan {
  runId: ReviewRunId;
  prNumber: number;
  reviewedHeadSha: string;
  inline: ReviewFinding[];
  summary: ReviewFinding[];
  suppressedCount: number;
  runSummary: ReviewRunSummary;
}
```

## 12. Review run summary

```ts
export interface ReviewRunSummary {
  changedFiles: number;
  impactCandidates: number;
  screenedCandidates: number;
  deepReviewedFiles: number;

  inlineFindings: number;
  summaryFindings: number;
  suppressedFindings: number;

  degradedStages: string[];

  tokenUsage?: {
    screening?: number;
    deepReview?: number;
    total?: number;
  };

  durationMs: number;
}
```

## 13. Serialization

All artifacts should include:

```json
{
  "schemaVersion": 1,
  "runId": "...",
  "createdAt": "...",
  "reviewedHeadSha": "..."
}
```

Version artifacts from day one. It makes future migrations much easier.
