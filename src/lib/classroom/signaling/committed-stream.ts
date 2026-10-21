/** Prepared public-stream protocol. Only an identity learned from authenticated
 * HTTPS may supply the native publisher ID. This is not a peer authority check. */
export type RealtimeWatermark = { epoch: string; sequence: number };
export type PublicRealtimeEnvelope = RealtimeWatermark & {
  version: 1; eventId: string; sessionId: string; audience: "public";
  entity: "caption" | "message" | "stage" | "courseware";
  entityId: string; entityVersion: number; operation: "upsert" | "delete" | "invalidate";
  data?: Record<string, unknown>;
};
export function createCommittedStream(input: {
  sessionId: string; serverPublisherId: string;
  apply: (event: PublicRealtimeEnvelope) => void; recover: () => void;
}) {
  let watermark: RealtimeWatermark | null = null;
  let waiting = false;
  const versions = new Map<string, number>();
  const retired = new Set<string>();
  const recover = () => { if (!waiting) { waiting = true; input.recover(); } };
  return {
    reset(next: RealtimeWatermark, entities: { entity: string; id: string; version: number }[] = []) {
      if (!next.epoch || !Number.isSafeInteger(next.sequence) || next.sequence < 0) throw new Error("Invalid authoritative stream watermark");
      if (watermark?.epoch === next.epoch && next.sequence < watermark.sequence) throw new Error("Snapshot watermark went backwards");
      if (watermark && watermark.epoch !== next.epoch) retired.add(watermark.epoch);
      watermark = next; waiting = false; versions.clear();
      for (const entity of entities) versions.set(`${entity.entity}:${entity.id}`, entity.version);
      while (retired.size > 8) retired.delete(retired.values().next().value!);
    },
    receive(value: unknown, publisherId?: string): "applied" | "ignored" | "recovering" {
      if (publisherId !== input.serverPublisherId || !value || typeof value !== "object") return "ignored";
      const event=value as PublicRealtimeEnvelope;
      if (event.version !== 1 || event.sessionId !== input.sessionId || event.audience !== "public" || typeof event.epoch !== "string" || typeof event.eventId !== "string" || event.eventId.length > 128 || typeof event.entityId !== "string" || event.entityId.length > 240 || !["caption","message","stage","courseware"].includes(event.entity) || !["upsert","delete","invalidate"].includes(event.operation) || !Number.isSafeInteger(event.sequence) || event.sequence <= 0 || !Number.isSafeInteger(event.entityVersion) || event.entityVersion < 0) return "ignored";
      if (!safePublicRealtimeEnvelope(event) || retired.has(event.epoch)) return "ignored";
      if (!watermark || event.epoch !== watermark.epoch || event.sequence > watermark.sequence + 1) { recover(); return "recovering"; }
      if (waiting) return "recovering";
      if (event.sequence <= watermark.sequence) return "ignored";
      const key=`${event.entity}:${event.entityId}`;
      // Advance only after apply succeeds. Deletion versions remain tombstones
      // until the next authoritative snapshot seeds the entity-version map.
      if (event.entityVersion > (versions.get(key) ?? -1)) {
        input.apply(event);
        versions.set(key,event.entityVersion);
      }
      watermark={epoch:event.epoch,sequence:event.sequence};
      return "applied";
    },
  };
}

/** One public DTO contract for producer and receiver. Unknown fields are
 * rejected so tokens, private recipients and download URLs cannot hitchhike. */
export function safePublicRealtimeEnvelope(event: PublicRealtimeEnvelope): boolean {
  const root=new Set(["version","eventId","sessionId","audience","epoch","sequence","entity","entityId","entityVersion","operation","data"]);
  if (Object.keys(event).some(key=>!root.has(key)) || event.audience!=="public") return false;
  if (event.entity==="courseware") return event.operation==="invalidate" && event.entityId==="collection" && event.data===undefined;
  if (event.operation!=="upsert") return event.data===undefined;
  const data=event.data;
  if (!data || Array.isArray(data) || typeof data!=="object") return false;
  const keys=event.entity==="stage" ? ["stageMode","stageLocked","activeCoursewareId"] : event.entity==="caption" ? ["id","text","speakerId","speakerName","sourceLanguage","detectedLanguage","translations","isFinal","occurredAt","createdAt","updatedAt","provider","translationStatus"] : ["id","senderId","senderName","senderRole","scope","spaceId","recipientId","kind","content","deletedAt","createdAt"];
  if (Object.keys(data).some(key=>!keys.includes(key))) return false;
  if (event.entity==="message") return data.scope==="classroom" && !data.recipientId && !data.spaceId && data.id===event.entityId && typeof data.content==="string";
  if (event.entity==="caption") return data.id===event.entityId && typeof data.text==="string" && typeof data.speakerName==="string";
  return ["auto","screen","whiteboard","spotlight"].includes(String(data.stageMode)) && typeof data.stageLocked==="boolean" && (data.activeCoursewareId===null || typeof data.activeCoursewareId==="string");
}
