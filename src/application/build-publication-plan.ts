import type {
  ChangedFile,
  PublicationDecision,
  PublicationPlan,
  ReviewFinding,
  ReviewRunSummary,
} from "../domain/review/contracts.js";
import { publicationDisposition } from "../domain/review/publication-policy.js";

export interface BuildPublicationPlanInput {
  runId: string;
  owner: string;
  repository: string;
  prNumber: number;
  reviewedHeadSha: string;
  changedFiles: ChangedFile[];
  findings: ReviewFinding[];
  impactCandidates: number;
  screenedCandidates: number;
  deepReviewedFiles: number;
  degradedStages?: string[];
  durationMs?: number;
}

export function buildPublicationPlan(input: BuildPublicationPlanInput): PublicationPlan {
  const decisions: PublicationDecision[] = input.findings.map((finding) => ({
    finding,
    ...publicationDisposition({ finding, changedFiles: input.changedFiles }),
  }));
  const summary: ReviewRunSummary = {
    changedFiles: input.changedFiles.length,
    impactCandidates: input.impactCandidates,
    screenedCandidates: input.screenedCandidates,
    deepReviewedFiles: input.deepReviewedFiles,
    inlineFindings: decisions.filter((decision) => decision.disposition === "INLINE").length,
    summaryFindings: decisions.filter((decision) => decision.disposition === "SUMMARY").length,
    suppressedFindings: decisions.filter((decision) => decision.disposition === "SUPPRESSED").length,
    degradedStages: input.degradedStages ?? [],
    durationMs: input.durationMs ?? 0,
  };
  return {
    runId: input.runId,
    owner: input.owner,
    repository: input.repository,
    prNumber: input.prNumber,
    reviewedHeadSha: input.reviewedHeadSha,
    decisions,
    summary,
  };
}
