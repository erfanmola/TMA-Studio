import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";

const studio = createRequire(
  new URL("../../apps/studio/package.json", import.meta.url),
);
const ui = createRequire(
  new URL("../../packages/ui/package.json", import.meta.url),
);

function versionOf(from: NodeJS.Require, name: string): string {
  return from(`${name}/package.json`).version;
}

describe("Solid compiler and runtime", () => {
  // The JSX compiler emits runtime calls (for example spread with merged
  // sources) whose shape must match the installed @solidjs/web; a mismatch
  // renders props as "0"/"1" attributes instead of class, ARIA and state.
  test("compiler, signals and web runtime come from the same release", () => {
    const runtime = versionOf(studio, "solid-js");
    const plugin = createRequire(
      studio.resolve("vite-plugin-solid/package.json"),
    );
    const compilerHost = createRequire(
      plugin.resolve("@solidjs/vite-plugin/package.json"),
    );
    const solid = createRequire(studio.resolve("solid-js/package.json"));

    expect(versionOf(studio, "@solidjs/web")).toBe(runtime);
    expect(versionOf(ui, "solid-js")).toBe(runtime);
    expect(versionOf(ui, "@solidjs/web")).toBe(runtime);
    expect(versionOf(solid, "@solidjs/signals")).toBe(runtime);
    expect(versionOf(compilerHost, "@solidjs/compiler")).toBe(runtime);
    expect(versionOf(compilerHost, "@solidjs/babel-plugin")).toBe(runtime);
  });
});
