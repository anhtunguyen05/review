import { randomUUID } from "node:crypto";
import type { LocalReviewDependencies } from "../application/review-local-range.js";
import { DisabledScreeningEngine } from "../application/disabled-screening-engine.js";
import { defaultImpactPolicy } from "../domain/review/impact-policy.js";
import type { ImpactPolicy, ReviewBudget } from "../domain/review/contracts.js";
import { ExecFileProcessRunner } from "../infrastructure/process/exec-file-process-runner.js";
import { GitCliAdapter } from "../infrastructure/git/git-cli-adapter.js";
import { GitContentAdapter } from "../infrastructure/git/git-content-adapter.js";
import { CompositeImpactAnalyzer } from "../infrastructure/impact/composite-impact-analyzer.js";
import { JevScreeningAdapter } from "../infrastructure/engines/jev/jev-screening-adapter.js";
import { OcrCliAdapter } from "../infrastructure/engines/ocr/ocr-cli-adapter.js";
import { FileSystemArtifactStore } from "../infrastructure/storage/filesystem-artifact-store.js";

export function buildLocalReview(
  ocrCommand: string,
  ocrArgs: string[] = [],
  screeningCommand?: string,
  screeningArgs: string[] = [],
  impactPolicy: ImpactPolicy = defaultImpactPolicy,
  scopeBudget: ReviewBudget = { maxCandidateFiles: 80, maxDeepReviewFiles: 20, maxInputTokens: 150_000, maxDurationMs: 600_000 },
): LocalReviewDependencies {
  const processRunner = new ExecFileProcessRunner();
  const content = new GitContentAdapter(processRunner, "git", 30_000, 2_000_000, impactPolicy.maxFileBytes);
  return {
    git: new GitCliAdapter(processRunner),
    impact: new CompositeImpactAnalyzer(content),
    impactPolicy,
    content,
    scopeBudget,
    screening: screeningCommand
      ? new JevScreeningAdapter(processRunner, screeningCommand, { commandArgs: screeningArgs })
      : new DisabledScreeningEngine(),
    deepReview: new OcrCliAdapter(processRunner, ocrCommand, { commandArgs: ocrArgs }),
    artifacts: new FileSystemArtifactStore(),
  };
}

export function createRunMetadata(): { runId: string; createdAt: string } {
  return { runId: randomUUID(), createdAt: new Date().toISOString() };
}
