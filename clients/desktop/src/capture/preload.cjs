/* eslint-disable @typescript-eslint/no-require-imports -- Electron sandbox preload */
const { contextBridge, ipcRenderer } = require('electron');
if (window.top === window && window.location.href === 'classroom-client://capture/index.html') {
  contextBridge.exposeInMainWorld('capturePicker', { locale: () => ipcRenderer.invoke('capture:locale'), sources: () => ipcRenderer.invoke('capture:sources'), select: id => ipcRenderer.invoke('capture:select', id), cancel: () => ipcRenderer.invoke('capture:cancel') });
}
