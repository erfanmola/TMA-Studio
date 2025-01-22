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

document.addEventListener("DOMContentLoaded", () => {
	window.addEventListener("message", (message) => {
		if (
			message.source ===
			(document.querySelector("iframe#tma-webview-iframe") as HTMLIFrameElement)
				?.contentWindow
		) {
			const { eventType, eventData } = JSON.parse(message.data);
			if (import.meta.env.DEV) {
				console.log("Mini App Method Emit", { eventType, eventData });
			}
			// @ts-ignore
			ipcRenderer.sendToHost("method", { eventType, eventData });
		}
	});
});
