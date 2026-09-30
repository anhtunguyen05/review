import { describe, expect, it } from "vitest";
import { goImpactAnalyzer, javaImpactAnalyzer, phpImpactAnalyzer, pythonImpactAnalyzer } from "../../src/infrastructure/impact/languages/additional-language-analyzers.js";
import { defaultImpactPolicy } from "../../src/domain/review/impact-policy.js";
import type { ImpactFragmentInput } from "../../src/infrastructure/impact/impact-fragment.js";

const range = { repositoryPath: "/repo", from: "main", to: "feature", baseSha: "a".repeat(40), headSha: "b".repeat(40), mergeBaseSha: "a".repeat(40) };

describe("additional language impact analyzers", () => {
  it.each([
    ["php", phpImpactAnalyzer, "class PaymentService {}", "<?php $service = new PaymentService();"],
    ["go", goImpactAnalyzer, "type PaymentStatus string", "func settle(status PaymentStatus) {}"],
    ["python", pythonImpactAnalyzer, "class PaymentService:\n    pass", "service = PaymentService()"],
    ["java", javaImpactAnalyzer, "class PaymentService {}", "class Checkout { PaymentService service; }"],
  ])("finds an untouched %s consumer with symbol evidence", (_name, analyzer, changedContent, consumerContent) => {
    const input: ImpactFragmentInput = {
      range,
      changedFiles: [{ path: `src/changed.${_name === "php" ? "php" : _name === "go" ? "go" : _name === "python" ? "py" : "java"}`, status: "modified" }],
      files: [
        { path: `src/changed.${_name === "php" ? "php" : _name === "go" ? "go" : _name === "python" ? "py" : "java"}`, commitSha: range.headSha, content: changedContent, directChange: true },
        { path: `src/consumer.${_name === "php" ? "php" : _name === "go" ? "go" : _name === "python" ? "py" : "java"}`, commitSha: range.headSha, content: consumerContent, directChange: false },
      ],
      policy: defaultImpactPolicy,
    };
    const fragment = analyzer.analyze(input);
    expect(fragment.candidates).toHaveLength(1);
    expect(fragment.candidates[0]?.reasons[0]).toMatchObject({ kind: "SYMBOL_REFERENCE", sourcePath: input.changedFiles[0]?.path });
  });
});
