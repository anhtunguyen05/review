import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { CheckpointStore } from "../../application/ports/checkpoint-store.js";
import type { ReviewCheckpoint } from "../../domain/review/contracts.js";

export class FileSystemCheckpointStore implements CheckpointStore {
  constructor(private readonly path: string) {}

  async load(): Promise<ReviewCheckpoint | undefined> {
    try {
      return JSON.parse(await readFile(resolve(this.path), "utf8")) as ReviewCheckpoint;
    } catch {
      return undefined;
    }
  }

  async save(checkpoint: ReviewCheckpoint): Promise<void> {
    const path = resolve(this.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(checkpoint, null, 2) + "\n", "utf8");
  }
}
