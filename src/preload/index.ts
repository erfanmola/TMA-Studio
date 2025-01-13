import { clipboard, contextBridge, ipcRenderer } from "electron";

import { electronAPI } from "@electron-toolkit/preload";

const api = {
	store: {
		get(key: string) {
			return ipcRenderer.sendSync("electron-store-get", key);
		},
		set(property, val) {
			ipcRenderer.send("electron-store-set", property, val);
		},
	},
	version: {
		get() {
			return ipcRenderer.sendSync("electron-version-get");
		},
	},
	haptic: {
		vibrate() {
			return ipcRenderer.send("haptic-feedback");
		},
	},
	clipboard: {
		getText() {
			return clipboard.readText();
		},
		setText(text: string) {
			return clipboard.writeText(text);
		},
		clear() {
			return clipboard.clear();
		},
	},
	project: {
		open: (project: string, platform: string) => {
			ipcRenderer.send("project-open", project, platform);
		},
		close: (project: string, platform: string, popup: boolean) => {
			ipcRenderer.send("project-close", project, platform, popup);
		},
	},
	onShortcutPressed: (callback) => ipcRenderer.on("shortcut-pressed", callback),
};

if (process.contextIsolated) {
	try {
		contextBridge.exposeInMainWorld("electron", electronAPI);
		contextBridge.exposeInMainWorld("api", api);
	} catch (error) {
		console.error(error);
	}
} else {
	// @ts-ignore (define in dts)
	window.electron = electronAPI;
	// @ts-ignore (define in dts)
	window.api = api;
}
