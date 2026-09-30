import { describe, expect, it } from "vitest";
import { buildPublicationPlan } from "../../src/application/build-publication-plan.js";
import { GitHubApiAdapter } from "../../src/infrastructure/github/github-api-adapter.js";
import type { ReviewFinding } from "../../src/domain/review/contracts.js";

const headSha = "b".repeat(40);

class FakeGitHub {
  issueComments: Array<{ id: number; body: string }> = [];
  reviewComments: Array<{ id: number; body: string }> = [];
  calls: Array<{ method: string; path: string; body?: string }> = [];
  private nextId = 1;

  readonly fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? init.body : undefined;
    this.calls.push({ method, path: url.pathname, ...(body === undefined ? {} : { body }) });
    if (url.pathname === "/repos/acme/demo/pulls/7" && method === "GET") {
      return this.response({
        title: "Feature",
        body: "Description",
        base: { ref: "main", sha: "a".repeat(40) },
        head: { ref: "feature", sha: headSha },
      });
    }
    if (url.pathname === "/repos/acme/demo/pulls/7/files" && method === "GET") {
      return this.response([{ filename: "src/a.ts", status: "modified", additions: 1, deletions: 0, patch: "@@ -1 +1 @@" }]);
    }
    if (url.pathname === "/repos/acme/demo/compare/" + "a".repeat(40) + "..." + headSha && method === "GET") {
      return this.response({ merge_base_commit: { sha: "c".repeat(40) } });
    }
    if (url.pathname === "/repos/acme/demo/issues/7/comments" && method === "GET") return this.response(this.issueComments);
    if (url.pathname === "/repos/acme/demo/issues/7/comments" && method === "POST") {
      const parsed = JSON.parse(body ?? "{}");
      this.issueComments.push({ id: this.nextId++, body: parsed.body });
      return this.response(this.issueComments.at(-1), 201);
    }
    if (url.pathname.startsWith("/repos/acme/demo/issues/comments/") && method === "PATCH") {
      const id = Number(url.pathname.split("/").at(-1));
      const parsed = JSON.parse(body ?? "{}");
      const comment = this.issueComments.find((item) => item.id === id);
      if (comment) comment.body = parsed.body;
      return this.response(comment);
    }
    if (url.pathname === "/repos/acme/demo/pulls/7/comments" && method === "GET") return this.response(this.reviewComments);
    if (url.pathname === "/repos/acme/demo/pulls/7/comments" && method === "POST") {
      const parsed = JSON.parse(body ?? "{}");
      this.reviewComments.push({ id: this.nextId++, body: parsed.body });
      return this.response(this.reviewComments.at(-1), 201);
    }
    return this.response({ error: "not found" }, 404);
  };

  private response(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }
}

function finding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    id: "finding-1",
    fingerprint: "provider-fingerprint",
    sourceEngines: ["ocr"],
    type: "DEFECT",
    severity: "HIGH",
    confidence: 0.95,
    title: "Unsafe state transition",
    message: "The changed branch can return an invalid state.",
    primaryLocation: { path: "src/a.ts", startLine: 1, endLine: 1 },
    relatedLocations: [],
    evidence: [{ kind: "DIFF", text: "changed line" }],
    actionable: true,
    ...overrides,
  };
}

describe("GitHub publication adapter", () => {
  it("resolves PR context and publishes one sticky summary and one inline finding idempotently", async () => {
    const fake = new FakeGitHub();
    const adapter = new GitHubApiAdapter("fixture-token", { baseUrl: "https://api.test", fetcher: fake.fetcher });
    const context = await adapter.getContext({ owner: "acme", repository: "demo", prNumber: 7 });
    expect(context).toMatchObject({ baseRef: "main", headRef: "feature", headSha, mergeBaseSha: "c".repeat(40) });
    expect(context.changedFiles[0]).toMatchObject({ path: "src/a.ts", additions: 1 });

    const plan = buildPublicationPlan({
      runId: "run-1",
      owner: "acme",
      repository: "demo",
      prNumber: 7,
      reviewedHeadSha: headSha,
      changedFiles: context.changedFiles,
      findings: [finding()],
      impactCandidates: 2,
      screenedCandidates: 2,
      deepReviewedFiles: 1,
    });
    await expect(adapter.publish(plan)).resolves.toMatchObject({ status: "ok", summaryComment: "created", inlinePublished: 1, inlineSkipped: 0 });
    await expect(adapter.publish(plan)).resolves.toMatchObject({ status: "ok", summaryComment: "unchanged", inlinePublished: 0, inlineSkipped: 1 });

    expect(fake.issueComments).toHaveLength(1);
    expect(fake.reviewComments).toHaveLength(1);
    expect(fake.reviewComments[0]?.body).toContain("review-orchestrator:fingerprint:");
  });

  it("aborts before mutation when the reviewed head is stale", async () => {
    const fake = new FakeGitHub();
    const adapter = new GitHubApiAdapter("fixture-token", { baseUrl: "https://api.test", fetcher: fake.fetcher });
    const result = await adapter.publish({
      runId: "run-stale",
      owner: "acme",
      repository: "demo",
      prNumber: 7,
      reviewedHeadSha: "d".repeat(40),
      decisions: [],
      summary: { changedFiles: 0, impactCandidates: 0, screenedCandidates: 0, deepReviewedFiles: 0, inlineFindings: 0, summaryFindings: 0, suppressedFindings: 0, degradedStages: [], durationMs: 0 },
    });

    expect(result).toMatchObject({ status: "failed", summaryComment: "skipped", error: "Reviewed head is stale" });
    expect(fake.calls.some((call) => call.method === "POST" || call.method === "PATCH")).toBe(false);
  });
});
