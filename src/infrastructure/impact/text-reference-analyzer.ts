import type { ImpactCandidate, ImpactEdge, ImpactNode } from "../../domain/review/contracts.js";
import { impactCandidateId, impactNodeId } from "../../domain/review/impact-policy.js";
import type { ImpactFragment, ImpactFragmentAnalyzer, ImpactFragmentInput } from "./impact-fragment.js";

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function sourceAnchors(content: string): string[] {
  const anchors = new Set<string>();
  const declarationPattern = /\b(?:export\s+)?(?:type|interface|enum|class|function|const|let|var)\s+([A-Za-z_$][\w$]*)/g;
  for (const match of content.matchAll(declarationPattern)) {
    const anchor = match[1];
    if (anchor) anchors.add(anchor);
  }
  return [...anchors];
}

function lineNumber(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

export class TextReferenceAnalyzer implements ImpactFragmentAnalyzer {
  analyze(input: ImpactFragmentInput): ImpactFragment {
    const nodes = new Map<string, ImpactNode>();
    const edges = new Map<string, ImpactEdge>();
    const candidates = new Map<string, ImpactCandidate>();
    const directPaths = new Set(input.changedFiles.map((file) => normalizePath(file.path)));

    for (const file of input.changedFiles) {
      const path = normalizePath(file.path);
      nodes.set(impactNodeId(path), { id: impactNodeId(path), location: { path }, directChange: true });
    }

    for (const changedFile of input.files.filter((file) => directPaths.has(normalizePath(file.path)))) {
      for (const symbol of sourceAnchors(changedFile.content)) {
        const expression = new RegExp("\\b" + symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
        for (const consumer of input.files) {
          const consumerPath = normalizePath(consumer.path);
          if (directPaths.has(consumerPath)) continue;
          const match = expression.exec(consumer.content);
          if (!match) continue;

          const consumerNodeId = impactNodeId(consumerPath);
          const sourceNodeId = impactNodeId(normalizePath(changedFile.path));
          nodes.set(consumerNodeId, { id: consumerNodeId, location: { path: consumerPath, startLine: lineNumber(consumer.content, match.index), symbol }, directChange: false });
          nodes.set(sourceNodeId, { id: sourceNodeId, location: { path: normalizePath(changedFile.path) }, directChange: true });
          edges.set(consumerNodeId + "->" + sourceNodeId + ":REFERENCES:" + symbol, {
            from: consumerNodeId,
            to: sourceNodeId,
            kind: "REFERENCES",
            evidence: symbol,
          });

          const candidateId = impactCandidateId(consumerPath);
          const existing = candidates.get(candidateId);
          const reason = { kind: "SYMBOL_REFERENCE" as const, symbol, sourcePath: normalizePath(changedFile.path) };
          candidates.set(candidateId, {
            id: candidateId,
            nodeId: consumerNodeId,
            score: (existing?.score ?? 0) + 40,
            reasons: [...(existing?.reasons ?? []), reason],
          });
        }
      }
    }

    return {
      nodes: [...nodes.values()].sort((left, right) => left.location.path.localeCompare(right.location.path)),
      edges: [...edges.values()].sort((left, right) => (left.from + left.to + left.evidence).localeCompare(right.from + right.to + right.evidence)),
      candidates: [...candidates.values()].sort((left, right) => left.id.localeCompare(right.id)),
      diagnostics: [],
    };
  }
}
