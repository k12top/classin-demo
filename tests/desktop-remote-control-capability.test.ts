import test from 'node:test';
import assert from 'node:assert/strict';
import {desktopRemoteInputAvailable} from '../src/lib/classroom/desktop-remote-control-capability';
const methods={setRemoteControlRequest:()=>{},startRemoteControl:()=>{}};
test('Windows remote input needs an explicit native capability; old Mac clients remain compatible',()=>{
 assert.equal(desktopRemoteInputAvailable({...methods,platform:'darwin'}),true);
 assert.equal(desktopRemoteInputAvailable({...methods,platform:'darwin',canReceiveRemoteControl:false}),false);
 assert.equal(desktopRemoteInputAvailable({...methods,platform:'win32'}),false);
 assert.equal(desktopRemoteInputAvailable({...methods,platform:'win32',canReceiveRemoteControl:true}),true);
 assert.equal(desktopRemoteInputAvailable({...methods,platform:'linux',canReceiveRemoteControl:true}),false);
 assert.equal(desktopRemoteInputAvailable(undefined),false);
 assert.equal(desktopRemoteInputAvailable({platform:'win32',canReceiveRemoteControl:true}),false);
});
