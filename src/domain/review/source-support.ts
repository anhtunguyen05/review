export type RepositoryFileKind =
  | "CODE"
  | "CONFIG"
  | "DOCUMENT"
  | "DATA"
  | "BINARY"
  | "GENERATED_OR_VENDOR";

const documentationExtensions = new Set([".adoc", ".md", ".mdx", ".rst", ".txt"]);
const configurationExtensions = new Set([".conf", ".env", ".ini", ".json", ".properties", ".toml", ".xml", ".yaml", ".yml"]);
const dataExtensions = new Set([".csv", ".lock", ".map", ".sum"]);
const binaryExtensions = new Set([
  ".7z", ".avi", ".class", ".dll", ".dmg", ".exe", ".gif", ".gz", ".ico", ".jar", ".jpeg", ".jpg",
  ".mov", ".mp3", ".mp4", ".pdf", ".png", ".so", ".tar", ".wasm", ".webp", ".woff", ".woff2", ".zip",
]);
const documentationNames = new Set(["changelog", "contributing", "license", "licence", "readme"]);
const dataNames = new Set(["cargo.lock", "composer.lock", "go.sum", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"]);

export function normalizeRepositoryPath(path: string): string {
  return path.replaceAll("\\", "/");
}

function fileNameOf(path: string): string {
  return normalizeRepositoryPath(path).split("/").at(-1)?.toLowerCase() ?? "";
}

function extensionOf(path: string): string {
  const fileName = fileNameOf(path);
  const index = fileName.lastIndexOf(".");
  return index < 0 ? "" : fileName.slice(index);
}

function stemOf(path: string): string {
  const fileName = fileNameOf(path);
  const extension = extensionOf(path);
  return extension ? fileName.slice(0, -extension.length) : fileName;
}

function isIgnoredPath(path: string, ignoredPathSegments: string[]): boolean {
  const segments = normalizeRepositoryPath(path).toLowerCase().split("/");
  const ignored = new Set(ignoredPathSegments.map((segment) => segment.toLowerCase()));
  return segments.some((segment) => ignored.has(segment));
}

function isGeneratedPath(path: string): boolean {
  const fileName = fileNameOf(path);
  return fileName.includes(".generated.") || fileName.includes(".gen.") || fileName.endsWith(".min.js") || fileName.endsWith(".min.css");
}

export function classifyRepositoryFile(path: string, ignoredPathSegments: string[] = []): RepositoryFileKind {
  const normalized = normalizeRepositoryPath(path);
  const extension = extensionOf(normalized);
  const fileName = fileNameOf(normalized);
  const stem = stemOf(normalized);

  if (isIgnoredPath(normalized, ignoredPathSegments) || isGeneratedPath(normalized)) return "GENERATED_OR_VENDOR";
  if (dataNames.has(fileName) || dataExtensions.has(extension)) return "DATA";
  if (binaryExtensions.has(extension)) return "BINARY";
  if (documentationNames.has(stem) || documentationExtensions.has(extension)) return "DOCUMENT";
  if (configurationExtensions.has(extension) || fileName === ".env") return "CONFIG";
  return "CODE";
}

export function isReviewableSourcePath(path: string, ignoredPathSegments: string[] = []): boolean {
  const kind = classifyRepositoryFile(path, ignoredPathSegments);
  return kind === "CODE" || kind === "CONFIG";
}

export function isImpactAnalyzablePath(path: string, includeDocs: boolean, ignoredPathSegments: string[] = []): boolean {
  const kind = classifyRepositoryFile(path, ignoredPathSegments);
  return kind === "CODE" || kind === "CONFIG" || (includeDocs && kind === "DOCUMENT");
}

export function isTextRepositoryContent(content: string): boolean {
  return !content.includes("\0");
}
