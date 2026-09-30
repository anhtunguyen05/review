/* global console */
import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = resolve(dirname(fileURLToPath(import.meta.url)), "../tests/fixtures/evaluation");
const entries = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
let caseCount = 0;
for (const name of entries) {
  const manifest = JSON.parse(await readFile(join(directory, name), "utf8"));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.cases) || manifest.cases.length === 0) {
    throw new Error("Invalid evaluation fixture manifest: " + name);
  }
  for (const item of manifest.cases) {
    if (typeof item.id !== "string" || !Array.isArray(item.expectedImpactedPaths) || !Array.isArray(item.expectedMechanisms)) {
      throw new Error("Invalid evaluation case in " + name);
    }
    caseCount += 1;
  }
}
console.log(`Validated ${caseCount} evaluation fixture case(s); provider-free manifest check only.`);
