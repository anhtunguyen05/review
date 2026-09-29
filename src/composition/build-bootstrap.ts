import { loadBootstrapConfig } from "../config/loader.js";
import { JsonLogger } from "../infrastructure/logging/json-logger.js";

export async function buildBootstrap(configPath?: string) {
  const config = await loadBootstrapConfig(configPath);
  const logger = new JsonLogger(config.logging.level);
  return { config, logger };
}

