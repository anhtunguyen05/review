import type { ProcessRunner } from "../../../application/ports/process-runner.js";
import type { ScreeningEngine } from "../../../application/ports/screening-engine.js";
import type { ScreeningInput, ScreeningResult } from "../../../domain/review/contracts.js";
import { normalizeScreeningDecisions } from "./screening-normalizer.js";

export interface JevScreeningOptions {
  commandArgs?: string[];
  timeoutMs?: number;
  maxOutputBytes?: number;
}

function redactDiagnostic(value: string): string {
  return value.replace(/(token|password|secret|authorization|api[-_]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]");
}

function failedResult(
  rawOutput: string,
  rawJson: unknown,
  diagnostics: string[],
  error: string,
): ScreeningResult {
  return { status: "failed", decisions: [], rawOutput, rawJson, diagnostics, error };
}

export class JevScreeningAdapter implements ScreeningEngine {
  constructor(
    private readonly processRunner: ProcessRunner,
    private readonly command: string,
    private readonly options: JevScreeningOptions = {},
  ) {}

  async screen(input: ScreeningInput): Promise<ScreeningResult> {
    if (input.candidates.length === 0) {
      return { status: "ok", decisions: [], rawOutput: "", rawJson: { decisions: [] }, diagnostics: [] };
    }

    const args = [
      ...(this.options.commandArgs ?? []),
      "--repo",
      input.repositoryPath,
      "--from",
      input.from,
      "--to",
      input.to,
      "--base-sha",
      input.baseSha,
      "--head-sha",
      input.headSha,
      "--merge-base",
      input.mergeBaseSha,
    ];
    for (const candidate of input.candidates) {
      args.push("--candidate-id", candidate.id, "--candidate-path", candidate.path);
    }
    args.push("--json");

    let result;
    try {
      result = await this.processRunner.run({
        command: this.command,
        args,
        cwd: input.repositoryPath,
        timeoutMs: this.options.timeoutMs ?? 120_000,
        maxOutputBytes: this.options.maxOutputBytes ?? 4_000_000,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Screening process could not be started";
      return failedResult("", null, [redactDiagnostic(message)], "Screening process failed");
    }

    const diagnostics: string[] = [];
    if (result.stderr.trim()) diagnostics.push("Screening stderr: " + redactDiagnostic(result.stderr.trim()).slice(0, 2_000));
    if (result.timedOut) diagnostics.push("Screening process timed out");
    if (result.outputLimitExceeded) diagnostics.push("Screening output exceeded the configured limit");
    if (result.exitCode !== 0 || result.timedOut || result.outputLimitExceeded) {
      if (result.exitCode !== 0) diagnostics.push("Screening process exited with code " + result.exitCode);
      return failedResult(result.stdout, null, diagnostics, "Screening process failed");
    }

    let rawJson: unknown;
    try {
      rawJson = JSON.parse(result.stdout);
    } catch {
      diagnostics.push("Screening stdout was not valid JSON");
      return failedResult(result.stdout, null, diagnostics, "Screening output was not valid JSON");
    }

    const normalized = normalizeScreeningDecisions(rawJson, input.candidates);
    diagnostics.push(...normalized.diagnostics);
    if (normalized.error !== undefined) {
      return failedResult(result.stdout, rawJson, diagnostics, normalized.error);
    }

    return {
      status: "ok",
      rawOutput: result.stdout,
      rawJson,
      decisions: normalized.decisions,
      diagnostics,
    };
  }
}
