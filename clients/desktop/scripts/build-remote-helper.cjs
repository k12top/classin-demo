'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),outputDir=path.join(root,'.native','remote-control'),source=path.join(root,'native','macos','RemoteInput.swift');
function run(command,args){const result=spawnSync(command,args,{encoding:'utf8',timeout:60000});if(result.error||result.status!==0)throw Error(`${path.basename(command)} failed: ${result.error?.message||result.stderr||result.status}`);return result.stdout;}
function build(){
 if(process.platform!=='darwin')throw Error('The macOS remote input helper must be built on macOS with the Apple toolchain');
 fs.mkdirSync(outputDir,{recursive:true});const temp=fs.mkdtempSync(path.join(outputDir,'build-'));
 try{
  for(const arch of ['arm64','x86_64'])run('/usr/bin/swiftc',['-swift-version','6','-target',`${arch}-apple-macos11.0`,source,'-o',path.join(temp,arch)]);
  const binary=path.join(temp,'RemoteInput');run('/usr/bin/lipo',['-create',path.join(temp,'arm64'),path.join(temp,'x86_64'),'-output',binary]);
  // lipo combines two linker-signed slices but leaves the universal object
  // without a designated requirement. macOS privacy authorization needs a
  // signed code identity even for a local development build. Distribution
  // packaging signs this helper again with the application's real identity.
  run('/usr/bin/codesign',['--force','--sign','-','--identifier','cn.xiangyuwenshu.classroom.remoteinput',binary]);
  run('/usr/bin/codesign',['--verify','--strict',binary]);
  if(run(binary,['--self-test']).trim()!=='ok')throw Error('Remote input helper self-test failed');
  fs.chmodSync(binary,0o755);fs.renameSync(binary,path.join(outputDir,'RemoteInput'));
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
if(require.main===module){try{build();console.log('Built universal macOS remote input helper');}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={build};
