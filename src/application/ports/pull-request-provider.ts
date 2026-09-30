import type { PullRequestContext } from "../../domain/review/contracts.js";

export interface PullRequestProvider {
  getContext(input: { owner: string; repository: string; prNumber: number }): Promise<PullRequestContext>;
}
