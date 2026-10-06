import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import solid from "vite-plugin-solid";

const sourceRoot = fileURLToPath(new URL("./src/", import.meta.url));
const forbidden = new Set(["bun", "bunium"]);

// Site pages must stay host-free: no Bun, Bunium or Node imports from site
// sources. Toolchain-internal imports (SSR helpers) are not site code.
function siteBoundary(): Plugin {
  return {
    enforce: "pre",
    name: "site-boundary",
    resolveId(source, importer) {
      if (!importer?.startsWith(sourceRoot)) return null;
      if (
        forbidden.has(source) ||
        source.startsWith("bun:") ||
        source.startsWith("node:")
      ) {
        this.error(`Site source cannot import host module: ${source}`);
      }
      return null;
    },
  };
}

// The client build only emits styles, fonts and media; pages are rendered once
// at build time by scripts/prerender.ts from the SSR bundle.
export default defineConfig({
  base: "./",
  build: {
    emptyOutDir: true,
    manifest: true,
    rollupOptions: { input: "src/client.ts" },
  },
  plugins: [siteBoundary(), solid({ ssr: true })],
});
