import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "electron-vite";
import solid from "vite-plugin-solid";

export default defineConfig({
	main: {
		build: {
			externalizeDeps: {
				exclude: ["electron-store"],
			},
		},
	},
	preload: {
		build: {
			rollupOptions: {
				output: {
					format: "cjs",
				},
				input: {
					index: resolve(__dirname, "src/preload/index.ts"),
					webview: resolve(__dirname, "src/preload/webview.ts"),
				},
			},
			externalizeDeps: {
				exclude: ["electron-store"],
			},
		},
		plugins: [],
	},
	renderer: {
		resolve: {
			alias: {
				"@renderer": resolve("src/renderer/src"),
			},
		},
		plugins: [tailwindcss(), solid()],
		css: {
			postcss: {
				plugins: [],
			},
		},
		build: {
			rollupOptions: {
				input: {
					index: resolve(__dirname, "src/renderer/index.html"),
					floating: resolve(__dirname, "src/renderer/floating.html"),
					iframe: resolve(__dirname, "src/renderer/iframe.html"),
				},
			},
		},
	},
});
