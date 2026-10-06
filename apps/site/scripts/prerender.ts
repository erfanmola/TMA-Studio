import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

type ManifestEntry = { css?: string[]; file: string; isEntry?: boolean };

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const manifestPath = resolve(dist, ".vite/manifest.json");
const manifest: Record<string, ManifestEntry> = JSON.parse(
  await readFile(manifestPath, "utf8"),
);
const client = manifest["src/client.ts"];
if (!client?.css?.length) throw new Error("Client build emitted no stylesheet");

const server = await import(resolve(root, ".cache/ssr/entry-server.js"));

// Pages are static: drop the styles-only client script and build manifest.
await rm(resolve(dist, client.file));
await rm(resolve(dist, ".vite"), { force: true, recursive: true });

let count = 0;
const write = async (file: string, html: string) => {
  const target = resolve(dist, file);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, html);
  count += 1;
};

await write("index.html", server.renderChooser(client.css));
for (const locale of server.LOCALES) {
  for (const route of server.ROUTES) {
    await write(
      server.pageFile(locale, route),
      server.renderPage(locale, route, client.css),
    );
  }
}
console.log(`Prerendered ${count} pages into ${dist}`);
