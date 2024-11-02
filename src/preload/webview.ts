import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('TelegramWebviewProxy', {
    postEvent: (eventType, eventData) => {
        if (import.meta.env.DEV) {
            console.log('Mini App Event Received', {eventType, eventData});
        }
        // @ts-ignore
        ipcRenderer.sendToHost({eventType, eventData});
    },
});
