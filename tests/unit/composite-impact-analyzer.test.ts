import { describe, expect, it } from "vitest";
import type { RepositoryContentPort } from "../../src/application/ports/repository-content.js";
import { defaultImpactPolicy } from "../../src/domain/review/impact-policy.js";
import { CompositeImpactAnalyzer } from "../../src/infrastructure/impact/composite-impact-analyzer.js";
import type { ImpactDiscoveryInput } from "../../src/domain/review/contracts.js";

class StubRepositoryContent implements RepositoryContentPort {
  constructor(private readonly files: Record<string, string>) {}

  async listFiles(): Promise<string[]> {
    return Object.keys(this.files);
  }

  async readFile(input: { path: string }): Promise<string> {
    const content = this.files[input.path];
    if (content === undefined) throw new Error("missing fixture file");
    return content;
  }
}

const input: ImpactDiscoveryInput = {
  repositoryPath: "/repo",
  from: "main",
  to: "feature",
  baseSha: "a".repeat(40),
  headSha: "b".repeat(40),
  mergeBaseSha: "a".repeat(40),
  changedFiles: [{ path: "src/status.ts", status: "modified" }],
  policy: defaultImpactPolicy,
};

describe("CompositeImpactAnalyzer", () => {
  it("merges structural reasons for an untouched consumer", async () => {
    const analyzer = new CompositeImpactAnalyzer(new StubRepositoryContent({
      "src/status.ts": "export type Status = 'OK' | 'PENDING';\n",
      "src/checkout.ts": "import type { Status } from './status.js';\nexport function checkout(status: Status) { return status; }\n",
      "src/checkout.test.ts": "import { checkout } from './checkout.js';\n",
    }));

    const result = await analyzer.discover(input);
    const checkout = result.graph.candidates.find((candidate) => candidate.id === "impact:src/checkout.ts");

    expect(result.status).toBe("ok");
    expect(checkout?.reasons).toEqual(expect.arrayContaining([
      { kind: "IMPORTER", sourcePath: "src/status.ts" },
      { kind: "SYMBOL_REFERENCE", symbol: "Status", sourcePath: "src/status.ts" },
    ]));
    expect(result.graph.candidates.every((candidate) => candidate.reasons.length > 0)).toBe(true);
  });

  it("preserves direct candidates and applies depth limits", async () => {
    const analyzer = new CompositeImpactAnalyzer(new StubRepositoryContent({
      "src/status.ts": "export type Status = 'OK';\n",
      "src/checkout.ts": "import type { Status } from './status.js';\n",
    }));
    const result = await analyzer.discover({
      ...input,
      policy: { ...defaultImpactPolicy, maxDepth: 0 },
    });

    expect(result.graph.candidates.map((candidate) => candidate.id)).toEqual(["impact:src/status.ts"]);
    expect(result.diagnostics.join(" ")).toContain("max depth 0");
  });
});
