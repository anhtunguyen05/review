import type { ScreeningEngine } from "./ports/screening-engine.js";
import type { ScreeningResult } from "../domain/review/contracts.js";

export class DisabledScreeningEngine implements ScreeningEngine {
  async screen(): Promise<ScreeningResult> {
    return {
      status: "disabled",
      decisions: [],
      rawOutput: "",
      rawJson: null,
      diagnostics: ["Screening is disabled because no trusted screening command was configured"],
    };
  }
}
