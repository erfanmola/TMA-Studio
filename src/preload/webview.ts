import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("TelegramWebviewProxy", {
	postEvent: (eventType, eventData) => {
		if (import.meta.env.DEV) {
			console.log("Mini App Method Emit", { eventType, eventData });
		}
		// @ts-ignore
		ipcRenderer.sendToHost("method", { eventType, eventData });
	},
});
