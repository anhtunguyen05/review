import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "yaml";
import { ZodError } from "zod";
import { bootstrapConfigSchema, defaultBootstrapConfig, type BootstrapConfig } from "./schema.js";

export class ConfigLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ConfigLoadError";
  }
}

export async function loadBootstrapConfig(path?: string): Promise<BootstrapConfig> {
  if (!path) return defaultBootstrapConfig;

  const configPath = resolve(path);
  try {
    await access(configPath);
    const raw = await readFile(configPath, "utf8");
    return bootstrapConfigSchema.parse(parse(raw));
  } catch (error) {
    if (error instanceof ZodError) {
      const fields = error.issues.map((issue) => issue.path.join(".") || "root").join(", ");
      throw new ConfigLoadError("Invalid configuration at " + configPath + "; invalid field(s): " + fields);
    }
    if (error instanceof Error && error.name === "YAMLParseError") {
      throw new ConfigLoadError("Invalid YAML at " + configPath);
    }
    throw new ConfigLoadError("Unable to load configuration at " + configPath, { cause: error });
  }
}

