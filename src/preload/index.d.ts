import type { ElectronAPI } from '@electron-toolkit/preload'
import type { TelegramPlatform } from '@renderer/utils/themes';

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
    clipboard: {
      getText: () => string;
      setText: (text: string) => void;
      clear: () => void;
    },
    project: {
      open: (project: string, platform: TelegramPlatform) => void;
    }
  }
}
