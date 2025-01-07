import { BrowserWindow, Menu, Tray, app, dialog, ipcMain, shell } from 'electron'
import {
  attachTitleBarToWindow,
  registerTitleBarListener
} from '@electron-uikit/titlebar'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'

import Store from 'electron-store';
import { defaultPreferences } from './preferences';
import { execFile } from 'node:child_process';
import { join } from 'node:path'
import os from 'node:os';
import path from 'node:path';
import { useUIKit } from '@electron-uikit/core/main'

declare module 'electron' {
  interface BrowserWindow {
    platform?: string;
  }
}

Menu.setApplicationMenu(Menu.buildFromTemplate([
  {
    label: 'File',
    submenu: [
      { role: 'quit' },
    ],
  },
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  },
]));

Store.initRenderer();

const UIPreferences = {
  theme: {
    mode: 'light',
    window_widgets: {
      light: {
        bg: '#f5f5f5',
        color: '#252525',
      },
      dark: {
        bg: '#212529',
        color: '#f5f5f5',
      },
    }
  },
  zoom: {
    level: 1,
  },
};

let tray: Tray | undefined;
let WindowMain: BrowserWindow | undefined;
let WindowWelcome: BrowserWindow | undefined;

const popupWindows: { [key: string]: BrowserWindow[] } = {};

const createMainWindow = (): void => {
  const mainWindow = new BrowserWindow({
    title: "TMA Studio",
    enableLargerThanScreen: true,
    width: 1820,
    height: 1080,
    minWidth: 1280,
    minHeight: 1024,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      webSecurity: false,
      webviewTag: true,
      devTools: is.dev,
      // nodeIntegration: true,
      // nodeIntegrationInSubFrames: true,
    },
    darkTheme: UIPreferences.theme.mode === 'dark',
    resizable: true,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: UIPreferences.theme.window_widgets[UIPreferences.theme.mode].bg,
      symbolColor: UIPreferences.theme.window_widgets[UIPreferences.theme.mode].color,
      height: 32
    }
  });

  attachTitleBarToWindow(mainWindow);

  WindowMain = mainWindow;

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (
      input.control ||  // Checks for Ctrl key on Windows/Linux
      input.meta        // Checks for Command key on macOS
    ) {
      const allowedKeys = ['a', 'c', 'v', 'x', 'q', 'f4'];

      if (!allowedKeys.includes(input.key)) {
        event.preventDefault(); // Prevents default behavior of Ctrl/Command shortcuts
        mainWindow.webContents.send('shortcut-pressed', input);
      }
    }
  });

  mainWindow.webContents.on('will-attach-webview', (_, webPreferences) => {
    webPreferences.preload = join(__dirname, '../preload/webview.js');
  });

  // WindowMain = mainWindow;

  mainWindow.on('ready-to-show', () => {
    mainWindow.webContents.setZoomFactor(UIPreferences.zoom.level);
    mainWindow.show();
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.on('close', (e) => {
    if (BrowserWindow.getAllWindows().length > 1) {
      e.preventDefault();
      mainWindow.minimize();
      if (tray && !tray.isDestroyed()) {
        tray.destroy();
      }
      tray = new Tray(join(__dirname, '../../icons/tray.png'));
      tray.addListener('click', () => {
        tray?.destroy();
        mainWindow.show();
      });
    }
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const createWelcomeWindow = (): void => {
  const mainWindow = new BrowserWindow({
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
    darkTheme: UIPreferences.theme.mode === 'dark',
    resizable: false,
    frame: false,
    center: true,
    alwaysOnTop: true,
  });

  WindowWelcome = mainWindow;

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('studio.tma');

  useUIKit();
  registerTitleBarListener();

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const store: any = new Store({
    defaults: defaultPreferences,
  });

  UIPreferences.theme.mode = store.get("preferences.theme_mode");
  UIPreferences.zoom.level = store.get("preferences.ui.scale");

  // Store
  ipcMain.on('electron-store-get', async (event, val) => {
    event.returnValue = store.get(val);
  });
  ipcMain.on('electron-store-set', async (_, key, val) => {
    store.set(key, val);
  });

  ipcMain.on('electron-version-get', async (event) => {
    event.returnValue = app.getVersion();
  });

  ipcMain.on('update-available', async (_, version) => {
    if (WindowMain) {
      dialog.showMessageBox(WindowMain, {
        title: "New Version Available",
        message: `There is a newer version of TMA Studio available, please update the app to version ${version}.`,
        buttons: ['Update']
      }).then(() => {
        shell.openExternal("https://tma-studio.pages.dev/");
        app.quit();
      });
    }
  });

  // Project
  ipcMain.on('project-open', async (_, project, platform) => {
    if (!(project in popupWindows)) {
      popupWindows[project] = [];
    }

    if (popupWindows[project].find(item => item.platform === platform)) return;

    const window = new BrowserWindow({
      title: "TMA Studio Project",
      width: store.get("preferences.project.floating_window_size"),
      height: store.get("preferences.project.floating_window_size") * 2.4,
      show: false,
      closable: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        webSecurity: false,
        webviewTag: true,
        devTools: is.dev,
      },
      darkTheme: UIPreferences.theme.mode === 'dark',
      resizable: false,
      alwaysOnTop: store.get("preferences.project.floating_window_on_top"),
      frame: false,
      transparent: true,
    });

    window.platform = platform;
    popupWindows[project].push(window);

    window.on('ready-to-show', () => {
      window.show()
    });

    window.on('closed', () => {
      WindowMain?.webContents.send(`sync-project-${project}-${platform}`);
      popupWindows[project] = popupWindows[project].filter((win) => !win.isDestroyed());
    });

    window.webContents.on('will-attach-webview', (_, webPreferences) => {
      webPreferences.preload = join(__dirname, '../preload/webview.js');
    });

    if (is.dev && process.env.ELECTRON_RENDERER_URL) {
      window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/floating.html#/${project}/${platform}`)
    } else {
      window.loadFile(join(__dirname, "../renderer/floating.html"), {
        hash: `/${project}/${platform}`,
      })
    }
  });
  ipcMain.on('project-close', async (_, project, _platform, popup) => {
    if (_.sender.id !== WindowMain?.webContents.id) {
      _.sender.close();
      // WindowMain?.webContents.send(`sync-project-${project}-${platform}`);

      const windowItem = popupWindows[project].find(item => item.webContents.id === _.sender.id);
      if (windowItem) {
        popupWindows[project].splice(popupWindows[project].indexOf(windowItem), 1);
      }
    } else if (_.sender.id === WindowMain?.webContents.id && popup) {
      if (popupWindows[project]) {
        for (const window of popupWindows[project]) {
          window.close();
          window.destroy();
        }
      }
      delete popupWindows[project];
    }
  });

  // Settings
  ipcMain.on('ui-scale-changed', async (_, ui_scale) => {
    UIPreferences.zoom.level = ui_scale;
    if (WindowMain && !(WindowMain.isDestroyed())) {
      WindowMain.webContents.setZoomFactor(UIPreferences.zoom.level);
    }
  });
  ipcMain.on('theme-mode-changed', async (_, theme_mode) => {
    UIPreferences.theme.mode = theme_mode;
    if (WindowMain && !WindowMain.isDestroyed()) {
      try {
        WindowMain.setTitleBarOverlay({
          color: UIPreferences.theme.window_widgets[UIPreferences.theme.mode].bg,
          symbolColor: UIPreferences.theme.window_widgets[UIPreferences.theme.mode].color,
          height: 32
        });
      } catch (e) { }
    }
  });

  // Haptic Feedback
  ipcMain.on('haptic-feedback', async (_) => {
    if (os.platform() === 'darwin') {
      execFile(path.resolve(app.getAppPath(), 'resources', 'bin', 'macos-haptic'));
    }
  });

  if (store.get("preferences.intro.skip")) {
    createMainWindow();
  } else {
    createWelcomeWindow();

    ipcMain.on('skip-intro', () => {
      WindowWelcome?.close();
      createMainWindow();
    });
  }

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      if (store.get("preferences.intro.skip")) {
        createMainWindow();
      } else {
        createWelcomeWindow();
      }
    }
  });
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  // if (process.platform !== 'darwin') {
  tray?.destroy();
  app.quit()
  // }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
