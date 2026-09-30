import { describe, expect, it } from "vitest";
import { defaultImpactPolicy } from "../../src/domain/review/impact-policy.js";
import { ConfigSchemaAnalyzer } from "../../src/infrastructure/impact/config-schema-analyzer.js";
import { TestRelationAnalyzer } from "../../src/infrastructure/impact/test-relation-analyzer.js";
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
  changedFiles: [{ path: "config/runtime.json", status: "modified" }],
  files: [
    {
      path: "config/runtime.json",
      commitSha: "b".repeat(40),
      content: '{"PAYMENT_TIMEOUT": 30}\n',
      directChange: true,
    },
    {
      path: "src/payment.ts",
      commitSha: "b".repeat(40),
      content: "const timeout = config.PAYMENT_TIMEOUT;\n",
      directChange: false,
    },
    {
      path: "tests/payment.test.ts",
      commitSha: "b".repeat(40),
      content: "import { payment } from '../src/payment.js';\n",
      directChange: false,
    },
  ],
  policy: defaultImpactPolicy,
};

describe("impact analyzers", () => {
  it("finds config key consumers", () => {
    const result = new ConfigSchemaAnalyzer().analyze(input);

    expect(result.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        nodeId: "path:src/payment.ts",
        reasons: [{ kind: "CONFIG_REFERENCE", key: "PAYMENT_TIMEOUT", sourcePath: "config/runtime.json" }],
      }),
    ]));
  });

  it("finds test relations to changed files", () => {
    const result = new TestRelationAnalyzer().analyze({
      ...input,
      changedFiles: [{ path: "src/payment.ts", status: "modified" }],
      files: [
        { ...input.files[1]!, path: "src/payment.ts", directChange: true },
        input.files[2]!,
      ],
    });

    expect(result.edges).toEqual([
      expect.objectContaining({ kind: "TESTS", from: "path:tests/payment.test.ts", to: "path:src/payment.ts" }),
    ]);
  });
});
