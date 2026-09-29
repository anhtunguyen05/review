import type { ChangedFile, ScreeningCandidate } from "../domain/review/contracts.js";

const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]);
const ignoredSegments = new Set([".git", "node_modules", "vendor", "dist", "build", "coverage"]);

export interface DirectScreeningCandidates {
  candidates: ScreeningCandidate[];
  diagnostics: string[];
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function isSafeRepositoryPath(path: string): boolean {
  return path.length > 0 && !path.startsWith("/") && !path.split("/").includes("..") && !/^[A-Za-z]:/.test(path);
}

function isScreenableSourcePath(path: string): boolean {
  const normalized = normalizePath(path);
  const segments = normalized.toLowerCase().split("/");
  const fileName = segments.at(-1) ?? "";
  const extensionIndex = fileName.lastIndexOf(".");
  const extension = extensionIndex < 0 ? "" : fileName.slice(extensionIndex);
  const generated = fileName.includes(".generated.") || fileName.endsWith(".gen.ts") || fileName.endsWith(".gen.js");
  return (
    isSafeRepositoryPath(normalized) &&
    !segments.some((segment) => ignoredSegments.has(segment)) &&
    !generated &&
    sourceExtensions.has(extension)
  );
}

export function screeningCandidateId(file: ChangedFile): string {
  const path = normalizePath(file.path);
  const previousPath = file.previousPath === undefined ? "" : normalizePath(file.previousPath);
  return "direct:" + file.status + ":" + path + (previousPath ? ":from:" + previousPath : "");
}

export function collectDirectScreeningCandidates(changedFiles: ChangedFile[]): DirectScreeningCandidates {
  const candidates: ScreeningCandidate[] = [];
  const diagnostics: string[] = [];

  for (const file of changedFiles) {
    if (!isScreenableSourcePath(file.path)) {
      diagnostics.push("Excluded non-screenable direct file: " + normalizePath(file.path));
      continue;
    }

    candidates.push({
      id: screeningCandidateId(file),
      path: normalizePath(file.path),
      status: file.status,
      ...(file.previousPath === undefined ? {} : { previousPath: normalizePath(file.previousPath) }),
      directChange: true,
    });
  }

  return { candidates, diagnostics };
}
