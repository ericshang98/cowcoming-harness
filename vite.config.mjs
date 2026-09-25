import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  plugins: [
    {
      name: "include-license-notices",
      generateBundle() {
        for (const [name, license] of [
          ["react", "LICENSE"],
          ["react-dom", "LICENSE"],
          ["scheduler", "LICENSE"],
          ["three", "LICENSE"],
          ["vite", "LICENSE.md"],
        ]) {
          const source = readFileSync(
            name === "three"
              ? join(dirname(require.resolve("three")), "..", license)
              : join(dirname(require.resolve(`${name}/package.json`)), license),
            "utf8",
          );
          this.emitFile({
            type: "asset",
            fileName: `licenses/${name}.txt`,
            source,
          });
        }
        for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md"])
          this.emitFile({
            type: "asset",
            fileName: name,
            source: readFileSync(new URL(name, import.meta.url), "utf8"),
          });
      },
    },
  ],
  build: { outDir: "dist", emptyOutDir: true },
});
