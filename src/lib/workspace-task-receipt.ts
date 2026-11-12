import type {WorkspaceTask} from "./workspace-client";
import {taskInput} from "./workspace-task-validation";

/** Validate the saved fields before clearing the recovery record or closing the form. */
export function taskSaveReceipt(value:unknown,body:string,previous?:WorkspaceTask):WorkspaceTask|null {
  try {
    if(!value||typeof value!=="object"||Array.isArray(value))return null;
    const row=(value as {task?:unknown}).task;
    if(!row||typeof row!=="object"||Array.isArray(row))return null;
    const task=row as Record<string,unknown>,input=taskInput(JSON.parse(body));
    if(typeof task.id!=="string"||!task.id||typeof task.completed!=="boolean"||!Number.isSafeInteger(task.version)||Number(task.version)<0)return null;
    if(previous&&(task.id!==previous.id||task.completed!==previous.completed||Number(task.version)<=previous.version))return null;
    if(!previous&&task.completed!==false)return null;
    if(task.title!==input.title||task.notes!==input.notes||task.dueDate!==input.dueDate||task.courseId!==input.courseId||task.sessionId!==input.sessionId)return null;
    return task as WorkspaceTask;
  }catch{return null;}
}

export function taskDeleteReceipt(value:unknown):boolean {
  return Boolean(value&&typeof value==="object"&&!Array.isArray(value)&&(value as {deleted?:unknown}).deleted===true);
}
