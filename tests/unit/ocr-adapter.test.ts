import { describe, expect, it } from "vitest";
import { OcrCliAdapter } from "../../src/infrastructure/engines/ocr/ocr-cli-adapter.js";
import type { ProcessResult, ProcessRunner } from "../../src/application/ports/process-runner.js";
import type { DeepReviewInput } from "../../src/domain/review/contracts.js";

class StubProcessRunner implements ProcessRunner {
  lastInput?: Parameters<ProcessRunner["run"]>[0];

  constructor(private readonly result: ProcessResult) {}

  async run(input: Parameters<ProcessRunner["run"]>[0]): Promise<ProcessResult> {
    this.lastInput = input;
    return this.result;
  }
}

const input: DeepReviewInput = {
  repositoryPath: "/tmp/repository",
  from: "main",
  to: "feature",
  baseSha: "a".repeat(40),
  headSha: "b".repeat(40),
  mergeBaseSha: "a".repeat(40),
  changedFiles: [],
};

function result(overrides: Partial<ProcessResult>): ProcessResult {
  return {
    exitCode: 0,
    stdout: JSON.stringify({ findings: [] }),
    stderr: "",
    timedOut: false,
    outputLimitExceeded: false,
    ...overrides,
  };
}

describe("OCR CLI adapter", () => {
  it("returns a typed failure for malformed JSON", async () => {
    const adapter = new OcrCliAdapter(new StubProcessRunner(result({ stdout: "{" })), "trusted-ocr");

    await expect(adapter.review(input)).resolves.toMatchObject({
      status: "failed",
      findings: [],
      error: "OCR output was not valid JSON",
    });
  });

  it("returns no fabricated findings for a failed process", async () => {
    const adapter = new OcrCliAdapter(
      new StubProcessRunner(result({ exitCode: 7, stdout: '{"findings":[{"title":"should not publish"}]}' })),
      "trusted-ocr",
    );

    await expect(adapter.review(input)).resolves.toMatchObject({
      status: "failed",
      findings: [],
      error: "OCR process failed",
    });
  });

  it("turns timeout and output-limit signals into diagnostics", async () => {
    const adapter = new OcrCliAdapter(
      new StubProcessRunner(result({ timedOut: true, outputLimitExceeded: true })),
      "trusted-ocr",
    );

    await expect(adapter.review(input)).resolves.toMatchObject({
      status: "failed",
      diagnostics: ["OCR process timed out", "OCR output exceeded the configured limit"],
    });
  });

  it("passes selected review and context paths as repeatable adapter flags", async () => {
    const runner = new StubProcessRunner(result({}));
    const adapter = new OcrCliAdapter(runner, "trusted-ocr");

    await adapter.review({
      ...input,
      scope: {
        required: [],
        candidates: [
          { id: "direct:src/changed.ts", location: { path: "src/changed.ts" }, directChange: true, impactScore: 100, reasons: [{ kind: "DIRECT_CHANGE" }], estimatedTokens: 10 },
          { id: "impact:src/consumer.ts", location: { path: "src/consumer.ts" }, directChange: false, impactScore: 80, reasons: [{ kind: "IMPORTER", sourcePath: "src/changed.ts" }], estimatedTokens: 20 },
        ],
        excluded: [],
        estimatedTokens: 30,
        estimatedDurationMs: 60,
      },
      background: { reviewFocus: [], selectedImpacts: [], contextPaths: ["docs/contract.md"], degraded: [] },
    });

    expect(runner.lastInput?.args).toEqual([
      "--repo", "/tmp/repository", "--from", "main", "--to", "feature",
      "--review-path", "src/changed.ts", "--review-path", "src/consumer.ts",
      "--context-path", "docs/contract.md", "--json",
    ]);
  });
});
