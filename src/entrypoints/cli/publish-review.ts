import { readFile } from "node:fs/promises";
import { publishReview } from "../../application/publish-review.js";
import { buildGitHubPublication } from "../../composition/build-github-publication.js";
import type { ReviewFinding } from "../../domain/review/contracts.js";

const help = `code-review-orchestrator publish-review

Usage:
  publish-review --artifacts <directory> --owner <owner> --repo <repository> --pr <number>

Credentials and GitHub Actions defaults:
  GITHUB_TOKEN supplies the token.
  GITHUB_REPOSITORY supplies owner/repository when flags are omitted.
  GITHUB_EVENT_PATH supplies pull_request.number when --pr is omitted.
`;

function value(args: string[], index: number, option: string): string {
  const result = args[index + 1];
  if (!result || result.startsWith("-")) throw new Error(option + " requires a value");
  return result;
}

function parse(args: string[]): { help: boolean; artifacts: string; owner?: string; repository?: string; prNumber?: number } {
  let helpRequested = false;
  let artifacts = "artifacts";
  let owner: string | undefined;
  let repository: string | undefined;
  let prNumber: number | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") helpRequested = true;
    else if (arg === "--artifacts") { artifacts = value(args, index, arg); index += 1; }
    else if (arg === "--owner") { owner = value(args, index, arg); index += 1; }
    else if (arg === "--repo") { repository = value(args, index, arg); index += 1; }
    else if (arg === "--pr") {
      const raw = value(args, index, arg);
      prNumber = Number(raw);
      if (!Number.isInteger(prNumber) || prNumber < 1) throw new Error("--pr must be a positive integer");
      index += 1;
    } else throw new Error("unknown option: " + arg);
  }
  return { help: helpRequested, artifacts, ...(owner === undefined ? {} : { owner }), ...(repository === undefined ? {} : { repository }), ...(prNumber === undefined ? {} : { prNumber }) };
}

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function eventPrNumber(eventPath: string | undefined): Promise<number | undefined> {
  if (!eventPath) return undefined;
  try {
    const event = JSON.parse(await readFile(eventPath, "utf8")) as { pull_request?: { number?: unknown }; inputs?: { pr_number?: unknown } };
    const pullRequestNumber = event.pull_request?.number;
    if (typeof pullRequestNumber === "number" && Number.isInteger(pullRequestNumber)) return pullRequestNumber;
    const inputNumber = event.inputs?.pr_number;
    if (typeof inputNumber === "string" && /^\d+$/.test(inputNumber)) return Number(inputNumber);
  } catch {
    return undefined;
  }
  return undefined;
}

export async function run(args: string[]): Promise<number> {
  const parsed = parse(args);
  if (parsed.help || args.length === 0) {
    process.stdout.write(help);
    return 0;
  }
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required");
  const repository = parsed.repository ?? process.env.GITHUB_REPOSITORY?.split("/")[1];
  const owner = parsed.owner ?? process.env.GITHUB_REPOSITORY?.split("/")[0];
  const prNumber = parsed.prNumber ?? await eventPrNumber(process.env.GITHUB_EVENT_PATH);
  if (!owner || !repository || !prNumber) throw new Error("owner, repository, and pull request number are required");

  const run = await json<{ runId: string; data: { status: "ok" | "partial" | "failed"; headSha: string; changedFiles: Array<{ path: string; status: "added" | "modified" | "deleted" | "renamed" }> } }>(`${parsed.artifacts}/run.json`);
  const findings = await json<{ data: { findings: ReviewFinding[] } }>(`${parsed.artifacts}/findings.json`);
  const impact = await json<{ data: { graph: { candidates: unknown[] } } }>(`${parsed.artifacts}/impact-graph.json`);
  const screening = await json<{ data: { decisions: unknown[] } }>(`${parsed.artifacts}/screening.json`);
  const scope = await json<{ data: { scope: { candidates: unknown[] } } }>(`${parsed.artifacts}/scope.json`);
  const github = buildGitHubPublication(token);
  const result = await publishReview({
    runId: run.runId,
    owner,
    repository,
    prNumber,
    reviewedHeadSha: run.data.headSha,
    findings: findings.data.findings,
    reviewStatus: run.data.status,
    impactCandidates: impact.data.graph.candidates.length,
    screenedCandidates: screening.data.decisions.length,
    deepReviewedFiles: scope.data.scope.candidates.length,
  }, github, github);
  process.stdout.write(`Publication ${result.status}: ${result.inlinePublished} inline comment(s), summary ${result.summaryComment}\n`);
  return result.status === "ok" ? 0 : 1;
}

if (process.argv[1]?.endsWith("/publish-review.ts") || process.argv[1]?.endsWith("\\publish-review.ts")) {
  run(process.argv.slice(2)).then((exitCode) => { process.exitCode = exitCode; }).catch((error: unknown) => {
    console.error("error: " + (error instanceof Error ? error.message : "Unexpected error"));
    process.exitCode = 1;
  });
}
