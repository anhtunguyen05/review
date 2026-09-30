import type { ChangedFile, ScreeningCandidate } from "../domain/review/contracts.js";
import { isReviewableSourcePath } from "../domain/review/source-support.js";

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
  return (
    isSafeRepositoryPath(normalized) &&
    isReviewableSourcePath(normalized, [...ignoredSegments])
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
      diagnostics.push("Excluded non-screenable direct repository file: " + normalizePath(file.path));
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
