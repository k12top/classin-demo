import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {prisma} from "@/lib/db";
import {directContacts,directPrincipal,directIsSelf} from "@/lib/workspace-direct-chat";

export async function GET(request:NextRequest){
 const session=await getSessionFromRequest(request);if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{
  const ids=[...new Set([directPrincipal(session.userId),directPrincipal(session.name||"")].filter(Boolean))];
  const where={OR:[{participantA:{in:ids}},{participantB:{in:ids}}]},cursor=request.nextUrl.searchParams.get("cursor");
  if(cursor&&!await prisma.workspaceDirectChat.findFirst({where:{...where,id:cursor},select:{id:true}}))return NextResponse.json({error:"Invalid cursor"},{status:400});
  const rows=await prisma.workspaceDirectChat.findMany({where,orderBy:[{createdAt:"desc"},{id:"desc"}],take:101,...(cursor?{cursor:{id:cursor},skip:1}:{})}),chats=rows.slice(0,100);
  const contacts=new Map<string,Awaited<ReturnType<typeof directContacts>>>();
  for(const courseId of new Set(chats.map(chat=>chat.courseId)))contacts.set(courseId,await directContacts(session,courseId));
  const reads=await prisma.workspaceDirectRead.findMany({where:{userId:session.userId,chatId:{in:chats.map(chat=>chat.id)}}});
  const visible=await Promise.all(chats.flatMap(chat=>{const members=contacts.get(chat.courseId);if(!members)return [];const peer=directIsSelf(session,chat.participantA)?chat.participantB:chat.participantA,read=reads.find(value=>value.chatId===chat.id);return [Promise.all([prisma.workspaceDirectMessage.count({where:{chatId:chat.id,senderId:{not:session.userId},...(read?{OR:[{createdAt:{gt:read.lastCreatedAt}},{createdAt:read.lastCreatedAt,id:{gt:read.lastMessageId}}]}:{})}}),prisma.workspaceDirectMessage.findFirst({where:{chatId:chat.id},orderBy:[{createdAt:"desc"},{id:"desc"}],select:{content:true,createdAt:true}})]).then(([unread,preview])=>({id:chat.id,courseId:chat.courseId,peerId:peer,peerName:members.find(member=>member.id===peer)?.name||peer,unread,preview}))];}));
  return NextResponse.json({chats:visible,nextCursor:rows.length>100?rows[99].id:null},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Unable to load conversations"},{status:503});}
}
export async function POST(request:NextRequest){
 const session=await getSessionFromRequest(request);if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 const body=await request.json().catch(()=>null);if(typeof body?.courseId!=="string"||!body.courseId||body.courseId.length>100||typeof body?.peerId!=="string"||!body.peerId||body.peerId.length>100)return NextResponse.json({error:"Invalid contact"},{status:400});
 try{
  const contacts=await directContacts(session,body.courseId);if(!contacts)return NextResponse.json({error:"Forbidden"},{status:403});
  const peerId=directPrincipal(body.peerId),peer=contacts.find(item=>item.id===peerId);if(!peer||directIsSelf(session,peerId))return NextResponse.json({error:"Contact not found"},{status:404});
  const [participantA,participantB]=[directPrincipal(session.userId),peerId].sort();if(!participantA||!participantB||participantA===participantB)return NextResponse.json({error:"Invalid contact"},{status:400});
  const chat=await prisma.workspaceDirectChat.upsert({where:{courseId_participantA_participantB:{courseId:body.courseId,participantA,participantB}},create:{courseId:body.courseId,participantA,participantB},update:{}});
  return NextResponse.json({chat:{id:chat.id,courseId:chat.courseId,peerId,peerName:peer.name}},{status:201});
 }catch{return NextResponse.json({error:"Unable to open conversation"},{status:503});}
}
