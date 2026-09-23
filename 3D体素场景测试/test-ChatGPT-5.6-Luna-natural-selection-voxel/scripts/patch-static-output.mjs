import { readFile, writeFile } from "node:fs/promises";

const outputPath = new URL("../dist/index.html", import.meta.url);
const html = await readFile(outputPath, "utf8");
// Vite places module scripts in <head>; modules are deferred by default. Keep
// that timing when converting the bundle to a file://-compatible classic script.
const patched = html.replace('<script type="module" crossorigin src=', '<script defer src=');

if (patched === html) {
  throw new Error("Static output script tag was not found.");
}

await writeFile(outputPath, patched, "utf8");
