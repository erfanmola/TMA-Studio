import type { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown,
    store: {
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      get: (key: string) => any;
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      set: (key: string, val: any) => void;
      // any other methods you've defined...
    },
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    onShortcutPressed: any,
  }
}
