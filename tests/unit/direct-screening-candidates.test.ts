import { describe, expect, it } from "vitest";
import { collectDirectScreeningCandidates, screeningCandidateId } from "../../src/application/direct-screening-candidates.js";
import type { ChangedFile } from "../../src/domain/review/contracts.js";

describe("direct screening candidates", () => {
  it("collects direct source files across languages with stable IDs", () => {
    const files: ChangedFile[] = [
      { path: "src/a.ts", status: "modified" },
      { path: "src/test.tsx", status: "added" },
      { path: "src/service.php", status: "modified" },
      { path: "src/worker.rs", status: "modified" },
      { path: "README.md", status: "modified" },
      { path: "node_modules/pkg/index.js", status: "modified" },
    ];

    const result = collectDirectScreeningCandidates(files);

    expect(result.candidates).toHaveLength(4);
    expect(result.candidates.map((candidate) => candidate.path)).toEqual(["src/a.ts", "src/test.tsx", "src/service.php", "src/worker.rs"]);
    expect(result.candidates[0]?.id).toBe(screeningCandidateId(files[0]!));
    expect(result.diagnostics).toHaveLength(2);
  });

  it("keeps rename identity tied to both paths", () => {
    const rename: ChangedFile = { path: "src/new.ts", previousPath: "src/old.ts", status: "renamed" };
    const result = collectDirectScreeningCandidates([rename]);

    expect(result.candidates[0]).toMatchObject({
      id: "direct:renamed:src/new.ts:from:src/old.ts",
      path: "src/new.ts",
      previousPath: "src/old.ts",
      directChange: true,
    });
  });
});
