/** Only use media from the currently selected, still-authorized lesson. */
export function replayRecordingsForSession<T>(data:{sessionId:string;items:T[]},sessionId:string,deniedSessionId:string):T[] {
  return sessionId && data.sessionId===sessionId && deniedSessionId!==sessionId ? data.items : [];
}

/** Explicit lesson links must not silently fall back to another recording. */
export function resolveReplayLesson<T extends {id:string;status:string;_count?:{recordings?:number}}>(sessions:readonly T[],requestedId:string) {
  if(requestedId) return {sessionId:sessions.find(item=>item.id===requestedId)?.id||"",unavailable:!sessions.some(item=>item.id===requestedId)};
  return {sessionId:(sessions.find(item=>(item._count?.recordings||0)>0)||sessions.find(item=>item.status==="finished"))?.id||"",unavailable:false};
}
