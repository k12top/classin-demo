'use strict';
const path=require('node:path');
const {launchNativeRemoteAdapter}=require('./native-remote-adapter.cjs');

/** Internal main-process adapter. Do not expose its methods to a renderer. */
function launchMacRemoteAdapter({executable,displayId,...options}){
 if(typeof executable!=='string'||!path.isAbsolute(executable)||!Number.isSafeInteger(displayId)||displayId<0||displayId>0xffffffff)throw Error('Invalid native input configuration');
 return launchNativeRemoteAdapter({...options,executable,args:[String(displayId)]});
}
module.exports={launchMacRemoteAdapter};
