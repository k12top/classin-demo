import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { safePublicRealtimeEnvelope, type PublicRealtimeEnvelope } from "../signaling/committed-stream";
import { publishServerRtmEvent, type ServerRtmConfiguration } from "../signaling/server-publisher";
type Sql = Pick<Prisma.TransactionClient,"$queryRaw" | "$executeRaw">;
/** Prepared adapter: call inside the state mutation's transaction after the
 * reviewed schema exists. No routes call this adapter in the delivered build. */
export async function enqueuePublicRealtimeEvent(tx: Sql, change: Omit<PublicRealtimeEnvelope,"version"|"eventId"|"epoch"|"sequence"|"audience">) {
  if (change.entity === "message" && change.operation === "upsert" && change.data?.scope !== "classroom") throw new Error("Private audience rejected");
  if (change.entity === "courseware" && change.operation === "upsert") throw new Error("Courseware must be read with viewer authorization");
  if (!Number.isSafeInteger(change.entityVersion) || change.entityVersion < 0) throw new Error("Invalid entity version");
  const rows=await tx.$queryRaw<{epoch:string;sequence:bigint}[]>`
    INSERT INTO "ClassroomRealtimeStream" ("sessionId","audience","epoch","sequence") VALUES (${change.sessionId},'public',${randomUUID()},1)
    ON CONFLICT ("sessionId","audience") DO UPDATE SET "sequence"="ClassroomRealtimeStream"."sequence"+1 RETURNING "epoch","sequence"`;
  const sequence=Number(rows[0].sequence);
  if (!Number.isSafeInteger(sequence)) throw new Error("Realtime sequence exhausted");
  const event:PublicRealtimeEnvelope={...change,version:1,eventId:randomUUID(),audience:"public",epoch:rows[0].epoch,sequence};
  if (Buffer.byteLength(JSON.stringify(event),"utf8")>24_000) { event.operation="invalidate"; delete event.data; }
  if (!safePublicRealtimeEnvelope(event)) throw new Error("Unsafe public realtime envelope");
  await tx.$executeRaw`INSERT INTO "ClassroomRealtimeOutbox" ("id","sessionId","audience","epoch","sequence","payload") VALUES (${event.eventId},${event.sessionId},'public',${event.epoch},${sequence},${JSON.stringify(event)}::jsonb)`;
  if (change.operation === "delete") await tx.$executeRaw`
    INSERT INTO "ClassroomRealtimeTombstone" ("sessionId","audience","entity","entityId","entityVersion") VALUES (${change.sessionId},'public',${change.entity},${change.entityId},${change.entityVersion})
    ON CONFLICT ("sessionId","audience","entity","entityId") DO UPDATE SET "entityVersion"=GREATEST("ClassroomRealtimeTombstone"."entityVersion",EXCLUDED."entityVersion")`;
  return event;
}
/** Lease only the oldest unfinished event of a stream. Publication is outside
 * the transaction; ambiguous sends retry the same event ID and sequence. */
export async function deliverPublicRealtimeEvent(database: Sql & { $transaction<T>(run:(tx:Sql)=>Promise<T>):Promise<T> }, config: ServerRtmConfiguration, fetcher: typeof fetch = fetch) {
  const claim=randomUUID();
  const row=await database.$transaction(async tx=>{
    const rows=await tx.$queryRaw<{id:string;payload:PublicRealtimeEnvelope;attempts:number}[]>`
      SELECT e."id",e."payload",e."attempts" FROM "ClassroomRealtimeOutbox" e
      WHERE e."deliveredAt" IS NULL AND e."nextAttemptAt" <= NOW() AND (e."lockedUntil" IS NULL OR e."lockedUntil" <= NOW())
      AND NOT EXISTS (SELECT 1 FROM "ClassroomRealtimeOutbox" older WHERE older."sessionId"=e."sessionId" AND older."audience"=e."audience" AND older."deliveredAt" IS NULL AND older."sequence"<e."sequence")
      ORDER BY e."createdAt",e."sequence" LIMIT 1 FOR UPDATE OF e SKIP LOCKED`;
    const row=rows[0];if(!row)return null;
    await tx.$executeRaw`UPDATE "ClassroomRealtimeOutbox" SET "claim"=${claim},"lockedUntil"=NOW()+INTERVAL '30 seconds',"attempts"="attempts"+1 WHERE "id"=${row.id}`;
    return row;
  });
  if (!row) return "empty";
  try {
    await publishServerRtmEvent(row.payload,config,fetcher);
    const marked = await database.$executeRaw`UPDATE "ClassroomRealtimeOutbox" SET "deliveredAt"=NOW(),"lockedUntil"=NULL,"claim"=NULL WHERE "id"=${row.id} AND "claim"=${claim}`;
    return marked === 1 ? "delivered" : "retry";
  } catch {
    const delay=Math.min(300,2**Math.min(row.attempts+1,8));
    await database.$executeRaw`UPDATE "ClassroomRealtimeOutbox" SET "nextAttemptAt"=NOW()+${delay}*INTERVAL '1 second',"lockedUntil"=NULL,"claim"=NULL WHERE "id"=${row.id} AND "claim"=${claim}`;
    return "retry";
  }
}
