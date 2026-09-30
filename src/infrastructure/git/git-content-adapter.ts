import type { ProcessRunner } from "../../application/ports/process-runner.js";
import type {
  RepositoryContentInput,
  RepositoryContentPort,
  RepositoryFileInput,
} from "../../application/ports/repository-content.js";

export class RepositoryContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryContentError";
  }
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function isSafePath(path: string): boolean {
  const normalized = normalizePath(path);
  return (
    normalized.length > 0 &&
    !normalized.startsWith("/") &&
    !normalized.split("/").includes("..") &&
    !/^[A-Za-z]:/.test(normalized)
  );
}

function isSafeCommitSha(commitSha: string): boolean {
  return /^[0-9a-f]{4,64}$/i.test(commitSha);
}

export class GitContentAdapter implements RepositoryContentPort {
  constructor(
    private readonly processRunner: ProcessRunner,
    private readonly command = "git",
    private readonly timeoutMs = 30_000,
    private readonly maxListOutputBytes = 2_000_000,
    private readonly maxFileBytes = 512 * 1024,
  ) {}

  async listFiles(input: RepositoryContentInput): Promise<string[]> {
    this.assertCommit(input.commitSha);
    const result = await this.run(input.repositoryPath, ["ls-tree", "-r", "--name-only", "-z", input.commitSha], this.maxListOutputBytes);
    return result
      .split("\0")
      .filter(Boolean)
      .map(normalizePath)
      .filter(isSafePath);
  }

  async readFile(input: RepositoryFileInput): Promise<string> {
    this.assertCommit(input.commitSha);
    const path = normalizePath(input.path);
    if (!isSafePath(path)) throw new RepositoryContentError("Unsafe repository path");

    const result = await this.run(
      input.repositoryPath,
      ["show", "--format=", "--no-ext-diff", input.commitSha + ":" + path],
      this.maxFileBytes + 1,
    );
    if (result.includes("\0")) throw new RepositoryContentError("Repository file is binary: " + path);
    return result;
  }

  private assertCommit(commitSha: string): void {
    if (!isSafeCommitSha(commitSha)) throw new RepositoryContentError("Invalid repository commit SHA");
  }

  private async run(cwd: string, args: string[], maxOutputBytes: number): Promise<string> {
    let result;
    try {
      result = await this.processRunner.run({
        command: this.command,
        args,
        cwd,
        timeoutMs: this.timeoutMs,
        maxOutputBytes,
      });
    } catch {
      throw new RepositoryContentError("Repository content command could not be started");
    }

    if (result.exitCode !== 0 || result.timedOut || result.outputLimitExceeded) {
      if (result.outputLimitExceeded) throw new RepositoryContentError("Repository content exceeded the configured limit");
      if (result.timedOut) throw new RepositoryContentError("Repository content command timed out");
      throw new RepositoryContentError("Repository content command failed");
    }
    return result.stdout;
  }
}
