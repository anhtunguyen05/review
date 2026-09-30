import type { ImpactCandidate, ImpactEdge, ImpactNode } from "../../domain/review/contracts.js";
import { impactCandidateId, impactNodeId } from "../../domain/review/impact-policy.js";
import type { ImpactFragment, ImpactFragmentAnalyzer, ImpactFragmentInput } from "./impact-fragment.js";

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function isConfigOrSchema(path: string): boolean {
  const normalized = normalizePath(path).toLowerCase();
  return /(^|\/)(config|configs|schema|schemas)(\/|$)/.test(normalized) || /\.(json|ya?ml)$/.test(normalized);
}

function configKeys(content: string): string[] {
  const keys = new Set<string>();
  for (const match of content.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)) {
    if (match[1]) keys.add(match[1]);
  }
  for (const match of content.matchAll(/["']?([A-Za-z][A-Za-z0-9_.-]{2,})["']?\s*:/g)) {
    if (match[1]) keys.add(match[1]);
  }
  return [...keys];
}

export class ConfigSchemaAnalyzer implements ImpactFragmentAnalyzer {
  analyze(input: ImpactFragmentInput): ImpactFragment {
    const nodes = new Map<string, ImpactNode>();
    const edges = new Map<string, ImpactEdge>();
    const candidates = new Map<string, ImpactCandidate>();
    const directPaths = new Set(input.changedFiles.map((file) => normalizePath(file.path)));

    for (const changedFile of input.files.filter((file) => directPaths.has(normalizePath(file.path)) && isConfigOrSchema(file.path))) {
      const sourcePath = normalizePath(changedFile.path);
      const keys = configKeys(changedFile.content);
      const sourceNodeId = impactNodeId(sourcePath);
      nodes.set(sourceNodeId, { id: sourceNodeId, location: { path: sourcePath }, directChange: true });
      for (const consumer of input.files) {
        const consumerPath = normalizePath(consumer.path);
        if (directPaths.has(consumerPath) || isConfigOrSchema(consumerPath)) continue;
        for (const key of keys) {
          const expression = new RegExp("\\b" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
          const match = expression.exec(consumer.content);
          if (!match) continue;
          const consumerNodeId = impactNodeId(consumerPath);
          nodes.set(consumerNodeId, { id: consumerNodeId, location: { path: consumerPath, symbol: key }, directChange: false });
          edges.set(consumerNodeId + "->" + sourceNodeId + ":CONFIGURES:" + key, {
            from: consumerNodeId,
            to: sourceNodeId,
            kind: "CONFIGURES",
            evidence: key,
          });
          const candidateId = impactCandidateId(consumerPath);
          const existing = candidates.get(candidateId);
          candidates.set(candidateId, {
            id: candidateId,
            nodeId: consumerNodeId,
            score: (existing?.score ?? 0) + 25,
            reasons: [...(existing?.reasons ?? []), { kind: "CONFIG_REFERENCE", key, sourcePath }],
          });
        }
      }
    }

    return {
      nodes: [...nodes.values()].sort((left, right) => left.location.path.localeCompare(right.location.path)),
      edges: [...edges.values()].sort((left, right) => (left.from + left.to).localeCompare(right.from + right.to)),
      candidates: [...candidates.values()].sort((left, right) => left.id.localeCompare(right.id)),
      diagnostics: [],
    };
  }
}
