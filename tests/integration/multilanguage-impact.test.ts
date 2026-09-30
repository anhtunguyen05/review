import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DisabledScreeningEngine } from "../../src/application/disabled-screening-engine.js";
import { reviewLocalRange } from "../../src/application/review-local-range.js";
import type { DeepReviewEngine } from "../../src/application/ports/deep-review-engine.js";
import type { DeepReviewInput } from "../../src/domain/review/contracts.js";
import { defaultImpactPolicy } from "../../src/domain/review/impact-policy.js";
import { FileSystemArtifactStore } from "../../src/infrastructure/storage/filesystem-artifact-store.js";
import { GitCliAdapter } from "../../src/infrastructure/git/git-cli-adapter.js";
import { GitContentAdapter } from "../../src/infrastructure/git/git-content-adapter.js";
import { CompositeImpactAnalyzer } from "../../src/infrastructure/impact/composite-impact-analyzer.js";
import { ExecFileProcessRunner } from "../../src/infrastructure/process/exec-file-process-runner.js";

const execFileAsync = promisify(execFile);
const temporaryPaths: string[] = [];

async function git(repositoryPath: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd: repositoryPath });
}

class CapturingDeepReview implements DeepReviewEngine {
  input?: DeepReviewInput;

  async review(input: DeepReviewInput): Promise<Awaited<ReturnType<DeepReviewEngine["review"]>>> {
    this.input = input;
    return { status: "ok", rawOutput: "{}", rawJson: {}, findings: [], diagnostics: [] };
  }
}

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe("generic multi-language impact pipeline", () => {
  it("discovers an untouched consumer and carries a non-JS direct file into OCR scope", async () => {
    const repositoryPath = await mkdtemp(join(tmpdir(), "review-multilanguage-"));
    const outputDirectory = join(repositoryPath, "artifacts");
    temporaryPaths.push(repositoryPath);
    await git(repositoryPath, ["init", "-b", "main"]);
    await git(repositoryPath, ["config", "user.email", "review@example.test"]);
    await git(repositoryPath, ["config", "user.name", "Review Test"]);
    await mkdir(join(repositoryPath, "src"), { recursive: true });
    await writeFile(join(repositoryPath, "src/service.php"), "<?php class PaymentService {}\n", "utf8");
    await writeFile(join(repositoryPath, "src/consumer.rs"), "fn settle(_: PaymentService) {}\n", "utf8");
    await git(repositoryPath, ["add", "."]);
    await git(repositoryPath, ["commit", "-m", "base"]);
    await git(repositoryPath, ["checkout", "-b", "feature"]);
    await writeFile(join(repositoryPath, "src/service.php"), "<?php class PaymentService { public function settle() {} }\n", "utf8");
    await git(repositoryPath, ["add", "src/service.php"]);
    await git(repositoryPath, ["commit", "-m", "change payment service"]);

    const processRunner = new ExecFileProcessRunner();
    const deepReview = new CapturingDeepReview();
    const result = await reviewLocalRange(
      { repositoryPath, from: "main", to: "feature", outputDirectory, runId: "multi-language-run", createdAt: "now" },
      {
        git: new GitCliAdapter(processRunner),
        impact: new CompositeImpactAnalyzer(new GitContentAdapter(processRunner)),
        impactPolicy: defaultImpactPolicy,
        content: new GitContentAdapter(processRunner),
        scopeBudget: { maxCandidateFiles: 80, maxDeepReviewFiles: 20, maxInputTokens: 150_000, maxDurationMs: 600_000 },
        screening: new DisabledScreeningEngine(),
        deepReview,
        artifacts: new FileSystemArtifactStore(),
      },
    );

    const artifact = JSON.parse(await readFile(join(outputDirectory, "impact-graph.json"), "utf8")) as {
      data: { graph: { candidates: Array<{ id: string; reasons: Array<{ kind: string }> }> } };
    };
    const consumer = artifact.data.graph.candidates.find((candidate) => candidate.id === "impact:src/consumer.rs");
    expect(result.status).toBe("partial");
    expect(consumer?.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "SYMBOL_REFERENCE" }),
    ]));
    expect(deepReview.input?.scope?.required.map((candidate) => candidate.location.path)).toEqual(["src/service.php"]);
  });
});
