import type { ImpactCandidate, ImpactEdge, ImpactNode } from "../../domain/review/contracts.js";
import { impactCandidateId, impactNodeId } from "../../domain/review/impact-policy.js";
import type { ImpactFragment, ImpactFragmentAnalyzer, ImpactFragmentInput } from "./impact-fragment.js";

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineNumber(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

function evidence(content: string, index: number): string {
  const line = content.slice(0, index).split("\n").at(-1) ?? "";
  return line.replace(/\s+/g, " ").trim().slice(0, 240);
}

export class SemanticImpactAnalyzer implements ImpactFragmentAnalyzer {
  analyze(input: ImpactFragmentInput): ImpactFragment {
    const nodes = new Map<string, ImpactNode>();
    const edges = new Map<string, ImpactEdge>();
    const candidates = new Map<string, ImpactCandidate>();
    const directPaths = new Set(input.changedFiles.map((file) => normalizePath(file.path)));
    const concepts = input.intent?.concepts ?? [];
    if (concepts.length === 0) return { nodes: [], edges: [], candidates: [], diagnostics: [] };
    const directNode = input.changedFiles[0] ? impactNodeId(normalizePath(input.changedFiles[0].path)) : undefined;

    for (const file of input.files) {
      const path = normalizePath(file.path);
      if (directPaths.has(path)) continue;
      for (const concept of concepts) {
        const match = new RegExp("\\b" + escape(concept) + "\\b", "i").exec(file.content);
        if (!match || match.index === undefined) continue;
        const nodeId = impactNodeId(path);
        const candidateId = impactCandidateId(path);
        const line = lineNumber(file.content, match.index);
        const matchEvidence = evidence(file.content, match.index);
        nodes.set(nodeId, { id: nodeId, location: { path, startLine: line }, directChange: false });
        if (directNode) {
          edges.set(nodeId + "->" + directNode + ":SEMANTIC:" + concept, {
            from: nodeId,
            to: directNode,
            kind: "SEMANTIC",
            evidence: concept,
          });
        }
        const existing = candidates.get(candidateId);
        const reason = { kind: "DOC_SEMANTIC" as const, concept, evidence: matchEvidence };
        const reasons = existing?.reasons.some((item) => JSON.stringify(item) === JSON.stringify(reason))
          ? existing.reasons
          : [...(existing?.reasons ?? []), reason];
        candidates.set(candidateId, {
          id: candidateId,
          nodeId,
          score: (existing?.score ?? 0) + 15,
          reasons,
        });
        break;
      }
    }
    return {
      nodes: [...nodes.values()].sort((left, right) => left.location.path.localeCompare(right.location.path)),
      edges: [...edges.values()].sort((left, right) => (left.from + left.to + left.evidence).localeCompare(right.from + right.to + right.evidence)),
      candidates: [...candidates.values()].sort((left, right) => right.score - left.score || left.id.localeCompare(right.id)),
      diagnostics: [],
    };
  }
}
