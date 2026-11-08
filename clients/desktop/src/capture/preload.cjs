const { contextBridge, ipcRenderer } = require('electron');
if (window.top === window && window.location.href === 'classroom-client://capture/index.html') {
  contextBridge.exposeInMainWorld('capturePicker', { sources: () => ipcRenderer.invoke('capture:sources'), select: id => ipcRenderer.invoke('capture:select', id), cancel: () => ipcRenderer.invoke('capture:cancel') });
}
