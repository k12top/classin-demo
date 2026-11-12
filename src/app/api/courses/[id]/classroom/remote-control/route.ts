import {NextRequest,NextResponse} from 'next/server';
import {resolveClassroomRequestAccess} from '@/lib/classroom/server/request-access';
import {ClassroomCommandConflict} from '@/lib/classroom/server/command-receipt';
import {RemoteControlError} from '@/lib/classroom/remote-control';
import {createRemoteControlRequest,listRemoteControlRequests,respondToRemoteControlRequest,stopRemoteControl,registerRemoteControlKey,verifyRemoteControlReceiver,markRemoteControlReceiverReady,RemoteControlServiceError} from '@/lib/classroom/server/remote-control';
import {databaseUnavailableResponse} from '@/lib/database-response';

export const dynamic='force-dynamic';
export const runtime='nodejs';
export const preferredRegion='sin1';
type RouteContext={params:Promise<{id:string}>};
const response=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function authorize(request:NextRequest,id:string,shareAccess:string|undefined){
 const result=await resolveClassroomRequestAccess(request,id,shareAccess);
 if(!result.ok)return {error:response({error:result.error,code:result.code},result.status)} as const;
 return {sessionId:result.access.sessionId,identity:{userId:result.session.userId,name:result.session.name}} as const;
}
function failure(error:unknown,sessionId:string){
 if(error instanceof RemoteControlServiceError)return response({error:error.message},error.status);
 if(error instanceof RemoteControlError)return response({error:'Control request unavailable'},409);
 if(error instanceof ClassroomCommandConflict)return response({error:'Command conflict',code:'command_conflict'},409);
 return databaseUnavailableResponse(error,{route:'classroom/remote-control',sessionId})||response({error:'Unable to process control request'},500);
}
export async function GET(request:NextRequest,{params}:RouteContext){
 const {id}=await params;try{const auth=await authorize(request,id,request.nextUrl.searchParams.get('shareAccess')||undefined);if('error' in auth)return auth.error;
  const clientId=request.nextUrl.searchParams.get('clientId')||'';
  if(request.nextUrl.searchParams.get('action')==='receiver-lease')return response({lease:await verifyRemoteControlReceiver({...auth,clientId,grantId:request.nextUrl.searchParams.get('grantId')||''})});
  const grants=await listRemoteControlRequests({...auth,clientId});return response({grants});
 }catch(error){return failure(error,id);}
}
export async function POST(request:NextRequest,{params}:RouteContext){
 const {id}=await params;try{const body=await request.json().catch(()=>null);if(!body||typeof body!=='object'||Array.isArray(body))return response({error:'Invalid request'},400);
  const auth=await authorize(request,id,typeof body.shareAccess==='string'?body.shareAccess:undefined);if('error' in auth)return auth.error;
  const context={...auth,clientId:typeof body.clientId==='string'?body.clientId:''};
  if(body.action==='request'&&typeof body.studentId==='string'&&typeof body.claimId==='string'&&typeof body.commandId==='string')return response({grant:await createRemoteControlRequest({...context,studentId:body.studentId,claimId:body.claimId,commandId:body.commandId})});
  if(body.action==='respond'&&typeof body.grantId==='string'&&typeof body.accept==='boolean'&&typeof body.commandId==='string')return response({grant:await respondToRemoteControlRequest({...context,grantId:body.grantId,accept:body.accept,commandId:body.commandId})});
  if(body.action==='register-key'&&typeof body.grantId==='string'&&typeof body.publicKey==='string')return response({channel:await registerRemoteControlKey({...context,grantId:body.grantId,publicKey:body.publicKey})});
  if(body.action==='receiver-ready'&&typeof body.grantId==='string')return response({ready:await markRemoteControlReceiverReady({...context,grantId:body.grantId})});
  if(body.action==='stop'&&typeof body.grantId==='string')return response({grant:await stopRemoteControl({...context,grantId:body.grantId})});
  return response({error:'Invalid request'},400);
 }catch(error){return failure(error,id);}
}
