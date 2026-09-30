import type { IntentDiscoveryEngine, IntentDiscoveryInput } from "./ports/intent-discovery.js";
import type { ChangeIntent, IntentDiscoveryResult } from "../domain/review/contracts.js";

const stopWords = new Set([
  "about", "after", "also", "been", "being", "from", "have", "into", "more", "only", "that", "their", "there", "these", "they", "this", "through", "will", "with", "when", "where", "which", "while", "would", "should", "could", "must", "feature", "change", "changed", "update", "updated", "document", "docs", "code", "file", "files", "the", "and", "for", "not", "are", "was", "were", "has", "had", "its", "our", "your", "you", "can", "may", "new", "add", "added", "from",
]);

function excerpt(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 400);
}

function words(value: string): string[] {
  return [...value.toLowerCase().matchAll(/[a-z][a-z0-9_-]{3,}/g)]
    .map((match) => match[0])
    .filter((word) => !stopWords.has(word) && !/^\d+$/.test(word));
}

function concepts(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    for (const word of words(value)) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 12)
    .map(([word]) => word);
}

function summary(title: string | undefined, body: string | undefined, documents: Array<{ path: string; content: string }>): string {
  const first = [title, body, ...documents.map((document) => document.content)]
    .map((value) => value?.split(/\r?\n/).find((line) => line.trim()) ?? "")
    .find((line) => line.trim());
  return excerpt(first ?? "");
}

export class DeterministicIntentDiscovery implements IntentDiscoveryEngine {
  discover(input: IntentDiscoveryInput): IntentDiscoveryResult {
    const sources: ChangeIntent["sources"] = [];
    if (input.title?.trim()) sources.push({ kind: "TITLE", excerpt: excerpt(input.title) });
    if (input.body?.trim()) sources.push({ kind: "BODY", excerpt: excerpt(input.body) });
    for (const document of input.documents) {
      sources.push({ kind: "DOCUMENT", path: document.path, excerpt: excerpt(document.content) });
    }
    const conceptsFound = concepts(sources.map((source) => source.excerpt));
    const intent: ChangeIntent = {
      summary: summary(input.title, input.body, input.documents),
      concepts: conceptsFound,
      sources,
      confidence: sources.length === 0 ? 0 : conceptsFound.length === 0 ? 0.25 : input.documents.length > 0 ? 0.65 : 0.5,
    };
    return {
      status: sources.length === 0 ? "disabled" : conceptsFound.length === 0 ? "partial" : "ok",
      intent,
      diagnostics: conceptsFound.length === 0 && sources.length > 0 ? ["No bounded semantic concepts were extracted"] : [],
    };
  }
}

export function discoverChangeIntent(input: IntentDiscoveryInput): IntentDiscoveryResult {
  return new DeterministicIntentDiscovery().discover(input);
}
