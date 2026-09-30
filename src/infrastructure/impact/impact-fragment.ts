import type {
  ChangedFile,
  ImpactEdge,
  ImpactNode,
  ImpactCandidate,
  ImpactPolicy,
  GitReviewRange,
} from "../../domain/review/contracts.js";

export interface ImpactSnapshotFile {
  path: string;
  commitSha: string;
  content: string;
  directChange: boolean;
}

export interface ImpactFragmentInput {
  range: GitReviewRange;
  changedFiles: ChangedFile[];
  files: ImpactSnapshotFile[];
  policy: ImpactPolicy;
}

export interface ImpactFragment {
  nodes: ImpactNode[];
  edges: ImpactEdge[];
  candidates: ImpactCandidate[];
  diagnostics: string[];
}

export interface ImpactFragmentAnalyzer {
  analyze(input: ImpactFragmentInput): ImpactFragment;
}
