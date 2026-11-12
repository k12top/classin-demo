/** Run session creation checks against an isolated, disposable local database. */
const {spawnSync,execFileSync}=require('node:child_process');
const crypto=require('node:crypto'),path=require('node:path'),net=require('node:net');
const root=path.resolve(__dirname,'..'),name='classroom-session-verification-'+crypto.randomUUID(),password=crypto.randomUUID(),database='classroom_sessions_verification';let container;
function run(binary,args,options={}){const result=spawnSync(binary,args,{cwd:root,encoding:'utf8',...options});if(result.error||result.status!==0)throw result.error||new Error(`${path.basename(binary)} failed (${result.status}): ${result.stderr||'see output'}`);return result.stdout;}
async function main(){
 container=execFileSync('docker',['run','--detach','--name',name,'--tmpfs','/var/lib/postgresql/data:rw,size=256m','-e',`POSTGRES_PASSWORD=${password}`,'-e',`POSTGRES_DB=${database}`,'--publish','127.0.0.1::5432','postgres:16-alpine'],{encoding:'utf8'}).trim();
 const port=Number(execFileSync('docker',['port',container,'5432/tcp'],{encoding:'utf8'}).trim().split(':').at(-1));const until=Date.now()+30000;
 while(true){const ready=spawnSync('docker',['exec',container,'pg_isready','-U','postgres','-d',database],{stdio:'ignore'}).status===0;const reachable=ready&&await new Promise(resolve=>{const socket=net.createConnection({host:'127.0.0.1',port});const done=value=>{socket.destroy();resolve(value)};socket.setTimeout(500);socket.once('connect',()=>done(true));socket.once('error',()=>done(false));socket.once('timeout',()=>done(false));});if(reachable)break;if(Date.now()>until)throw Error('Temporary database did not become ready');await new Promise(resolve=>setTimeout(resolve,250));}
 const env={...process.env,DATABASE_URL:`postgresql://postgres:${password}@127.0.0.1:${port}/${database}`};
 run(path.join(root,'node_modules/.bin/prisma'),['migrate','deploy'],{env});
 const result=run(process.execPath,['tests/integration/course-session-batch.cjs'],{env});process.stdout.write(result);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>{if(container)spawnSync('docker',['rm','-f',container],{stdio:'ignore'});});
