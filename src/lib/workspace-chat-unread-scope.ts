/** Keep cached counts bound to the exact accessible course set. */
export function workspaceUnreadScope(courseIds:readonly string[]):string {
 return JSON.stringify([...new Set(courseIds)].sort());
}
export function workspaceUnreadForScope(state:{scope:string;counts:Record<string,number>},scope:string):Record<string,number> {
 return state.scope===scope?state.counts:{};
}
