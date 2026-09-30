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

describe("Phase 4 impact discovery", () => {
  it("finds an untouched enum consumer and persists the graph artifact", async () => {
    const repositoryPath = await mkdtemp(join(tmpdir(), "review-impact-"));
    const outputDirectory = join(repositoryPath, "artifacts");
    temporaryPaths.push(repositoryPath);
    await git(repositoryPath, ["init", "-b", "main"]);
    await git(repositoryPath, ["config", "user.email", "review@example.test"]);
    await git(repositoryPath, ["config", "user.name", "Review Test"]);
    await mkdir(join(repositoryPath, "src"), { recursive: true });
    await writeFile(join(repositoryPath, "src/status.ts"), "export type Status = 'OK';\n", "utf8");
    await writeFile(join(repositoryPath, "src/checkout.ts"), "import type { Status } from './status.js';\nexport function checkout(status: Status) { return status; }\n", "utf8");
    await git(repositoryPath, ["add", "."]);
    await git(repositoryPath, ["commit", "-m", "base"]);
    await git(repositoryPath, ["checkout", "-b", "feature"]);
    await writeFile(join(repositoryPath, "src/status.ts"), "export type Status = 'OK' | 'PENDING';\n", "utf8");
    await git(repositoryPath, ["add", "src/status.ts"]);
    await git(repositoryPath, ["commit", "-m", "add pending status"]);

    const processRunner = new ExecFileProcessRunner();
    const result = await reviewLocalRange(
      { repositoryPath, from: "main", to: "feature", outputDirectory, runId: "impact-run", createdAt: "now" },
      {
        git: new GitCliAdapter(processRunner),
        impact: new CompositeImpactAnalyzer(new GitContentAdapter(processRunner)),
        impactPolicy: defaultImpactPolicy,
        content: new GitContentAdapter(processRunner),
        scopeBudget: { maxCandidateFiles: 80, maxDeepReviewFiles: 20, maxInputTokens: 150_000, maxDurationMs: 600_000 },
        screening: new DisabledScreeningEngine(),
        deepReview: new NoopDeepReview(),
        artifacts: new FileSystemArtifactStore(),
      },
    );

    const artifact = JSON.parse(await readFile(join(outputDirectory, "impact-graph.json"), "utf8")) as {
      reviewedHeadSha: string;
      data: { graph: { candidates: Array<{ id: string; reasons: Array<{ kind: string }> }> } };
    };
    const checkout = artifact.data.graph.candidates.find((candidate) => candidate.id === "impact:src/checkout.ts");
    expect(result.status).toBe("partial");
    expect(artifact.reviewedHeadSha).toMatch(/^[0-9a-f]{40}$/);
    expect(checkout?.reasons.map((reason) => reason.kind)).toEqual(expect.arrayContaining(["IMPORTER", "SYMBOL_REFERENCE"]));
  });
});
