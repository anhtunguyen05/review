import { describe, expect, it } from "vitest";
import { OcrCliAdapter } from "../../src/infrastructure/engines/ocr/ocr-cli-adapter.js";
import type { ProcessResult, ProcessRunner } from "../../src/application/ports/process-runner.js";
import type { DeepReviewInput } from "../../src/domain/review/contracts.js";

class StubProcessRunner implements ProcessRunner {
  constructor(private readonly result: ProcessResult) {}

  async run(): Promise<ProcessResult> {
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
});
