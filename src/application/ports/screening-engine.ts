import type { ScreeningInput, ScreeningResult } from "../../domain/review/contracts.js";

export interface ScreeningEngine {
  screen(input: ScreeningInput): Promise<ScreeningResult>;
}
