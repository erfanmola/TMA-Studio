import type { IPCMainPreferences } from "../renderer/src/types";
import { Menu } from "electron";
import Store from "electron-store";
import { defaultPreferences } from "./preferences";

// Setup the application menu
Menu.setApplicationMenu(
	Menu.buildFromTemplate([
		{
			label: "File",
			submenu: [{ role: "quit" }],
		},
		{
			label: "Edit",
			submenu: [
				{ role: "undo" },
				{ role: "redo" },
				{ type: "separator" },
				{ role: "cut" },
				{ role: "copy" },
				{ role: "paste" },
				{ role: "selectAll" },
			],
		},
	]),
);

// Initialize the store
Store.initRenderer();

export const store: any = new Store({
	defaults: {
		preferences: defaultPreferences,
	},
});

// Initialize the ipcMain Preferences Store
export const ipcMainPreferences: IPCMainPreferences = {
	theme: {
		mode: "light",
		window_widgets: {
			light: {
				bg: "#f5f5f5",
				color: "#252525",
			},
			dark: {
				bg: "#212529",
				color: "#f5f5f5",
			},
		},
	},
	zoom: {
		level: 1,
	},
	windows: {
		popups: {},
		main: undefined,
		welcome: undefined,
	},
	tray: undefined,
};
