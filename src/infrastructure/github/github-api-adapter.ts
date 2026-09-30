import { createHash } from "node:crypto";
import type { PullRequestProvider } from "../../application/ports/pull-request-provider.js";
import type { ReviewPublisher } from "../../application/ports/review-publisher.js";
import type {
  ChangedFile,
  PublicationDecision,
  PublicationPlan,
  PublicationResult,
  PullRequestContext,
  ReviewFinding,
} from "../../domain/review/contracts.js";

interface GitHubApiAdapterOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
}

interface GitHubComment {
  id: number;
  body: string;
}

interface PullRequestPayload {
  title?: unknown;
  body?: unknown;
  base?: { ref?: unknown; sha?: unknown };
  head?: { ref?: unknown; sha?: unknown };
}

interface PullRequestFilePayload {
  filename?: unknown;
  status?: unknown;
  previous_filename?: unknown;
  additions?: unknown;
  deletions?: unknown;
  patch?: unknown;
}

interface ComparePayload {
  merge_base_commit?: { sha?: unknown };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function changedFile(payload: PullRequestFilePayload): ChangedFile | undefined {
  const path = typeof payload.filename === "string" ? payload.filename : undefined;
  if (!path) return undefined;
  const status = payload.status === "added" || payload.status === "modified" || payload.status === "removed" || payload.status === "renamed"
    ? payload.status === "removed" ? "deleted" : payload.status
    : "modified";
  const previousPath = typeof payload.previous_filename === "string" ? payload.previous_filename : undefined;
  const additions = numberValue(payload.additions);
  const deletions = numberValue(payload.deletions);
  const patch = typeof payload.patch === "string" ? payload.patch : undefined;
  return {
    path,
    status,
    ...(previousPath === undefined ? {} : { previousPath }),
    ...(additions === undefined ? {} : { additions }),
    ...(deletions === undefined ? {} : { deletions }),
    ...(patch === undefined ? {} : { patch }),
  };
}

function fingerprint(finding: ReviewFinding, owner: string, repository: string): string {
  const source = [
    finding.type,
    owner,
    repository,
    finding.primaryLocation.path,
    finding.primaryLocation.symbol ?? "",
    finding.title,
    finding.message.replace(/\s+/g, " ").trim(),
  ].join("\n");
  return createHash("sha256").update(source, "utf8").digest("hex");
}

function findingMarker(value: string): string {
  return `<!-- review-orchestrator:fingerprint:${value} -->`;
}

function summaryMarker(): string {
  return "<!-- review-orchestrator:summary -->";
}

function findingBody(decision: PublicationDecision, marker: string): string {
  const suggestion = decision.finding.suggestion ? `\n\nSuggestion: ${decision.finding.suggestion.slice(0, 1_000)}` : "";
  return `${marker}\n**${decision.finding.severity}: ${decision.finding.title}**\n\n${decision.finding.message.slice(0, 4_000)}${suggestion}`;
}

function summaryBody(plan: PublicationPlan, summaryFindings: PublicationDecision[], owner: string, repository: string): string {
  const findingLines = summaryFindings.length === 0
    ? "No summary-level findings."
    : summaryFindings.map((decision) => {
      const marker = findingMarker(fingerprint(decision.finding, owner, repository));
      return `${marker}\n- **${decision.finding.severity}: ${decision.finding.title}** - ${decision.finding.message.slice(0, 1_000)} (${decision.finding.primaryLocation.path})`;
    }).join("\n");
  const degraded = plan.summary.degradedStages.length === 0 ? "None" : plan.summary.degradedStages.join(", ");
  return [
    summaryMarker(),
    "## AI Review Summary",
    "",
    `Reviewed head: \`${plan.reviewedHeadSha}\``,
    "",
    "### Scope",
    `- Changed files: ${plan.summary.changedFiles}`,
    `- Impact candidates: ${plan.summary.impactCandidates}`,
    `- Screened candidates: ${plan.summary.screenedCandidates}`,
    `- Deep reviewed: ${plan.summary.deepReviewedFiles}`,
    "",
    "### Findings",
    `- Inline: ${plan.summary.inlineFindings}`,
    `- Summary: ${plan.summary.summaryFindings}`,
    `- Suppressed: ${plan.summary.suppressedFindings}`,
    "",
    `### Degraded stages\n${degraded}`,
    "",
    "### Summary findings",
    findingLines,
    "",
    `Run: \`${plan.runId}\``,
  ].join("\n");
}

export class GitHubApiAdapter implements PullRequestProvider, ReviewPublisher {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly token: string, options: GitHubApiAdapterOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://api.github.com").replace(/\/$/, "");
    this.fetcher = options.fetcher ?? fetch;
  }

  async getContext(input: { owner: string; repository: string; prNumber: number }): Promise<PullRequestContext> {
    const prefix = `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}`;
    const pull = await this.request<PullRequestPayload>(`${prefix}/pulls/${input.prNumber}`);
    const base = record(pull.base);
    const head = record(pull.head);
    const baseSha = stringValue(base.sha, "");
    const headSha = stringValue(head.sha, "");
    const files = await this.pullFiles(prefix, input.prNumber);
    const compare = await this.request<ComparePayload>(`${prefix}/compare/${baseSha}...${headSha}`);
    const mergeBaseSha = stringValue(record(compare.merge_base_commit).sha, baseSha);
    return {
      owner: input.owner,
      repository: input.repository,
      prNumber: input.prNumber,
      title: stringValue(pull.title, ""),
      body: typeof pull.body === "string" ? pull.body : "",
      baseRef: stringValue(base.ref, ""),
      baseSha,
      headRef: stringValue(head.ref, ""),
      headSha,
      mergeBaseSha,
      changedFiles: files,
    };
  }

  async publish(plan: PublicationPlan): Promise<PublicationResult> {
    const context = await this.getContext({ owner: plan.owner, repository: plan.repository, prNumber: plan.prNumber });
    if (context.headSha !== plan.reviewedHeadSha) {
      return {
        status: "failed",
        reviewedHeadSha: context.headSha,
        summaryComment: "skipped",
        inlinePublished: 0,
        inlineSkipped: 0,
        diagnostics: [`Head changed from ${plan.reviewedHeadSha} to ${context.headSha}; publication skipped`],
        error: "Reviewed head is stale",
      };
    }

    const prefix = `/repos/${encodeURIComponent(plan.owner)}/${encodeURIComponent(plan.repository)}`;
    const diagnostics: string[] = [];
    let summaryComment: PublicationResult["summaryComment"] = "skipped";
    try {
      const comments = await this.request<GitHubComment[]>(`${prefix}/issues/${plan.prNumber}/comments`);
      const body = summaryBody(plan, plan.decisions.filter((decision) => decision.disposition === "SUMMARY"), plan.owner, plan.repository);
      const existing = comments.find((comment) => comment.body.includes(summaryMarker()));
      if (existing) {
        if (existing.body === body) summaryComment = "unchanged";
        else {
          await this.request<unknown>(`/repos/${encodeURIComponent(plan.owner)}/${encodeURIComponent(plan.repository)}/issues/comments/${existing.id}`, {
            method: "PATCH",
            body: JSON.stringify({ body }),
          });
          summaryComment = "updated";
        }
      } else {
        await this.request<unknown>(`${prefix}/issues/${plan.prNumber}/comments`, { method: "POST", body: JSON.stringify({ body }) });
        summaryComment = "created";
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Summary publication failed";
      return {
        status: "failed",
        reviewedHeadSha: plan.reviewedHeadSha,
        summaryComment: "skipped",
        inlinePublished: 0,
        inlineSkipped: 0,
        diagnostics: [message],
        error: "Summary publication failed",
      };
    }

    const existingReviewComments = await this.request<GitHubComment[]>(`${prefix}/pulls/${plan.prNumber}/comments`);
    let inlinePublished = 0;
    let inlineSkipped = 0;
    for (const decision of plan.decisions.filter((item) => item.disposition === "INLINE")) {
      const value = fingerprint(decision.finding, plan.owner, plan.repository);
      const marker = findingMarker(value);
      if (existingReviewComments.some((comment) => comment.body.includes(marker))) {
        inlineSkipped += 1;
        continue;
      }
      try {
        const line = decision.finding.primaryLocation.startLine;
        if (line === undefined) {
          diagnostics.push(`Inline finding ${value} has no line and was skipped`);
          inlineSkipped += 1;
          continue;
        }
        await this.request<unknown>(`${prefix}/pulls/${plan.prNumber}/comments`, {
          method: "POST",
          body: JSON.stringify({
            body: findingBody(decision, marker),
            commit_id: plan.reviewedHeadSha,
            path: decision.finding.primaryLocation.path,
            line,
            side: "RIGHT",
          }),
        });
        inlinePublished += 1;
      } catch (error: unknown) {
        diagnostics.push(error instanceof Error ? error.message : `Inline publication failed for ${value}`);
        inlineSkipped += 1;
      }
    }
    const status = diagnostics.length > 0 ? "partial" : "ok";
    return {
      status,
      reviewedHeadSha: plan.reviewedHeadSha,
      summaryComment,
      inlinePublished,
      inlineSkipped,
      diagnostics,
      ...(status === "partial" ? { error: "Some inline findings were not published" } : {}),
    };
  }

  private async pullFiles(prefix: string, prNumber: number): Promise<ChangedFile[]> {
    const result: ChangedFile[] = [];
    for (let page = 1; page <= 10; page += 1) {
      const files = await this.request<PullRequestFilePayload[]>(`${prefix}/pulls/${prNumber}/files?per_page=100&page=${page}`);
      for (const item of files) {
        const file = changedFile(item);
        if (file) result.push(file);
      }
      if (files.length < 100) break;
    }
    return result;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(this.baseUrl + path, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub API request failed with status ${response.status}`);
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  }
}
