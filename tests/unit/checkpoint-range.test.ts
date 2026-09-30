import { describe, expect, it } from "vitest";
import { configFingerprint, planCheckpointRange } from "../../src/application/plan-checkpoint-range.js";

const checkpoint = {
  repositoryPath: "/repo",
  headSha: "b".repeat(40),
  configFingerprint: configFingerprint({ version: 1, scope: { maxDeepReviewFiles: 20 } }),
  runId: "run-1",
  completedAt: "now",
};

describe("checkpoint range policy", () => {
  it("uses a verified checkpoint for incremental review", () => {
    expect(planCheckpointRange({ requestedFrom: "main", configFingerprint: checkpoint.configFingerprint, checkpoint, descendantVerified: true })).toMatchObject({ mode: "incremental", from: checkpoint.headSha, usedCheckpoint: true });
  });

  it("falls back to the requested full range for stale/config-mismatched checkpoints", () => {
    expect(planCheckpointRange({ requestedFrom: "main", configFingerprint: checkpoint.configFingerprint, checkpoint, descendantVerified: false })).toMatchObject({ mode: "full", from: "main", usedCheckpoint: false });
    expect(planCheckpointRange({ requestedFrom: "main", configFingerprint: "changed", checkpoint, descendantVerified: true })).toMatchObject({ mode: "full", from: "main", usedCheckpoint: false });
  });

  it("honors explicit full mode", () => {
    expect(planCheckpointRange({ requestedFrom: "main", configFingerprint: checkpoint.configFingerprint, checkpoint, descendantVerified: true, forceFull: true }).diagnostics[0]).toContain("explicitly requested");
  });
});
