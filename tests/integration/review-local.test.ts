import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const temporaryPaths: string[] = [];
const fixtureRoot = resolve("tests/fixtures/repos/pr-range");
const fakeOcr = resolve("tests/fixtures/fake-ocr.mjs");

async function runGit(repositoryPath: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd: repositoryPath });
}

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe("Phase 1 local review", () => {
  it("reviews a git range and writes normalized artifacts", async () => {
    const repositoryPath = await mkdtemp(join(tmpdir(), "review-range-"));
    const outputDirectory = join(repositoryPath, "artifacts");
    temporaryPaths.push(repositoryPath);

    await runGit(repositoryPath, ["init", "-b", "main"]);
    await runGit(repositoryPath, ["config", "user.email", "review@example.test"]);
    await runGit(repositoryPath, ["config", "user.name", "Review Test"]);
    const baseSource = await readFile(join(fixtureRoot, "src/base.ts"), "utf8");
    await writeFile(join(repositoryPath, "base.ts"), baseSource, "utf8");
    await runGit(repositoryPath, ["add", "base.ts"]);
    await runGit(repositoryPath, ["commit", "-m", "base"]);
    await runGit(repositoryPath, ["checkout", "-b", "feature"]);
    await writeFile(join(repositoryPath, "src-placeholder"), "changed", "utf8");
    await runGit(repositoryPath, ["add", "src-placeholder"]);
    await runGit(repositoryPath, ["commit", "-m", "feature"]);

    const cliPath = resolve("src/entrypoints/cli/review.ts");
    const { stdout } = await execFileAsync(
      process.execPath,
      ["--import", "tsx", cliPath, "--repo", repositoryPath, "--from", "main", "--to", "feature", "--output", outputDirectory, "--ocr-command", fakeOcr],
      { cwd: resolve(".") },
    );

    expect(stdout).toMatch(/Review ok: 1 finding\(s\), run [0-9a-f-]+/);
    const run = JSON.parse(await readFile(join(outputDirectory, "run.json"), "utf8")) as {
      data: { mergeBaseSha: string; changedFiles: Array<{ path: string; status: string }>; metrics: { changedFiles: number; estimatedOcrInputTokens: number; totalDurationMs: number } };
    };
    const findings = JSON.parse(await readFile(join(outputDirectory, "findings.json"), "utf8")) as {
      data: { findings: Array<{ sourceEngines: string[]; primaryLocation: { path: string } }> };
    };
    const raw = JSON.parse(await readFile(join(outputDirectory, "ocr.raw.json"), "utf8")) as {
      data: { rawJson: { findings: unknown[] } };
    };

    expect(run.data.mergeBaseSha).toMatch(/^[0-9a-f]{40}$/);
    expect(run.data.metrics).toMatchObject({ changedFiles: 1 });
    expect(run.data.metrics.estimatedOcrInputTokens).toBeGreaterThanOrEqual(0);
    expect(run.data.metrics.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(run.data.changedFiles).toEqual([{ path: "src-placeholder", status: "added" }]);
    expect(findings.data.findings[0]).toMatchObject({
      sourceEngines: ["ocr"],
      primaryLocation: { path: "src/changed.ts" },
    });
    expect(raw.data.rawJson.findings).toHaveLength(1);
  });
});
