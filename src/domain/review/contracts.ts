export type ChangedFileStatus = "added" | "modified" | "deleted" | "renamed";

export interface GitReviewRange {
  repositoryPath: string;
  from: string;
  to: string;
  baseSha: string;
  headSha: string;
  mergeBaseSha: string;
}

export interface ChangedFile {
  path: string;
  status: ChangedFileStatus;
  previousPath?: string;
}

export interface CodeLocation {
  path: string;
  startLine?: number;
  endLine?: number;
  symbol?: string;
}

export type ImpactEdgeKind =
  | "IMPORTS"
  | "CALLS"
  | "REFERENCES"
  | "IMPLEMENTS"
  | "TESTS"
  | "CONFIGURES"
  | "SEMANTIC";

export interface ImpactNode {
  id: string;
  location: CodeLocation;
  directChange: boolean;
}

export interface ImpactEdge {
  from: string;
  to: string;
  kind: ImpactEdgeKind;
  evidence?: string;
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

export interface ImpactCandidate {
  id: string;
  nodeId: string;
  score: number;
  reasons: ImpactReason[];
}

export interface ImpactGraph {
  nodes: ImpactNode[];
  edges: ImpactEdge[];
  candidates: ImpactCandidate[];
}

export interface ImpactPolicy {
  maxDepth: number;
  maxCandidateFiles: number;
  maxFileBytes: number;
  includeTests: boolean;
  includeDocs: boolean;
  ignoredPathSegments: string[];
}

export interface ImpactDiscoveryInput extends GitReviewRange {
  changedFiles: ChangedFile[];
  policy: ImpactPolicy;
}

export interface ImpactDiscoveryResult {
  status: "ok" | "failed";
  graph: ImpactGraph;
  diagnostics: string[];
  error?: string;
}

export type FindingType =
  | "DEFECT"
  | "SECURITY"
  | "PERFORMANCE"
  | "MAINTAINABILITY"
  | "STYLE"
  | "TEST_GAP";

export type FindingSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export interface FindingEvidence {
  kind: "DIFF" | "SOURCE" | "DOC" | "RELATION";
  text: string;
  location?: CodeLocation;
}

export interface ReviewFinding {
  id: string;
  fingerprint: string;
  sourceEngines: Array<"ocr" | "jev" | "deterministic">;
  type: FindingType;
  severity: FindingSeverity;
  confidence: number;
  title: string;
  message: string;
  primaryLocation: CodeLocation;
  relatedLocations: CodeLocation[];
  evidence: FindingEvidence[];
  actionable: boolean;
  suggestion?: string;
}

export interface DeepReviewInput extends GitReviewRange {
  changedFiles: ChangedFile[];
}

export interface ScreeningCandidate {
  id: string;
  path: string;
  status: ChangedFileStatus;
  previousPath?: string;
  directChange: true;
}

export interface ScreeningInput extends GitReviewRange {
  candidates: ScreeningCandidate[];
}

export type ScreeningAction = "SKIP" | "LIGHT" | "DEEP";

export interface ScreeningDecision {
  candidateId: string;
  relevance: number;
  correctnessRisk: number;
  securityRisk: number;
  reliabilityRisk: number;
  compatibilityRisk: number;
  testGapRisk: number;
  confidence: number;
  action: ScreeningAction;
  evidence?: string[];
}

export interface ScreeningResult {
  status: "ok" | "failed" | "disabled";
  decisions: ScreeningDecision[];
  rawOutput: string;
  rawJson: unknown;
  diagnostics: string[];
  error?: string;
}

export interface DeepReviewResult {
  status: "ok" | "failed";
  rawOutput: string;
  rawJson: unknown;
  findings: ReviewFinding[];
  diagnostics: string[];
  error?: string;
}

export interface ArtifactEnvelope<T> {
  schemaVersion: 1;
  runId: string;
  createdAt: string;
  reviewedHeadSha: string;
  data: T;
}

export interface ReviewRunArtifacts {
  run: ArtifactEnvelope<{
    repositoryPath: string;
    from: string;
    to: string;
    baseSha: string;
    headSha: string;
    mergeBaseSha: string;
    changedFiles: ChangedFile[];
    status: "ok" | "partial" | "failed";
    diagnostics: string[];
  }>;
  screening: ArtifactEnvelope<{
    status: ScreeningResult["status"];
    candidates: ScreeningCandidate[];
    decisions: ScreeningDecision[];
    rawOutput: string;
    rawJson: unknown;
    diagnostics: string[];
    error?: string;
  }>;
  impact: ArtifactEnvelope<{
    status: ImpactDiscoveryResult["status"];
    graph: ImpactGraph;
    diagnostics: string[];
    error?: string;
  }>;
  ocrRaw: ArtifactEnvelope<{
    status: "ok" | "failed";
    rawOutput: string;
    rawJson: unknown;
    diagnostics: string[];
    error?: string;
  }>;
  findings: ArtifactEnvelope<{
    findings: ReviewFinding[];
  }>;
}
