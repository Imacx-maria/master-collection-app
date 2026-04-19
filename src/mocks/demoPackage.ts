import type { MasterCollectionPackage } from "@/lib/package/types";

const demoAssetUrl =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
      <rect width="960" height="540" fill="#f5f5f5"/>
      <rect x="80" y="70" width="800" height="400" fill="#ffffff" stroke="#171717" stroke-width="2"/>
      <text x="120" y="170" font-family="Inter, Arial, sans-serif" font-size="56" fill="#171717">Master Collection</text>
      <text x="120" y="235" font-family="Inter, Arial, sans-serif" font-size="28" fill="#737373">DEMO install asset</text>
      <rect x="120" y="310" width="240" height="72" fill="#171717"/>
      <text x="150" y="357" font-family="Inter, Arial, sans-serif" font-size="24" fill="#fafafa">Ready to paste</text>
    </svg>`,
  );

export const demoPackage: MasterCollectionPackage = {
  schemaVersion: "master-collection-package@1",
  packageId: "pkg_demo_001",
  productId: "demo-product",
  name: "Demo Component",
  version: "1.0.0",
  fonts: [
    {
      family: "Inter",
      weights: [400, 600],
      styles: ["normal"],
      required: true,
      installNote: "Inter is used by the demo component. Install it in Webflow before pasting.",
    },
  ],
  assets: [
    {
      key: "demo-hero",
      fileName: "master-collection-demo.svg",
      url: demoAssetUrl,
      mimeType: "image/svg+xml",
      required: true,
      patchTargets: [
        { kind: "image-src", path: ["payload", "nodes", 0, "data", "attr", "src"] },
        { kind: "image-asset-id", path: ["payload", "nodes", 0, "data", "img", "id"] },
      ],
    },
  ],
  warnings: [
    {
      code: "FONT_MANUAL_INSTALL",
      message: "Custom font installation is manual in the MVP.",
    },
  ],
  xscpData: {
    type: "@webflow/XscpData",
    payload: {
      assets: [],
      nodes: [
        {
          _id: "mc_demo_image",
          type: "Image",
          data: {
            attr: {
              src: demoAssetUrl,
              alt: "Master Collection demo asset",
            },
            img: {
              id: "__MASTER_COLLECTION_ASSET_DEMO_HERO_ID__",
            },
            displayName: "Master Collection Demo Image",
          },
        },
      ],
      ix3: {
        interactions: [
          {
            pageId: "__MASTER_COLLECTION_CURRENT_PAGE_ID__",
            scope: {
              type: "PAGE",
              value: ["__MASTER_COLLECTION_CURRENT_PAGE_ID__"],
            },
          },
        ],
        timelines: [
          {
            pageId: "__MASTER_COLLECTION_CURRENT_PAGE_ID__",
          },
        ],
      },
    },
  },
};
