export type TaskInput = { title:string; notes:string; dueDate:string|null; courseId:string|null; sessionId:string|null };
export function taskInput(value:unknown):TaskInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid task");
  const input=value as Record<string,unknown>;
  if(typeof input.title!=="string" || !input.title.trim() || input.title.trim().length>200)throw new Error("Task title must contain 1–200 characters");
  if(input.notes!==undefined && (typeof input.notes!=="string" || input.notes.length>4000))throw new Error("Task notes are too long");
  if(input.dueDate!==undefined && input.dueDate!==null && input.dueDate!==""){
    if(typeof input.dueDate!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) || !Number.isFinite(Date.parse(input.dueDate)) || new Date(input.dueDate).toISOString().slice(0,10)!==input.dueDate)throw new Error("Invalid due date");
  }
  if(input.courseId!==undefined&&input.courseId!==null&&input.courseId!==""&&(typeof input.courseId!=="string"||input.courseId.length>100))throw new Error("Invalid course");
  if(input.sessionId!==undefined&&input.sessionId!==null&&input.sessionId!==""&&(typeof input.sessionId!=="string"||input.sessionId.length>100))throw new Error("Invalid lesson");
  if(input.sessionId && !input.courseId)throw new Error("A lesson requires a class");
  return {title:input.title.trim(),notes:(input.notes as string | undefined)||"",dueDate:(input.dueDate as string)||null,courseId:(input.courseId as string)||null,sessionId:(input.sessionId as string)||null};
}
export function taskRequestId(value:string|null){if(!value || !/^[a-zA-Z0-9_-]{8,100}$/.test(value))throw new Error("Invalid request id");return value;}
