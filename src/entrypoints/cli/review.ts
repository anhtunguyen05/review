import { buildBootstrap } from "../../composition/build-bootstrap.js";
import { buildLocalReview, createRunMetadata } from "../../composition/build-local-review.js";
import { reviewLocalRange } from "../../application/review-local-range.js";
import { configFingerprint, planCheckpointRange } from "../../application/plan-checkpoint-range.js";
import { buildCheckpointStore } from "../../composition/build-checkpoint-store.js";
import { logLevels, type LogLevel } from "../../application/ports/logger.js";

const help = `code-review-orchestrator

Usage:
  review --help
  review [--config <path>] [--log-level <debug|info|warn|error>] [--checkpoint <path>] [--full]
  review --repo <path> --from <ref> --to <ref> [--output <dir>] [--ocr-command <path>] [--ocr-arg <arg>]
         [--screening-command <path>] [--screening-arg <arg>]

  Local review:
  Resolves merge-base(from, to), derives bounded intent concepts from changed
  documents, discovers structural and semantic JS/TS impact, screens direct
  and impacted files when a trusted screening executable is configured, plans a
  bounded OCR scope, invokes OCR, and writes run.json, intent.json,
  impact-graph.json, screening.json, scope.json, ocr.raw.json, and findings.json
  to the output directory.
  Impact and OCR scope limits are configured under the trusted --config YAML file.
  The OCR executable may also be supplied with OCR_COMMAND.
  The screening executable may be supplied with SCREENING_COMMAND.
  A checkpoint is used only with --checkpoint; --full always bypasses it.
`;

interface ParsedArgs {
  help: boolean;
  configPath?: string;
  logLevel?: LogLevel;
  repositoryPath?: string;
  from?: string;
  to?: string;
  outputDirectory?: string;
  ocrCommand?: string;
  ocrArgs: string[];
  screeningCommand?: string;
  screeningArgs: string[];
  checkpointPath?: string;
  full: boolean;
}

function fail(message: string): never {
  console.error("error: " + message);
  process.exit(2);
}

function requiredValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) fail(option + " requires a value");
  return value;
}

function parseArgs(args: string[]): ParsedArgs {
  let helpRequested = false;
  let configPath: string | undefined;
  let logLevel: LogLevel | undefined;
  let repositoryPath: string | undefined;
  let from: string | undefined;
  let to: string | undefined;
  let outputDirectory: string | undefined;
  let ocrCommand: string | undefined;
  const ocrArgs: string[] = [];
  let screeningCommand: string | undefined;
  const screeningArgs: string[] = [];
  let checkpointPath: string | undefined;
  let full = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      helpRequested = true;
    } else if (arg === "--config") {
      configPath = requiredValue(args, index, "--config");
      index += 1;
    } else if (arg === "--log-level") {
      const value = requiredValue(args, index, "--log-level");
      if (!logLevels.includes(value as LogLevel)) fail("--log-level must be one of debug, info, warn, error");
      logLevel = value as LogLevel;
      index += 1;
    } else if (arg === "--repo") {
      repositoryPath = requiredValue(args, index, "--repo");
      index += 1;
    } else if (arg === "--from") {
      from = requiredValue(args, index, "--from");
      index += 1;
    } else if (arg === "--to") {
      to = requiredValue(args, index, "--to");
      index += 1;
    } else if (arg === "--output") {
      outputDirectory = requiredValue(args, index, "--output");
      index += 1;
    } else if (arg === "--ocr-command") {
      ocrCommand = requiredValue(args, index, "--ocr-command");
      index += 1;
    } else if (arg === "--ocr-arg") {
      ocrArgs.push(requiredValue(args, index, "--ocr-arg"));
      index += 1;
    } else if (arg === "--screening-command") {
      screeningCommand = requiredValue(args, index, "--screening-command");
      index += 1;
    } else if (arg === "--screening-arg") {
      screeningArgs.push(requiredValue(args, index, "--screening-arg"));
      index += 1;
    } else if (arg === "--checkpoint") {
      checkpointPath = requiredValue(args, index, "--checkpoint");
      index += 1;
    } else if (arg === "--full") {
      full = true;
    } else {
      fail("unknown option: " + arg);
    }
  }

  return {
    help: helpRequested,
    ...(configPath === undefined ? {} : { configPath }),
    ...(logLevel === undefined ? {} : { logLevel }),
    ...(repositoryPath === undefined ? {} : { repositoryPath }),
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
    ...(outputDirectory === undefined ? {} : { outputDirectory }),
    ...(ocrCommand === undefined ? {} : { ocrCommand }),
    ocrArgs,
    ...(screeningCommand === undefined ? {} : { screeningCommand }),
    screeningArgs,
    ...(checkpointPath === undefined ? {} : { checkpointPath }),
    full,
  };
}

export async function run(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  if (parsed.help || args.length === 0) {
    process.stdout.write(help);
    return 0;
  }

  const bootstrap = await buildBootstrap(parsed.configPath);
  if (parsed.logLevel) {
    bootstrap.logger.info("review.bootstrap", "Bootstrap ready", { logLevel: parsed.logLevel });
  }

  const hasRangeArgument = parsed.repositoryPath !== undefined || parsed.from !== undefined || parsed.to !== undefined;
  if (!hasRangeArgument) return 0;
  if (!parsed.repositoryPath || !parsed.from || !parsed.to) {
    fail("--repo, --from, and --to are required together");
  }

  const ocrCommand = parsed.ocrCommand ?? process.env.OCR_COMMAND;
  if (!ocrCommand) fail("--ocr-command or OCR_COMMAND is required for a Phase 1 review");
  const screeningCommand = parsed.screeningCommand ?? process.env.SCREENING_COMMAND;

  const dependencies = buildLocalReview(ocrCommand, parsed.ocrArgs, screeningCommand, parsed.screeningArgs, bootstrap.config.impact, bootstrap.config.scope);
  let reviewFrom = parsed.from;
  let rangeDiagnostics: string[] = [];
  let checkpointStore: ReturnType<typeof buildCheckpointStore> | undefined;
  if (parsed.checkpointPath) {
    checkpointStore = buildCheckpointStore(parsed.checkpointPath);
    const requestedRange = await dependencies.git.resolveRange({ repositoryPath: parsed.repositoryPath, from: parsed.from, to: parsed.to });
    const checkpoint = await checkpointStore.load();
    const descendantVerified = checkpoint !== undefined && dependencies.git.isAncestor !== undefined
      ? await dependencies.git.isAncestor({ repositoryPath: parsed.repositoryPath, ancestorSha: checkpoint.headSha, descendantSha: requestedRange.headSha })
      : false;
    const decision = planCheckpointRange({
      requestedFrom: parsed.from,
      configFingerprint: configFingerprint(bootstrap.config),
      ...(checkpoint === undefined ? {} : { checkpoint }),
      descendantVerified,
      forceFull: parsed.full,
    });
    reviewFrom = decision.from;
    rangeDiagnostics = decision.diagnostics;
  } else if (parsed.full) {
    rangeDiagnostics = ["Full review was explicitly requested"];
  }
  const metadata = createRunMetadata();
  const result = await reviewLocalRange(
    {
      repositoryPath: parsed.repositoryPath,
      from: reviewFrom,
      to: parsed.to,
      outputDirectory: parsed.outputDirectory ?? "artifacts",
      rangeDiagnostics,
      ...metadata,
    },
    dependencies,
  );
  if (checkpointStore && result.status === "ok") {
    await checkpointStore.save({
      repositoryPath: result.artifacts.run.data.repositoryPath,
      headSha: result.artifacts.run.data.headSha,
      configFingerprint: configFingerprint(bootstrap.config),
      runId: result.runId,
      completedAt: metadata.createdAt,
    });
  }
  process.stdout.write(
    "Review " + result.status + ": " + result.findingsCount + " finding(s), run " + result.runId + "\n",
  );
  return result.status === "ok" ? 0 : 1;
}

if (process.argv[1]?.endsWith("/review.ts") || process.argv[1]?.endsWith("\\review.ts")) {
  run(process.argv.slice(2)).then((exitCode) => { process.exitCode = exitCode; }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("error: " + message);
    process.exitCode = 1;
  });
}
