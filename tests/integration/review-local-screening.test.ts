import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const temporaryPaths: string[] = [];
const fakeOcr = resolve("tests/fixtures/fake-ocr.mjs");
const fakeScreening = resolve("tests/fixtures/fake-screening.mjs");

async function git(repositoryPath: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd: repositoryPath });
}

async function createFixtureRepository(): Promise<{ repositoryPath: string; outputDirectory: string }> {
  const repositoryPath = await mkdtemp(join(tmpdir(), "review-screening-"));
  const outputDirectory = join(repositoryPath, "artifacts");
  temporaryPaths.push(repositoryPath);
  await git(repositoryPath, ["init", "-b", "main"]);
  await git(repositoryPath, ["config", "user.email", "review@example.test"]);
  await git(repositoryPath, ["config", "user.name", "Review Test"]);
  await writeFile(join(repositoryPath, "base.ts"), "export const base = true;\n", "utf8");
  await git(repositoryPath, ["add", "base.ts"]);
  await git(repositoryPath, ["commit", "-m", "base"]);
  await git(repositoryPath, ["checkout", "-b", "feature"]);
  await mkdir(join(repositoryPath, "src"));
  await writeFile(join(repositoryPath, "src/a.ts"), "export const a = true;\n", "utf8");
  await writeFile(join(repositoryPath, "src/b.ts"), "export const b = true;\n", "utf8");
  await writeFile(join(repositoryPath, "src/c.ts"), "export const c = true;\n", "utf8");
  await writeFile(join(repositoryPath, "README.md"), "docs changed\n", "utf8");
  await git(repositoryPath, ["add", "."]);
  await git(repositoryPath, ["commit", "-m", "feature"]);
  return { repositoryPath, outputDirectory };
}

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe("Phase 3 local screening", () => {
  it("writes explicit DEEP, LIGHT, and SKIP decisions for direct source files", async () => {
    const { repositoryPath, outputDirectory } = await createFixtureRepository();
    const cliPath = resolve("src/entrypoints/cli/review.ts");
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        "--import", "tsx", cliPath,
        "--repo", repositoryPath,
        "--from", "main",
        "--to", "feature",
        "--output", outputDirectory,
        "--ocr-command", fakeOcr,
        "--screening-command", fakeScreening,
      ],
      { cwd: resolve(".") },
    );

    expect(stdout).toMatch(/Review ok: 1 finding\(s\)/);
    const screening = JSON.parse(await readFile(join(outputDirectory, "screening.json"), "utf8")) as {
      reviewedHeadSha: string;
      data: { status: string; decisions: Array<{ candidateId: string; action: string }> };
    };
    const run = JSON.parse(await readFile(join(outputDirectory, "run.json"), "utf8")) as {
      reviewedHeadSha: string;
      data: { changedFiles: Array<{ path: string }> };
    };
    const scope = JSON.parse(await readFile(join(outputDirectory, "scope.json"), "utf8")) as {
      reviewedHeadSha: string;
      data: { scope: { candidates: Array<{ location: { path: string } }> } };
    };

    expect(screening.reviewedHeadSha).toBe(run.reviewedHeadSha);
    expect(scope.reviewedHeadSha).toBe(run.reviewedHeadSha);
    expect(screening.data.status).toBe("ok");
    expect(screening.data.decisions.map((decision) => decision.action)).toEqual(["DEEP", "LIGHT", "SKIP"]);
    expect(scope.data.scope.candidates.map((candidate) => candidate.location.path)).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
    expect(run.data.changedFiles.map((file) => file.path)).toEqual(["README.md", "src/a.ts", "src/b.ts", "src/c.ts"]);
  });

  it("falls back to OCR and records partial status when screening fails", async () => {
    const { repositoryPath, outputDirectory } = await createFixtureRepository();
    const cliPath = resolve("src/entrypoints/cli/review.ts");
    await expect(
      execFileAsync(
        process.execPath,
        [
          "--import", "tsx", cliPath,
          "--repo", repositoryPath,
          "--from", "main",
          "--to", "feature",
          "--output", outputDirectory,
          "--ocr-command", fakeOcr,
          "--screening-command", fakeScreening,
        ],
        { cwd: resolve("."), env: { ...process.env, FAKE_SCREENING_MODE: "non-zero" } },
      ),
    ).rejects.toMatchObject({ code: 1 });

    const run = JSON.parse(await readFile(join(outputDirectory, "run.json"), "utf8")) as { data: { status: string } };
    const screening = JSON.parse(await readFile(join(outputDirectory, "screening.json"), "utf8")) as {
      data: { status: string; decisions: unknown[]; diagnostics: string[] };
    };
    const findings = JSON.parse(await readFile(join(outputDirectory, "findings.json"), "utf8")) as {
      data: { findings: unknown[] };
    };

    expect(run.data.status).toBe("partial");
    expect(screening.data).toMatchObject({ status: "failed", decisions: [] });
    expect(screening.data.diagnostics.join(" ")).not.toContain("fixture-secret");
    expect(findings.data.findings).toHaveLength(1);
  });
});
