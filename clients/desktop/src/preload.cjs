const { contextBridge, ipcRenderer } = require('electron');
const origin = process.argv.find(value => value.startsWith('--classroom-origin='))?.slice('--classroom-origin='.length);
if (window.location.origin === origin && window.top === window) {
  contextBridge.exposeInMainWorld('classroomDesktop', {
    listDesktopSources: () => ipcRenderer.invoke('classroom:list-desktop-sources'),
    openWorkspace: () => ipcRenderer.invoke('client:open-workspace'),
    isDesktop: true,
    platform: process.platform,
  });
  window.addEventListener('DOMContentLoaded', () => {
    const launch = document.createElement('button');
    launch.type = 'button'; launch.id = 'classroom-client-workspace'; launch.textContent = '人员工作台';
    launch.title = '课堂花名册与学生分组（⌘/Ctrl + 2）'; launch.setAttribute('aria-label', '打开客户端人员工作台');
    launch.addEventListener('click', () => { void ipcRenderer.invoke('client:open-workspace'); });
    document.body.append(launch);
  }, { once: true });
}
