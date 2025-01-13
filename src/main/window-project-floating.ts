import { ipcMainPreferences, store } from "./init";

import { BrowserWindow } from "electron";
import type { Project } from "../renderer/src/types";
import type { TelegramPlatform } from "../renderer/src/utils/themes";
import { is } from "@electron-toolkit/utils";
import { join } from "node:path";

export const createWindowProjectFloating = (
	project: Project["id"],
	platform: TelegramPlatform,
) => {
	if (!(project in ipcMainPreferences.windows.popups)) {
		ipcMainPreferences.windows.popups[project] = [];
	}

	if (
		ipcMainPreferences.windows.popups[project].find(
			(item) => item.platform === platform,
		)
	)
		return;

	const window = new BrowserWindow({
		title: "TMA Studio Project",
		width: store.get("preferences.project.floating_window_size"),
		height: store.get("preferences.project.floating_window_size") * 2.4,
		show: false,
		closable: false,
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
		resizable: false,
		alwaysOnTop: store.get("preferences.project.floating_window_on_top"),
		frame: false,
		transparent: true,
	});

	window.platform = platform;
	ipcMainPreferences.windows.popups[project].push(window);

	window.on("ready-to-show", () => {
		window.show();
	});

	window.on("closed", () => {
		ipcMainPreferences.windows.main?.webContents.send(
			`sync-project-${project}-${platform}`,
		);
		ipcMainPreferences.windows.popups[project] =
			ipcMainPreferences.windows.popups[project].filter(
				(win) => !win.isDestroyed(),
			);
	});

	window.webContents.on("will-attach-webview", (_, webPreferences) => {
		webPreferences.preload = join(__dirname, "../preload/webview.js");
	});

	if (is.dev && process.env.ELECTRON_RENDERER_URL) {
		window.loadURL(
			`${process.env.ELECTRON_RENDERER_URL}/floating.html#/${project}/${platform}`,
		);
	} else {
		window.loadFile(join(__dirname, "../renderer/floating.html"), {
			hash: `/${project}/${platform}`,
		});
	}
};
