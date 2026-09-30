import type { ImpactDiscoveryInput, ImpactDiscoveryResult } from "../../domain/review/contracts.js";

export interface ImpactAnalyzer {
  discover(input: ImpactDiscoveryInput): Promise<ImpactDiscoveryResult>;
}
