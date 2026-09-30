import { describe, expect, it } from "vitest";
import { JevScreeningAdapter } from "../../src/infrastructure/engines/jev/jev-screening-adapter.js";
import type { ProcessRequest, ProcessResult, ProcessRunner } from "../../src/application/ports/process-runner.js";
import type { ScreeningInput } from "../../src/domain/review/contracts.js";

class StubProcessRunner implements ProcessRunner {
  request?: ProcessRequest;

  constructor(private readonly result: ProcessResult) {}

  async run(request: ProcessRequest): Promise<ProcessResult> {
    this.request = request;
    return this.result;
  }
}

const input: ScreeningInput = {
  repositoryPath: "/tmp/repository",
  from: "main",
  to: "feature",
  baseSha: "a".repeat(40),
  headSha: "b".repeat(40),
  mergeBaseSha: "a".repeat(40),
  candidates: [
    { id: "direct:modified:src/a.ts", path: "src/a.ts", status: "modified", directChange: true },
  ],
};

function result(overrides: Partial<ProcessResult>): ProcessResult {
  return {
    exitCode: 0,
    stdout: JSON.stringify({
      decisions: [
        {
          candidateId: input.candidates[0]!.id,
          relevance: 0.7,
          correctnessRisk: 0.8,
          securityRisk: 0.1,
          reliabilityRisk: 0.2,
          compatibilityRisk: 0.2,
          testGapRisk: 0.1,
          confidence: 0.9,
        },
      ],
    }),
    stderr: "",
    timedOut: false,
    outputLimitExceeded: false,
    ...overrides,
  };
}

describe("Jev screening adapter", () => {
  it("passes explicit range and candidates without shell execution", async () => {
    const runner = new StubProcessRunner(result({}));
    const adapter = new JevScreeningAdapter(runner, "trusted-jev", { commandArgs: ["--preset", "screen"] });

    await expect(adapter.screen(input)).resolves.toMatchObject({ status: "ok", decisions: [{ action: "DEEP" }] });
    expect(runner.request).toMatchObject({ command: "trusted-jev", cwd: input.repositoryPath });
    expect(runner.request?.args).toEqual(expect.arrayContaining([
      "--from", "main", "--to", "feature", "--base-sha", input.baseSha,
      "--head-sha", input.headSha, "--merge-base", input.mergeBaseSha,
      "--candidate-id", input.candidates[0]!.id, "--candidate-path", "src/a.ts", "--json",
    ]));
  });

  it("passes non-JS candidates without language-specific adapter logic", async () => {
    const runner = new StubProcessRunner(result({
      stdout: JSON.stringify({
        decisions: [{
          candidateId: "direct:modified:src/service.php",
          relevance: 0.7,
          correctnessRisk: 0.8,
          securityRisk: 0.1,
          reliabilityRisk: 0.2,
          compatibilityRisk: 0.2,
          testGapRisk: 0.1,
          confidence: 0.9,
        }],
      }),
    }));
    const adapter = new JevScreeningAdapter(runner, "trusted-jev");

    await expect(adapter.screen({
      ...input,
      candidates: [{ id: "direct:modified:src/service.php", path: "src/service.php", status: "modified", directChange: true }],
    })).resolves.toMatchObject({ status: "ok", decisions: [{ action: "DEEP" }] });
    expect(runner.request?.args).toEqual(expect.arrayContaining(["--candidate-path", "src/service.php"]));
  });

  it("fails conservatively on malformed JSON and provider errors", async () => {
    const malformed = new JevScreeningAdapter(new StubProcessRunner(result({ stdout: "{" })), "trusted-jev");
    await expect(malformed.screen(input)).resolves.toMatchObject({ status: "failed", decisions: [] });

    const failed = new JevScreeningAdapter(
      new StubProcessRunner(result({ exitCode: 9, stderr: "provider token=fixture-secret" })),
      "trusted-jev",
    );
    const response = await failed.screen(input);
    expect(response).toMatchObject({ status: "failed", decisions: [] });
    expect(response.diagnostics.join(" ")).not.toContain("fixture-secret");
  });
});
