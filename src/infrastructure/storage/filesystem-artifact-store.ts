import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ArtifactStore } from "../../application/ports/artifact-store.js";
import type { ReviewRunArtifacts } from "../../domain/review/contracts.js";

export class FileSystemArtifactStore implements ArtifactStore {
  async save(outputDirectory: string, artifacts: ReviewRunArtifacts): Promise<void> {
    const directory = resolve(outputDirectory);
    await mkdir(directory, { recursive: true });
    await Promise.all([
      this.write(directory, "run.json", artifacts.run),
      this.write(directory, "screening.json", artifacts.screening),
      this.write(directory, "impact-graph.json", artifacts.impact),
      this.write(directory, "ocr.raw.json", artifacts.ocrRaw),
      this.write(directory, "findings.json", artifacts.findings),
    ]);
  }

  private async write(directory: string, name: string, value: unknown): Promise<void> {
    await writeFile(resolve(directory, name), JSON.stringify(value, null, 2) + "\n", "utf8");
  }
}
