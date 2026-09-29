import { withScreeningAction } from "../../../domain/review/screening-policy.js";
import type { ScreeningCandidate, ScreeningDecision } from "../../../domain/review/contracts.js";

interface RawScreeningDecision {
  candidateId: string;
  relevance: number;
  correctnessRisk: number;
  securityRisk: number;
  reliabilityRisk: number;
  compatibilityRisk: number;
  testGapRisk: number;
  confidence: number;
  evidence?: string[];
}

interface ScreeningNormalizationResult {
  decisions: ScreeningDecision[];
  diagnostics: string[];
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBoundedScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function asRawDecision(value: unknown): RawScreeningDecision | null {
  if (!isRecord(value)) return null;
  const numericKeys = [
    "relevance",
    "correctnessRisk",
    "securityRisk",
    "reliabilityRisk",
    "compatibilityRisk",
    "testGapRisk",
    "confidence",
  ] as const;
  if (typeof value.candidateId !== "string" || numericKeys.some((key) => !isBoundedScore(value[key]))) return null;
  if (value.evidence !== undefined && (!Array.isArray(value.evidence) || value.evidence.some((item) => typeof item !== "string"))) {
    return null;
  }
  return {
    candidateId: value.candidateId,
    relevance: value.relevance as number,
    correctnessRisk: value.correctnessRisk as number,
    securityRisk: value.securityRisk as number,
    reliabilityRisk: value.reliabilityRisk as number,
    compatibilityRisk: value.compatibilityRisk as number,
    testGapRisk: value.testGapRisk as number,
    confidence: value.confidence as number,
    ...(value.evidence === undefined ? {} : { evidence: value.evidence as string[] }),
  };
}

export function normalizeScreeningDecisions(
  rawJson: unknown,
  candidates: ScreeningCandidate[],
): ScreeningNormalizationResult {
  if (!isRecord(rawJson) || !Array.isArray(rawJson.decisions)) {
    return {
      decisions: [],
      diagnostics: ["Screening output must be an object with a decisions array"],
      error: "Screening output had an invalid top-level shape",
    };
  }

  const expectedIds = new Set(candidates.map((candidate) => candidate.id));
  const seenIds = new Set<string>();
  const diagnostics: string[] = [];
  const decisions: ScreeningDecision[] = [];

  rawJson.decisions.forEach((value, index) => {
    const raw = asRawDecision(value);
    if (!raw) {
      diagnostics.push("Ignored invalid screening decision at index " + index);
      return;
    }
    if (!expectedIds.has(raw.candidateId)) {
      diagnostics.push("Screening decision referenced an unknown candidate: " + raw.candidateId);
      return;
    }
    if (seenIds.has(raw.candidateId)) {
      diagnostics.push("Screening output contained a duplicate candidate: " + raw.candidateId);
      return;
    }
    seenIds.add(raw.candidateId);
    decisions.push(withScreeningAction(raw));
  });

  const missingIds = candidates.filter((candidate) => !seenIds.has(candidate.id)).map((candidate) => candidate.id);
  if (diagnostics.length > 0 || missingIds.length > 0) {
    if (missingIds.length > 0) diagnostics.push("Screening output omitted candidate(s): " + missingIds.join(", "));
    return {
      decisions: [],
      diagnostics,
      error: "Screening output failed candidate validation",
    };
  }

  return { decisions, diagnostics };
}
