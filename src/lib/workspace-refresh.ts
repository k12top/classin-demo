import {WORKSPACE_LESSON_CHANGED_EVENT} from "./workspace-lesson-events";

export const WORKSPACE_REFRESH_INTERVAL_MS=60_000;

type RefreshEnvironment={
 window:Pick<Window,"addEventListener"|"removeEventListener"|"setInterval"|"clearInterval">;
 document:Pick<Document,"addEventListener"|"removeEventListener"|"visibilityState">;
 isOnline:()=>boolean;
};

/** Refresh only while visible and connected; remove every listener on unmount. */
export function watchWorkspaceRefresh(refresh:()=>void,env:RefreshEnvironment={window,document,isOnline:()=>navigator.onLine}){
 const sync=()=>{if(env.document.visibilityState==="visible"&&env.isOnline())refresh();};
 env.window.addEventListener("focus",sync);
 env.window.addEventListener("online",sync);
 env.window.addEventListener(WORKSPACE_LESSON_CHANGED_EVENT,sync);
 env.document.addEventListener("visibilitychange",sync);
 const timer=env.window.setInterval(sync,WORKSPACE_REFRESH_INTERVAL_MS);
 return()=>{env.window.clearInterval(timer);env.window.removeEventListener("focus",sync);env.window.removeEventListener("online",sync);env.window.removeEventListener(WORKSPACE_LESSON_CHANGED_EVENT,sync);env.document.removeEventListener("visibilitychange",sync);};
}
