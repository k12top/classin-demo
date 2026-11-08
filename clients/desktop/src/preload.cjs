const { contextBridge, ipcRenderer } = require('electron');
const origin = process.argv.find(value => value.startsWith('--classroom-origin='))?.slice('--classroom-origin='.length);
if (window.location.origin === origin && window.top === window) {
  // Catch same-document router transitions before a second room can mount.
  // The main-process navigation and permission guards also cover full loads.
  window.navigation?.addEventListener('navigate', event => {
    const target=new URL(event.destination.url);
    if(event.cancelable && target.origin===origin && target.pathname==='/classroom' && target.href!==window.location.href){
      event.preventDefault();void ipcRenderer.invoke('client:enter',target.href);
    }
  });
  contextBridge.exposeInMainWorld('classroomDesktop', {
    listDesktopSources: () => ipcRenderer.invoke('classroom:list-desktop-sources'),
    openHome: () => ipcRenderer.invoke('client:open-home'),
    openWorkspace: () => ipcRenderer.invoke('client:open-workspace'),
    isDesktop: true,
    platform: process.platform,
  });
  window.addEventListener('DOMContentLoaded', () => {
    const launch = document.createElement('button');
    launch.type = 'button'; launch.id = 'classroom-client-workspace'; launch.textContent = '桌面工作台';
    launch.title = '返回桌面工作台（⌘/Ctrl + 1）'; launch.setAttribute('aria-label', '返回桌面工作台');
    launch.addEventListener('click', () => { void ipcRenderer.invoke('client:open-home'); });
    document.body.append(launch);
  }, { once: true });
}
