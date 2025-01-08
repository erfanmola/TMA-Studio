import { BrowserWindow, shell } from "electron";

import { ipcMainPreferences } from "./init";
import { is } from "@electron-toolkit/utils";
import { join } from "node:path";

export const createWindowWelcome = (): void => {
    ipcMainPreferences.windows.welcome = new BrowserWindow({
        title: "TMA Studio Welcome",
        width: 720,
        height: 512,
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            sandbox: false,
            contextIsolation: true,
            devTools: is.dev,
        },
        darkTheme: ipcMainPreferences.theme.mode === 'dark',
        resizable: false,
        frame: false,
        center: true,
        alwaysOnTop: true,
    });

    ipcMainPreferences.windows.welcome.on('ready-to-show', () => {
        if (!ipcMainPreferences.windows.welcome) return;
        ipcMainPreferences.windows.welcome.show()
    })

    ipcMainPreferences.windows.welcome.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
    })

    if (is.dev && process.env.ELECTRON_RENDERER_URL) {
        ipcMainPreferences.windows.welcome.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
        ipcMainPreferences.windows.welcome.loadFile(join(__dirname, '../renderer/index.html'))
    }
}