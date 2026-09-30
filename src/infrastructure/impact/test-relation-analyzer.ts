import { basename, posix as pathPosix } from "node:path";
import type { ImpactCandidate, ImpactEdge, ImpactNode } from "../../domain/review/contracts.js";
import { impactCandidateId, impactNodeId } from "../../domain/review/impact-policy.js";
import type { ImpactFragment, ImpactFragmentAnalyzer, ImpactFragmentInput } from "./impact-fragment.js";

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function isTestPath(path: string): boolean {
  const normalized = normalizePath(path).toLowerCase();
  return /(^|\/)(tests?|__tests__)(\/|$)/.test(normalized) || /\.(test|spec)\.[^.]+$/.test(normalized);
}

function matchesChangedSource(testPath: string, sourcePath: string, content: string): boolean {
  const normalizedTest = normalizePath(testPath);
  const normalizedSource = normalizePath(sourcePath);
  const relative = pathPosix.relative(pathPosix.dirname(normalizedTest), normalizedSource);
  const relativeSpecifier = relative.startsWith(".") ? relative : "./" + relative;
  const sourceBase = basename(normalizedSource).replace(/\.[^.]+$/, "");
  return content.includes(relativeSpecifier) || content.includes(sourceBase);
}

export class TestRelationAnalyzer implements ImpactFragmentAnalyzer {
  analyze(input: ImpactFragmentInput): ImpactFragment {
    const nodes = new Map<string, ImpactNode>();
    const edges = new Map<string, ImpactEdge>();
    const candidates = new Map<string, ImpactCandidate>();
    const directPaths = new Set(input.changedFiles.map((file) => normalizePath(file.path)));

    for (const file of input.files) {
      const testPath = normalizePath(file.path);
      if (!isTestPath(testPath) || directPaths.has(testPath)) continue;
      for (const changedFile of input.changedFiles) {
        const sourcePath = normalizePath(changedFile.path);
        if (!matchesChangedSource(testPath, sourcePath, file.content)) continue;
        const testNodeId = impactNodeId(testPath);
        const sourceNodeId = impactNodeId(sourcePath);
        nodes.set(testNodeId, { id: testNodeId, location: { path: testPath }, directChange: false });
        nodes.set(sourceNodeId, { id: sourceNodeId, location: { path: sourcePath }, directChange: true });
        edges.set(testNodeId + "->" + sourceNodeId + ":TESTS", {
          from: testNodeId,
          to: sourceNodeId,
          kind: "TESTS",
          evidence: sourcePath,
        });
        const candidateId = impactCandidateId(testPath);
        const existing = candidates.get(candidateId);
        candidates.set(candidateId, {
          id: candidateId,
          nodeId: testNodeId,
          score: (existing?.score ?? 0) + 20,
          reasons: [...(existing?.reasons ?? []), { kind: "TEST_RELATION", sourcePath }],
        });
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
