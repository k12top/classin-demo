import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {directContacts} from "@/lib/workspace-direct-chat";

export async function GET(request:NextRequest){
 const session=await getSessionFromRequest(request);if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 const courseId=request.nextUrl.searchParams.get("courseId");if(!courseId||courseId.length>100)return NextResponse.json({error:"Invalid course"},{status:400});
 try{const contacts=await directContacts(session,courseId);if(!contacts)return NextResponse.json({error:"Forbidden"},{status:403});return NextResponse.json({contacts},{headers:{"Cache-Control":"no-store"}});}catch{return NextResponse.json({error:"Unable to load contacts"},{status:503});}
}
