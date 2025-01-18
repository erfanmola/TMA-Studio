import { app, dialog, ipcMain, shell } from "electron";
import { ipcMainPreferences, store } from "./init";

import { createWindowProjectFloating } from "./window-project-floating";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";

export const initializeIPCHandlers = () => {
	initializeIPCStore();
	initializeIPCMisc();
	initializeIPCProject();
	initializeIPCSettings();
};

const initializeIPCStore = () => {
	ipcMain.on("electron-store-get", async (event, val) => {
		event.returnValue = store.get(val);
	});

	ipcMain.on("electron-store-set", async (_, key, val) => {
		store.set(key, val);
	});
};

const initializeIPCMisc = () => {
	ipcMain.on("electron-version-get", async (event) => {
		event.returnValue = app.getVersion();
	});

	ipcMain.on("update-available", async (_, version) => {
		if (ipcMainPreferences.windows.main) {
			try {
				const { response } = await dialog.showMessageBox(
					ipcMainPreferences.windows.main,
					{
						title: "New Version Available",
						message: `There is a newer version of TMA Studio available. Please update the app to version ${version}.`,
						buttons: ["Update", "Later"],
						defaultId: 0, // "Update" will be preselected
						cancelId: 1, // "Later" will act as cancel
					},
				);

				if (response === 0) {
					// User chose "Update"
					await shell.openExternal("https://tma-studio.pages.dev/");
					app.quit(); // Quit the app only after opening the URL
				}
			} catch (error) {
				console.error(
					"Failed to display update dialog or open the URL:",
					error,
				);
			}
		}
	});

	ipcMain.on("haptic-feedback", async (_) => {
		if (os.platform() === "darwin") {
			execFile(
				path.resolve(app.getAppPath(), "resources", "bin", "macos-haptic"),
			);
		}
	});
};

const initializeIPCProject = () => {
	ipcMain.on("project-open", async (_, project, platform) => {
		createWindowProjectFloating(project, platform);
	});

	ipcMain.on("project-close", async (_, project, _platform, popup) => {
		if (_.sender.id !== ipcMainPreferences.windows.main?.webContents.id) {
			_.sender.close();

			const windowItem = ipcMainPreferences.windows.popups[project].find(
				(item) => item.webContents.id === _.sender.id,
			);
			if (windowItem) {
				ipcMainPreferences.windows.popups[project].splice(
					ipcMainPreferences.windows.popups[project].indexOf(windowItem),
					1,
				);
			}
		} else if (
			_.sender.id === ipcMainPreferences.windows.main?.webContents.id &&
			popup
		) {
			if (ipcMainPreferences.windows.popups[project]) {
				for (const window of ipcMainPreferences.windows.popups[project]) {
					window.close();
					window.destroy();
				}
			}
			delete ipcMainPreferences.windows.popups[project];
		}
	});
};

const initializeIPCSettings = () => {
	ipcMain.on("ui-scale-changed", async (_, ui_scale) => {
		ipcMainPreferences.zoom.level = ui_scale;
		if (
			ipcMainPreferences.windows.main &&
			!ipcMainPreferences.windows.main.isDestroyed()
		) {
			ipcMainPreferences.windows.main.webContents.setZoomFactor(
				ipcMainPreferences.zoom.level,
			);
		}
	});

	ipcMain.on("theme-mode-changed", async (_, theme_mode) => {
		ipcMainPreferences.theme.mode = theme_mode;
		if (
			ipcMainPreferences.windows.main &&
			!ipcMainPreferences.windows.main.isDestroyed()
		) {
			try {
				ipcMainPreferences.windows.main.setTitleBarOverlay({
					color:
						ipcMainPreferences.theme.window_widgets[
							ipcMainPreferences.theme.mode
						].bg,
					symbolColor:
						ipcMainPreferences.theme.window_widgets[
							ipcMainPreferences.theme.mode
						].color,
					height: 32,
				});
			} catch (e) {}
		}
	});
};
