import { electronApp, optimizer } from "@electron-toolkit/utils";
import { registerContextMenuListener } from "@electron-uikit/contextmenu/main";
import { useUIKit } from "@electron-uikit/core/main";
import { registerTitleBarListener } from "@electron-uikit/titlebar";
import { app, BrowserWindow, ipcMain } from "electron";
import { ipcMainPreferences, store } from "./init";
import { initializeIPCHandlers } from "./ipcHandler";
import { createWindowMain } from "./window-main";
import { createWindowWelcome } from "./window-welcome";

declare module "electron" {
	interface BrowserWindow {
		platform?: string;
	}
}

app.whenReady().then(() => {
	electronApp.setAppUserModelId("studio.tma");

	useUIKit();
	registerTitleBarListener();
	registerContextMenuListener();

	app.on("browser-window-created", (_, window) => {
		optimizer.watchWindowShortcuts(window);
	});

	ipcMainPreferences.theme.mode = store.get("preferences.theme_mode");
	ipcMainPreferences.zoom.level = store.get("preferences.ui.scale");

	initializeIPCHandlers();

	if (store.get("preferences.intro.skip")) {
		createWindowMain();
	} else {
		createWindowWelcome();

		ipcMain.on("skip-intro", () => {
			ipcMainPreferences.windows.welcome?.close();
			createWindowMain();
		});
	}

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			if (store.get("preferences.intro.skip")) {
				createWindowMain();
			} else {
				createWindowWelcome();
			}
		}
	});
});

app.on("window-all-closed", () => {
	ipcMainPreferences.tray?.destroy();
	app.quit();
});
