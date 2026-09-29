import { z } from "zod";

export const logLevelSchema = z.enum(["debug", "info", "warn", "error"]);

export const bootstrapConfigSchema = z
  .object({
    version: z.literal(1),
    logging: z
      .object({ level: logLevelSchema.default("info") })
      .strict()
      .default({ level: "info" }),
  })
  .strict();

export type BootstrapConfig = z.infer<typeof bootstrapConfigSchema>;

export const defaultBootstrapConfig: BootstrapConfig = {
  version: 1,
  logging: { level: "info" },
};

