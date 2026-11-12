import {loadWorkspaceCourses} from "./workspace-load-results";
import {workspaceRequest} from "./workspace-client";
export type WorkspaceReviewTask={id:string;courseId:string;programId:string|null;unitId:string|null;title:string;dueDate:string|null;pendingCount:number};
/** Load only teacher-authorized aggregates, limiting concurrent course requests. */
export async function loadWorkspaceReviewTasks(courseIds:readonly string[],signal:AbortSignal,request:typeof workspaceRequest=workspaceRequest):Promise<WorkspaceReviewTask[]>{
 const ids=[...new Set(courseIds)];
 const results=await loadWorkspaceCourses(ids,signal,async (courseId,requestSignal)=>{const page=await request<{tasks:Omit<WorkspaceReviewTask,"courseId">[]}>(`/api/courses/${encodeURIComponent(courseId)}/assignment-review-tasks`,{signal:requestSignal});return page.tasks.map(task=>({...task,courseId}));});
 return results.flat();
}
