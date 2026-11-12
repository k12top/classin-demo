'use strict';
const {webBase}=require('./client-contract.cjs');
const valid=value=>typeof value==='string'&&value.length>0&&value.length<=200&&!['.','..'].includes(value)&&!/[\x00-\x1f]/.test(value);
function createRemoteRequestClient({session,base}){
 const origin=webBase(base);if(!session||typeof session.fetch!=='function')throw Error('Invalid session');
 const endpoint=sessionId=>new URL(`/api/courses/${encodeURIComponent(sessionId)}/classroom/remote-control`,origin);
 return {
  read:async({sessionId,clientId},signal)=>{if(!valid(sessionId)||!valid(clientId))throw Error('Invalid request');const url=endpoint(sessionId);url.search=new URLSearchParams({clientId}).toString();const res=await session.fetch(url.toString(),{method:'GET',credentials:'include',redirect:'error',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(8000)])});if(!res.ok)throw Error('Request unavailable');const body=await res.json();if(!Array.isArray(body.grants)||body.grants.length>100)throw Error('Invalid response');return body.grants;},
  respond:async({sessionId,clientId,grantId,accept,commandId},signal)=>{
   if(![sessionId,clientId,grantId,commandId].every(valid)||typeof accept!=='boolean')throw Error('Invalid response');const body=JSON.stringify({action:'respond',clientId,grantId,accept,commandId});
   for(let attempt=0;attempt<2;attempt++){try{const res=await session.fetch(endpoint(sessionId).toString(),{method:'POST',credentials:'include',redirect:'error',cache:'no-store',headers:{'Content-Type':'application/json',Origin:origin},body,signal:AbortSignal.any([signal,AbortSignal.timeout(8000)])});if(!res.ok){if(res.status>=500&&attempt===0)continue;throw Object.assign(Error('Response unavailable'),{terminal:true});}const value=await res.json();if(value?.grant?.id!==grantId||!['granted','rejected','revoked'].includes(value?.grant?.state))throw Object.assign(Error('Invalid response'),{terminal:true});return value.grant.state;}catch(error){if(signal.aborted||error?.terminal||attempt===1)throw error;}}
   throw Error('Response unavailable');
  },
 };
}
module.exports={createRemoteRequestClient};
