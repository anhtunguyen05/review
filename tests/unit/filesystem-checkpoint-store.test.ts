import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileSystemCheckpointStore } from "../../src/infrastructure/storage/filesystem-checkpoint-store.js";

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("filesystem checkpoint store", () => {
  it("round-trips a checkpoint and creates its parent directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "review-checkpoint-"));
    temporaryPaths.push(directory);
    const store = new FileSystemCheckpointStore(join(directory, "nested", "checkpoint.json"));
    const checkpoint = { repositoryPath: "/repo", headSha: "a".repeat(40), configFingerprint: "config", runId: "run", completedAt: "now" };
    await store.save(checkpoint);
    await expect(store.load()).resolves.toEqual(checkpoint);
    await expect(readFile(join(directory, "nested", "checkpoint.json"), "utf8")).resolves.toContain("headSha");
  });
});
