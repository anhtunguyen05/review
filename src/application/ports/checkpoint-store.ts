import type { ReviewCheckpoint } from "../../domain/review/contracts.js";

export interface CheckpointStore {
  load(): Promise<ReviewCheckpoint | undefined>;
  save(checkpoint: ReviewCheckpoint): Promise<void>;
}
