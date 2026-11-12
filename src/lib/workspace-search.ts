export type WorkspaceSearchResult = {kind:"class"|"classChat"|"student"|"directChat"|"group"|"lesson";id:string;name:string};
/** Search only records already authorized and supplied by the workspace. */
export function searchWorkspace(query:string,classes:readonly {id:string;name:string}[],students:readonly {id:string;name:string}[],direct:readonly {id:string;peerName:string}[],extra:{groups?:readonly {id:string;name:string}[];lessons?:readonly {scheduleId:string;name:string;sessionTitle?:string|null}[]}={}):WorkspaceSearchResult[]{
 const needle=query.trim().toLocaleLowerCase();if(!needle)return [];
 const match=(value:string)=>value.toLocaleLowerCase().includes(needle);
 return [
  ...classes.filter(item=>match(item.name)).slice(0,8).map(item=>({kind:"class" as const,id:item.id,name:item.name})),
  ...students.filter(item=>match(item.name)||match(item.id)).slice(0,8).map(item=>({kind:"student" as const,id:item.id,name:item.name})),
  ...classes.filter(item=>match(item.name)).slice(0,8).map(item=>({kind:"classChat" as const,id:item.id,name:item.name})),
  ...direct.filter(item=>match(item.peerName)).slice(0,8).map(item=>({kind:"directChat" as const,id:item.id,name:item.peerName})),
  ...(extra.groups||[]).filter(item=>match(item.name)).slice(0,8).map(item=>({kind:"group" as const,id:item.id,name:item.name})),
  ...(extra.lessons||[]).filter(item=>match(`${item.sessionTitle||""} ${item.name}`)).slice(0,8).map(item=>({kind:"lesson" as const,id:item.scheduleId,name:item.sessionTitle||item.name})),
 ];
}
