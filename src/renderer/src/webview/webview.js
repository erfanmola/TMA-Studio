const { ipcRenderer } = require('electron');

window.TelegramWebviewProxy = {
    postEvent: (eventType, eventData) => {
        console.log({eventType, eventData});
        ipcRenderer.sendToHost({eventType, eventData});
    },
};