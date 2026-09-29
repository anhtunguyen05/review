import { describe, expect, it } from "vitest";
import { normalizeScreeningDecisions } from "../../src/infrastructure/engines/jev/screening-normalizer.js";
import type { ScreeningCandidate } from "../../src/domain/review/contracts.js";

const candidates: ScreeningCandidate[] = [
  { id: "direct:modified:src/a.ts", path: "src/a.ts", status: "modified", directChange: true },
  { id: "direct:modified:src/b.ts", path: "src/b.ts", status: "modified", directChange: true },
];

function decision(candidateId: string, risk = 0.2) {
  return {
    candidateId,
    relevance: 0.5,
    correctnessRisk: risk,
    securityRisk: 0.2,
    reliabilityRisk: 0.2,
    compatibilityRisk: 0.2,
    testGapRisk: 0.2,
    confidence: 0.8,
    evidence: ["fixture evidence"],
  };
}

describe("screening normalizer", () => {
  it("maps all candidates and computes actions", () => {
    const result = normalizeScreeningDecisions(
      { decisions: [decision(candidates[0]!.id, 0.9), decision(candidates[1]!.id)] },
      candidates,
    );

    expect(result.error).toBeUndefined();
    expect(result.decisions).toMatchObject([
      { candidateId: candidates[0]!.id, action: "DEEP" },
      { candidateId: candidates[1]!.id, action: "LIGHT" },
    ]);
  });

  it("rejects missing candidates instead of fabricating SKIP", () => {
    const result = normalizeScreeningDecisions({ decisions: [decision(candidates[0]!.id)] }, candidates);

    expect(result.decisions).toEqual([]);
    expect(result.error).toBe("Screening output failed candidate validation");
    expect(result.diagnostics.join(" ")).toContain(candidates[1]!.id);
  });

  it("rejects out-of-range scores and unknown candidates", () => {
    const result = normalizeScreeningDecisions(
      {
        decisions: [
          { ...decision(candidates[0]!.id), correctnessRisk: 1.2 },
          decision("unknown"),
        ],
      },
      candidates,
    );

    expect(result.decisions).toEqual([]);
    expect(result.error).toBe("Screening output failed candidate validation");
  });
});
