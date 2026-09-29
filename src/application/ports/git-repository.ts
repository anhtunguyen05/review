import type { ChangedFile, GitReviewRange } from "../../domain/review/contracts.js";

export interface GitRepositoryPort {
  resolveRange(input: { repositoryPath: string; from: string; to: string }): Promise<GitReviewRange>;
  getChangedFiles(range: GitReviewRange): Promise<ChangedFile[]>;
}
