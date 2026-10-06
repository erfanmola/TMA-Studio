const forbiddenModules = new Set(["bunium", "bun"]);

export function rendererBoundaryPlugin() {
  return {
    name: "studio-renderer-boundary",
    enforce: "pre",
    resolveId(source) {
      if (
        forbiddenModules.has(source) ||
        source.startsWith("node:") ||
        source.startsWith("bun:")
      ) {
        this.error(`Renderer cannot import host or native module: ${source}`);
      }
      return null;
    },
  };
}
