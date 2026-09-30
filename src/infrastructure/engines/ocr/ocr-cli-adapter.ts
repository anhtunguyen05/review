import type { DeepReviewEngine } from "../../../application/ports/deep-review-engine.js";
import type { ProcessRunner } from "../../../application/ports/process-runner.js";
import type { DeepReviewInput, DeepReviewResult } from "../../../domain/review/contracts.js";
import { normalizeOcrFindings } from "./ocr-normalizer.js";

export interface OcrCliOptions {
  commandArgs?: string[];
  timeoutMs?: number;
  maxOutputBytes?: number;
  reviewPathArg?: string;
  contextPathArg?: string;
}

export class OcrCliAdapter implements DeepReviewEngine {
  constructor(
    private readonly processRunner: ProcessRunner,
    private readonly command: string,
    private readonly options: OcrCliOptions = {},
  ) {}

  async review(input: DeepReviewInput): Promise<DeepReviewResult> {
    const reviewPathArg = this.options.reviewPathArg ?? "--review-path";
    const contextPathArg = this.options.contextPathArg ?? "--context-path";
    const result = await this.processRunner.run({
      command: this.command,
      args: [
        ...(this.options.commandArgs ?? []),
        "--repo",
        input.repositoryPath,
        "--from",
        input.from,
        "--to",
        input.to,
        ...(input.scope?.candidates.flatMap((candidate) => [reviewPathArg, candidate.location.path]) ?? []),
        ...(input.background?.contextPaths.flatMap((path) => [contextPathArg, path]) ?? []),
        "--json",
      ],
      cwd: input.repositoryPath,
      timeoutMs: this.options.timeoutMs ?? 120_000,
      maxOutputBytes: this.options.maxOutputBytes ?? 4_000_000,
    });

    const diagnostics: string[] = [];
    if (result.stderr.trim()) diagnostics.push("OCR stderr: " + result.stderr.trim().slice(0, 2_000));
    if (result.timedOut) diagnostics.push("OCR process timed out");
    if (result.outputLimitExceeded) diagnostics.push("OCR output exceeded the configured limit");
    if (result.exitCode !== 0 || result.timedOut || result.outputLimitExceeded) {
      if (result.exitCode !== 0) diagnostics.push("OCR process exited with code " + result.exitCode);
      return {
        status: "failed",
        rawOutput: result.stdout,
        rawJson: null,
        findings: [],
        diagnostics,
        error: "OCR process failed",
      };
    }

    let rawJson: unknown;
    try {
      rawJson = JSON.parse(result.stdout);
    } catch {
      diagnostics.push("OCR stdout was not valid JSON");
      return {
        status: "failed",
        rawOutput: result.stdout,
        rawJson: null,
        findings: [],
        diagnostics,
        error: "OCR output was not valid JSON",
      };
    }

    const normalized = normalizeOcrFindings(rawJson);
    diagnostics.push(...normalized.diagnostics);
    return {
      status: normalized.diagnostics.some((item) => item.startsWith("OCR output must")) ? "failed" : "ok",
      rawOutput: result.stdout,
      rawJson,
      findings: normalized.findings,
      diagnostics,
      ...(normalized.diagnostics.some((item) => item.startsWith("OCR output must"))
        ? { error: "OCR output had an invalid top-level shape" }
        : {}),
    };
  }
}
