import { demoPackage } from "@/mocks/demoPackage";
import { parseMasterCollectionPackage } from "./schema";
import type { MasterCollectionPackage } from "./types";

export async function resolveInstallCode(code: string): Promise<MasterCollectionPackage> {
  const normalized = code.trim();

  if (normalized.toUpperCase() === "DEMO") {
    return parseMasterCollectionPackage(demoPackage);
  }

  const apiBase = import.meta.env.VITE_MASTER_COLLECTION_API_BASE_URL;
  if (!apiBase) {
    throw new Error("Use DEMO until the Master Collection package API is configured.");
  }

  const response = await fetch(`${apiBase.replace(/\/$/, "")}/api/install-code/resolve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code: normalized }),
  });

  if (!response.ok) {
    throw new Error(`Install code could not be resolved (${response.status}).`);
  }

  const payload = await response.json();
  const packageData = "package" in payload ? payload.package : payload;

  return parseMasterCollectionPackage(packageData);
}
