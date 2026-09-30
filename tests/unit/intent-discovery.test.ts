import { describe, expect, it } from "vitest";
import { discoverChangeIntent } from "../../src/application/discover-change-intent.js";

describe("deterministic intent discovery", () => {
  it("extracts bounded concepts and inspectable document sources", () => {
    const result = discoverChangeIntent({
      changedFiles: [{ path: "docs/payment.md", status: "modified" }],
      documents: [{ path: "docs/payment.md", content: "# Payment settlement\nPayment remains pending until reconciliation." }],
      title: "Keep payment pending during reconciliation",
    });

    expect(result.status).toBe("ok");
    expect(result.intent.summary).toContain("Keep payment pending");
    expect(result.intent.concepts).toContain("payment");
    expect(result.intent.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "TITLE" }),
      expect.objectContaining({ kind: "DOCUMENT", path: "docs/payment.md" }),
    ]));
    expect(result.intent.concepts.length).toBeLessThanOrEqual(12);
  });
});
