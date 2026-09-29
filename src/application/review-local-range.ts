import type { ArtifactStore } from "./ports/artifact-store.js";
import type { DeepReviewEngine } from "./ports/deep-review-engine.js";
import type { GitRepositoryPort } from "./ports/git-repository.js";
import type {
  ArtifactEnvelope,
  DeepReviewResult,
  ReviewRunArtifacts,
} from "../domain/review/contracts.js";

export interface LocalReviewInput {
  repositoryPath: string;
  from: string;
  to: string;
  outputDirectory: string;
  runId: string;
  createdAt: string;
}

export interface LocalReviewDependencies {
  git: GitRepositoryPort;
  deepReview: DeepReviewEngine;
  artifacts: ArtifactStore;
}

export interface LocalReviewResult {
  runId: string;
  status: "ok" | "failed";
  findingsCount: number;
  artifacts: ReviewRunArtifacts;
}

function envelope<T>(
  runId: string,
  createdAt: string,
  reviewedHeadSha: string,
  data: T,
): ArtifactEnvelope<T> {
  return { schemaVersion: 1, runId, createdAt, reviewedHeadSha, data };
}

export async function reviewLocalRange(
  input: LocalReviewInput,
  dependencies: LocalReviewDependencies,
): Promise<LocalReviewResult> {
  const range = await dependencies.git.resolveRange(input);
  const changedFiles = await dependencies.git.getChangedFiles(range);
  let deepReview: DeepReviewResult;

  try {
    deepReview = await dependencies.deepReview.review({ ...range, changedFiles });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Deep review failed";
    deepReview = {
      status: "failed",
      rawOutput: "",
      rawJson: null,
      findings: [],
      diagnostics: [message],
      error: message,
    };
  }

  const artifacts: ReviewRunArtifacts = {
    run: envelope(input.runId, input.createdAt, range.headSha, {
      repositoryPath: range.repositoryPath,
      from: range.from,
      to: range.to,
      baseSha: range.baseSha,
      headSha: range.headSha,
      mergeBaseSha: range.mergeBaseSha,
      changedFiles,
      status: deepReview.status,
      diagnostics: deepReview.diagnostics,
    }),
    ocrRaw: envelope(input.runId, input.createdAt, range.headSha, {
      status: deepReview.status,
      rawOutput: deepReview.rawOutput,
      rawJson: deepReview.rawJson,
      diagnostics: deepReview.diagnostics,
      ...(deepReview.error === undefined ? {} : { error: deepReview.error }),
    }),
    findings: envelope(input.runId, input.createdAt, range.headSha, {
      findings: deepReview.findings,
    }),
  };

  await dependencies.artifacts.save(input.outputDirectory, artifacts);

  return {
    runId: input.runId,
    status: deepReview.status,
    findingsCount: deepReview.findings.length,
    artifacts,
  };
}
