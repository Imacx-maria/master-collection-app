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
  kind: z.enum(["image-src", "image-asset-id", "background-url"]),
  path: z.array(z.union([z.string(), z.number()])),
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

export const masterCollectionPackageSchema = z.object({
  schemaVersion: z.literal("master-collection-package@1"),
  packageId: z.string().min(1),
  productId: z.string().optional(),
  name: z.string().min(1),
  version: z.string().min(1),
  xscpData: z.unknown(),
  fonts: z.array(fontRequirementSchema),
  assets: z.array(assetRequirementSchema),
  warnings: z.array(warningSchema).optional(),
});

export function parseMasterCollectionPackage(input: unknown): MasterCollectionPackage {
  return masterCollectionPackageSchema.parse(input);
}
