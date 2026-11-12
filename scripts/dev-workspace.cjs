const dotenv=require('dotenv'),{spawn}=require('node:child_process');
const {startLoopbackForwarder}=require('./lib/loopback-forwarder.cjs');
// Local Docker settings win; legacy project configuration supplies SSO/media.
dotenv.config({path:['.env.local','env.local'],quiet:true});
if(!process.env.DATABASE_URL){console.error('Run npm run workspace:db to configure the local Docker database.');process.exit(1);}
async function start(){
 const port=Number(process.env.PORT || '3000');
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT must be between 1 and 65535.');
 let forwarder;
 try{forwarder=await startLoopbackForwarder(port);}catch(error){
  if(!['EAFNOSUPPORT','EADDRNOTAVAIL','EPROTONOSUPPORT'].includes(error.code))throw error;
  console.warn('IPv6 loopback is unavailable; use http://127.0.0.1:'+port+'.');
 }
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(port)],{stdio:'inherit',env:process.env});
 const stop=signal=>{void forwarder?.close();child.kill(signal);};
 process.once('SIGINT',()=>stop('SIGINT'));process.once('SIGTERM',()=>stop('SIGTERM'));
 child.once('error',error=>{console.error(error.message);void forwarder?.close();process.exitCode=1;});
 child.once('exit',async(code,signal)=>{await forwarder?.close();process.exitCode=code ?? (signal==='SIGINT'?130:1);});
}
start().catch(error=>{console.error(error.message);process.exitCode=1;});
