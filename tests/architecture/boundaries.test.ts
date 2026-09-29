import { describe, expect, it } from "vitest";
import { findViolations } from "../../scripts/check-boundaries.mjs";

describe("dependency boundaries", () => {
  it("accepts inward dependency direction", () => {
    expect(findViolations({
      "/repo/src/domain/value.ts": "export type Value = string;",
      "/repo/src/application/use-case.ts": 'import type { Value } from "../domain/value.js";',
    })).toEqual([]);
  });

  it("rejects external and outward domain imports", () => {
    expect(findViolations({
      "/repo/src/domain/value.ts": 'import fs from "node:fs";',
      "/repo/src/application/use-case.ts": 'import "../infrastructure/adapter.js";',
    })).toHaveLength(2);
  });
});

