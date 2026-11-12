'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),source=path.join(root,'native','windows'),output=path.join(root,'.native','remote-control');
function run(command,args,options={}){const result=spawnSync(command,args,{encoding:'utf8',timeout:60000,...options});if(result.error||result.status!==0)throw Error(`${path.basename(command)} failed: ${result.error?.message||result.stderr||result.status}`);return result.stdout;}
function build({arch='x64'}={}){
 if(arch!==1&&arch!=='x64')throw Error('The Windows remote-input helper currently requires an x64 desktop build.');
 const compiler=process.env.CLASSROOM_WINDOWS_CXX||(process.platform==='win32'?'g++':'x86_64-w64-mingw32-g++');
 const resourceCompiler=process.env.CLASSROOM_WINDOWS_WINDRES||compiler.replace(/g\+\+(\.exe)?$/,'windres$1');
 if(resourceCompiler===compiler)throw Error('Set CLASSROOM_WINDOWS_WINDRES to the matching MinGW resource compiler.');
 fs.mkdirSync(output,{recursive:true});const temp=fs.mkdtempSync(path.join(output,'windows-build-'));
 try{
  const resource=path.join(temp,'manifest.o'),binary=path.join(temp,'RemoteInput.exe');
  run(resourceCompiler,['--input','RemoteInput.rc','--output',resource,'--output-format=coff','--target=pe-x86-64'],{cwd:source});
  run(compiler,['-std=c++17','-O2','-Wall','-Wextra','-Werror','-D_WIN32_WINNT=0x0A00','-DUNICODE','-D_UNICODE','-static','-static-libgcc','-static-libstdc++','-pthread','-m64',path.join(source,'RemoteInput.cpp'),resource,'-Wl,--nxcompat,--dynamicbase','-luser32','-lkernel32','-o',binary]);
  const bytes=fs.readFileSync(binary),pe=bytes.readUInt32LE(0x3c);
  if(bytes.toString('ascii',0,2)!=='MZ'||bytes.readUInt32LE(pe)!==0x4550||bytes.readUInt16LE(pe+4)!==0x8664)throw Error('Expected a Windows x64 executable.');
  if(process.platform==='win32'&&run(binary,['--self-test']).trim()!=='ok')throw Error('Windows input helper self-test failed.');
  fs.renameSync(binary,path.join(output,'RemoteInput.exe'));
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
if(require.main===module){try{build();console.log('Built Windows x64 remote input helper'+(process.platform==='win32'?'':' (cross-compiled; Windows execution still requires verification)'));}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={build};
