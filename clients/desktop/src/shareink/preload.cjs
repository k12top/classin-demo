const {contextBridge,ipcRenderer}=require('electron');
if(window.top===window&&window.location.href==='classroom-client://shareink/index.html')contextBridge.exposeInMainWorld('shareInk',{stroke:points=>ipcRenderer.invoke('shareink:stroke',points),close:()=>ipcRenderer.invoke('shareink:close')});
