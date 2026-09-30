import { describe, expect, it } from "vitest";
import {
  classifyRepositoryFile,
  isImpactAnalyzablePath,
  isReviewableSourcePath,
} from "../../src/domain/review/source-support.js";

describe("repository source support", () => {
  it.each([".php", ".go", ".py", ".java", ".rs", ".kt"])("classifies %s as code without a language registry entry", (extension) => {
    expect(classifyRepositoryFile(`src/service${extension}`)).toBe("CODE");
    expect(isReviewableSourcePath(`src/service${extension}`)).toBe(true);
    expect(isImpactAnalyzablePath(`src/service${extension}`, false)).toBe(true);
  });

  it("keeps generated, vendor, binary, and documentation paths out of code review scope", () => {
    expect(classifyRepositoryFile("vendor/library/service.php", ["vendor"])).toBe("GENERATED_OR_VENDOR");
    expect(classifyRepositoryFile("src/service.generated.go")).toBe("GENERATED_OR_VENDOR");
    expect(classifyRepositoryFile("assets/logo.png")).toBe("BINARY");
    expect(classifyRepositoryFile("README.md")).toBe("DOCUMENT");
    expect(isReviewableSourcePath("README.md")).toBe(false);
  });
});
