import { describe, expect, it } from "vitest";
import {
  overallScreeningRisk,
  routeScreeningAction,
  screeningThresholds,
  type ScreeningScores,
} from "../../src/domain/review/screening-policy.js";

function scores(overrides: Partial<ScreeningScores> = {}): ScreeningScores {
  return {
    candidateId: "candidate-1",
    relevance: 0.5,
    correctnessRisk: 0.2,
    securityRisk: 0.2,
    reliabilityRisk: 0.2,
    compatibilityRisk: 0.2,
    testGapRisk: 0.2,
    confidence: 0.9,
    ...overrides,
  };
}

describe("screening policy", () => {
  it("routes low relevance and low risk to SKIP", () => {
    expect(routeScreeningAction(scores({ relevance: 0.1 }))).toBe("SKIP");
  });

  it("routes high risk to DEEP and preserves security precedence", () => {
    const value = scores({ relevance: 0.1, securityRisk: 0.9 });
    expect(overallScreeningRisk(value)).toBe(0.9);
    expect(routeScreeningAction(value)).toBe("DEEP");
  });

  it("uses LIGHT at the exact deep threshold when risk is below it", () => {
    expect(routeScreeningAction(scores({ correctnessRisk: screeningThresholds.deepRisk - 0.01 }))).toBe("LIGHT");
  });

  it("uses DEEP at the exact deep threshold", () => {
    expect(routeScreeningAction(scores({ correctnessRisk: screeningThresholds.deepRisk }))).toBe("DEEP");
  });
});
