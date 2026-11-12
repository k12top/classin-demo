const {contextBridge,ipcRenderer}=require('electron');
if(window.top===window&&window.location.href==='classroom-client://entry/index.html')contextBridge.exposeInMainWorld('classroomEntry',{locale:()=>ipcRenderer.invoke('entry:locale')});
