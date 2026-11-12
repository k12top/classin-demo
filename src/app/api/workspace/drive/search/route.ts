import {NextRequest,NextResponse} from 'next/server';
import {getSessionFromRequest} from '@/lib/session';
import {prisma} from '@/lib/db';
export async function GET(request:NextRequest){
 const session=await getSessionFromRequest(request);if(!session)return NextResponse.json({error:'Unauthorized'},{status:401});
 const query=request.nextUrl.searchParams.get('q')?.trim()||'';
 if(!query||query.length>100)return NextResponse.json({error:'Invalid search'},{status:400});
 try{
  const rows=await prisma.workspaceDriveItem.findMany({where:{userId:session.userId,kind:'file',status:'ready',name:{contains:query,mode:'insensitive'}},select:{id:true,name:true,size:true},orderBy:[{updatedAt:'desc'},{id:'desc'}],take:21});
  return NextResponse.json({files:rows.slice(0,20),hasMore:rows.length>20},{headers:{'Cache-Control':'private, no-store'}});
 }catch{return NextResponse.json({error:'File search unavailable'},{status:503});}
}
