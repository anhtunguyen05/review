import type { ImpactFragmentAnalyzer, ImpactFragmentInput } from "../impact-fragment.js";
import type { ImpactCandidate, ImpactEdge, ImpactNode } from "../../../domain/review/contracts.js";

export interface LanguageImpactAnalyzer extends ImpactFragmentAnalyzer {
  supports(path: string): boolean;
}

export type LanguageAnchorExtractor = (content: string) => string[];

export interface LanguageDefinition {
  name: string;
  extensions: Set<string>;
  extractAnchors: LanguageAnchorExtractor;
}

export function extensionOf(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const index = normalized.lastIndexOf(".");
  return index < 0 ? "" : normalized.slice(index).toLowerCase();
}

export function createLanguageAnalyzer(definition: LanguageDefinition): LanguageImpactAnalyzer {
  return {
    supports(path: string): boolean {
      return definition.extensions.has(extensionOf(path));
    },
    analyze(input: ImpactFragmentInput) {
      const nodes = new Map<string, ImpactNode>();
      const edges = new Map<string, ImpactEdge>();
      const candidates = new Map<string, ImpactCandidate>();
      const directPaths = new Set(input.changedFiles.map((file) => file.path.replaceAll("\\", "/")));
      const directNode = input.changedFiles.find((file) => definition.extensions.has(extensionOf(file.path)));
      const directNodeId = directNode ? "path:" + directNode.path.replaceAll("\\", "/") : undefined;
      for (const changedFile of input.files.filter((file) => file.directChange && this.supports(file.path))) {
        for (const symbol of definition.extractAnchors(changedFile.content)) {
          for (const consumer of input.files) {
            const consumerPath = consumer.path.replaceAll("\\", "/");
            if (consumer.directChange || directPaths.has(consumerPath) || !this.supports(consumerPath)) continue;
            const match = new RegExp("\\b" + symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").exec(consumer.content);
            if (!match || match.index === undefined) continue;
            const nodeId = "path:" + consumerPath;
            const candidateId = "impact:" + consumerPath;
            const startLine = consumer.content.slice(0, match.index).split("\n").length;
            nodes.set(nodeId, { id: nodeId, location: { path: consumerPath, startLine, symbol }, directChange: false });
            if (directNodeId) {
              edges.set(nodeId + "->" + directNodeId + ":REFERENCES:" + symbol, { from: nodeId, to: directNodeId, kind: "REFERENCES", evidence: symbol });
            }
            const existing = candidates.get(candidateId);
            const reason = { kind: "SYMBOL_REFERENCE" as const, symbol, sourcePath: changedFile.path.replaceAll("\\", "/") };
            candidates.set(candidateId, { id: candidateId, nodeId, score: (existing?.score ?? 0) + 40, reasons: [...(existing?.reasons ?? []), reason] });
          }
        }
      }
      return {
        nodes: [...nodes.values()],
        edges: [...edges.values()],
        candidates: [...candidates.values()],
        diagnostics: [],
      };
    },
  };
}
