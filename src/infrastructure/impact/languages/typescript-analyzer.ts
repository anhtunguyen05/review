import { dirname, posix as pathPosix } from "node:path";
import type { ImpactCandidate, ImpactEdge, ImpactNode } from "../../../domain/review/contracts.js";
import { impactCandidateId, impactNodeId } from "../../../domain/review/impact-policy.js";
import type { ImpactFragment, ImpactFragmentAnalyzer, ImpactFragmentInput } from "../impact-fragment.js";

const sourceExtensions = [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"];

function normalizePath(path: string): string {
  return pathPosix.normalize(path.replaceAll("\\", "/")).replace(/^\.\//, "");
}

function node(path: string, directChange: boolean): ImpactNode {
  return { id: impactNodeId(path), location: { path }, directChange };
}

function candidatesForDirectFiles(input: ImpactFragmentInput): ImpactCandidate[] {
  return input.changedFiles.map((file) => ({
    id: impactCandidateId(normalizePath(file.path)),
    nodeId: impactNodeId(normalizePath(file.path)),
    score: 100,
    reasons: [{ kind: "DIRECT_CHANGE" }],
  }));
}

function importSpecifiers(source: string): string[] {
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^"';]+?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  const result: string[] = [];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier) result.push(specifier);
    }
  }
  return [...new Set(result)];
}

function resolveTarget(importer: string, specifier: string, available: Set<string>): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = normalizePath(pathPosix.join(dirname(importer), specifier));
  const candidates = new Set<string>([base]);
  const extension = pathPosix.extname(base);
  if (extension && [".js", ".jsx", ".mjs", ".cjs"].includes(extension)) {
    const withoutExtension = base.slice(0, -extension.length);
    for (const sourceExtension of sourceExtensions) candidates.add(withoutExtension + sourceExtension);
  }
  if (!extension) {
    for (const sourceExtension of sourceExtensions) candidates.add(base + sourceExtension);
  }
  for (const candidate of [...candidates]) {
    candidates.add(candidate + "/index.ts");
    candidates.add(candidate + "/index.js");
  }
  return [...candidates].find((candidate) => available.has(candidate));
}

export class TypeScriptImportAnalyzer implements ImpactFragmentAnalyzer {
  analyze(input: ImpactFragmentInput): ImpactFragment {
    const diagnostics: string[] = [];
    const nodes = new Map<string, ImpactNode>();
    const edges = new Map<string, ImpactEdge>();
    const candidates = new Map<string, ImpactCandidate>();
    const available = new Set(input.files.map((file) => normalizePath(file.path)));
    const changedPaths = new Set(input.changedFiles.map((file) => normalizePath(file.path)));

    for (const file of input.changedFiles) {
      const path = normalizePath(file.path);
      nodes.set(impactNodeId(path), node(path, true));
    }
    for (const candidate of candidatesForDirectFiles(input)) candidates.set(candidate.id, candidate);

    for (const file of input.files) {
      const importer = normalizePath(file.path);
      const importerNodeId = impactNodeId(importer);
      nodes.set(importerNodeId, node(importer, changedPaths.has(importer)));
      for (const specifier of importSpecifiers(file.content)) {
        const target = resolveTarget(importer, specifier, available);
        if (!target) {
          if (specifier.startsWith(".")) diagnostics.push("Unresolved local import: " + importer + " -> " + specifier);
          continue;
        }
        const targetNodeId = impactNodeId(target);
        nodes.set(targetNodeId, node(target, changedPaths.has(target)));
        const edge: ImpactEdge = { from: importerNodeId, to: targetNodeId, kind: "IMPORTS", evidence: specifier };
        edges.set(importerNodeId + "->" + targetNodeId + ":IMPORTS", edge);
        if (changedPaths.has(target) && !changedPaths.has(importer)) {
          const candidateId = impactCandidateId(importer);
          const existing = candidates.get(candidateId);
          candidates.set(candidateId, {
            id: candidateId,
            nodeId: importerNodeId,
            score: (existing?.score ?? 0) + 30,
            reasons: [...(existing?.reasons ?? []), { kind: "IMPORTER", sourcePath: target }],
          });
        }
      }
    }

    return {
      nodes: [...nodes.values()].sort((left, right) => left.location.path.localeCompare(right.location.path)),
      edges: [...edges.values()].sort((left, right) => (left.from + left.to).localeCompare(right.from + right.to)),
      candidates: [...candidates.values()].sort((left, right) => left.id.localeCompare(right.id)),
      diagnostics,
    };
  }
}
