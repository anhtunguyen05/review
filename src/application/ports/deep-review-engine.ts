import type { DeepReviewInput, DeepReviewResult } from "../../domain/review/contracts.js";

export interface DeepReviewEngine {
  review(input: DeepReviewInput): Promise<DeepReviewResult>;
}
