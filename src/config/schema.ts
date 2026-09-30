import { z } from "zod";

export const logLevelSchema = z.enum(["debug", "info", "warn", "error"]);

export const impactConfigSchema = z
  .object({
    maxDepth: z.number().int().min(0).max(8).default(2),
    maxCandidateFiles: z.number().int().positive().max(10_000).default(80),
    maxFileBytes: z.number().int().positive().max(10_000_000).default(512 * 1024),
    includeTests: z.boolean().default(true),
    includeDocs: z.boolean().default(true),
    ignoredPathSegments: z.array(z.string().min(1)).min(1).default([".git", "node_modules", "vendor", "dist", "build", "coverage"]),
  })
  .strict()
  .default({
    maxDepth: 2,
    maxCandidateFiles: 80,
    maxFileBytes: 512 * 1024,
    includeTests: true,
    includeDocs: true,
    ignoredPathSegments: [".git", "node_modules", "vendor", "dist", "build", "coverage"],
  });

export const bootstrapConfigSchema = z
  .object({
    version: z.literal(1),
    logging: z
      .object({ level: logLevelSchema.default("info") })
      .strict()
      .default({ level: "info" }),
    impact: impactConfigSchema,
  })
  .strict();

export type BootstrapConfig = z.infer<typeof bootstrapConfigSchema>;

export const defaultBootstrapConfig: BootstrapConfig = {
  version: 1,
  logging: { level: "info" },
  impact: {
    maxDepth: 2,
    maxCandidateFiles: 80,
    maxFileBytes: 512 * 1024,
    includeTests: true,
    includeDocs: true,
    ignoredPathSegments: [".git", "node_modules", "vendor", "dist", "build", "coverage"],
  },
};

