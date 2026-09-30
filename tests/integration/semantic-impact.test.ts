import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DisabledScreeningEngine } from "../../src/application/disabled-screening-engine.js";
import { reviewLocalRange } from "../../src/application/review-local-range.js";
import { defaultImpactPolicy } from "../../src/domain/review/impact-policy.js";
import { GitCliAdapter } from "../../src/infrastructure/git/git-cli-adapter.js";
import { GitContentAdapter } from "../../src/infrastructure/git/git-content-adapter.js";
import { CompositeImpactAnalyzer } from "../../src/infrastructure/impact/composite-impact-analyzer.js";
import { ExecFileProcessRunner } from "../../src/infrastructure/process/exec-file-process-runner.js";
import { FileSystemArtifactStore } from "../../src/infrastructure/storage/filesystem-artifact-store.js";
import type { DeepReviewEngine } from "../../src/application/ports/deep-review-engine.js";

const execFileAsync = promisify(execFile);
const temporaryPaths: string[] = [];

async function git(repositoryPath: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd: repositoryPath });
}

class NoopDeepReview implements DeepReviewEngine {
  async review(): Promise<Awaited<ReturnType<DeepReviewEngine["review"]>>> {
    return { status: "ok", rawOutput: "{}", rawJson: {}, findings: [], diagnostics: [] };
  }
}

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe("Phase 6 semantic impact discovery", () => {
  it("grounds docs-only intent concepts in an untouched source consumer", async () => {
    const repositoryPath = await mkdtemp(join(tmpdir(), "review-semantic-"));
    const outputDirectory = join(repositoryPath, "artifacts");
    temporaryPaths.push(repositoryPath);
    await git(repositoryPath, ["init", "-b", "main"]);
    await git(repositoryPath, ["config", "user.email", "review@example.test"]);
    await git(repositoryPath, ["config", "user.name", "Review Test"]);
    await mkdir(join(repositoryPath, "src"), { recursive: true });
    await writeFile(join(repositoryPath, "src/payment.ts"), "export function settlePayment() { return 'pending'; }\n", "utf8");
    await writeFile(join(repositoryPath, "README.md"), "project overview\n", "utf8");
    await git(repositoryPath, ["add", "."]);
    await git(repositoryPath, ["commit", "-m", "base"]);
    await git(repositoryPath, ["checkout", "-b", "feature"]);
    await writeFile(join(repositoryPath, "docs.md"), "# Payment settlement\nPayment remains pending until reconciliation.\n", "utf8");
    await git(repositoryPath, ["add", "docs.md"]);
    await git(repositoryPath, ["commit", "-m", "document payment lifecycle"]);

    const runner = new ExecFileProcessRunner();
    const content = new GitContentAdapter(runner);
    const result = await reviewLocalRange(
      { repositoryPath, from: "main", to: "feature", outputDirectory, runId: "semantic-run", createdAt: "now" },
      {
        git: new GitCliAdapter(runner),
        impact: new CompositeImpactAnalyzer(content),
        impactPolicy: defaultImpactPolicy,
        content,
        scopeBudget: { maxCandidateFiles: 80, maxDeepReviewFiles: 20, maxInputTokens: 150_000, maxDurationMs: 600_000 },
        screening: new DisabledScreeningEngine(),
        deepReview: new NoopDeepReview(),
        artifacts: new FileSystemArtifactStore(),
      },
    );

    const intent = JSON.parse(await readFile(join(outputDirectory, "intent.json"), "utf8")) as { data: { intent: { concepts: string[] } } };
    const impact = JSON.parse(await readFile(join(outputDirectory, "impact-graph.json"), "utf8")) as { data: { graph: { candidates: Array<{ nodeId: string; reasons: Array<{ kind: string }> }> } } };
    expect(result.status).toBe("partial");
    expect(intent.data.intent.concepts).toContain("payment");
    expect(impact.data.graph.candidates.some((candidate) => candidate.nodeId === "path:src/payment.ts" && candidate.reasons.some((reason) => reason.kind === "DOC_SEMANTIC"))).toBe(true);
  });
});
