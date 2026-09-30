import { resolve } from "node:path";
import type { GitRepositoryPort } from "../../application/ports/git-repository.js";
import type { ProcessRunner } from "../../application/ports/process-runner.js";
import type { ChangedFile, GitReviewRange } from "../../domain/review/contracts.js";

export class GitRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitRepositoryError";
  }
}

export class GitCliAdapter implements GitRepositoryPort {
  constructor(
    private readonly processRunner: ProcessRunner,
    private readonly command = "git",
    private readonly timeoutMs = 30_000,
    private readonly maxOutputBytes = 2_000_000,
  ) {}

  async resolveRange(input: { repositoryPath: string; from: string; to: string }): Promise<GitReviewRange> {
    const repositoryPath = resolve(input.repositoryPath);
    const topLevel = await this.run(repositoryPath, ["rev-parse", "--show-toplevel"]);
    const baseSha = await this.run(repositoryPath, ["rev-parse", input.from]);
    const headSha = await this.run(repositoryPath, ["rev-parse", input.to]);
    const mergeBaseSha = await this.run(repositoryPath, ["merge-base", baseSha, headSha]);

    return {
      repositoryPath: topLevel,
      from: input.from,
      to: input.to,
      baseSha,
      headSha,
      mergeBaseSha,
    };
  }

  async getChangedFiles(range: GitReviewRange): Promise<ChangedFile[]> {
    const output = await this.run(range.repositoryPath, [
      "diff",
      "--name-status",
      "--find-renames",
      range.mergeBaseSha,
      range.headSha,
    ]);

    return output
      .split("\n")
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("\t");
        const statusCode = parts[0] ?? "";
        if (statusCode.startsWith("R")) {
          const previousPath = parts[1];
          const path = parts[2];
          if (!previousPath || !path) throw new GitRepositoryError("Git returned an invalid rename record");
          return { status: "renamed" as const, previousPath, path };
        }

        const path = parts[1];
        if (!path) throw new GitRepositoryError("Git returned an invalid changed-file record");
        const status = statusCode[0];
        if (status === "A") return { status: "added" as const, path };
        if (status === "D") return { status: "deleted" as const, path };
        if (status === "M") return { status: "modified" as const, path };
        throw new GitRepositoryError("Unsupported Git change status: " + statusCode);
      });
  }

  async isAncestor(input: { repositoryPath: string; ancestorSha: string; descendantSha: string }): Promise<boolean> {
    const result = await this.processRunner.run({
      command: this.command,
      args: ["merge-base", "--is-ancestor", input.ancestorSha, input.descendantSha],
      cwd: resolve(input.repositoryPath),
      timeoutMs: this.timeoutMs,
      maxOutputBytes: this.maxOutputBytes,
    });
    return result.exitCode === 0 && !result.timedOut && !result.outputLimitExceeded;
  }

  private async run(cwd: string, args: string[]): Promise<string> {
    const result = await this.processRunner.run({
      command: this.command,
      args,
      cwd,
      timeoutMs: this.timeoutMs,
      maxOutputBytes: this.maxOutputBytes,
    });
    if (result.exitCode !== 0 || result.timedOut || result.outputLimitExceeded) {
      const detail = result.stderr.trim() || "no diagnostic output";
      throw new GitRepositoryError("Git command failed (" + args.join(" ") + "): " + detail);
    }
    const output = result.stdout.trim();
    if (!output) throw new GitRepositoryError("Git command returned no output: " + args.join(" "));
    return output;
  }
}
