import { BrowserWindow, app, ipcMain, shell } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'

import Store from 'electron-store';
import icon from '../../resources/icon.png?asset'
import { join } from 'node:path'

Store.initRenderer();

// let WindowMain: BrowserWindow | undefined;
let WindowWelcome: BrowserWindow | undefined;

const createMainWindow = (): void => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      webSecurity: false,
      webviewTag: true,
      nodeIntegration: true,
      nodeIntegrationInSubFrames: true,
    },
    resizable: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: true,
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (
      input.control ||  // Checks for Ctrl key on Windows/Linux
      input.meta        // Checks for Command key on macOS
    ) {
      event.preventDefault(); // Prevents default behavior of Ctrl/Command shortcuts
      mainWindow.webContents.send('shortcut-pressed', input);
    }
  });

  // WindowMain = mainWindow;

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

const createWelcomeWindow = (): void => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 720,
    height: 512,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
    },
    resizable: false,
    titleBarStyle: 'hidden',
    center: true,
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
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const store = new Store();

  ipcMain.on('electron-store-get', async (event, val) => {
    // @ts-ignore
    event.returnValue = store.get(val);
  });
  ipcMain.on('electron-store-set', async (_, key, val) => {
    // @ts-ignore
    store.set(key, val);
  });

  // @ts-ignore
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
        // @ts-ignore
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
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
