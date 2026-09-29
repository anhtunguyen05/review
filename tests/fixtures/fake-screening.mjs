#!/usr/bin/env node

/* global process */

const args = process.argv.slice(2);
const candidateIds = [];
const candidatePaths = [];
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--candidate-id") candidateIds.push(args[index + 1]);
  if (args[index] === "--candidate-path") candidatePaths.push(args[index + 1]);
}

if (process.env.FAKE_SCREENING_MODE === "invalid-json") {
  process.stdout.write("{");
  process.exit(0);
}

if (process.env.FAKE_SCREENING_MODE === "non-zero") {
  process.stderr.write("provider token=fixture-secret");
  process.exit(9);
}

const decisions = candidateIds.map((candidateId, index) => {
  const path = candidatePaths[index] ?? "";
  const profile = path.endsWith("a.ts")
    ? { relevance: 0.8, correctnessRisk: 0.9 }
    : path.endsWith("b.ts")
      ? { relevance: 0.6, correctnessRisk: 0.6 }
      : { relevance: 0.1, correctnessRisk: 0.2 };
  return {
    candidateId,
    relevance: profile.relevance,
    correctnessRisk: profile.correctnessRisk,
    securityRisk: 0.1,
    reliabilityRisk: 0.2,
    compatibilityRisk: 0.2,
    testGapRisk: 0.1,
    confidence: 0.9,
    evidence: ["fixture screening evidence"],
  };
});

process.stdout.write(JSON.stringify({ decisions }));
