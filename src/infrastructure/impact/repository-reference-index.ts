import type { ImpactSnapshotFile } from "./impact-fragment.js";
import { classifyRepositoryFile, normalizeRepositoryPath, type RepositoryFileKind } from "../../domain/review/source-support.js";

export interface ReferenceHit {
  path: string;
  line: number;
  index: number;
  evidence: string;
  kind: RepositoryFileKind;
}

const tokenPattern = /[A-Za-z_$][A-Za-z0-9_$.-]{2,}/g;
const ignoredTokens = new Set([
  "and", "any", "async", "await", "begin", "bool", "break", "case", "catch", "class", "const", "continue",
  "def", "default", "defer", "do", "else", "enum", "false", "finally", "for", "from", "func", "function",
  "if", "implements", "import", "in", "interface", "let", "match", "new", "nil", "null", "package", "pass",
  "public", "return", "static", "struct", "switch", "this", "throw", "trait", "true", "try", "type", "var",
  "void", "while", "with", "export", "extends", "namespace", "throws", "use",
]);
const maxHitsPerTokenPerFile = 8;

function lineNumber(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

function evidenceLine(content: string, index: number): string {
  return (content.slice(0, index).split("\n").at(-1) ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
}

function isUsefulToken(token: string): boolean {
  return token.length >= 3 && !ignoredTokens.has(token.toLowerCase()) && !/^\d+$/.test(token);
}

export function extractGenericAnchors(content: string, maxAnchors = 96): string[] {
  const tokens = new Map<string, number>();
  for (const match of content.matchAll(tokenPattern)) {
    const token = match[0];
    if (!token || !isUsefulToken(token)) continue;
    tokens.set(token, (tokens.get(token) ?? 0) + 1);
  }

  return [...tokens.entries()]
    .sort(([leftToken, leftCount], [rightToken, rightCount]) => {
      const leftPriority = /[A-Z_$.-]/.test(leftToken) ? 1 : 0;
      const rightPriority = /[A-Z_$.-]/.test(rightToken) ? 1 : 0;
      return rightPriority - leftPriority || rightCount - leftCount || rightToken.length - leftToken.length || leftToken.localeCompare(rightToken);
    })
    .slice(0, maxAnchors)
    .map(([token]) => token);
}

export class RepositoryReferenceIndex {
  private readonly hits = new Map<string, ReferenceHit[]>();

  constructor(files: ImpactSnapshotFile[], ignoredPathSegments: string[] = []) {
    for (const file of files) {
      const path = normalizeRepositoryPath(file.path);
      const kind = classifyRepositoryFile(path, ignoredPathSegments);
      if (kind === "BINARY" || kind === "DATA" || kind === "GENERATED_OR_VENDOR") continue;
      const hitCounts = new Map<string, number>();
      for (const match of file.content.matchAll(tokenPattern)) {
        const token = match[0];
        const index = match.index;
        if (!token || index === undefined || !isUsefulToken(token)) continue;
        const count = hitCounts.get(token) ?? 0;
        if (count >= maxHitsPerTokenPerFile) continue;
        hitCounts.set(token, count + 1);
        const hit: ReferenceHit = {
          path,
          line: lineNumber(file.content, index),
          index,
          evidence: evidenceLine(file.content, index),
          kind,
        };
        this.hits.set(token, [...(this.hits.get(token) ?? []), hit]);
      }
    }
  }

  references(anchor: string): ReferenceHit[] {
    return this.hits.get(anchor) ?? [];
  }
}
