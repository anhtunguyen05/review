import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigLoadError, loadBootstrapConfig } from "../../src/config/loader.js";

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe("bootstrap configuration", () => {
  it("returns safe defaults when no path is provided", async () => {
    await expect(loadBootstrapConfig()).resolves.toEqual({
      version: 1,
      logging: { level: "info" },
    });
  });

  it("loads and validates a local YAML config", async () => {
    const directory = await mkdtemp(join(tmpdir(), "review-orchestrator-"));
    temporaryPaths.push(directory);
    const path = join(directory, "config.yml");
    await writeFile(path, "version: 1\nlogging:\n  level: debug\n", "utf8");

    await expect(loadBootstrapConfig(path)).resolves.toEqual({
      version: 1,
      logging: { level: "debug" },
    });
  });

  it("rejects invalid configuration without echoing the invalid value", async () => {
    const directory = await mkdtemp(join(tmpdir(), "review-orchestrator-"));
    temporaryPaths.push(directory);
    const path = join(directory, "config.yml");
    await writeFile(path, "version: 1\nlogging:\n  level: reveal-me\n", "utf8");

    await expect(loadBootstrapConfig(path)).rejects.toBeInstanceOf(ConfigLoadError);
    await expect(loadBootstrapConfig(path)).rejects.not.toThrow("reveal-me");
  });
});

