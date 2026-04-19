import fsp from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const officialBundlePath = path.join(rootDir, "bundle.zip");
const outputDir = path.join(rootDir, "bundles");
const outputPath = path.join(outputDir, "master-collection-webflow-app.zip");

async function assertExists(targetPath, label) {
  try {
    await fsp.access(targetPath);
  } catch {
    throw new Error(`${label} is missing: ${targetPath}`);
  }
}

async function placeBundle() {
  await assertExists(officialBundlePath, "Webflow CLI bundle");
  await fsp.mkdir(outputDir, { recursive: true });
  await fsp.copyFile(officialBundlePath, outputPath);

  process.stdout.write(`Created Webflow upload bundle: ${outputPath}\n`);
}

placeBundle().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
