import type { ArtifactStore } from "./ports/artifact-store.js";
import type { DeepReviewEngine } from "./ports/deep-review-engine.js";
import type { GitRepositoryPort } from "./ports/git-repository.js";
import type { ScreeningEngine } from "./ports/screening-engine.js";
import { collectDirectScreeningCandidates } from "./direct-screening-candidates.js";
import type {
  ArtifactEnvelope,
  DeepReviewResult,
  ReviewRunArtifacts,
  ScreeningResult,
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
  screening: ScreeningEngine;
  deepReview: DeepReviewEngine;
  artifacts: ArtifactStore;
}

export interface LocalReviewResult {
  runId: string;
  status: "ok" | "partial" | "failed";
  findingsCount: number;
  screeningDecisionsCount: number;
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
  const directCandidates = collectDirectScreeningCandidates(changedFiles);
  let screening: ScreeningResult;

  if (directCandidates.candidates.length === 0) {
    screening = {
      status: "ok",
      decisions: [],
      rawOutput: "",
      rawJson: { decisions: [] },
      diagnostics: ["No direct JS/TS source files required screening"],
    };
  } else {
    try {
      screening = await dependencies.screening.screen({ ...range, candidates: directCandidates.candidates });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Screening failed";
      screening = {
        status: "failed",
        decisions: [],
        rawOutput: "",
        rawJson: null,
        diagnostics: [message],
        error: message,
      };
    }
  }

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

  const screeningDiagnostics = [...directCandidates.diagnostics, ...screening.diagnostics];
  const status = deepReview.status === "failed" ? "failed" : screening.status === "failed" ? "partial" : "ok";
  const artifacts: ReviewRunArtifacts = {
    run: envelope(input.runId, input.createdAt, range.headSha, {
      repositoryPath: range.repositoryPath,
      from: range.from,
      to: range.to,
      baseSha: range.baseSha,
      headSha: range.headSha,
      mergeBaseSha: range.mergeBaseSha,
      changedFiles,
      status,
      diagnostics: [...screeningDiagnostics.map((item) => "Screening: " + item), ...deepReview.diagnostics],
    }),
    screening: envelope(input.runId, input.createdAt, range.headSha, {
      status: screening.status,
      candidates: directCandidates.candidates,
      decisions: screening.decisions,
      rawOutput: screening.rawOutput,
      rawJson: screening.rawJson,
      diagnostics: screeningDiagnostics,
      ...(screening.error === undefined ? {} : { error: screening.error }),
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
    status,
    findingsCount: deepReview.findings.length,
    screeningDecisionsCount: screening.decisions.length,
    artifacts,
  };
}
