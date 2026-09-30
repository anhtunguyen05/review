import type { ChangedFile, FindingSeverity, ReviewFinding, VerificationResult } from "../domain/review/contracts.js";

const severityRank: Record<FindingSeverity, number> = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
const severityByRank: FindingSeverity[] = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"];

interface VerifyInput {
  findings: ReviewFinding[];
  changedFiles?: ChangedFile[];
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function supportKey(finding: ReviewFinding): string {
  const location = finding.primaryLocation;
  return [
    finding.type,
    location.path,
    location.symbol ?? "",
    location.startLine ?? "",
    normalized(finding.title),
    normalized(finding.message),
  ].join("|");
}

function severity(finding: ReviewFinding): FindingSeverity {
  const raw = severityRank[finding.severity];
  const maximum = finding.confidence < 0.6 ? severityRank.MEDIUM : finding.confidence < 0.8 ? severityRank.HIGH : severityRank.CRITICAL;
  return severityByRank[Math.min(raw, maximum)] ?? "INFO";
}

function locationKey(location: ReviewFinding["primaryLocation"]): string {
  return [location.path, location.startLine ?? "", location.endLine ?? "", location.symbol ?? ""].join("|");
}

function mergeFindings(left: ReviewFinding, right: ReviewFinding): ReviewFinding {
  const preferred = right.confidence > left.confidence ? right : left;
  const sources = [...new Set([...left.sourceEngines, ...right.sourceEngines])];
  const evidence = [...left.evidence, ...right.evidence].filter((item, index, all) => all.findIndex((candidate) => candidate.kind === item.kind && candidate.text === item.text && locationKey(candidate.location ?? { path: "" }) === locationKey(item.location ?? { path: "" })) === index);
  const relatedLocations = [...left.relatedLocations, ...right.relatedLocations].filter((item, index, all) => all.findIndex((candidate) => locationKey(candidate) === locationKey(item)) === index);
  return {
    ...preferred,
    severity: severity(preferred),
    sourceEngines: sources,
    evidence,
    relatedLocations,
    actionable: left.actionable || right.actionable,
    ...(preferred.suggestion === undefined ? {} : { suggestion: preferred.suggestion }),
  };
}

export function verifyReviewFindings(input: VerifyInput): VerificationResult {
  const diagnostics: string[] = [];
  const clusters = new Map<string, ReviewFinding>();
  let suppressedFindings = 0;
  for (const finding of input.findings) {
    const path = finding.primaryLocation.path;
    const safePath = path.length > 0 && !path.startsWith("/") && !path.split("/").includes("..") && !path.includes("\\");
    const supported = finding.message.trim().length > 0 && finding.evidence.some((item) => item.text.trim().length > 0);
    if (!safePath || !supported) {
      suppressedFindings += 1;
      diagnostics.push("Suppressed unsupported finding " + finding.id);
      continue;
    }
    const key = finding.fingerprint || supportKey(finding);
    const equivalentKey = supportKey(finding);
    const existing = clusters.get(key) ?? clusters.get(equivalentKey);
    if (existing) {
      const merged = mergeFindings(existing, finding);
      for (const [alias, value] of clusters) {
        if (value === existing) clusters.delete(alias);
      }
      clusters.set(key, merged);
      clusters.set(equivalentKey, merged);
      continue;
    }
    const verified = { ...finding, severity: severity(finding) };
    clusters.set(key, verified);
    clusters.set(equivalentKey, verified);
  }
  const unique = [...new Set(clusters.values())];
  const mergedClusters = input.findings.length - suppressedFindings - unique.length;
  if (mergedClusters > 0) diagnostics.push("Merged " + mergedClusters + " duplicate finding(s)");
  if (input.changedFiles && input.changedFiles.length === 0 && unique.length > 0) diagnostics.push("No changed-file context was available for inline publication");
  return {
    status: suppressedFindings > 0 ? "partial" : "ok",
    findings: unique.sort((left, right) => left.primaryLocation.path.localeCompare(right.primaryLocation.path) || (left.primaryLocation.startLine ?? 0) - (right.primaryLocation.startLine ?? 0)),
    diagnostics,
    mergedClusters,
    suppressedFindings,
  };
}
