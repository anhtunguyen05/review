import { buildBootstrap } from "../../composition/build-bootstrap.js";
import { logLevels, type LogLevel } from "../../application/ports/logger.js";

const help = `code-review-orchestrator

Usage:
  review --help
  review [--config <path>] [--log-level <debug|info|warn|error>]

Phase 0 bootstrap only. Provider integrations are not enabled.
`;

function fail(message: string): never {
  console.error("error: " + message);
  process.exit(2);
}

function parseArgs(args: string[]): { help: boolean; configPath?: string; logLevel?: LogLevel } {
  let helpRequested = false;
  let configPath: string | undefined;
  let logLevel: LogLevel | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      helpRequested = true;
    } else if (arg === "--config") {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) fail("--config requires a path");
      configPath = value;
      index += 1;
    } else if (arg === "--log-level") {
      const value = args[index + 1];
      if (!value || !logLevels.includes(value as LogLevel)) {
        fail("--log-level must be one of debug, info, warn, error");
      }
      logLevel = value as LogLevel;
      index += 1;
    } else {
      fail("unknown option: " + arg);
    }
  }

  return {
    help: helpRequested,
    ...(configPath === undefined ? {} : { configPath }),
    ...(logLevel === undefined ? {} : { logLevel }),
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
    bootstrap.logger.info("review.bootstrap", "Phase 0 bootstrap ready", { logLevel: parsed.logLevel });
  }
  return 0;
}

if (process.argv[1]?.endsWith("/review.ts")) {
  run(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("error: " + message);
    process.exitCode = 1;
  });
}

