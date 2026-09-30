import { posix as pathPosix } from "node:path";
import type { ImpactAnalyzer } from "../../application/ports/impact-analyzer.js";
import type { RepositoryContentPort } from "../../application/ports/repository-content.js";
import type {
  ImpactCandidate,
  ImpactDiscoveryInput,
  ImpactDiscoveryResult,
  ImpactEdge,
  ImpactGraph,
  ImpactNode,
  ImpactReason,
} from "../../domain/review/contracts.js";
import { impactCandidateId, impactNodeId } from "../../domain/review/impact-policy.js";
import { ConfigSchemaAnalyzer } from "./config-schema-analyzer.js";
import type { ImpactFragment, ImpactFragmentAnalyzer, ImpactFragmentInput, ImpactSnapshotFile } from "./impact-fragment.js";
import { TestRelationAnalyzer } from "./test-relation-analyzer.js";
import { TextReferenceAnalyzer } from "./text-reference-analyzer.js";
import { TypeScriptImportAnalyzer } from "./languages/typescript-analyzer.js";
import { SemanticImpactAnalyzer } from "./semantic-impact-analyzer.js";
import { goImpactAnalyzer, javaImpactAnalyzer, phpImpactAnalyzer, pythonImpactAnalyzer } from "./languages/additional-language-analyzers.js";

const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]);
const documentationExtensions = new Set([".md", ".mdx", ".txt"]);
const configExtensions = new Set([".json", ".yaml", ".yml"]);

function normalizePath(path: string): string {
  return pathPosix.normalize(path.replaceAll("\\", "/")).replace(/^\.\//, "");
}

function extensionOf(path: string): string {
  return pathPosix.extname(path).toLowerCase();
}

function isTestPath(path: string): boolean {
  const normalized = normalizePath(path).toLowerCase();
  return /(^|\/)(tests?|__tests__)(\/|$)/.test(normalized) || /\.(test|spec)\.[^.]+$/.test(normalized);
}

function isIgnoredPath(path: string, ignoredPathSegments: string[]): boolean {
  const segments = normalizePath(path).toLowerCase().split("/");
  const ignored = new Set(ignoredPathSegments.map((segment) => segment.toLowerCase()));
  return segments.some((segment) => ignored.has(segment)) || /\.generated\.|\.gen\./.test(segments.at(-1) ?? "");
}

function isAnalyzablePath(path: string, input: ImpactDiscoveryInput): boolean {
  const normalized = normalizePath(path);
  if (isIgnoredPath(normalized, input.policy.ignoredPathSegments)) return false;
  const extension = extensionOf(normalized);
  if (sourceExtensions.has(extension)) return input.policy.includeTests || !isTestPath(normalized);
  if (configExtensions.has(extension)) return true;
  return input.policy.includeDocs && documentationExtensions.has(extension);
}

function emptyGraph(): ImpactGraph {
  return { nodes: [], edges: [], candidates: [] };
}

function reasonKey(reason: ImpactReason): string {
  return JSON.stringify(reason);
}

function edgeKey(edge: ImpactEdge): string {
  return edge.from + "->" + edge.to + ":" + edge.kind;
}

function candidateDistance(graph: ImpactGraph, directNodeIds: Set<string>, maxDepth: number): Set<string> {
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
    adjacency.set(edge.to, [...(adjacency.get(edge.to) ?? []), edge.from]);
  }
  const distances = new Map<string, number>();
  const queue = [...directNodeIds];
  for (const id of directNodeIds) distances.set(id, 0);
  while (queue.length > 0) {
    const current = queue.shift()!;
    const distance = distances.get(current)!;
    if (distance >= maxDepth) continue;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (distances.has(neighbor)) continue;
      distances.set(neighbor, distance + 1);
      queue.push(neighbor);
    }
  }
  return new Set([...distances.keys()]);
}

function mergeFragments(fragments: ImpactFragment[]): ImpactGraph {
  const nodes = new Map<string, ImpactNode>();
  const edges = new Map<string, ImpactEdge>();
  const candidates = new Map<string, ImpactCandidate>();
  for (const fragment of fragments) {
    for (const node of fragment.nodes) {
      const existing = nodes.get(node.id);
      nodes.set(node.id, existing ? { ...existing, directChange: existing.directChange || node.directChange } : node);
    }
    for (const edge of fragment.edges) edges.set(edgeKey(edge), edge);
    for (const candidate of fragment.candidates) {
      const existing = candidates.get(candidate.id);
      if (!existing) {
        candidates.set(candidate.id, candidate);
        continue;
      }
      const reasons = new Map(existing.reasons.map((reason) => [reasonKey(reason), reason]));
      for (const reason of candidate.reasons) reasons.set(reasonKey(reason), reason);
      candidates.set(candidate.id, {
        ...existing,
        score: existing.score + candidate.score,
        reasons: [...reasons.values()],
      });
    }
  }
  return {
    nodes: [...nodes.values()].sort((left, right) => left.location.path.localeCompare(right.location.path)),
    edges: [...edges.values()].sort((left, right) => edgeKey(left).localeCompare(edgeKey(right))),
    candidates: [...candidates.values()].sort((left, right) => right.score - left.score || left.id.localeCompare(right.id)),
  };
}

export class CompositeImpactAnalyzer implements ImpactAnalyzer {
  constructor(
    private readonly content: RepositoryContentPort,
    private readonly analyzers: ImpactFragmentAnalyzer[] = [
      new TypeScriptImportAnalyzer(),
      new TextReferenceAnalyzer(),
      new TestRelationAnalyzer(),
      new ConfigSchemaAnalyzer(),
      new SemanticImpactAnalyzer(),
      phpImpactAnalyzer,
      goImpactAnalyzer,
      pythonImpactAnalyzer,
      javaImpactAnalyzer,
    ],
  ) {}

  async discover(input: ImpactDiscoveryInput): Promise<ImpactDiscoveryResult> {
    const diagnostics: string[] = [];
    const headPaths = await this.listFiles(input, input.headSha, diagnostics);
    if (headPaths === undefined) {
      return { status: "failed", graph: emptyGraph(), diagnostics, error: "Impact discovery could not list repository files" };
    }

    const descriptors = new Map<string, { path: string; commitSha: string; directChange: boolean }>();
    const directPaths = new Set(input.changedFiles.map((file) => normalizePath(file.path)));
    for (const path of headPaths) {
      if (isAnalyzablePath(path, input)) descriptors.set(normalizePath(path), { path: normalizePath(path), commitSha: input.headSha, directChange: directPaths.has(normalizePath(path)) });
    }
    for (const file of input.changedFiles) {
      const path = normalizePath(file.path);
      if (!isAnalyzablePath(path, input) || descriptors.has(path)) continue;
      descriptors.set(path, { path, commitSha: input.baseSha, directChange: true });
    }

    const files: ImpactSnapshotFile[] = [];
    let directReadFailure = false;
    for (const descriptor of descriptors.values()) {
      try {
        files.push({
          path: descriptor.path,
          commitSha: descriptor.commitSha,
          content: await this.content.readFile({ repositoryPath: input.repositoryPath, commitSha: descriptor.commitSha, path: descriptor.path }),
          directChange: descriptor.directChange,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Repository file could not be read";
        diagnostics.push("Skipped " + descriptor.path + ": " + message);
        if (descriptor.directChange) directReadFailure = true;
      }
    }
    if (directReadFailure) {
      return { status: "failed", graph: emptyGraph(), diagnostics, error: "A changed file could not be read for impact discovery" };
    }

    const fragmentInput: ImpactFragmentInput = { range: input, changedFiles: input.changedFiles, files, policy: input.policy, ...(input.intent === undefined ? {} : { intent: input.intent }) };
    const fragments = this.analyzers.map((analyzer) => analyzer.analyze(fragmentInput));
    diagnostics.push(...fragments.flatMap((fragment) => fragment.diagnostics));
    let graph = mergeFragments(fragments);
    const directNodeIds = new Set(input.changedFiles.map((file) => impactNodeId(normalizePath(file.path))));
    const reachable = candidateDistance(graph, directNodeIds, input.policy.maxDepth);
    const directCandidateIds = new Set(input.changedFiles.map((file) => impactCandidateId(normalizePath(file.path))));
    const reachableCandidates = graph.candidates.filter((candidate) => reachable.has(candidate.nodeId) || directCandidateIds.has(candidate.id));
    const droppedByDepth = graph.candidates.length - reachableCandidates.length;
    if (droppedByDepth > 0) diagnostics.push("Excluded " + droppedByDepth + " impact candidate(s) beyond max depth " + input.policy.maxDepth);
    const limitedCandidates = reachableCandidates
      .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
      .filter((candidate, index) => directCandidateIds.has(candidate.id) || index < input.policy.maxCandidateFiles);
    if (limitedCandidates.length < reachableCandidates.length) diagnostics.push("Impact candidate limit reached at " + input.policy.maxCandidateFiles);
    graph = { ...graph, candidates: limitedCandidates };
    return { status: "ok", graph, diagnostics };
  }

  private async listFiles(input: ImpactDiscoveryInput, commitSha: string, diagnostics: string[]): Promise<string[] | undefined> {
    try {
      return await this.content.listFiles({ repositoryPath: input.repositoryPath, commitSha });
    } catch (error: unknown) {
      diagnostics.push(error instanceof Error ? error.message : "Repository file listing failed");
      return undefined;
    }
  }
}
