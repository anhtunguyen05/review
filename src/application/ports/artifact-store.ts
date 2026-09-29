import type { ReviewRunArtifacts } from "../../domain/review/contracts.js";

export interface ArtifactStore {
  save(outputDirectory: string, artifacts: ReviewRunArtifacts): Promise<void>;
}
