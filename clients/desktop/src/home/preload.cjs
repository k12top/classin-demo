const { contextBridge, ipcRenderer } = require('electron');
if (window.top === window && window.location.href === 'classroom-client://home/index.html') {
  const unwrap = async promise => { const result = await promise; if (!result.ok) throw Object.assign(new Error(result.error), { status: result.status }); return result.data; };
  contextBridge.exposeInMainWorld('classroomHome', {
    request: (operation, args) => unwrap(ipcRenderer.invoke('home:request', operation, args)),
    navigate: (page, args) => unwrap(ipcRenderer.invoke('home:navigate', page, args)),
    enter: args => unwrap(ipcRenderer.invoke('home:enter', args)),
    openPeople: () => ipcRenderer.invoke('home:people'),
    focusClassroom: () => ipcRenderer.invoke('home:focus-classroom'),
  });
}
