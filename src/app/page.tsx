"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {useAuth} from "@/lib/auth-context";
import {redirectToSsoLogin} from "@/lib/auth-login";
import {useTranslation} from "@/lib/i18n/context";
import {workspaceRequest} from "@/lib/workspace-client";
import type {WorkspaceCourse} from "@/lib/workspace-model";
import {WorkspaceApp} from "@/components/workspace/workspace-app";
import {PageLoadingState} from "@/components/ui/page-loading-state";
import {watchWorkspaceRefresh} from "@/lib/workspace-refresh";

type CourseState={owner:string;courses:WorkspaceCourse[];loading:boolean;error:string;offline:boolean};
export default function DashboardPage(){
  const {user,loading:authLoading}=useAuth(),{t}=useTranslation();
  const [state,setState]=useState<CourseState>({owner:"",courses:[],loading:true,error:"",offline:false});
  const generation=useRef(0),accountId=user?.userId || "";
  const fetchCourses=useCallback(async(silent=false)=>{
    if(!accountId)return;
    const request=++generation.current;
    setState(previous=>previous.owner===accountId?{...previous,loading:silent?previous.loading:true}:{owner:accountId,courses:[],loading:true,error:"",offline:false});
    try{
      const desktop=window.classroomDesktop?.getCachedCourses;
      const result=desktop?await desktop(accountId):null;
      if(result&&!result.ok)throw Object.assign(new Error(result.error||"Unable to load courses"),{status:result.status});
      if(desktop&&!Array.isArray(result?.data?.courses))throw Object.assign(new Error("Invalid course response"),{status:502});
      const courses=result?.data?.courses??(desktop?[]:(await workspaceRequest<{courses:WorkspaceCourse[]}>("/api/courses"))?.courses);
      if(!Array.isArray(courses))throw new Error("Invalid course response");
      if(request===generation.current)setState({owner:accountId,courses,loading:false,error:result?.cached?"offline-cache":"",offline:Boolean(result?.cached)});
    }catch(error){
      if(request!==generation.current)return;
      if((error as {status?:number}).status===401){setState({owner:"",courses:[],loading:false,error:"",offline:false});redirectToSsoLogin();return;}
      setState(previous=>({owner:accountId,courses:([403,409].includes((error as {status?:number}).status??0)?[]:previous.owner===accountId?previous.courses:[]),loading:false,error:error instanceof Error?error.message:t("common.failed"),offline:false}));
    }
  },[accountId,t]);
  const invalidateRequests=useCallback(()=>{generation.current++;},[]);
  useEffect(()=>{
    if(authLoading)return;
    if(!accountId){generation.current++;redirectToSsoLogin();return;}
    queueMicrotask(()=>{void fetchCourses();});
    return invalidateRequests;
  },[accountId,authLoading,fetchCourses,invalidateRequests]);
  useEffect(()=>{
    if(!accountId)return;
    return watchWorkspaceRefresh(()=>void fetchCourses(true));
  },[accountId,fetchCourses]);
  if(authLoading||!user)return <PageLoadingState message={t("common.loading")} variant="dashboard"/>;
  // The previous account's loaded state never reaches the next account's UI.
  const current=state.owner===accountId?state:{owner:accountId,courses:[],loading:true,error:"",offline:false};
  return <WorkspaceApp key={accountId} courses={current.courses} user={user} refresh={()=>void fetchCourses()} error={current.error} offline={current.offline} refreshing={current.loading}/>;
}
