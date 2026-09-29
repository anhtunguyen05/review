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
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe("Phase 1 OCR failure handling", () => {
  it("writes a failure artifact without fabricated findings", async () => {
    const repositoryPath = await mkdtemp(join(tmpdir(), "review-range-failure-"));
    const outputDirectory = join(repositoryPath, "artifacts");
    temporaryPaths.push(repositoryPath);

    await git(repositoryPath, ["init", "-b", "main"]);
    await git(repositoryPath, ["config", "user.email", "review@example.test"]);
    await git(repositoryPath, ["config", "user.name", "Review Test"]);
    await writeFile(join(repositoryPath, "base.ts"), "export const base = true;\n", "utf8");
    await git(repositoryPath, ["add", "base.ts"]);
    await git(repositoryPath, ["commit", "-m", "base"]);
    await git(repositoryPath, ["checkout", "-b", "feature"]);
    await writeFile(join(repositoryPath, "changed.ts"), "export const changed = true;\n", "utf8");
    await git(repositoryPath, ["add", "changed.ts"]);
    await git(repositoryPath, ["commit", "-m", "feature"]);

    const cliPath = resolve("src/entrypoints/cli/review.ts");
    await expect(
      execFileAsync(
        process.execPath,
        ["--import", "tsx", cliPath, "--repo", repositoryPath, "--from", "main", "--to", "feature", "--output", outputDirectory, "--ocr-command", fakeOcr],
        { cwd: resolve("."), env: { ...process.env, FAKE_OCR_MODE: "invalid-json" } },
      ),
    ).rejects.toMatchObject({ code: 1 });

    const findings = JSON.parse(await readFile(join(outputDirectory, "findings.json"), "utf8")) as {
      data: { findings: unknown[] };
    };
    const raw = JSON.parse(await readFile(join(outputDirectory, "ocr.raw.json"), "utf8")) as {
      data: { status: string; rawOutput: string; error: string };
    };
    expect(findings.data.findings).toEqual([]);
    expect(raw.data).toMatchObject({ status: "failed", rawOutput: "{", error: "OCR output was not valid JSON" });
  });
});
