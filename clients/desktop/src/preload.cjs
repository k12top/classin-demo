const { contextBridge, ipcRenderer } = require('electron');
const origin = process.argv.find(value => value.startsWith('--classroom-origin='))?.slice('--classroom-origin='.length);
if(window.top===window&&window.location.href==='classroom-client://connection/index.html')contextBridge.exposeInMainWorld('classroomConnection',{
  state:()=>ipcRenderer.invoke('connection:state'),
  retry:()=>ipcRenderer.invoke('connection:retry'),
  home:()=>ipcRenderer.invoke('connection:home'),
});
// Overlay an invisible drag area without reserving a separate title row.
if (window.top === window && ['darwin', 'win32'].includes(process.platform)) window.addEventListener('DOMContentLoaded', () => {
  const bar = document.createElement('div');
  bar.id = 'classroom-client-titlebar';
  bar.className = process.platform === 'darwin' ? 'classroom-client-macos' : 'classroom-client-windows';
  bar.setAttribute('aria-hidden', 'true');
  document.documentElement.append(bar);
}, { once: true });
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
    getCachedCourses: userId => ipcRenderer.invoke('client:cached-courses', userId),
    openHome: () => ipcRenderer.invoke('client:open-home'),
    openWorkspace: () => ipcRenderer.invoke('client:open-workspace'),
    enterClassroom: url => ipcRenderer.invoke('client:enter', url),
    entryReady: () => ipcRenderer.invoke('client:entry-ready'),
    closeClassroom: () => ipcRenderer.invoke('client:close-classroom'),
    setSharingState: sharing => ipcRenderer.invoke('client:sharing-state', sharing),
    startRemoteControl: input => ipcRenderer.invoke('client:remote-start', input),
    setRemoteControlRequest: input => ipcRenderer.invoke('client:remote-pending', input),
    onRemoteControlRequestState: callback => {const listener=(_event,state)=>callback(state);ipcRenderer.on('client:remote-request-state',listener);return()=>ipcRenderer.removeListener('client:remote-request-state',listener);},
    stopRemoteControl: () => ipcRenderer.invoke('client:remote-stop'),
    receiveRemoteControl: packet => ipcRenderer.invoke('client:remote-input', packet),
    onRemoteControlState: callback => {const listener=(_event,state)=>callback(state);ipcRenderer.on('client:remote-state',listener);return()=>ipcRenderer.removeListener('client:remote-state',listener);},
    setSharingControls: controls => ipcRenderer.invoke('client:sharing-controls', controls),
    setSharingChatSnapshot: snapshot => ipcRenderer.invoke('client:sharing-chat-snapshot', snapshot),
    reportSharingChatResult: (id, ok) => ipcRenderer.invoke('client:sharing-chat-result', id, ok),
    onSharingChatTranslationRetry: callback => { const listener=()=>callback();ipcRenderer.on('client:sharing-chat-translation-retry',listener);return()=>ipcRenderer.removeListener('client:sharing-chat-translation-retry',listener); },
    onSharingChatSend: callback => { const listener=(_event,request)=>callback(request);ipcRenderer.on('client:sharing-chat-send',listener);return()=>ipcRenderer.removeListener('client:sharing-chat-send',listener); },
    onSharingChatImage: callback => { const listener=(_event,request)=>callback(request);ipcRenderer.on('client:sharing-chat-image',listener);return()=>ipcRenderer.removeListener('client:sharing-chat-image',listener); },
    reportSharingChatImage: (id, data) => ipcRenderer.invoke('client:sharing-chat-image-result', id, data),
    setSharingSeats: rect => ipcRenderer.invoke('client:sharing-seats', rect),
    onSharingCommand: callback => { const listener=(_event,command)=>{if(['stop','settings','members','microphone','camera'].includes(command))callback(command);};ipcRenderer.on('client:sharing-command',listener);return()=>ipcRenderer.removeListener('client:sharing-command',listener); },
    onScreenInk: callback => { const listener=(_event,stroke)=>callback(stroke);ipcRenderer.on('client:screen-ink',listener);return()=>ipcRenderer.removeListener('client:screen-ink',listener); },
    reportScreenInkFailure: () => ipcRenderer.invoke('client:screen-ink-failure'),
    prepareDeviceCheck: kind => ipcRenderer.invoke('client:prepare-device-check', kind),
    cancelDeviceCheck: () => ipcRenderer.invoke('client:cancel-device-check'),
    isDesktop: true,
    canReceiveRemoteControl: process.argv.includes('--classroom-remote-input-ready'),
    platform: process.platform,
  });
  window.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname !== '/classroom') return;
    const launch = document.createElement('button');
    launch.type = 'button'; launch.id = 'classroom-client-workspace'; launch.textContent = '桌面工作台';
    launch.title = '返回桌面工作台（⌘/Ctrl + 1）'; launch.setAttribute('aria-label', '返回桌面工作台');
    launch.addEventListener('click', () => { void ipcRenderer.invoke('client:open-home'); });
    document.body.append(launch);
  }, { once: true });
}
