import { BrowserWindow, app, ipcMain } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { ipcMainPreferences, store } from './init';

import { createWindowMain } from './window-main';
import { createWindowWelcome } from './window-welcome';
import { initializeIPCHandlers } from './ipcHandler';
import { registerContextMenuListener } from '@electron-uikit/contextmenu/main';
import {
  registerTitleBarListener
} from '@electron-uikit/titlebar'
import { useUIKit } from '@electron-uikit/core/main'

declare module 'electron' {
  interface BrowserWindow {
    platform?: string;
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('studio.tma');

  useUIKit();
  registerTitleBarListener();
  registerContextMenuListener();

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  });

  ipcMainPreferences.theme.mode = store.get("preferences.theme_mode");
  ipcMainPreferences.zoom.level = store.get("preferences.ui.scale");

  initializeIPCHandlers();

  if (store.get("preferences.intro.skip")) {
    createWindowMain();
  } else {
    createWindowWelcome();

    ipcMain.on('skip-intro', () => {
      ipcMainPreferences.windows.welcome?.close();
      createWindowMain();
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (store.get("preferences.intro.skip")) {
        createWindowMain();
      } else {
        createWindowWelcome();
      }
    }
  });
})

app.on('window-all-closed', () => {
  ipcMainPreferences.tray?.destroy();
  app.quit()
});
