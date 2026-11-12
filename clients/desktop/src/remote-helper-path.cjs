'use strict';
const path=require('node:path');
/** Only main-process application paths may choose the executable. */
function macRemoteHelperPath({isPackaged,resourcesPath,appPath,platform=process.platform}){
 if(platform!=='darwin')return null;
 const base=isPackaged?resourcesPath:appPath;
 if(typeof base!=='string'||!path.isAbsolute(base))throw Error('Invalid application path');
 return path.join(base,isPackaged?'remote-control':'.native/remote-control','RemoteInput');
}
function windowsRemoteHelperPath({isPackaged,resourcesPath,appPath,platform=process.platform}){
 if(platform!=='win32')return null;
 const base=isPackaged?resourcesPath:appPath;
 if(typeof base!=='string'||!path.win32.isAbsolute(base))throw Error('Invalid application path');
 return path.win32.join(base,isPackaged?'remote-control':'.native/remote-control','RemoteInput.exe');
}
module.exports={macRemoteHelperPath,windowsRemoteHelperPath};
