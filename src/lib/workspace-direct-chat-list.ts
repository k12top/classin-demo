import {workspaceRequest} from "./workspace-client";
import {workspaceAccessDenied} from "./workspace-load-results";

export type DirectChat={id:string;courseId:string;peerId:string;peerName:string;unread:number;preview?:{content:string;createdAt:string}|null};
export type OpenedDirectChat=Omit<DirectChat,"unread"|"preview">;

/** Keep any existing unread count when opening an already-known conversation. */
export function rememberOpenedChat(chats:readonly DirectChat[],chat:OpenedDirectChat):DirectChat[]{
 const existing=chats.find(item=>item.id===chat.id);
 return [{...chat,unread:existing?.unread||0,...(existing?.preview!==undefined?{preview:existing.preview}:{})},...chats.filter(item=>item.id!==chat.id)];
}

/** Complete pagination before applying a result, and discard superseded reads. */
export function createDirectChatListLoader(commit:(chats:DirectChat[])=>void,request:typeof workspaceRequest=workspaceRequest){
 let generation=0;
 return {
  async load(signal?:AbortSignal){
   const current=++generation,chats:DirectChat[]=[],seen=new Set<string>();let cursor:string|null=null;
   try {
    do{
     const result:{chats:DirectChat[];nextCursor:string|null}=await request(cursor?`/api/workspace/direct?cursor=${encodeURIComponent(cursor)}`:"/api/workspace/direct",{signal});
     if(signal?.aborted||current!==generation)return;
     chats.push(...result.chats);cursor=result.nextCursor;if(cursor&&seen.has(cursor))throw new Error("Repeated cursor");if(cursor)seen.add(cursor);
    }while(cursor);
    if(!signal?.aborted&&current===generation)commit(chats);
   } catch (failure) {
    // Temporary outages preserve the last complete list. Confirmed loss of
    // access clears it, but an obsolete request must never clear newer data.
    if(!signal?.aborted&&current===generation&&workspaceAccessDenied(failure))commit([]);
    throw failure;
   }
  },
  invalidate(){generation++;},
 };
}
