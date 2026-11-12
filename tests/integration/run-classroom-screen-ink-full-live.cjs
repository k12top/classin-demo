/* eslint-disable @typescript-eslint/no-require-imports -- disposable Docker database launcher */
const {execFileSync,spawnSync}=require('node:child_process'),crypto=require('node:crypto');
require('dotenv').config({path:'.env.local',quiet:true});
if(process.env.INK_FULL_LIVE_TEST!=='1')throw Error('Set INK_FULL_LIVE_TEST=1 to create and delete isolated test resources');
const dbName='classroom_ink_'+crypto.randomBytes(6).toString('hex');let created=false;
try{
 const password=execFileSync('docker',['exec','classin-unified-postgres','printenv','POSTGRES_PASSWORD'],{encoding:'utf8'}).trim();
 execFileSync('docker',['exec','classin-unified-postgres','createdb','-U','classin_dev',dbName]);created=true;
 const env={...process.env,DATABASE_URL:`postgresql://classin_dev:${encodeURIComponent(password)}@127.0.0.1:35432/${dbName}`};
 let result=spawnSync('./node_modules/.bin/prisma',['migrate','deploy'],{env,encoding:'utf8'});
 if(result.status!==0)throw Error('Disposable migration failed: '+(result.stderr||'').slice(0,1200));
 result=spawnSync('./clients/desktop/node_modules/.bin/electron',['tests/integration/classroom-screen-ink-full-live.cjs'],{env,encoding:'utf8'});
 process.stdout.write(result.stdout||'');if(result.status!==0)throw Error('Live integration failed: '+(result.stderr||result.error?.message||'').slice(0,1800));
}catch(error){console.error(error.message);process.exitCode=1;}finally{
 if(created)try{execFileSync('docker',['exec','classin-unified-postgres','dropdb','-U','classin_dev',dbName]);console.log('Disposable test database removed');}catch{console.error('Disposable test database cleanup failed');process.exitCode=1;}
}
