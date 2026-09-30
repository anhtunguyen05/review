import type {
  ImpactGraph,
  ReviewBackground,
  ReviewBudget,
  ReviewScope,
  ScopeCandidate,
  ScopeExclusion,
  ScopePlanningResult,
  ScreeningCandidate,
  ScreeningResult,
} from "../domain/review/contracts.js";

export interface ScopePlanningInput {
  candidates: ScreeningCandidate[];
  impactGraph: ImpactGraph;
  screening: ScreeningResult;
  budget: ReviewBudget;
  estimatedTokensByPath?: Readonly<Record<string, number>>;
  estimatedDurationMsByPath?: Readonly<Record<string, number>>;
}

const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]);

function extensionOf(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const index = normalized.lastIndexOf(".");
  return index < 0 ? "" : normalized.slice(index).toLowerCase();
}

function isSupportedPath(path: string): boolean {
  return sourceExtensions.has(extensionOf(path));
}

function riskOf(decision: { correctnessRisk: number; securityRisk: number; reliabilityRisk: number; compatibilityRisk: number; testGapRisk: number }): number {
  return Math.max(
    decision.correctnessRisk,
    decision.securityRisk,
    decision.reliabilityRisk,
    decision.compatibilityRisk,
    decision.testGapRisk,
  );
}

function candidateFromScreening(
  candidate: ScreeningCandidate,
  estimatedTokensByPath: Readonly<Record<string, number>>,
): ScopeCandidate {
  const estimatedTokens = Math.max(1, Math.ceil(estimatedTokensByPath[candidate.path] ?? 1));
  return {
    id: candidate.id,
    location: { path: candidate.path },
    directChange: candidate.directChange,
    impactScore: candidate.impactScore ?? (candidate.directChange ? 100 : 0),
    reasons: candidate.reasons ?? [{ kind: "DIRECT_CHANGE" }],
    estimatedTokens,
  };
}

function emptyBackground(): ReviewBackground {
  return { reviewFocus: [], selectedImpacts: [], contextPaths: [], degraded: [] };
}

function exclusion(
  candidateId: string,
  path: string,
  reason: ScopeExclusion["reason"],
  detail: string,
): ScopeExclusion {
  return { candidateId, path, reason, detail };
}

export function planReviewScope(input: ScopePlanningInput): ScopePlanningResult {
  const diagnostics: string[] = [];
  const exclusions: ScopeExclusion[] = [];
  const estimatedTokensByPath = input.estimatedTokensByPath ?? {};
  const estimatedDurationMsByPath = input.estimatedDurationMsByPath ?? {};
  const screeningById = new Map(input.screening.decisions.map((decision) => [decision.candidateId, decision]));
  const required = input.candidates
    .filter((candidate) => candidate.directChange)
    .map((candidate) => candidateFromScreening(candidate, estimatedTokensByPath))
    .sort((left, right) => left.location.path.localeCompare(right.location.path));
  const selectedImpacted: ScopeCandidate[] = [];
  const background = emptyBackground();

  let totalTokens = required.reduce((sum, candidate) => sum + candidate.estimatedTokens, 0);
  let totalDurationMs = required.reduce(
    (sum, candidate) => sum + Math.max(1, estimatedDurationMsByPath[candidate.location.path] ?? candidate.estimatedTokens * 2),
    0,
  );
  if (required.length > input.budget.maxDeepReviewFiles) {
    diagnostics.push("Required direct files exceed maxDeepReviewFiles and were preserved");
  }
  if (totalTokens > input.budget.maxInputTokens) {
    diagnostics.push("Required direct files exceed maxInputTokens and were preserved");
  }

  const impacted = input.candidates
    .filter((candidate) => !candidate.directChange)
    .map((candidate) => ({
      candidate,
      decision: screeningById.get(candidate.id),
      scope: candidateFromScreening(candidate, estimatedTokensByPath),
    }))
    .sort((left, right) => {
      const leftDecision = left.decision;
      const rightDecision = right.decision;
      const leftAction = leftDecision?.action === "DEEP" ? 0 : leftDecision?.action === "LIGHT" ? 1 : 2;
      const rightAction = rightDecision?.action === "DEEP" ? 0 : rightDecision?.action === "LIGHT" ? 1 : 2;
      return (
        leftAction - rightAction ||
        (rightDecision ? riskOf(rightDecision) : 0) - (leftDecision ? riskOf(leftDecision) : 0) ||
        right.scope.impactScore - left.scope.impactScore ||
        left.scope.estimatedTokens - right.scope.estimatedTokens ||
        left.scope.location.path.localeCompare(right.scope.location.path)
      );
    });

  const screeningUnavailable = input.screening.status !== "ok";
  if (screeningUnavailable && impacted.length > 0) {
    diagnostics.push("Impacted candidates were not selected because screening is " + input.screening.status);
  }

  for (const item of impacted) {
    const { candidate, decision, scope } = item;
    if (!isSupportedPath(scope.location.path)) {
      exclusions.push(exclusion(candidate.id, scope.location.path, "UNSUPPORTED_PATH", "Phase 5 OCR scope supports JS/TS paths only"));
      continue;
    }
    if (screeningUnavailable || !decision) {
      exclusions.push(exclusion(candidate.id, scope.location.path, "SCREENING_UNAVAILABLE", "No trusted screening decision was available"));
      continue;
    }
    if (decision.action === "SKIP") {
      exclusions.push(exclusion(candidate.id, scope.location.path, "LOW_RELEVANCE", "Screening routed the candidate to SKIP"));
      continue;
    }
    if (scope.estimatedTokens > input.budget.maxInputTokens) {
      exclusions.push(exclusion(candidate.id, scope.location.path, "TOO_LARGE", "Candidate estimate exceeds maxInputTokens"));
      continue;
    }
    if (selectedImpacted.length >= input.budget.maxCandidateFiles) {
      exclusions.push(exclusion(candidate.id, scope.location.path, "BUDGET", "maxCandidateFiles reached"));
      continue;
    }
    const duration = Math.max(1, estimatedDurationMsByPath[scope.location.path] ?? scope.estimatedTokens * 2);
    const overFileBudget = required.length + selectedImpacted.length >= input.budget.maxDeepReviewFiles;
    const overTokenBudget = totalTokens + scope.estimatedTokens > input.budget.maxInputTokens;
    const overDurationBudget = totalDurationMs + duration > input.budget.maxDurationMs;
    if (overFileBudget || overTokenBudget || overDurationBudget) {
      const dimensions = [
        overFileBudget ? "maxDeepReviewFiles" : "",
        overTokenBudget ? "maxInputTokens" : "",
        overDurationBudget ? "maxDurationMs" : "",
      ].filter(Boolean).join(", ");
      exclusions.push(exclusion(candidate.id, scope.location.path, "BUDGET", "Budget exceeded: " + dimensions));
      continue;
    }
    selectedImpacted.push(scope);
    totalTokens += scope.estimatedTokens;
    totalDurationMs += duration;
    background.selectedImpacts.push({
      candidateId: candidate.id,
      path: scope.location.path,
      score: scope.impactScore,
      reasons: scope.reasons,
      evidence: decision.evidence ?? [],
    });
    background.reviewFocus.push("Review " + scope.location.path + " for cross-file impact and regression risk");
  }

  const scope: ReviewScope = {
    required,
    candidates: [...required, ...selectedImpacted],
    excluded: exclusions.sort((left, right) => left.path.localeCompare(right.path)),
    estimatedTokens: totalTokens,
    estimatedDurationMs: totalDurationMs,
  };
  if (screeningUnavailable && impacted.length > 0) background.degraded.push("Adaptive scope degraded to direct-only");
  if (scope.excluded.length > 0) diagnostics.push("Excluded " + scope.excluded.length + " candidate(s) from deep review scope");

  return {
    status: screeningUnavailable && impacted.length > 0 ? "partial" : "ok",
    scope,
    background,
    diagnostics,
  };
}
