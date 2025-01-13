import { BrowserWindow, Tray, shell } from "electron";

import { attachTitleBarToWindow } from "@electron-uikit/titlebar/main";
import { ipcMainPreferences } from "./init";
import { is } from "@electron-toolkit/utils";
import { join } from "node:path";

export const createWindowMain = (): void => {
	ipcMainPreferences.windows.main = new BrowserWindow({
		title: "TMA Studio",
		enableLargerThanScreen: true,
		width: 1820,
		height: 1080,
		minWidth: 1280,
		minHeight: 1024,
		show: false,
		autoHideMenuBar: true,
		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
			sandbox: false,
			contextIsolation: true,
			webSecurity: false,
			webviewTag: true,
			devTools: is.dev,
		},
		darkTheme: ipcMainPreferences.theme.mode === "dark",
		resizable: true,
		frame: false,
		titleBarStyle: "hidden",
		titleBarOverlay: {
			color:
				ipcMainPreferences.theme.window_widgets[ipcMainPreferences.theme.mode]
					.bg,
			symbolColor:
				ipcMainPreferences.theme.window_widgets[ipcMainPreferences.theme.mode]
					.color,
			height: 32,
		},
	});

	attachTitleBarToWindow(ipcMainPreferences.windows.main);

	ipcMainPreferences.windows.main.webContents.on(
		"before-input-event",
		(event, input) => {
			if (
				input.control || // Checks for Ctrl key on Windows/Linux
				input.meta // Checks for Command key on macOS
			) {
				if (!ipcMainPreferences.windows.main) return;

				const allowedKeys = ["a", "c", "v", "x", "q", "f4"];

				if (!allowedKeys.includes(input.key)) {
					event.preventDefault(); // Prevents default behavior of Ctrl/Command shortcuts
					ipcMainPreferences.windows.main.webContents.send(
						"shortcut-pressed",
						input,
					);
				}
			}
		},
	);

	ipcMainPreferences.windows.main.webContents.on(
		"will-attach-webview",
		(_, webPreferences) => {
			webPreferences.preload = join(__dirname, "../preload/webview.js");
		},
	);

	ipcMainPreferences.windows.main.on("ready-to-show", () => {
		if (!ipcMainPreferences.windows.main) return;
		ipcMainPreferences.windows.main.webContents.setZoomFactor(
			ipcMainPreferences.zoom.level,
		);
		ipcMainPreferences.windows.main.show();
	});

	ipcMainPreferences.windows.main.webContents.setWindowOpenHandler(
		(details) => {
			shell.openExternal(details.url);
			return { action: "deny" };
		},
	);

	ipcMainPreferences.windows.main.on("close", (e) => {
		if (!ipcMainPreferences.windows.main) return;

		if (BrowserWindow.getAllWindows().length > 1) {
			e.preventDefault();

			ipcMainPreferences.windows.main.minimize();
			if (ipcMainPreferences.tray && !ipcMainPreferences.tray.isDestroyed()) {
				ipcMainPreferences.tray.destroy();
			}

			ipcMainPreferences.tray = new Tray(
				join(__dirname, "../../icons/tray.png"),
			);
			ipcMainPreferences.tray.addListener("click", () => {
				if (!ipcMainPreferences.windows.main) return;

				ipcMainPreferences.tray?.destroy();
				ipcMainPreferences.windows.main.show();
			});
		}
	});

	if (is.dev && process.env.ELECTRON_RENDERER_URL) {
		ipcMainPreferences.windows.main.loadURL(process.env.ELECTRON_RENDERER_URL);
	} else {
		ipcMainPreferences.windows.main.loadFile(
			join(__dirname, "../renderer/index.html"),
		);
	}
};
