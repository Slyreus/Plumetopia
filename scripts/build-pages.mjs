import { copyFile, cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateSeo } from "./generate-seo.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptDirectory, "..");
const outputDirectory = path.join(rootDirectory, "_site");

if (path.dirname(outputDirectory) !== rootDirectory || path.basename(outputDirectory) !== "_site") {
  throw new Error("Répertoire de publication inattendu.");
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const rootFiles = [
  "index.html",
  "app.js",
  "admin.js",
  "auth.js",
  "backend.js",
  "site-config.js",
  "manifest.webmanifest",
  "styles.css",
];
await Promise.all(
  rootFiles.map((filename) =>
    copyFile(path.join(rootDirectory, filename), path.join(outputDirectory, filename)),
  ),
);

await cp(path.join(rootDirectory, "data"), path.join(outputDirectory, "data"), {
  recursive: true,
});
await cp(
  path.join(rootDirectory, "assets", "brand"),
  path.join(outputDirectory, "assets", "brand"),
  { recursive: true },
);

const sourceBirdDirectory = path.join(rootDirectory, "assets", "birds", "oiseaux_hd");
const outputBirdDirectory = path.join(outputDirectory, "assets", "birds", "oiseaux_hd");
await mkdir(outputBirdDirectory, { recursive: true });
const birdAssets = await readdir(sourceBirdDirectory, { withFileTypes: true });
await Promise.all(
  birdAssets
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png"))
    .map((entry) =>
      copyFile(
        path.join(sourceBirdDirectory, entry.name),
        path.join(outputBirdDirectory, entry.name),
      ),
    ),
);
await copyFile(
  path.join(rootDirectory, "assets", "birds", "bird-placeholder.svg"),
  path.join(outputDirectory, "assets", "birds", "bird-placeholder.svg"),
);

await writeFile(path.join(outputDirectory, ".nojekyll"), "", "utf8");
await generateSeo({
  outputDirectory,
  siteUrl: process.env.SITE_URL,
});

console.log(`Site GitHub Pages prêt dans ${outputDirectory}.`);
