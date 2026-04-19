export interface MasterCollectionPackage {
  schemaVersion: "master-collection-package@1";
  packageId: string;
  productId?: string;
  name: string;
  version: string;
  xscpData: unknown;
  fonts: SimpleFontRequirement[];
  assets: SimpleAssetRequirement[];
  warnings?: SimplePackageWarning[];
}

export interface SimpleFontRequirement {
  family: string;
  weights?: Array<string | number>;
  styles?: string[];
  required: boolean;
  installNote?: string;
}

export interface SimpleAssetRequirement {
  key: string;
  fileName: string;
  url: string;
  mimeType?: string;
  required: boolean;
  patchTargets: SimpleAssetPatchTarget[];
}

export interface SimpleAssetPatchTarget {
  kind: "image-src" | "image-asset-id" | "background-url";
  path: Array<string | number>;
}

export interface SimplePackageWarning {
  code:
    | "CMS_NOT_SUPPORTED"
    | "CUSTOM_CODE_NOT_SUPPORTED"
    | "INTERACTIONS_LIMITED"
    | "FONT_MANUAL_INSTALL";
  message: string;
}
