import {taskInput} from "./workspace-task-validation";
export function assignmentDraftInput(value:unknown){
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Invalid assignment");
 const input=value as Record<string,unknown>;
 if(typeof input.description!=="string"||input.description.length>2000)throw new Error("Invalid description");
 const parsed=taskInput({title:input.title,notes:input.description,dueDate:input.dueDate});
 if(parsed.title.length>80)throw new Error("Invalid title");
 return {title:parsed.title,description:parsed.notes,dueDate:parsed.dueDate};
}
export function assignmentProgramId(value:unknown){
 if(value===null||value===undefined||value==="")return null;
 if(typeof value!=="string"||value.length>100)throw new Error("Invalid course");
 return value;
}
