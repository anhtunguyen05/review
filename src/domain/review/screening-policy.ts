import type { ScreeningAction, ScreeningDecision } from "./contracts.js";

export const screeningThresholds = {
  skipRelevance: 0.35,
  skipRisk: 0.45,
  deepRisk: 0.75,
} as const;

export type ScreeningScores = Omit<ScreeningDecision, "action">;

export function overallScreeningRisk(scores: ScreeningScores): number {
  return Math.max(
    scores.correctnessRisk,
    scores.securityRisk,
    scores.reliabilityRisk,
    scores.compatibilityRisk,
    scores.testGapRisk,
  );
}

export function routeScreeningAction(scores: ScreeningScores): ScreeningAction {
  const risk = overallScreeningRisk(scores);
  if (scores.relevance < screeningThresholds.skipRelevance && risk < screeningThresholds.skipRisk) {
    return "SKIP";
  }
  if (risk >= screeningThresholds.deepRisk) return "DEEP";
  return "LIGHT";
}

export function withScreeningAction(scores: ScreeningScores): ScreeningDecision {
  return { ...scores, action: routeScreeningAction(scores) };
}
