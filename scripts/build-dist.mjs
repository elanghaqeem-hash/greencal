import { copyFile, mkdir, readFile, rm, stat } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";

// P0: publish every external asset the production HTML requires.
// Never silently deploy an index.html with broken JavaScript imports.
const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
const required = [
  "index.html",
  "auth-client.js",
  "assets/guide-learning.js",
];
const html = await readFile(join(root, "index.html"), "utf8");
for (const asset of required.slice(1)) {
  const variants = [asset, "./" + asset, "/" + asset];
  if (!variants.some(ref => html.includes(ref))) {
    throw new Error("Asset not referenced by index.html: " + asset);
  }
  const f = join(root, asset);
  const meta = await stat(f);
  if (!meta.isFile() || meta.size < 100) {
    throw new Error("Required GreenCal asset missing or empty: " + asset);
  }
}
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
const enterpriseAssets = ["enterprise.html", "assets/enterprise.css", "assets/enterprise.js", "assets/enterprise-analytics.js", "assets/enterprise-release.js", "assets/enterprise-book6.js", "assets/enterprise-discovery.js", "assets/enterprise-discovery.css"];
for (const asset of [...required, ...enterpriseAssets]) {
  const target = join(dist, asset === "enterprise.html" ? "enterprise/index.html" : asset);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(root, asset), target);
  const copied = await stat(target);
  const original = await stat(join(root, asset));
  if (copied.size !== original.size) {
    throw new Error("Asset copy size differs: " + asset);
  }
  console.log("P0 asset:", asset, copied.size, "bytes");
}
console.log("GreenCal dist is complete; Cloudflare can deploy ./dist.");
