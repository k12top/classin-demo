import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {prisma} from "@/lib/db";
import {getAliyunOssClient} from "@/lib/aliyun-oss";
import {driveFile,driveObjectKey} from "@/lib/workspace-drive";
import {taskRequestId} from "@/lib/workspace-task-validation";

export const runtime="nodejs";
export async function POST(request:NextRequest){
 const session=await getSessionFromRequest(request);if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 let input:ReturnType<typeof driveFile>,requestId:string;
 try{input=driveFile(await request.json());requestId=taskRequestId(request.headers.get("Idempotency-Key"));}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Invalid file"},{status:400});}
 try{
  const oss=getAliyunOssClient();
  const item=await prisma.$transaction(async tx=>{
   if(input.parentId&&!await tx.workspaceDriveItem.findFirst({where:{id:input.parentId,userId:session.userId,kind:"folder",status:"ready"},select:{id:true}}))return null;
   return tx.workspaceDriveItem.upsert({where:{userId_requestId:{userId:session.userId,requestId}},create:{...input,userId:session.userId,requestId,kind:"file",status:"pending",objectKey:driveObjectKey(session.userId)},update:{}});
  },{isolationLevel:"Serializable"});
  if(!item)return NextResponse.json({error:"Folder not found"},{status:404});
  if(item.kind!=="file"||item.name!==input.name||item.parentId!==input.parentId||item.size!==input.size||item.contentType!==input.contentType)return NextResponse.json({error:"Request id already used"},{status:409});
  if(item.status==="ready")return NextResponse.json({id:item.id,complete:true});
  if(item.status!=="pending")return NextResponse.json({error:"File is unavailable"},{status:409});
  if(!item.objectKey)return NextResponse.json({error:"Upload unavailable"},{status:503});
  // OSS POST policy enforces the size at storage, before accepting bytes.
  const policy={expiration:new Date(Date.now()+15*60_000).toISOString(),conditions:[{key:item.objectKey},{"Content-Type":item.contentType},["content-length-range",item.size,item.size]]};
  const signature=(oss as unknown as {calculatePostSignature:(value:typeof policy)=>{OSSAccessKeyId:string;Signature:string;policy:string}}).calculatePostSignature(policy);
  const uploadUrl=new URL(oss.signatureUrl(item.objectKey,{expires:900})).origin;
  return NextResponse.json({id:item.id,uploadUrl,fields:{key:item.objectKey,"Content-Type":item.contentType,...signature}});
 }catch{return NextResponse.json({error:"Storage unavailable"},{status:503});}
}
