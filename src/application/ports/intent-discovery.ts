import type { ChangedFile, ChangeIntent, IntentDiscoveryResult } from "../../domain/review/contracts.js";

export interface IntentDiscoveryInput {
  changedFiles: ChangedFile[];
  documents: Array<{ path: string; content: string }>;
  title?: string;
  body?: string;
}

export interface IntentDiscoveryEngine {
  discover(input: IntentDiscoveryInput): IntentDiscoveryResult;
}

export type IntentDiscoveryOutput = ChangeIntent;
