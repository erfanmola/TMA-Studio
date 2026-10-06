// Pinned to Solid 2.0 RC (see package.json: solid-js@2.0.0-rc.0 +
// vite-plugin-solid@3.0.0-next.x, the matching "next" dist-tag for the
// plugin -- the 2.x plugin line only supports Solid 1.x). Solid 2.0 was
// still pre-1.0-final as of this template's creation; if a compatibility
// issue shows up, pin back to solid-js@^1.9 + vite-plugin-solid@^2.11.
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { rendererBoundaryPlugin } from "../../scripts/renderer-boundary.mjs";

// Base "/" matters for prod: the bunium main process serves the built
// output through the custom "bunium://app/" scheme (see
// app.setAppRoot() + BuniumSchemeHandlerFactory), so asset URLs must
// resolve relative to that scheme root, same as they would for any
// normal static site -- no special base needed beyond Vite's default.
export default defineConfig({
  plugins: [rendererBoundaryPlugin(), solid()],
  server: {
    port: 5173,
    strictPort: true,
  },
});
