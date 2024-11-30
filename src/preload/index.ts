import { clipboard, contextBridge, ipcRenderer } from 'electron'

import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

contextBridge.exposeInMainWorld('store', {
  get(key: string) {
    return ipcRenderer.sendSync('electron-store-get', key);
  },
  set(property, val) {
    ipcRenderer.send('electron-store-set', property, val);
  },
});

contextBridge.exposeInMainWorld('onShortcutPressed', (callback) => ipcRenderer.on('shortcut-pressed', callback));

contextBridge.exposeInMainWorld('clipboard', {
  getText() {
    return clipboard.readText();
  },
  setText(text: string) {
    return clipboard.writeText(text);
  },
  clear() {
    return clipboard.clear();
  },
});

contextBridge.exposeInMainWorld('project', {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  open: (project: string, platform: any) => {
    ipcRenderer.send('project-open', project, platform);
  },
});