import { describe, expect, it } from "vitest";
import { reviewLocalRange } from "../../src/application/review-local-range.js";
import type { ArtifactStore } from "../../src/application/ports/artifact-store.js";
import type { DeepReviewEngine } from "../../src/application/ports/deep-review-engine.js";
import type { GitRepositoryPort } from "../../src/application/ports/git-repository.js";
import type { ImpactAnalyzer } from "../../src/application/ports/impact-analyzer.js";
import type { ScreeningEngine } from "../../src/application/ports/screening-engine.js";
import { defaultImpactPolicy } from "../../src/domain/review/impact-policy.js";
import type { ChangedFile, GitReviewRange, ImpactDiscoveryResult, ScreeningResult } from "../../src/domain/review/contracts.js";

const range: GitReviewRange = {
  repositoryPath: "/repo",
  from: "main",
  to: "feature",
  baseSha: "a".repeat(40),
  headSha: "b".repeat(40),
  mergeBaseSha: "a".repeat(40),
};

const changedFiles: ChangedFile[] = [{ path: "src/changed.ts", status: "modified" }];

class StubGit implements GitRepositoryPort {
  async resolveRange(): Promise<GitReviewRange> {
    return range;
  }

  async getChangedFiles(): Promise<ChangedFile[]> {
    return changedFiles;
  }
}

class FailedImpact implements ImpactAnalyzer {
  async discover(): Promise<ImpactDiscoveryResult> {
    return { status: "failed", graph: { nodes: [], edges: [], candidates: [] }, diagnostics: ["fixture discovery failure"], error: "fixture discovery failure" };
  }
}

class DisabledScreening implements ScreeningEngine {
  async screen(): Promise<ScreeningResult> {
    return { status: "disabled", decisions: [], rawOutput: "", rawJson: null, diagnostics: [] };
  }
}

class SuccessfulReview implements DeepReviewEngine {
  async review(): Promise<Awaited<ReturnType<DeepReviewEngine["review"]>>> {
    return { status: "ok", rawOutput: "{}", rawJson: {}, findings: [], diagnostics: [] };
  }
}

class CaptureArtifacts implements ArtifactStore {
  artifacts?: Parameters<ArtifactStore["save"]>[1];

  async save(_outputDirectory: string, artifacts: Parameters<ArtifactStore["save"]>[1]): Promise<void> {
    this.artifacts = artifacts;
  }
}

describe("reviewLocalRange impact fallback", () => {
  it("keeps direct OCR review and marks impact failure as partial", async () => {
    const artifacts = new CaptureArtifacts();
    const result = await reviewLocalRange(
      { repositoryPath: "/repo", from: "main", to: "feature", outputDirectory: "/artifacts", runId: "run-1", createdAt: "now" },
      {
        git: new StubGit(),
        impact: new FailedImpact(),
        impactPolicy: defaultImpactPolicy,
        screening: new DisabledScreening(),
        deepReview: new SuccessfulReview(),
        artifacts,
      },
    );

    expect(result.status).toBe("partial");
    expect(result.impactCandidatesCount).toBe(0);
    expect(artifacts.artifacts?.impact.data).toMatchObject({ status: "failed", error: "fixture discovery failure" });
    expect(artifacts.artifacts?.run.data.diagnostics.join(" ")).toContain("Impact: fixture discovery failure");
  });
});
