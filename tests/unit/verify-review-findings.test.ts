import { describe, expect, it } from "vitest";
import { verifyReviewFindings } from "../../src/application/verify-review-findings.js";
import type { ReviewFinding } from "../../src/domain/review/contracts.js";

function finding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    id: "f-1",
    fingerprint: "fingerprint-1",
    sourceEngines: ["ocr"],
    type: "DEFECT",
    severity: "CRITICAL",
    confidence: 0.95,
    title: "Unsafe transition",
    message: "State is used before validation.",
    primaryLocation: { path: "src/a.ts", startLine: 4 },
    relatedLocations: [],
    evidence: [{ kind: "SOURCE", text: "state is used", location: { path: "src/a.ts", startLine: 4 } }],
    actionable: true,
    ...overrides,
  };
}

describe("post-review verifier", () => {
  it("merges equivalent cross-engine findings and keeps evidence", () => {
    const result = verifyReviewFindings({
      findings: [
        finding(),
        finding({
          id: "f-2",
          fingerprint: "fingerprint-2",
          sourceEngines: ["jev"],
          title: "Unsafe transition!",
          message: "State is used before validation",
          evidence: [{ kind: "RELATION", text: "same state branch" }],
          confidence: 0.9,
        }),
      ],
    });

    expect(result.status).toBe("ok");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.sourceEngines).toEqual(expect.arrayContaining(["ocr", "jev"]));
    expect(result.findings[0]?.evidence).toHaveLength(2);
    expect(result.mergedClusters).toBe(1);
  });

  it("suppresses unsupported findings and bounds severity by confidence", () => {
    const result = verifyReviewFindings({
      findings: [
        finding({ id: "unsupported", evidence: [] }),
        finding({ id: "low-confidence", fingerprint: "other", confidence: 0.55, severity: "CRITICAL" }),
      ],
    });

    expect(result.status).toBe("partial");
    expect(result.suppressedFindings).toBe(1);
    expect(result.findings[0]?.severity).toBe("MEDIUM");
    expect(result.diagnostics.join(" ")).toContain("Suppressed unsupported finding");
  });
});
