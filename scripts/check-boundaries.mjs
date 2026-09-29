/* global console, process */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);

function sourceFiles(root) {
  const result = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...sourceFiles(path));
    else if (sourceExtensions.has(extname(entry.name))) result.push(path);
  }
  return result;
}

function importSpecifiers(source) {
  const matches = source.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g);
  return [...matches].map((match) => match[1]).filter(Boolean);
}

function layerOf(path) {
  const normalized = normalize(path).replaceAll("\\\\", "/");
  const match = normalized.match(/(?:^|\/)src\/([^/]+)/);
  return match?.[1] ?? "unknown";
}

function resolveRelative(importer, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(importer), specifier);
  for (const suffix of ["", ".ts", ".tsx", ".mts", ".cts", "/index.ts"]) {
    const candidate = base + suffix;
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Candidate does not exist.
    }
  }
  return base;
}

export function findViolations(files) {
  const violations = [];
  for (const [importer, source] of Object.entries(files)) {
    const layer = layerOf(importer);
    for (const specifier of importSpecifiers(source)) {
      const isNodeImport = specifier.startsWith("node:");
      const isPackageImport = !specifier.startsWith(".");
      const target = resolveRelative(importer, specifier);
      const targetLayer = target ? layerOf(target) : null;

      if (layer === "domain" && (isNodeImport || isPackageImport || (targetLayer !== null && targetLayer !== "domain"))) {
        violations.push(importer + " -> " + specifier + ": domain must have no external or outward dependency");
      }
      if (layer === "application" && (isNodeImport || isPackageImport || ["infrastructure", "entrypoints", "config"].includes(targetLayer))) {
        violations.push(importer + " -> " + specifier + ": application may depend only on domain and ports");
      }
      if (layer === "entrypoints" && targetLayer === "infrastructure") {
        violations.push(importer + " -> " + specifier + ": entrypoints must use the composition root");
      }
    }
  }
  return violations;
}

function scan() {
  const files = Object.fromEntries(sourceFiles(sourceRoot).map((path) => [path, readFileSync(path, "utf8")]));
  const violations = findViolations(files);
  if (violations.length > 0) {
    console.error(violations.join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log("Boundary check passed for " + Object.keys(files).length + " source files.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) scan();

