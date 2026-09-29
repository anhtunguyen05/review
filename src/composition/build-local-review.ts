import { randomUUID } from "node:crypto";
import type { LocalReviewDependencies } from "../application/review-local-range.js";
import { ExecFileProcessRunner } from "../infrastructure/process/exec-file-process-runner.js";
import { GitCliAdapter } from "../infrastructure/git/git-cli-adapter.js";
import { OcrCliAdapter } from "../infrastructure/engines/ocr/ocr-cli-adapter.js";
import { FileSystemArtifactStore } from "../infrastructure/storage/filesystem-artifact-store.js";

export function buildLocalReview(ocrCommand: string, ocrArgs: string[] = []): LocalReviewDependencies {
  const processRunner = new ExecFileProcessRunner();
  return {
    git: new GitCliAdapter(processRunner),
    deepReview: new OcrCliAdapter(processRunner, ocrCommand, { commandArgs: ocrArgs }),
    artifacts: new FileSystemArtifactStore(),
  };
}

export function createRunMetadata(): { runId: string; createdAt: string } {
  return { runId: randomUUID(), createdAt: new Date().toISOString() };
}
