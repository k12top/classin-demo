"use client";
import type {ReactNode} from "react";
import type {AuthUser} from "@/lib/auth-context";
import {useWorkspaceCourses} from "@/lib/use-workspace-courses";
import type {WorkspaceCourse} from "@/lib/workspace-model";
import {WorkspaceApp} from "./workspace-app";

/** Reuse the real workspace navigation, actions and unread state on detail pages. */
export function WorkspaceSubpage({user,children,navigation}:{user:AuthUser;children:ReactNode;navigation?:(courses:WorkspaceCourse[])=>ReactNode}){
 const current=useWorkspaceCourses(user.userId);
 if(current.expired)return null;
 return <WorkspaceApp key={user.userId} user={user} courses={current.courses} error={current.error} refreshing={current.loading} refresh={current.refresh} navigation={navigation?.(current.courses)}>{children}</WorkspaceApp>;
}
