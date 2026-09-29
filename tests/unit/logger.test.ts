import { describe, expect, it } from "vitest";
import { JsonLogger } from "../../src/infrastructure/logging/json-logger.js";

describe("JsonLogger", () => {
  it("writes valid JSON and redacts sensitive context", () => {
    const lines: string[] = [];
    const logger = new JsonLogger("info", (line) => lines.push(line));

    logger.debug("ignored", "not emitted");
    logger.info("review.bootstrap", "ready", {
      token: "do-not-log",
      nested: { authorization: "also-do-not-log" },
    });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      level: "info",
      event: "review.bootstrap",
      context: {
        token: "[REDACTED]",
        nested: { authorization: "[REDACTED]" },
      },
    });
    expect(lines[0]!).not.toContain("do-not-log");
  });

  it("does not throw when the sink fails", () => {
    const logger = new JsonLogger("info", () => {
      throw new Error("sink unavailable");
    });

    expect(() => logger.error("review.error", "safe")).not.toThrow();
  });
});

