import { describe, expect, it } from "vitest";
import { defaultImpactPolicy } from "../../src/domain/review/impact-policy.js";
import { TypeScriptImportAnalyzer } from "../../src/infrastructure/impact/languages/typescript-analyzer.js";
import type { ImpactFragmentInput } from "../../src/infrastructure/impact/impact-fragment.js";

const input: ImpactFragmentInput = {
  range: {
    repositoryPath: "/repo",
    from: "main",
    to: "feature",
    baseSha: "a".repeat(40),
    headSha: "b".repeat(40),
    mergeBaseSha: "a".repeat(40),
  },
  changedFiles: [{ path: "src/status.ts", status: "modified" }],
  files: [
    {
      path: "src/status.ts",
      commitSha: "b".repeat(40),
      content: "export type Status = 'OK' | 'PENDING';\n",
      directChange: true,
    },
    {
      path: "src/checkout.ts",
      commitSha: "b".repeat(40),
      content: "import type { Status } from './status.js';\nexport function checkout(status: Status) { return status; }\n",
      directChange: false,
    },
  ],
  policy: defaultImpactPolicy,
};

describe("TypeScriptImportAnalyzer", () => {
  it("finds an untouched importer of a changed module", () => {
    const result = new TypeScriptImportAnalyzer().analyze(input);

    expect(result.edges).toEqual([
      expect.objectContaining({ kind: "IMPORTS", evidence: "./status.js" }),
    ]);
    expect(result.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        nodeId: "path:src/checkout.ts",
        reasons: [{ kind: "IMPORTER", sourcePath: "src/status.ts" }],
      }),
    ]));
  });

  it("keeps direct candidates deterministic", () => {
    const result = new TypeScriptImportAnalyzer().analyze(input);
    expect(result.candidates.find((candidate) => candidate.nodeId === "path:src/status.ts")).toMatchObject({
      id: "impact:src/status.ts",
      score: 100,
      reasons: [{ kind: "DIRECT_CHANGE" }],
    });
  });
});
