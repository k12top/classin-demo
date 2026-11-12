import {loadWorkspaceCourses} from "./workspace-load-results";
import {workspaceRequest} from "./workspace-client";

export type WorkspaceAssignmentDraft={id:string;courseId:string;programId:string|null;unitId:string|null;title:string;description:string;dueDate:string|null};

/** Read complete teacher-authorized course lists, with bounded concurrency. */
export async function loadWorkspaceAssignmentDrafts(courseIds:readonly string[],signal:AbortSignal,request:typeof workspaceRequest=workspaceRequest):Promise<WorkspaceAssignmentDraft[]> {
 const ids=[...new Set(courseIds)];
 const results=await loadWorkspaceCourses(ids,signal,async (courseId,requestSignal)=>{
   const items:WorkspaceAssignmentDraft[]=[],seen=new Set<string>();let cursor:string|null=null;
   do{
    const query=new URLSearchParams({allPrograms:"1"});if(cursor)query.set("cursor",cursor);
    const page:{drafts:Omit<WorkspaceAssignmentDraft,"courseId">[];nextCursor:string|null}=await request(`/api/courses/${encodeURIComponent(courseId)}/assignments?${query}`,{signal:requestSignal});
    items.push(...page.drafts.map(draft=>({...draft,courseId})));cursor=page.nextCursor;
    if(cursor&&seen.has(cursor))throw new Error("Repeated assignment cursor");if(cursor)seen.add(cursor);
   }while(cursor);
   return items;
 });
 return results.flat();
}
