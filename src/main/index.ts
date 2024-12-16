import { BrowserWindow, Menu, Tray, app, ipcMain, shell } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'

import Store from 'electron-store';
import { join } from 'node:path'

Menu.setApplicationMenu(Menu.buildFromTemplate([
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

let ThemeMode: 'dark' | 'light' = 'light';
let ZoomLevel = 1;

let tray: Tray | undefined;
let WindowMain: BrowserWindow | undefined;
let WindowWelcome: BrowserWindow | undefined;

const popupWindows: { [key: string]: BrowserWindow[] } = {};

const createMainWindow = (): void => {
  // Create the browser window.
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
    darkTheme: ThemeMode === 'dark',
    resizable: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: true,
  });

  WindowMain = mainWindow;

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (
      input.control ||  // Checks for Ctrl key on Windows/Linux
      input.meta        // Checks for Command key on macOS
    ) {
      if (!['a', 'c', 'v', 'x'].includes(input.key)) {
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
    mainWindow.webContents.setZoomFactor(ZoomLevel);
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
  // Create the browser window.
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
    darkTheme: ThemeMode === 'dark',
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
  electronApp.setAppUserModelId('studio.tma')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  const store: any = new Store();

  ThemeMode = store.get("preferences")?.theme_mode ?? 'light';
  ZoomLevel = store.get("preferences")?.ui.scale ?? 1;

  // Store
  ipcMain.on('electron-store-get', async (event, val) => {
    event.returnValue = store.get(val);
  });
  ipcMain.on('electron-store-set', async (_, key, val) => {
    store.set(key, val);
  });

  // Project
  ipcMain.on('project-open', async (_, project, platform) => {
    const window = new BrowserWindow({
      title: "TMA Studio Project",
      width: store.get("preferences")?.project?.floating_window_size ?? 420,
      height: (store.get("preferences")?.project?.floating_window_size ?? 420) * 2.4,
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
      darkTheme: ThemeMode === 'dark',
      resizable: false,
      alwaysOnTop: store.get("preferences")?.project?.floating_window_on_top,
      frame: false,
      transparent: true,
    });

    if (!(project in popupWindows)) {
      popupWindows[project] = [];
    }
    popupWindows[project].push(window);

    window.on('ready-to-show', () => {
      window.show()
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
  ipcMain.on('project-close', async (_, project, platform, popup) => {
    if (_.sender.id !== WindowMain?.webContents.id) {
      _.sender.close();
      WindowMain?.webContents.send(`sync-project-${project}-${platform}`);

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
    ZoomLevel = ui_scale;
    if (WindowMain && !(WindowMain.isDestroyed())) {
      WindowMain.webContents.setZoomFactor(ZoomLevel);
    }
  });
  ipcMain.on('theme-mode-changed', async (_, theme_mode) => {
    ThemeMode = theme_mode;
  });
  ipcMain.on('theme-mode-changed', async (_, theme_mode) => {
    ThemeMode = theme_mode;
  });

  if (store.get('intro_done')) {
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
      if (store.get('intro_done')) {
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
