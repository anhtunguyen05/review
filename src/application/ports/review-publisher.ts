import type { PublicationPlan, PublicationResult } from "../../domain/review/contracts.js";

export interface ReviewPublisher {
  publish(plan: PublicationPlan): Promise<PublicationResult>;
}
