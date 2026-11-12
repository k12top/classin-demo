const test=require('node:test'),assert=require('node:assert/strict');
const {macRemoteHelperPath,windowsRemoteHelperPath}=require('../src/remote-helper-path.cjs');
test('helper location is derived only from the trusted application paths',()=>{assert.equal(macRemoteHelperPath({platform:'darwin',isPackaged:true,resourcesPath:'/app/Contents/Resources'}),'/app/Contents/Resources/remote-control/RemoteInput');assert.equal(macRemoteHelperPath({platform:'darwin',isPackaged:false,appPath:'/app/desktop'}),'/app/desktop/.native/remote-control/RemoteInput');assert.equal(macRemoteHelperPath({platform:'win32'}),null);assert.throws(()=>macRemoteHelperPath({platform:'darwin',isPackaged:true,resourcesPath:'relative'}));});
test('Windows helper paths use only packaged resources or the local native build',()=>{
 assert.equal(windowsRemoteHelperPath({platform:'win32',isPackaged:true,resourcesPath:'C:\\Classroom\\resources'}),'C:\\Classroom\\resources\\remote-control\\RemoteInput.exe');
 assert.equal(windowsRemoteHelperPath({platform:'win32',isPackaged:false,appPath:'C:\\repo\\desktop'}),'C:\\repo\\desktop\\.native\\remote-control\\RemoteInput.exe');
 assert.equal(windowsRemoteHelperPath({platform:'darwin'}),null);
 assert.throws(()=>windowsRemoteHelperPath({platform:'win32',isPackaged:true,resourcesPath:'relative'}));
});
