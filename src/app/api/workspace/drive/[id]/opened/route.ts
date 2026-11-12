import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {prisma} from "@/lib/db";

/** Record an explicit file-open action without changing the modification time. */
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const session=await getSessionFromRequest(request);if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id}=await params;
 try{const rows=await prisma.$queryRaw<{lastOpenedAt:Date}[]>`UPDATE "WorkspaceDriveItem" SET "lastOpenedAt"=NOW() WHERE "id"=${id} AND "userId"=${session.userId} AND "kind"='file' AND "status"='ready' RETURNING "lastOpenedAt"`;
  return rows.length?NextResponse.json({openedAt:rows[0].lastOpenedAt}):NextResponse.json({error:"File not found"},{status:404});
 }catch{return NextResponse.json({error:"Unable to record file access"},{status:503});}
}
