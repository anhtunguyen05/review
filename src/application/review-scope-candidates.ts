import type {
  ChangedFile,
  ImpactGraph,
  ScreeningCandidate,
} from "../domain/review/contracts.js";
import { collectDirectScreeningCandidates } from "./direct-screening-candidates.js";

export interface ReviewScreeningCandidates {
  candidates: ScreeningCandidate[];
  diagnostics: string[];
}

export function collectReviewScreeningCandidates(
  changedFiles: ChangedFile[],
  impactGraph: ImpactGraph,
): ReviewScreeningCandidates {
  const direct = collectDirectScreeningCandidates(changedFiles);
  const directPaths = new Set(direct.candidates.map((candidate) => candidate.path));
  const nodes = new Map(impactGraph.nodes.map((node) => [node.id, node]));
  const candidates = [...direct.candidates];
  const diagnostics = [...direct.diagnostics];

  for (const candidate of impactGraph.candidates) {
    const node = nodes.get(candidate.nodeId);
    if (!node || node.directChange || directPaths.has(node.location.path)) continue;
    candidates.push({
      id: candidate.id,
      path: node.location.path,
      status: "modified",
      directChange: false,
      impactScore: candidate.score,
      reasons: candidate.reasons,
    });
  }

  const deduplicated = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  if (deduplicated.size !== candidates.length) diagnostics.push("Removed duplicate scope screening candidates");
  return { candidates: [...deduplicated.values()], diagnostics };
}
