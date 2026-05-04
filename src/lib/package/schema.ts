import { z } from "zod";
import type { MasterCollectionPackage } from "./types";

const fontRequirementSchema = z.object({
  family: z.string().min(1),
  weights: z.array(z.union([z.string(), z.number()])).optional(),
  styles: z.array(z.string()).optional(),
  required: z.boolean(),
  installNote: z.string().optional(),
});

const patchTargetSchema = z.object({
  kind: z.enum(["image-src", "image-srcset", "image-asset-id", "background-url", "text-url"]),
  path: z.array(z.union([z.string(), z.number()])),
  sourceUrl: z.string().optional(),
});

const assetRequirementSchema = z.object({
  key: z.string().min(1),
  fileName: z.string().min(1),
  url: z.string().min(1),
  mimeType: z.string().optional(),
  required: z.boolean(),
  patchTargets: z.array(patchTargetSchema),
});

const warningSchema = z.object({
  code: z.enum([
    "CMS_NOT_SUPPORTED",
    "CUSTOM_CODE_NOT_SUPPORTED",
    "INTERACTIONS_LIMITED",
    "FONT_MANUAL_INSTALL",
  ]),
  message: z.string().min(1),
});

const xscpDataSchema = z.unknown().superRefine((value, ctx) => {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "type" in value &&
    (value as { type?: unknown }).type === "flowbridge/app-multipage-payload"
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "xscpData must be one @webflow/XscpData page payload, not a Master Collection multi-page app envelope.",
    });
  }
});

export const masterCollectionPackageSchema = z.object({
  schemaVersion: z.literal("master-collection-package@1"),
  packageId: z.string().min(1),
  productId: z.string().optional(),
  name: z.string().min(1),
  version: z.string().min(1),
  xscpData: xscpDataSchema,
  fonts: z.array(fontRequirementSchema),
  assets: z.array(assetRequirementSchema),
  warnings: z.array(warningSchema).optional(),
  blockedReason: z.string().optional(),
});

export function parseMasterCollectionPackage(input: unknown): MasterCollectionPackage {
  return masterCollectionPackageSchema.parse(input);
}
