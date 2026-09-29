import { createHash } from "node:crypto";
import type {
  CodeLocation,
  FindingEvidence,
  FindingSeverity,
  FindingType,
  ReviewFinding,
} from "../../../domain/review/contracts.js";

const findingTypes = new Set<FindingType>([
  "DEFECT",
  "SECURITY",
  "PERFORMANCE",
  "MAINTAINABILITY",
  "STYLE",
  "TEST_GAP",
]);
const severities = new Set<FindingSeverity>(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]);

interface RawFinding {
  type: string;
  severity: string;
  confidence: number;
  title: string;
  message: string;
  path: string;
  startLine?: number;
  endLine?: number;
  symbol?: string;
  evidence?: string;
  suggestion?: string;
  actionable?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSafeRelativePath(path: string): boolean {
  return path.length > 0 && !path.startsWith("/") && !path.split("/").includes("..");
}

function asRawFinding(value: unknown): RawFinding | null {
  if (!isRecord(value)) return null;
  const required = ["type", "severity", "confidence", "title", "message", "path"];
  if (required.some((key) => typeof value[key] !== "string" && key !== "confidence")) return null;
  if (typeof value.confidence !== "number" || value.confidence < 0 || value.confidence > 1) return null;
  if (
    typeof value.type !== "string" ||
    typeof value.severity !== "string" ||
    typeof value.title !== "string" ||
    typeof value.message !== "string" ||
    typeof value.path !== "string"
  ) return null;
  if (!isSafeRelativePath(value.path)) return null;
  if (!findingTypes.has(value.type as FindingType) || !severities.has(value.severity as FindingSeverity)) return null;
  return {
    type: value.type,
    severity: value.severity,
    confidence: value.confidence,
    title: value.title,
    message: value.message,
    path: value.path,
    ...(typeof value.startLine === "number" ? { startLine: value.startLine } : {}),
    ...(typeof value.endLine === "number" ? { endLine: value.endLine } : {}),
    ...(typeof value.symbol === "string" ? { symbol: value.symbol } : {}),
    ...(typeof value.evidence === "string" ? { evidence: value.evidence } : {}),
    ...(typeof value.suggestion === "string" ? { suggestion: value.suggestion } : {}),
    ...(typeof value.actionable === "boolean" ? { actionable: value.actionable } : {}),
  };
}

function location(raw: RawFinding): CodeLocation {
  return {
    path: raw.path,
    ...(raw.startLine === undefined ? {} : { startLine: raw.startLine }),
    ...(raw.endLine === undefined ? {} : { endLine: raw.endLine }),
    ...(raw.symbol === undefined ? {} : { symbol: raw.symbol }),
  };
}

export function normalizeOcrFindings(rawJson: unknown): { findings: ReviewFinding[]; diagnostics: string[] } {
  const values = Array.isArray(rawJson) ? rawJson : isRecord(rawJson) && Array.isArray(rawJson.findings) ? rawJson.findings : null;
  if (!values) return { findings: [], diagnostics: ["OCR output must be an array or an object with a findings array"] };

  const diagnostics: string[] = [];
  const findings: ReviewFinding[] = [];
  values.forEach((value, index) => {
    const raw = asRawFinding(value);
    if (!raw) {
      diagnostics.push("Ignored invalid OCR finding at index " + index);
      return;
    }
    const primaryLocation = location(raw);
    const evidence: FindingEvidence[] = raw.evidence
      ? [{ kind: "SOURCE", text: raw.evidence, location: primaryLocation }]
      : [];
    const fingerprint = createHash("sha256")
      .update([raw.type, raw.path, raw.startLine ?? "", raw.endLine ?? "", raw.title, raw.message].join("|"))
      .digest("hex");
    findings.push({
      id: "ocr-" + fingerprint.slice(0, 16),
      fingerprint,
      sourceEngines: ["ocr"],
      type: raw.type as FindingType,
      severity: raw.severity as FindingSeverity,
      confidence: raw.confidence,
      title: raw.title,
      message: raw.message,
      primaryLocation,
      relatedLocations: [],
      evidence,
      actionable: raw.actionable ?? true,
      ...(raw.suggestion === undefined ? {} : { suggestion: raw.suggestion }),
    });
  });
  return { findings, diagnostics };
}
