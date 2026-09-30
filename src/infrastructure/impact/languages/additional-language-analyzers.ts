import { createLanguageAnalyzer, type LanguageImpactAnalyzer } from "./language-impact-analyzer.js";

function declarations(pattern: RegExp): (content: string) => string[] {
  return (content) => [...content.matchAll(pattern)].map((match) => match[1]).filter((value): value is string => value !== undefined);
}

export const phpImpactAnalyzer: LanguageImpactAnalyzer = createLanguageAnalyzer({
  name: "PHP",
  extensions: new Set([".php"]),
  extractAnchors: declarations(/\b(?:class|interface|trait|function)\s+([A-Za-z_][A-Za-z0-9_]*)/g),
});

export const goImpactAnalyzer: LanguageImpactAnalyzer = createLanguageAnalyzer({
  name: "Go",
  extensions: new Set([".go"]),
  extractAnchors: declarations(/\b(?:type|func|const|var)\s+([A-Za-z_][A-Za-z0-9_]*)/g),
});

export const pythonImpactAnalyzer: LanguageImpactAnalyzer = createLanguageAnalyzer({
  name: "Python",
  extensions: new Set([".py"]),
  extractAnchors: declarations(/^\s*(?:class|def)\s+([A-Za-z_][A-Za-z0-9_]*)/gm),
});

export const javaImpactAnalyzer: LanguageImpactAnalyzer = createLanguageAnalyzer({
  name: "Java",
  extensions: new Set([".java"]),
  extractAnchors: declarations(/\b(?:class|interface|enum|record)\s+([A-Za-z_][A-Za-z0-9_]*)/g),
});
