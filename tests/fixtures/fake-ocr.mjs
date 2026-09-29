#!/usr/bin/env node

/* global process */

if (process.env.FAKE_OCR_MODE === "invalid-json") {
  process.stdout.write("{");
  process.exit(0);
}

if (process.env.FAKE_OCR_MODE === "non-zero") {
  process.stderr.write("provider diagnostic token=fixture-only");
  process.exit(7);
}
process.stdout.write(
  JSON.stringify({
    findings: [
      {
        type: "DEFECT",
        severity: "HIGH",
        confidence: 0.93,
        title: "Changed function needs a guard",
        message: "The changed function accepts an unchecked value.",
        path: "src/changed.ts",
        startLine: 1,
        endLine: 1,
        evidence: "The input is used before validation.",
        suggestion: "Validate the input before using it.",
        actionable: true,
      },
    ],
  }),
);
