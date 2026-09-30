import type { ImpactCandidate, ImpactEdge, ImpactNode } from "../../domain/review/contracts.js";
import { impactCandidateId, impactNodeId } from "../../domain/review/impact-policy.js";
import { classifyRepositoryFile, normalizeRepositoryPath } from "../../domain/review/source-support.js";
import type { ImpactFragment, ImpactFragmentAnalyzer, ImpactFragmentInput } from "./impact-fragment.js";
import { extractGenericAnchors, RepositoryReferenceIndex } from "./repository-reference-index.js";

function isSearchableKind(path: string, ignoredPathSegments: string[]): boolean {
  const kind = classifyRepositoryFile(path, ignoredPathSegments);
  return kind === "CODE" || kind === "CONFIG";
}

function isSymbolLike(anchor: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(anchor);
}

export class GenericReferenceImpactAnalyzer implements ImpactFragmentAnalyzer {
  analyze(input: ImpactFragmentInput): ImpactFragment {
    const nodes = new Map<string, ImpactNode>();
    const edges = new Map<string, ImpactEdge>();
    const candidates = new Map<string, ImpactCandidate>();
    const directPaths = new Set(input.changedFiles.map((file) => normalizeRepositoryPath(file.path)));
    const index = new RepositoryReferenceIndex(input.files, input.policy.ignoredPathSegments);

    for (const changedFile of input.files.filter((file) => file.directChange && isSearchableKind(file.path, input.policy.ignoredPathSegments))) {
      const sourcePath = normalizeRepositoryPath(changedFile.path);
      const sourceNodeId = impactNodeId(sourcePath);
      const anchors = extractGenericAnchors(changedFile.content);
      for (const anchor of anchors) {
        for (const hit of index.references(anchor)) {
          if (directPaths.has(hit.path) || hit.path === sourcePath || !isSearchableKind(hit.path, input.policy.ignoredPathSegments)) continue;
          const nodeId = impactNodeId(hit.path);
          const candidateId = impactCandidateId(hit.path);
          nodes.set(nodeId, { id: nodeId, location: { path: hit.path, startLine: hit.line, symbol: anchor }, directChange: false });
          nodes.set(sourceNodeId, { id: sourceNodeId, location: { path: sourcePath }, directChange: true });
          edges.set(nodeId + "->" + sourceNodeId + ":REFERENCES:" + anchor, {
            from: nodeId,
            to: sourceNodeId,
            kind: "REFERENCES",
            evidence: anchor,
          });
          const reason = isSymbolLike(anchor)
            ? { kind: "SYMBOL_REFERENCE" as const, symbol: anchor, sourcePath }
            : { kind: "TEXT_REFERENCE" as const, query: anchor };
          const existing = candidates.get(candidateId);
          const reasons = existing?.reasons.some((item) => JSON.stringify(item) === JSON.stringify(reason))
            ? existing.reasons
            : [...(existing?.reasons ?? []), reason];
          candidates.set(candidateId, {
            id: candidateId,
            nodeId,
            score: (existing?.score ?? 0) + (isSymbolLike(anchor) ? 24 : 16),
            reasons,
          });
        }
      }
    }

    return {
      nodes: [...nodes.values()].sort((left, right) => left.location.path.localeCompare(right.location.path)),
      edges: [...edges.values()].sort((left, right) => (left.from + left.to + (left.evidence ?? "")).localeCompare(right.from + right.to + (right.evidence ?? ""))),
      candidates: [...candidates.values()].sort((left, right) => right.score - left.score || left.id.localeCompare(right.id)),
      diagnostics: [],
    };
  }
}
