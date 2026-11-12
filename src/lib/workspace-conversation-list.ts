import type {WorkspaceCourse} from "./workspace-model";
import type {DirectChat} from "./workspace-direct-chat-list";

type Preview={content:string;createdAt:string};
export type ConversationRow={kind:"class";course:WorkspaceCourse;preview:Preview|null}|{kind:"direct";chat:DirectChat;preview:Preview|null};
/** Sort only the already-authorized conversations; preserve their order on ties. */
export function workspaceConversationList(courses:readonly WorkspaceCourse[],direct:readonly DirectChat[],previews:Record<string,Preview|null>,query:string,filter:"all"|"direct"):ConversationRow[]{
 const needle=query.trim().toLocaleLowerCase();
 const rows:ConversationRow[]=[...direct.filter(chat=>chat.peerName.toLocaleLowerCase().includes(needle)).map(chat=>({kind:"direct" as const,chat,preview:chat.preview||null})),...(filter==="all"?courses.filter(course=>course.name.toLocaleLowerCase().includes(needle)).map(course=>({kind:"class" as const,course,preview:previews[course.id]||null})):[])];
 const time=(row:ConversationRow)=>{const value=Date.parse(row.preview?.createdAt||"");return Number.isFinite(value)?value:0;};
 return rows.map((row,index)=>({row,index})).sort((a,b)=>time(b.row)-time(a.row)||a.index-b.index).map(entry=>entry.row);
}
