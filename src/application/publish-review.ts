import type { PullRequestProvider } from "./ports/pull-request-provider.js";
import type { ReviewPublisher } from "./ports/review-publisher.js";
import type { PublicationResult, ReviewFinding } from "../domain/review/contracts.js";
import { buildPublicationPlan } from "./build-publication-plan.js";

export interface PublishReviewInput {
  runId: string;
  owner: string;
  repository: string;
  prNumber: number;
  reviewedHeadSha: string;
  findings: ReviewFinding[];
  reviewStatus: "ok" | "partial" | "failed";
  impactCandidates: number;
  screenedCandidates: number;
  deepReviewedFiles: number;
  degradedStages?: string[];
  durationMs?: number;
}

export async function publishReview(
  input: PublishReviewInput,
  provider: PullRequestProvider,
  publisher: ReviewPublisher,
): Promise<PublicationResult> {
  if (input.reviewStatus === "failed") {
    return {
      status: "failed",
      reviewedHeadSha: input.reviewedHeadSha,
      summaryComment: "skipped",
      inlinePublished: 0,
      inlineSkipped: 0,
      diagnostics: ["Review failed; publication skipped"],
      error: "Review failed",
    };
  }
  const context = await provider.getContext({ owner: input.owner, repository: input.repository, prNumber: input.prNumber });
  if (context.headSha !== input.reviewedHeadSha) {
    return {
      status: "failed",
      reviewedHeadSha: context.headSha,
      summaryComment: "skipped",
      inlinePublished: 0,
      inlineSkipped: 0,
      diagnostics: [`Head changed from ${input.reviewedHeadSha} to ${context.headSha}; publication skipped`],
      error: "Reviewed head is stale",
    };
  }
  const plan = buildPublicationPlan({
    ...input,
    changedFiles: context.changedFiles,
  });
  return publisher.publish(plan);
}
