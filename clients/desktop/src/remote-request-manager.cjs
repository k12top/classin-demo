'use strict';
const {randomUUID}=require('node:crypto');
const {sharedDisplayStillMatches}=require('./share-display.cjs');
const valid=value=>typeof value==='string'&&value.length>0&&value.length<=200&&!['.','..'].includes(value)&&!/[\x00-\x1f]/.test(value);
function createRemoteRequestManager({getContext,getSource,getDisplays,client,confirm,onChange=()=>{}}){
 if([getContext,getSource,getDisplays,confirm,onChange,client?.read,client?.respond].some(fn=>typeof fn!=='function'))throw Error('Invalid request manager');
 let current;
 const live=item=>{try{return current===item&&!item.owner.isDestroyed()&&getContext(item.owner)?.sessionId===item.sessionId&&getSource(item.owner)===item.source&&sharedDisplayStillMatches(item.source.display,getDisplays());}catch{return false;}};
 const notify=(item,state)=>{if(!item.owner.isDestroyed())onChange(item.owner,{grantId:item.grantId,...state});};
 const clear=(owner)=>{const item=current;if(!item||(owner&&item.owner!==owner))return;current=undefined;item.controller.abort();notify(item,{pending:false});};
 const find=async item=>{const grants=await client.read({sessionId:item.sessionId,clientId:item.clientId},item.controller.signal);const grant=grants.find(value=>value?.id===item.grantId&&value.effectiveState==='requested'&&valid(value.teacherId));if(!live(item)||!grant)throw Error('Request unavailable');return grant;};
 async function set(owner,input){
  if(!input){clear(owner);return false;}if(!valid(input.clientId)||!valid(input.grantId))return false;
  if(current?.owner===owner&&current.clientId===input.clientId&&current.grantId===input.grantId&&current.verified)return true;
  clear();const context=getContext(owner),source=getSource(owner);if(!context||!source?.id?.startsWith('screen:')||!source.display){if(!owner.isDestroyed())onChange(owner,{grantId:input.grantId,pending:false,error:true});return false;}
  const item={owner,source,sessionId:context.sessionId,clientId:input.clientId,grantId:input.grantId,controller:new AbortController(),verified:false,busy:false};current=item;
  try{const grant=await find(item);item.verified=true;item.teacherId=grant.teacherId;notify(item,{pending:true,teacherId:grant.teacherId});return true;}catch{if(current===item){current=undefined;notify(item,{pending:false,error:true});}return false;}
 }
 async function review(owner){
  const item=current;if(!item||item.owner!==owner||!item.verified||item.busy||!live(item))return false;item.busy=true;notify(item,{pending:true,busy:true,teacherId:item.teacherId});
  try{const grant=await find(item),accepted=await confirm(owner,grant.teacherId);if(!live(item))throw Error('Sharing changed');
   const state=await client.respond({sessionId:item.sessionId,clientId:item.clientId,grantId:item.grantId,accept:accepted,commandId:randomUUID()},item.controller.signal);
   if(!live(item))return false;current=undefined;notify(item,{pending:false,decision:state,teacherId:grant.teacherId});return state==='granted';
  }catch{if(current===item){item.busy=false;notify(item,{pending:true,error:true,teacherId:item.teacherId});}return false;}
 }
 return {set,review,clear,recheck:()=>{if(current&&!live(current))clear(current.owner)}};
}
module.exports={createRemoteRequestManager};
