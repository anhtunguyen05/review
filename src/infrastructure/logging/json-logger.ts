import type { Logger, LogContext, LogLevel } from "../../application/ports/logger.js";

const severity: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const sensitiveKey = /(token|password|secret|authorization|api[-_]?key)/i;

function redact(value: unknown, key?: string): unknown {
  if (key && sensitiveKey.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redact(entryValue, entryKey)]),
    );
  }
  return value;
}

export type LogSink = (line: string) => void;

export class JsonLogger implements Logger {
  constructor(
    private readonly minimumLevel: LogLevel = "info",
    private readonly sink: LogSink = (line) => process.stderr.write(line),
  ) {}

  debug(event: string, message?: string, context?: LogContext): void { this.write("debug", event, message, context); }
  info(event: string, message?: string, context?: LogContext): void { this.write("info", event, message, context); }
  warn(event: string, message?: string, context?: LogContext): void { this.write("warn", event, message, context); }
  error(event: string, message?: string, context?: LogContext): void { this.write("error", event, message, context); }

  private write(level: LogLevel, event: string, message?: string, context?: LogContext): void {
    if (severity[level] < severity[this.minimumLevel]) return;
    const record = redact({
      timestamp: new Date().toISOString(),
      level,
      event,
      ...(message ? { message } : {}),
      ...(context ? { context } : {}),
    });
    try {
      this.sink(JSON.stringify(record) + "\n");
    } catch {
      // Logging must never mask the operation that emitted the event.
    }
  }
}

