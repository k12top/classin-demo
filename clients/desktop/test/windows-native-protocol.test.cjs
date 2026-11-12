const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
test('Windows native protocol validates keys, JSON, leases, bounds, rate limits and input release without operating the computer',t=>{
 const compiler=process.env.CLASSROOM_PROTOCOL_CXX||(process.platform==='darwin'?'clang++':process.platform==='win32'?'g++':'c++'),probe=spawnSync(compiler,['--version'],{encoding:'utf8',timeout:5000});
 if(probe.error?.code==='ENOENT'){t.skip('A C++17 compiler is needed for the native protocol test');return;}
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'classin-win-protocol-')),binary=path.join(dir,process.platform==='win32'?'ProtocolTest.exe':'ProtocolTest');
 try{
  const result=spawnSync(compiler,['-std=c++17','-Wall','-Wextra','-Werror','-DCLASSROOM_PROTOCOL_ONLY',path.join(__dirname,'../native/windows/RemoteInput.cpp'),'-o',binary],{encoding:'utf8',timeout:60000});assert.equal(result.status,0,result.error?.message||result.stderr);
  const checked=spawnSync(binary,[],{encoding:'utf8',timeout:5000});assert.equal(checked.status,0,checked.error?.message||checked.stderr);assert.equal(checked.stdout.trim(),'ok');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
