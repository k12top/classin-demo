const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("classroomDesktop", {
  listDesktopSources: () => ipcRenderer.invoke("classroom:list-desktop-sources"),
  platform: process.platform,
});
