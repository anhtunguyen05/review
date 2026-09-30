import type { ArtifactStore } from "./ports/artifact-store.js";
import type { DeepReviewEngine } from "./ports/deep-review-engine.js";
import type { GitRepositoryPort } from "./ports/git-repository.js";
import type { ScreeningEngine } from "./ports/screening-engine.js";
import type { ImpactAnalyzer } from "./ports/impact-analyzer.js";
import type { RepositoryContentPort } from "./ports/repository-content.js";
import { collectReviewScreeningCandidates } from "./review-scope-candidates.js";
import { planReviewScope } from "./plan-review-scope.js";
import { discoverChangeIntent } from "./discover-change-intent.js";
import { verifyReviewFindings } from "./verify-review-findings.js";
import type {
  ArtifactEnvelope,
  DeepReviewResult,
  ImpactPolicy,
  ImpactDiscoveryResult,
  ReviewBudget,
  IntentDiscoveryResult,
  ReviewMetrics,
  ScopePlanningResult,
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
  title?: string;
  body?: string;
  rangeDiagnostics?: string[];
}

export interface LocalReviewDependencies {
  git: GitRepositoryPort;
  impact: ImpactAnalyzer;
  impactPolicy: ImpactPolicy;
  content: RepositoryContentPort;
  scopeBudget: ReviewBudget;
  screening: ScreeningEngine;
  deepReview: DeepReviewEngine;
  artifacts: ArtifactStore;
}

export interface LocalReviewResult {
  runId: string;
  status: "ok" | "partial" | "failed";
  findingsCount: number;
  impactCandidatesCount: number;
  scope: ScopePlanningResult;
  intent: IntentDiscoveryResult;
  metrics: ReviewMetrics;
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
  const reviewStartedAt = Date.now();
  const stageDurationsMs: Record<string, number> = {};
  const range = await dependencies.git.resolveRange(input);
  const changedFiles = await dependencies.git.getChangedFiles(range);
  let stageStartedAt = Date.now();
  const intentDocuments: Array<{ path: string; content: string }> = [];
  const intentDiagnostics: string[] = [];
  for (const file of changedFiles) {
    if (!/\.(md|mdx|txt)$/i.test(file.path)) continue;
    try {
      intentDocuments.push({
        path: file.path,
        content: await dependencies.content.readFile({
          repositoryPath: range.repositoryPath,
          commitSha: file.status === "deleted" ? range.baseSha : range.headSha,
          path: file.path,
        }),
      });
    } catch (error: unknown) {
      intentDiagnostics.push("Intent document unavailable for " + file.path + ": " + (error instanceof Error ? error.message : "unknown error"));
    }
  }
  const intent = discoverChangeIntent({ changedFiles, documents: intentDocuments, ...(input.title === undefined ? {} : { title: input.title }), ...(input.body === undefined ? {} : { body: input.body }) });
  stageDurationsMs.intent = Date.now() - stageStartedAt;
  stageStartedAt = Date.now();
  let impact: ImpactDiscoveryResult;
  try {
    impact = await dependencies.impact.discover({ ...range, changedFiles, policy: dependencies.impactPolicy, intent: intent.intent });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Impact discovery failed";
    impact = { status: "failed", graph: { nodes: [], edges: [], candidates: [] }, diagnostics: [message], error: message };
  }
  stageDurationsMs.impact = Date.now() - stageStartedAt;
  stageStartedAt = Date.now();
  const screeningCandidates = collectReviewScreeningCandidates(changedFiles, impact.graph);
  let screening: ScreeningResult;

  if (screeningCandidates.candidates.length === 0) {
    screening = {
      status: "ok",
      decisions: [],
      rawOutput: "",
      rawJson: { decisions: [] },
      diagnostics: ["No direct JS/TS source files required screening"],
    };
  } else {
    try {
      screening = await dependencies.screening.screen({ ...range, candidates: screeningCandidates.candidates });
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
  stageDurationsMs.screening = Date.now() - stageStartedAt;

  const estimatedTokensByPath: Record<string, number> = {};
  const scopeDiagnostics: string[] = [];
  stageStartedAt = Date.now();
  for (const candidate of screeningCandidates.candidates) {
    try {
      const content = await dependencies.content.readFile({ repositoryPath: range.repositoryPath, commitSha: range.headSha, path: candidate.path });
      estimatedTokensByPath[candidate.path] = Math.max(1, Math.ceil(Buffer.byteLength(content, "utf8") / 4));
    } catch (error: unknown) {
      estimatedTokensByPath[candidate.path] = 1;
      scopeDiagnostics.push("Token estimate unavailable for " + candidate.path + ": " + (error instanceof Error ? error.message : "unknown error"));
    }
  }
  const scope = planReviewScope({
    candidates: screeningCandidates.candidates,
    impactGraph: impact.graph,
    screening,
    budget: dependencies.scopeBudget,
    estimatedTokensByPath,
  });
  stageDurationsMs.scope = Date.now() - stageStartedAt;

  let deepReview: DeepReviewResult;
  stageStartedAt = Date.now();

  try {
    deepReview = await dependencies.deepReview.review({ ...range, changedFiles, scope: scope.scope, background: scope.background });
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
  stageDurationsMs.deepReview = Date.now() - stageStartedAt;
  stageStartedAt = Date.now();
  const verification = verifyReviewFindings({ findings: deepReview.findings, changedFiles });
  stageDurationsMs.verification = Date.now() - stageStartedAt;

  const screeningDiagnostics = [...screeningCandidates.diagnostics, ...screening.diagnostics];
  const status = deepReview.status === "failed"
    ? "failed"
    : screening.status === "failed" || impact.status === "failed" || scope.status === "partial" || verification.status === "partial"
      ? "partial"
      : "ok";
  const metrics: ReviewMetrics = {
    stageDurationsMs,
    changedFiles: changedFiles.length,
    impactCandidates: impact.graph.candidates.length,
    screenedCandidates: screening.decisions.length,
    skipCount: screening.decisions.filter((decision) => decision.action === "SKIP").length,
    lightCount: screening.decisions.filter((decision) => decision.action === "LIGHT").length,
    deepCount: screening.decisions.filter((decision) => decision.action === "DEEP").length,
    ocrFiles: scope.scope.candidates.length,
    estimatedOcrInputTokens: scope.scope.estimatedTokens,
    rawFindings: deepReview.findings.length,
    verifiedFindings: verification.findings.length,
    duplicatesRemoved: verification.mergedClusters,
    suppressedFindings: verification.suppressedFindings,
    degradedStages: [
      ...(impact.status === "failed" ? ["impact"] : []),
      ...(screening.status !== "ok" ? ["screening"] : []),
      ...(scope.status !== "ok" ? ["scope"] : []),
      ...(verification.status !== "ok" ? ["verification"] : []),
    ],
    totalDurationMs: Date.now() - reviewStartedAt,
  };
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
      metrics,
      diagnostics: [
        ...(input.rangeDiagnostics ?? []).map((item) => "Range: " + item),
        ...impact.diagnostics.map((item) => "Impact: " + item),
        ...intentDiagnostics.map((item) => "Intent: " + item),
        ...intent.diagnostics.map((item) => "Intent: " + item),
        ...scopeDiagnostics.map((item) => "Scope: " + item),
        ...scope.diagnostics.map((item) => "Scope: " + item),
        ...verification.diagnostics.map((item) => "Verification: " + item),
        ...screeningDiagnostics.map((item) => "Screening: " + item),
        ...deepReview.diagnostics,
      ],
    }),
    screening: envelope(input.runId, input.createdAt, range.headSha, {
      status: screening.status,
      candidates: screeningCandidates.candidates,
      decisions: screening.decisions,
      rawOutput: screening.rawOutput,
      rawJson: screening.rawJson,
      diagnostics: screeningDiagnostics,
      ...(screening.error === undefined ? {} : { error: screening.error }),
    }),
    impact: envelope(input.runId, input.createdAt, range.headSha, {
      status: impact.status,
      graph: impact.graph,
      diagnostics: impact.diagnostics,
      ...(impact.error === undefined ? {} : { error: impact.error }),
    }),
    intent: envelope(input.runId, input.createdAt, range.headSha, intent),
    scope: envelope(input.runId, input.createdAt, range.headSha, {
      status: scope.status,
      scope: scope.scope,
      background: scope.background,
      diagnostics: [...scopeDiagnostics, ...scope.diagnostics],
      ...(scope.error === undefined ? {} : { error: scope.error }),
    }),
    ocrRaw: envelope(input.runId, input.createdAt, range.headSha, {
      status: deepReview.status,
      rawOutput: deepReview.rawOutput,
      rawJson: deepReview.rawJson,
      diagnostics: deepReview.diagnostics,
      ...(deepReview.error === undefined ? {} : { error: deepReview.error }),
    }),
    findings: envelope(input.runId, input.createdAt, range.headSha, {
      findings: verification.findings,
    }),
  };

  await dependencies.artifacts.save(input.outputDirectory, artifacts);

  return {
    runId: input.runId,
    status,
    findingsCount: verification.findings.length,
    impactCandidatesCount: impact.graph.candidates.length,
    scope,
    intent,
    metrics,
    screeningDecisionsCount: screening.decisions.length,
    artifacts,
  };
}
