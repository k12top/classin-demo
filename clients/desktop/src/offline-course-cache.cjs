const {createHash}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const MAX_BYTES=5*1024*1024,MAX_AGE_MS=24*60*60*1000;
function sessionKey(origin,cookie,now=Date.now()){
 if(!cookie||typeof cookie.value!=='string'||!cookie.value||!Number.isFinite(cookie.expirationDate)||cookie.expirationDate*1000<=now)return null;
 return createHash('sha256').update(origin).update('\0').update(cookie.value).digest('hex');
}
function transient(status){return !status||status===408||status===429||status>=500;}
function encryptionReady(safeStorage){return safeStorage.isEncryptionAvailable()&&!(process.platform==='linux'&&safeStorage.getSelectedStorageBackend?.()==='basic_text');}
function createOfflineCourseCache({directory,safeStorage,DatabaseSync,now=()=>Date.now()}){
 let db;
 function open(){if(db)return db;fs.mkdirSync(directory,{recursive:true,mode:0o700});const file=path.join(directory,'workspace-cache.sqlite');db=new DatabaseSync(file);try{fs.chmodSync(file,0o600);}catch{/* OS-managed permissions may not expose POSIX modes. */}db.exec('PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS course_cache (session_key TEXT PRIMARY KEY, payload BLOB NOT NULL, saved_at INTEGER NOT NULL)');db.prepare('DELETE FROM course_cache WHERE saved_at < ? OR saved_at > ?').run(now()-MAX_AGE_MS,now());return db;}
 return {
  put(key,userId,courses){if(!key||!encryptionReady(safeStorage)||!Array.isArray(courses))return false;const raw=JSON.stringify({userId,courses});if(Buffer.byteLength(raw)>MAX_BYTES)return false;const payload=safeStorage.encryptString(raw);open().prepare('INSERT INTO course_cache(session_key,payload,saved_at) VALUES(?,?,?) ON CONFLICT(session_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at').run(key,payload,now());return true;},
  get(key,userId){if(!key||!encryptionReady(safeStorage))return null;const row=open().prepare('SELECT payload,saved_at FROM course_cache WHERE session_key=?').get(key);if(!row)return null;if(now()-row.saved_at>MAX_AGE_MS||row.saved_at>now()){this.remove(key);return null;}try{const value=JSON.parse(safeStorage.decryptString(Buffer.from(row.payload)));return value.userId===userId&&Array.isArray(value.courses)?{courses:value.courses,savedAt:row.saved_at}:null;}catch{this.remove(key);return null;}},
  remove(key){if(key)open().prepare('DELETE FROM course_cache WHERE session_key=?').run(key);},
  close(){db?.close();db=undefined;},
 };
}
function createCachedCourseReader({api,session,base,cache,now=()=>Date.now()}){
 const denied=new Set();
 const key=async()=>{const cookies=await session.cookies.get({url:base,name:'classroom_session'});return cookies.length===1?sessionKey(base,cookies[0],now()):null;};
 const fallback=async(expectedId,status)=>{const before=await key();let saved;if(!denied.has(before))try{saved=cache.get(before,expectedId);}catch{/* Cache errors must not mask the network failure. */}if(!saved||before!==await key())return {ok:false,status,error:'Course cache unavailable'};return {ok:true,data:{courses:saved.courses},cached:true,savedAt:saved.savedAt};};
 const remove=key=>{if(key)denied.add(key);try{cache.remove(key);}catch{/* Keep the session denied in memory even if deleting the cache fails. */}};
 return async expectedId=>{
  if(typeof expectedId!=='string'||!expectedId||expectedId.length>200)return {ok:false,status:400,error:'Invalid account'};
  const initial=await key();let identity=await api('identity',{});
  if(!identity.ok){if(transient(identity.status))return fallback(expectedId,identity.status);remove(initial);return identity;}
  if(!identity.data?.user){remove(await key());return {ok:false,status:401,error:'Session changed'};}
  if(identity.data.user.userId!==expectedId)return {ok:false,status:409,error:'Session changed'};
  const before=await key();
  // A refresh may rotate the cookie, or another window may switch account.
  // Revalidate the new session before binding any server data to it.
  if(initial!==before){identity=await api('identity',{});if(!identity.ok||identity.data?.user?.userId!==expectedId||before!==await key())return {ok:false,status:409,error:'Session changed'};}
  const result=await api('courses',{});const after=await key();
  if(before!==after)return {ok:false,status:409,error:'Session changed'};
  if(!result.ok){if(transient(result.status))return fallback(expectedId,result.status);remove(after);return result;}
  if(!Array.isArray(result.data?.courses))return {ok:false,status:502,error:'Invalid course response'};
  try{if(cache.put(after,expectedId,result.data.courses))denied.delete(after);}catch{/* The online response remains usable if storage is unavailable. */}
  return {...result,cached:false};
 };
}
module.exports={sessionKey,createOfflineCourseCache,createCachedCourseReader};
