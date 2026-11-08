const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('classroomClient', {
  context: () => ipcRenderer.invoke('client:context'),
  request: async (operation, args) => { const result = await ipcRenderer.invoke('client:request', operation, args); if (!result.ok) throw Object.assign(new Error(result.error), { status: result.status }); return result.data; },
  focusClassroom: () => ipcRenderer.invoke('client:focus-classroom'),
});
