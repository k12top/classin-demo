'use strict';
const {webBase}=require('./client-contract.cjs');
const identifier=value=>typeof value==='string'&&value.length>0&&value.length<=200&&!['.','..'].includes(value)&&!/[\x00-\x1f]/.test(value);
/** This function stays in the main process and uses its authenticated session. */
function createReceiverLeaseReader({session,base,clientId}){
 const origin=webBase(base);
 if(!session||typeof session.fetch!=='function'||!identifier(clientId))throw Error('Invalid receiver session');
 return async function readReceiverLease(binding,signal){
  if(!binding||!identifier(binding.sessionId)||!identifier(binding.grantId)||!signal||typeof signal.aborted!=='boolean')throw Error('Invalid receiver binding');
  const url=new URL(`/api/courses/${encodeURIComponent(binding.sessionId)}/classroom/remote-control`,origin);
  url.search=new URLSearchParams({action:'receiver-lease',clientId,grantId:binding.grantId}).toString();
  const response=await session.fetch(url.toString(),{method:'GET',credentials:'include',redirect:'error',cache:'no-store',signal});
  if(!response.ok||signal.aborted)throw Error('Receiver lease unavailable');
  const body=await response.json();
  if(signal.aborted||!body||typeof body!=='object'||!body.lease||typeof body.lease!=='object')throw Error('Invalid receiver lease');
  return body.lease;
 };
}
module.exports={createReceiverLeaseReader};
