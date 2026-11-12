'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('teacherPointer',{onClick:callback=>{
 if(typeof callback!=='function')return;
 ipcRenderer.on('teacher-pointer:click',()=>callback());
}});
