import { describe, expect, it } from "vitest";
import { GitContentAdapter, RepositoryContentError } from "../../src/infrastructure/git/git-content-adapter.js";
import type { ProcessRequest, ProcessResult, ProcessRunner } from "../../src/application/ports/process-runner.js";

class StubProcessRunner implements ProcessRunner {
  request?: ProcessRequest;

  constructor(private readonly response: ProcessResult) {}

  async run(request: ProcessRequest): Promise<ProcessResult> {
    this.request = request;
    return this.response;
  }
}

const ok = (stdout: string): ProcessResult => ({
  exitCode: 0,
  stdout,
  stderr: "",
  timedOut: false,
  outputLimitExceeded: false,
});

describe("GitContentAdapter", () => {
  it("lists files and reads a file at an explicit commit", async () => {
    const runner = new StubProcessRunner(ok("src/a.ts\0src/b.ts\0"));
    const adapter = new GitContentAdapter(runner);

    await expect(adapter.listFiles({ repositoryPath: "/repo", commitSha: "a".repeat(40) })).resolves.toEqual([
      "src/a.ts",
      "src/b.ts",
    ]);
    expect(runner.request?.args).toEqual(["ls-tree", "-r", "--name-only", "-z", "a".repeat(40)]);
  });

  it("rejects unsafe paths and binary content", async () => {
    const runner = new StubProcessRunner(ok("binary\0content"));
    const adapter = new GitContentAdapter(runner);

    await expect(adapter.readFile({ repositoryPath: "/repo", commitSha: "b".repeat(40), path: "../secret" }))
      .rejects.toBeInstanceOf(RepositoryContentError);
    await expect(adapter.readFile({ repositoryPath: "/repo", commitSha: "b".repeat(40), path: "src/a.ts" }))
      .rejects.toThrow("binary");
  });

  it("fails closed when Git output exceeds the configured limit", async () => {
    const runner = new StubProcessRunner({ ...ok("partial"), outputLimitExceeded: true });
    const adapter = new GitContentAdapter(runner);

    await expect(adapter.readFile({ repositoryPath: "/repo", commitSha: "c".repeat(40), path: "src/large.ts" }))
      .rejects.toThrow("exceeded the configured limit");
  });
});
