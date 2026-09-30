import type { CheckpointRangeDecision, ReviewCheckpoint } from "../domain/review/contracts.js";

export interface PlanCheckpointRangeInput {
  requestedFrom: string;
  configFingerprint: string;
  checkpoint?: ReviewCheckpoint;
  descendantVerified: boolean;
  forceFull?: boolean;
}

export function planCheckpointRange(input: PlanCheckpointRangeInput): CheckpointRangeDecision {
  if (input.forceFull) return { mode: "full", from: input.requestedFrom, usedCheckpoint: false, diagnostics: ["Full review was explicitly requested"] };
  if (!input.checkpoint) return { mode: "full", from: input.requestedFrom, usedCheckpoint: false, diagnostics: ["No usable checkpoint was found; using requested full range"] };
  if (input.checkpoint.configFingerprint !== input.configFingerprint) {
    return { mode: "full", from: input.requestedFrom, usedCheckpoint: false, diagnostics: ["Checkpoint config fingerprint changed; using requested full range"] };
  }
  if (!input.descendantVerified) {
    return { mode: "full", from: input.requestedFrom, usedCheckpoint: false, diagnostics: ["Checkpoint head is not a verified ancestor; using requested full range"] };
  }
  return { mode: "incremental", from: input.checkpoint.headSha, usedCheckpoint: true, diagnostics: ["Using verified checkpoint head as incremental base"] };
}

export function configFingerprint(config: unknown): string {
  return JSON.stringify(config);
}
