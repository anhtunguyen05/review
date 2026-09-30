import type { CheckpointStore } from "../application/ports/checkpoint-store.js";
import { FileSystemCheckpointStore } from "../infrastructure/storage/filesystem-checkpoint-store.js";

export function buildCheckpointStore(path: string): CheckpointStore {
  return new FileSystemCheckpointStore(path);
}
