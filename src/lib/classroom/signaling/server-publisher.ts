import "server-only";
import { createHmac } from "node:crypto";
import { safePublicRealtimeEnvelope, type PublicRealtimeEnvelope } from "./committed-stream";
export type ServerRtmConfiguration = { appId: string; appCertificate: string; customerId: string; customerSecret: string };
/** Explicit activation is required; this patch never sets this environment flag. */
export function serverRtmConfiguration(env: Partial<NodeJS.ProcessEnv> = process.env): ServerRtmConfiguration | null {
  if (env.CLASSROOM_SERVER_RTM_EVENTS_ENABLED !== "true") return null;
  const values=[env.AGORA_APP_ID,env.AGORA_APP_CERTIFICATE,env.AGORA_REST_CUSTOMER_ID,env.AGORA_REST_CUSTOMER_SECRET].map(value=>value?.trim() || "");
  if (values.some(value=>!value)) throw new Error("Server Signaling configuration is incomplete");
  return {appId:values[0],appCertificate:values[1],customerId:values[2],customerSecret:values[3]};
}
export function serverRtmPublisherId(sessionId: string, config: ServerRtmConfiguration) {
  return `svr-${createHmac("sha256",config.appCertificate).update(`classroom-public:${sessionId}`).digest("hex").slice(0,48)}`;
}
export function assertClientSignalingIdentity(sessionId: string, userId: string, config: ServerRtmConfiguration) {
  if (userId===serverRtmPublisherId(sessionId,config)) throw new Error("Server Signaling identity cannot be issued to a client");
}
export async function publishServerRtmEvent(event: PublicRealtimeEnvelope, config: ServerRtmConfiguration, fetcher: typeof fetch = fetch) {
  if (!safePublicRealtimeEnvelope(event)) throw new Error("Unsafe public realtime envelope");
  if (event.audience !== "public") throw new Error("Only the public audience is implemented");
  if (event.entity === "message" && event.operation === "upsert" && event.data?.scope !== "classroom") throw new Error("Private messages cannot enter the public stream");
  if (event.entity === "courseware" && event.operation === "upsert") throw new Error("Courseware requires an authorized section read");
  const payload=JSON.stringify(event);
  if (Buffer.byteLength(payload,"utf8") > 24_000) throw new Error("Realtime envelope exceeds the application payload budget");
  const response=await fetcher(`https://api.agora.io/dev/v2/project/${encodeURIComponent(config.appId)}/rtm/users/${encodeURIComponent(serverRtmPublisherId(event.sessionId,config))}/channel_messages`,{
    method:"POST",headers:{"Content-Type":"application/json",Authorization:`Basic ${Buffer.from(`${config.customerId}:${config.customerSecret}`).toString("base64")}`},
    body:JSON.stringify({channel_name:`classroom-${event.sessionId}`,enable_historical_messaging:false,payload}),signal:AbortSignal.timeout(5_000),cache:"no-store",
  });
  if (!response.ok) throw new Error(`Server Signaling HTTP ${response.status}`);
  const result=await response.json() as {result?:unknown;code?:unknown};
  if (result.result!=="success" || result.code!=="message_sent") throw new Error("Server Signaling did not confirm delivery");
}
