import type {WorkspaceTask} from "./workspace-client";

/** A write receipt must identify the requested task and the new version. */
export function taskToggleReceipt(value:unknown,previous:WorkspaceTask,completed:boolean):WorkspaceTask|null {
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  const task=(value as {task?:unknown}).task;
  if(!task||typeof task!=="object"||Array.isArray(task))return null;
  const row=task as Record<string,unknown>;
  const nullableString=(item:unknown)=>item===null||typeof item==="string";
  if(row.id!==previous.id||row.completed!==completed||!Number.isSafeInteger(row.version)||Number(row.version)<=previous.version||typeof row.title!=="string"||typeof row.notes!=="string"||!nullableString(row.dueDate)||!nullableString(row.courseId)||!nullableString(row.sessionId))return null;
  return row as WorkspaceTask;
}

/** Reconcile a failed or lost write response against a fresh account-scoped read. */
export function taskToggleOutcome(tasks:WorkspaceTask[]|null,id:string,completed:boolean):"confirmed"|"changed"|"unknown" {
  if(!tasks)return "unknown";
  const current=tasks.find(task=>task.id===id);
  return current && current.completed===completed ? "confirmed" : "changed";
}
