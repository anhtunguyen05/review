export const logLevels = ["debug", "info", "warn", "error"] as const;

export type LogLevel = (typeof logLevels)[number];

export type LogContextValue =
  | string
  | number
  | boolean
  | null
  | LogContextValue[]
  | { readonly [key: string]: LogContextValue };

export type LogContext = Readonly<Record<string, LogContextValue>>;

export interface Logger {
  debug(event: string, message?: string, context?: LogContext): void;
  info(event: string, message?: string, context?: LogContext): void;
  warn(event: string, message?: string, context?: LogContext): void;
  error(event: string, message?: string, context?: LogContext): void;
}

