import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {prisma} from "@/lib/db";
import {authorizedDirectChat} from "@/lib/workspace-direct-chat";
import {chatTranslationConfig,translateChatText} from "@/lib/classroom/server/message-translation";
import {captionLanguageOptions} from "@/lib/classroom/languages";

export const runtime="nodejs";
export const maxDuration=30;
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const session=await getSessionFromRequest(request);if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 const body=await request.json().catch(()=>null);
 if(!Array.isArray(body?.messageIds)||!body.messageIds.length||body.messageIds.length>20||body.messageIds.some((id:unknown)=>typeof id!=="string"||id.length>150)||!captionLanguageOptions("shengwang").some(item=>item.code===body.language))return NextResponse.json({error:"Invalid translation request"},{status:400});
 const {id:chatId}=await params;
 try{
  if(!await authorizedDirectChat(session,chatId))return NextResponse.json({error:"Not found"},{status:404});
  const config=chatTranslationConfig();if(!config)return NextResponse.json({error:"Translation unavailable",code:"TRANSLATION_NOT_CONFIGURED"},{status:503});
  const messages=await prisma.workspaceDirectMessage.findMany({where:{chatId,id:{in:[...new Set<string>(body.messageIds)]}},select:{id:true,content:true}});
  if(!messages.length)return NextResponse.json({translations:{}},{headers:{"Cache-Control":"no-store"}});
  const translations=await translateChatText(messages,body.language,config);
  if(!await authorizedDirectChat(session,chatId))return NextResponse.json({error:"Not found"},{status:404});
  const current=await prisma.workspaceDirectMessage.findMany({where:{chatId,id:{in:messages.map(message=>message.id)}},select:{id:true,content:true}});
  const originals=new Map(messages.map(message=>[message.id,message.content]));
  return NextResponse.json({translations:Object.fromEntries(current.filter(message=>originals.get(message.id)===message.content&&Object.hasOwn(translations,message.id)).map(message=>[message.id,translations[message.id]]))},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Translation failed"},{status:503});}
}
