import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("review CLI", () => {
  it("prints help without external integrations", async () => {
    const result = await execFileAsync(process.execPath, ["--import", "tsx", "src/entrypoints/cli/review.ts", "--help"], {
      env: { ...process.env, NO_COLOR: "1" },
    });

    expect(result.stdout).toContain("code-review-orchestrator");
    expect(result.stdout).toContain("review --help");
    expect(result.stderr).toBe("");
  });

  it("rejects unknown options", async () => {
    await expect(
      execFileAsync(process.execPath, ["--import", "tsx", "src/entrypoints/cli/review.ts", "--unknown"]),
    ).rejects.toMatchObject({ code: 2 });
  });
});

