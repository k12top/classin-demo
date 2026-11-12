import {loadWorkspaceCourses} from "./workspace-load-results";
import {workspaceRequest} from "./workspace-client";
export type WorkspaceStudentAssignment={id:string;courseId:string;programId:string|null;unitId:string|null;title:string;dueDate:string|null};
export async function loadWorkspaceStudentAssignments(courseIds:readonly string[],signal:AbortSignal,request:typeof workspaceRequest=workspaceRequest){
 const ids=[...new Set(courseIds)];
 const results=await loadWorkspaceCourses(ids,signal,async (courseId,requestSignal)=>{const tasks:WorkspaceStudentAssignment[]=[],seen=new Set<string>();let cursor:string|null=null;
  do{const query=cursor?`?cursor=${encodeURIComponent(cursor)}`:"";const result:{tasks:Omit<WorkspaceStudentAssignment,"courseId">[];nextCursor:string|null}=await request(`/api/courses/${encodeURIComponent(courseId)}/assignment-student-tasks${query}`,{signal:requestSignal});tasks.push(...result.tasks.map(task=>({...task,courseId})));cursor=result.nextCursor;if(cursor&&seen.has(cursor))throw new Error("Repeated assignment cursor");if(cursor)seen.add(cursor);}while(cursor);
  return tasks;
 });
 return results.flat();
}
