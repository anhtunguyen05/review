import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const temporaryPaths: string[] = [];
const fakeOcr = resolve("tests/fixtures/fake-ocr.mjs");

async function git(repositoryPath: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd: repositoryPath });
}

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("checkpointed review CLI", () => {
  it("uses the previous successful head as the next incremental base", async () => {
    const repositoryPath = await mkdtemp(join(tmpdir(), "review-checkpoint-cli-"));
    temporaryPaths.push(repositoryPath);
    const checkpointPath = join(repositoryPath, "checkpoint.json");
    const firstOutput = join(repositoryPath, "artifacts-1");
    const secondOutput = join(repositoryPath, "artifacts-2");
    await git(repositoryPath, ["init", "-b", "main"]);
    await git(repositoryPath, ["config", "user.email", "review@example.test"]);
    await git(repositoryPath, ["config", "user.name", "Review Test"]);
    await writeFile(join(repositoryPath, "README.md"), "base\n", "utf8");
    await git(repositoryPath, ["add", "."]);
    await git(repositoryPath, ["commit", "-m", "base"]);
    await git(repositoryPath, ["checkout", "-b", "feature"]);
    await writeFile(join(repositoryPath, "one.ts"), "export const one = true;\n", "utf8");
    await git(repositoryPath, ["add", "."]);
    await git(repositoryPath, ["commit", "-m", "first push"]);
    const firstHead = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repositoryPath })).stdout.trim();
    await writeFile(join(repositoryPath, "two.ts"), "export const two = true;\n", "utf8");
    await git(repositoryPath, ["add", "."]);
    await git(repositoryPath, ["commit", "-m", "second push"]);

    const cliPath = resolve("src/entrypoints/cli/review.ts");
    await execFileAsync(process.execPath, ["--import", "tsx", cliPath, "--repo", repositoryPath, "--from", "main", "--to", firstHead, "--output", firstOutput, "--checkpoint", checkpointPath, "--ocr-command", fakeOcr], { cwd: resolve(".") });
    await execFileAsync(process.execPath, ["--import", "tsx", cliPath, "--repo", repositoryPath, "--from", "main", "--to", "feature", "--output", secondOutput, "--checkpoint", checkpointPath, "--ocr-command", fakeOcr], { cwd: resolve(".") });

    const checkpoint = JSON.parse(await readFile(checkpointPath, "utf8")) as { headSha: string };
    const secondRun = JSON.parse(await readFile(join(secondOutput, "run.json"), "utf8")) as { data: { from: string; changedFiles: Array<{ path: string }> } };
    expect(checkpoint.headSha).toMatch(/^[0-9a-f]{40}$/);
    expect(secondRun.data.from).toBe(firstHead);
    expect(secondRun.data.changedFiles.map((file) => file.path)).toEqual(["two.ts"]);
  }, 15_000);
});
