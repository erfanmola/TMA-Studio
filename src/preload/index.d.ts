import type { ElectronAPI } from "@electron-toolkit/preload";
import type { TelegramPlatform } from "@renderer/utils/themes";

declare global {
	interface Window {
		electron: ElectronAPI;
		api: {
			store: {
				get: (key: string) => any;
				set: (key: string, val: any) => void;
			};
			onShortcutPressed: any;
			clipboard: {
				getText: () => string;
				setText: (text: string) => void;
				clear: () => void;
			};
			project: {
				open: (project: string, platform: TelegramPlatform) => void;
				close: (
					project: string,
					platform: TelegramPlatform,
					popup: boolean,
				) => void;
			};
			version: {
				get: () => string;
			};
			haptic: {
				vibrate: () => void;
			};
		};
	}
}
