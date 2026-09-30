import { GitHubApiAdapter } from "../infrastructure/github/github-api-adapter.js";

export function buildGitHubPublication(token: string): GitHubApiAdapter {
  return new GitHubApiAdapter(token);
}
