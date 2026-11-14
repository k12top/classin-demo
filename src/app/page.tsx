"use client";
import {useEffect} from "react";
import {useAuth} from "@/lib/auth-context";
import {redirectToSsoLogin} from "@/lib/auth-login";
import {useTranslation} from "@/lib/i18n/context";
import {useWorkspaceCourses} from "@/lib/use-workspace-courses";
import {WorkspaceApp} from "@/components/workspace/workspace-app";
import {PageLoadingState} from "@/components/ui/page-loading-state";
export default function DashboardPage(){
  const {user,loading:authLoading}=useAuth(),{t}=useTranslation();
  const accountId=user?.userId || "";
  const current=useWorkspaceCourses(authLoading?"":accountId,true);
  useEffect(()=>{
    if(!authLoading&&!accountId)redirectToSsoLogin();
  },[accountId,authLoading]);
  if(authLoading||!user)return <PageLoadingState message={t("common.loading")} variant="dashboard"/>;
  if(current.expired)return null;
  return <WorkspaceApp key={accountId} courses={current.courses} user={user} refresh={current.refresh} error={current.error} offline={current.offline} refreshing={current.loading}/>;
}
