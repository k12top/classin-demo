'use strict';
const {startNativeRemoteReceiver}=require('./macos-remote-receiver.cjs');
const {launchWindowsRemoteAdapter}=require('./windows-remote-adapter.cjs');
async function startWindowsRemoteReceiver({getPhysicalBounds,launch=launchWindowsRemoteAdapter,...input}){
 if(typeof getPhysicalBounds!=='function'||!input.display?.bounds)throw Error('Remote control unavailable');
 const display=Object.freeze({...input.display,bounds:Object.freeze({...input.display.bounds})});
 // DIP rectangles are rounded outwards by Chromium. Allow only the bounded
 // round-trip error when locating a unique monitor, then bind its exact pixels.
 return startNativeRemoteReceiver({...input,display,launch:options=>launch({...options,bounds:getPhysicalBounds(display),roundingTolerance:Math.ceil(display.scaleFactor)*2})});
}
module.exports={startWindowsRemoteReceiver};
