import type { ImpactPolicy } from "./contracts.js";

export const defaultImpactPolicy: ImpactPolicy = {
  maxDepth: 2,
  maxCandidateFiles: 80,
  maxFileBytes: 512 * 1024,
  includeTests: true,
  includeDocs: true,
  ignoredPathSegments: [".git", "node_modules", "vendor", "dist", "build", "coverage"],
};

export function impactNodeId(path: string): string {
  return "path:" + path.replaceAll("\\", "/");
}

export function impactCandidateId(path: string): string {
  return "impact:" + path.replaceAll("\\", "/");
}
