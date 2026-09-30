import { describe, expect, it } from "vitest";
import { collectReviewScreeningCandidates } from "../../src/application/review-scope-candidates.js";
import { planReviewScope } from "../../src/application/plan-review-scope.js";
import type {
  ChangedFile,
  ImpactGraph,
  ReviewBudget,
  ScreeningCandidate,
  ScreeningDecision,
  ScreeningResult,
} from "../../src/domain/review/contracts.js";

const budget: ReviewBudget = {
  maxCandidateFiles: 80,
  maxDeepReviewFiles: 20,
  maxInputTokens: 150_000,
  maxDurationMs: 600_000,
};

function decision(candidateId: string, action: ScreeningDecision["action"], risk: number): ScreeningDecision {
  return {
    candidateId,
    relevance: risk,
    correctnessRisk: risk,
    securityRisk: 0,
    reliabilityRisk: 0,
    compatibilityRisk: 0,
    testGapRisk: 0,
    confidence: 0.9,
    action,
    evidence: ["fixture evidence"],
  };
}

function screening(decisions: ScreeningDecision[], status: ScreeningResult["status"] = "ok"): ScreeningResult {
  return { status, decisions, rawOutput: "{}", rawJson: { decisions }, diagnostics: [] };
}

describe("adaptive review scope planner", () => {
  it("selects the configured high/medium subset from a 30-candidate fixture", () => {
    const changedFiles: ChangedFile[] = [{ path: "src/changed.ts", status: "modified" }];
    const graph: ImpactGraph = {
      nodes: [
        { id: "node:src/changed.ts", location: { path: "src/changed.ts" }, directChange: true },
        ...Array.from({ length: 29 }, (_, index) => ({
          id: `node:src/consumer-${index}.ts`,
          location: { path: `src/consumer-${index}.ts` },
          directChange: false,
        })),
      ],
      edges: [],
      candidates: Array.from({ length: 29 }, (_, index) => ({
        id: `impact:src/consumer-${index}.ts`,
        nodeId: `node:src/consumer-${index}.ts`,
        score: 100 - index,
        reasons: [{ kind: "IMPORTER" as const, sourcePath: "src/changed.ts" }],
      })),
    };
    const materialized = collectReviewScreeningCandidates(changedFiles, graph).candidates;
    const directCandidate = materialized[0];
    expect(directCandidate).toBeDefined();
    const decisions = materialized.slice(1).map((candidate, index) =>
      decision(candidate.id, index < 10 ? "DEEP" : index < 20 ? "LIGHT" : "SKIP", index < 10 ? 90 : index < 20 ? 70 : 10),
    );
    const result = planReviewScope({
      candidates: materialized,
      impactGraph: graph,
      screening: screening([decision(directCandidate!.id, "DEEP", 100), ...decisions]),
      budget,
    });

    expect(materialized).toHaveLength(30);
    expect(result.scope.candidates).toHaveLength(20);
    expect(result.scope.required).toHaveLength(1);
    expect(result.scope.candidates.slice(1).every((candidate) => candidate.directChange === false)).toBe(true);
    expect(result.scope.excluded).toHaveLength(10);
    expect(result.scope.excluded.filter((item) => item.reason === "LOW_RELEVANCE")).toHaveLength(9);
    expect(result.scope.excluded.filter((item) => item.reason === "BUDGET")).toHaveLength(1);
    expect(result.background.selectedImpacts).toHaveLength(19);
  });

  it("preserves required direct files and records each exclusion policy", () => {
    const candidates: ScreeningCandidate[] = [
      { id: "direct:src/changed.ts", path: "src/changed.ts", status: "modified", directChange: true },
      { id: "impact:src/skip.ts", path: "src/skip.ts", status: "modified", directChange: false, impactScore: 10 },
      { id: "impact:src/unsupported.json", path: "src/unsupported.json", status: "modified", directChange: false, impactScore: 80 },
      { id: "impact:src/large.ts", path: "src/large.ts", status: "modified", directChange: false, impactScore: 90 },
      { id: "impact:src/budget.ts", path: "src/budget.ts", status: "modified", directChange: false, impactScore: 70 },
    ];
    const result = planReviewScope({
      candidates,
      impactGraph: { nodes: [], edges: [], candidates: [] },
      screening: screening([
        decision("impact:src/skip.ts", "SKIP", 1),
        decision("impact:src/unsupported.json", "DEEP", 80),
        decision("impact:src/large.ts", "DEEP", 90),
        decision("impact:src/budget.ts", "DEEP", 70),
      ]),
      budget: { ...budget, maxDeepReviewFiles: 1, maxInputTokens: 100 },
      estimatedTokensByPath: { "src/changed.ts": 1, "src/large.ts": 101, "src/budget.ts": 1 },
    });

    expect(result.scope.required.map((candidate) => candidate.location.path)).toEqual(["src/changed.ts"]);
    expect(result.scope.excluded.map((item) => item.reason)).toEqual([
      "BUDGET", "TOO_LARGE", "LOW_RELEVANCE", "UNSUPPORTED_PATH",
    ]);
  });

  it("degrades to direct-only when screening is unavailable", () => {
    const candidates: ScreeningCandidate[] = [
      { id: "direct:src/changed.ts", path: "src/changed.ts", status: "modified", directChange: true },
      { id: "impact:src/consumer.ts", path: "src/consumer.ts", status: "modified", directChange: false, impactScore: 80 },
    ];
    const result = planReviewScope({
      candidates,
      impactGraph: { nodes: [], edges: [], candidates: [] },
      screening: screening([], "failed"),
      budget,
    });

    expect(result.status).toBe("partial");
    expect(result.scope.candidates.map((candidate) => candidate.location.path)).toEqual(["src/changed.ts"]);
    expect(result.scope.excluded[0]).toMatchObject({ reason: "SCREENING_UNAVAILABLE", path: "src/consumer.ts" });
    expect(result.background.degraded).toEqual(["Adaptive scope degraded to direct-only"]);
  });
});
