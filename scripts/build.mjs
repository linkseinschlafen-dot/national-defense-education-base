import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const outputDirectory = resolve(projectRoot, "assets/js");

await mkdir(outputDirectory, { recursive: true });

await build({
  entryPoints: [resolve(projectRoot, "src/main.js")],
  outfile: resolve(outputDirectory, "main.bundle.js"),
  bundle: true,
  format: "esm",
  target: ["es2022"],
  minify: true,
  legalComments: "none",
  sourcemap: false,
  logLevel: "info",
});

await Promise.all([
  copyFile(
    resolve(projectRoot, "node_modules/@google/model-viewer/dist/model-viewer.min.js"),
    resolve(outputDirectory, "model-viewer.min.js"),
  ),
  copyFile(
    resolve(projectRoot, "node_modules/meshoptimizer/meshopt_decoder.js"),
    resolve(outputDirectory, "meshopt_decoder.js"),
  ),
]);

console.log("Runtime dependencies bundled into assets/js.");
