"use client";
import {useCallback,useEffect,useRef,useState,type ReactNode} from "react";
import type {AuthUser} from "@/lib/auth-context";
import {workspaceRequest} from "@/lib/workspace-client";
import {redirectToSsoLogin} from "@/lib/auth-login";
import {watchWorkspaceRefresh} from "@/lib/workspace-refresh";
import type {WorkspaceCourse} from "@/lib/workspace-model";
import {WorkspaceApp} from "./workspace-app";

/** Reuse the real workspace navigation, actions and unread state on detail pages. */
export function WorkspaceSubpage({user,children,navigation}:{user:AuthUser;children:ReactNode;navigation?:(courses:WorkspaceCourse[])=>ReactNode}){
 const [state,setState]=useState<{owner:string;courses:WorkspaceCourse[];error:string;loading:boolean}>({owner:"",courses:[],error:"",loading:true});
 const [expiredOwner,setExpiredOwner]=useState("");
 const generation=useRef(0),accountId=user.userId;
 const refresh=useCallback(async(silent=false)=>{
  const request=++generation.current;setState(previous=>previous.owner===accountId?{...previous,loading:silent?previous.loading:true}:{owner:accountId,courses:[],error:"",loading:true});
  try{const result=await workspaceRequest<{courses:WorkspaceCourse[]}>("/api/courses");if(!Array.isArray(result?.courses))throw new Error("Invalid course response");if(request===generation.current)setState({owner:accountId,courses:result.courses,error:"",loading:false});}
  catch(error){if(request!==generation.current)return;const status=(error as {status?:number}).status;if(status===401){setState({owner:accountId,courses:[],error:"",loading:false});setExpiredOwner(accountId);redirectToSsoLogin();return;}setState(previous=>({owner:accountId,courses:status===403?[]:previous.owner===accountId?previous.courses:[],error:error instanceof Error?error.message:"Unable to load classes",loading:false}));}
 },[accountId]);
 useEffect(()=>{let canceled=false;const marker=generation;queueMicrotask(()=>{if(!canceled)void refresh();});return()=>{canceled=true;marker.current++;};},[refresh]);
 useEffect(()=>watchWorkspaceRefresh(()=>void refresh(true)),[refresh]);
 const current=state.owner===accountId?state:{owner:accountId,courses:[],error:"",loading:true};
 if(expiredOwner===accountId)return null;
 return <WorkspaceApp key={accountId} user={user} courses={current.courses} error={current.error} refreshing={current.loading} refresh={()=>void refresh()} navigation={navigation?.(current.courses)}>{children}</WorkspaceApp>;
}
