import { tryOAuthRefresh } from "./auth-refresh-client";
/** Browser credentials stay in the HttpOnly session. Never automatically replay a write. */
export async function workspaceRequest<T>(path:string, options:RequestInit={},timeoutMs=15_000) : Promise<T> {
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  const abort=()=>controller.abort();options.signal?.addEventListener("abort",abort,{once:true});
  if(options.signal?.aborted)controller.abort();
  try{
    const read=!options.method || options.method==="GET";
    const init={...options,credentials:"same-origin" as const,cache:"no-store" as const,signal:controller.signal};
    let response=await fetch(path,init);
    if(response.status===401 && read && await tryOAuthRefresh())response=await fetch(path,init);
    let result:unknown;
    try{result=await response.json();}catch{if(response.ok)throw new Error("Invalid workspace response");result={};}
    const errorBody=result&&typeof result==="object"&&!Array.isArray(result)?result as {error?:unknown;code?:unknown}:{};
    if(!response.ok)throw Object.assign(new Error(typeof errorBody.error==="string"?errorBody.error:`Request failed (${response.status})`),{status:response.status,...(typeof errorBody.code==="string"?{code:errorBody.code}:{})});
    return result as T;
  } finally { clearTimeout(timeout);options.signal?.removeEventListener("abort",abort); }
}

export type WorkspaceTask = {id:string;title:string;notes:string;dueDate:string|null;courseId:string|null;sessionId:string|null;completed:boolean;version:number};

/** Load the complete account-scoped task list; never replace it with a partial page. */
export async function loadWorkspaceTasks(signal?:AbortSignal):Promise<WorkspaceTask[]> {
  const tasks:WorkspaceTask[]=[];
  const seen=new Set<string>();
  let cursor:string|null=null;
  do {
    const path=cursor?`/api/workspace/tasks?cursor=${encodeURIComponent(cursor)}`:"/api/workspace/tasks";
    const page:{tasks:WorkspaceTask[];nextCursor:string|null}=await workspaceRequest(path,{signal});
    tasks.push(...page.tasks);
    cursor=page.nextCursor;
    if(cursor && seen.has(cursor))throw new Error("Repeated task cursor");
    if(cursor)seen.add(cursor);
  } while(cursor);
  return tasks;
}
