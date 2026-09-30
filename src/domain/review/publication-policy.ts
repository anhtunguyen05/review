import type { ChangedFile, PublicationDisposition, ReviewFinding } from "./contracts.js";

export interface PublicationPolicyInput {
  finding: ReviewFinding;
  changedFiles: ChangedFile[];
}

function isChangedFileLocation(finding: ReviewFinding, changedFiles: ChangedFile[]): boolean {
  const path = finding.primaryLocation.path;
  const changed = changedFiles.find((file) => file.path === path);
  return changed !== undefined && finding.primaryLocation.startLine !== undefined && finding.primaryLocation.startLine > 0;
}

export function publicationDisposition(input: PublicationPolicyInput): { disposition: PublicationDisposition; reason: string } {
  const { finding } = input;
  if (finding.confidence >= 0.8 && finding.actionable && isChangedFileLocation(input.finding, input.changedFiles)) {
    return { disposition: "INLINE", reason: "High-confidence actionable finding on a changed file" };
  }
  if (finding.confidence >= 0.58 && finding.actionable) {
    return { disposition: "SUMMARY", reason: "Actionable finding does not meet inline location requirements" };
  }
  return { disposition: "SUPPRESSED", reason: "Finding confidence or actionability is below publication threshold" };
}
