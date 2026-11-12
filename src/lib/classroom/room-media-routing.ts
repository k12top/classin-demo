import type {ClassroomRole} from "@/lib/classroom/types";

/** Teaching staff monitor rooms by default; assigned assistants operate in their room. */
export function controlsAssignedRoomMedia(input:{mode:string;role:ClassroomRole;roomConnected:boolean;roomMember:boolean;studentOnStage:boolean}):boolean {
  if(input.mode!=="largeClass"||!input.roomConnected)return false;
  if(input.role==="assistant")return input.roomMember;
  return input.role==="student"&&!input.studentOnStage;
}

/** Fail closed if a main-channel microphone cannot be muted before switching. */
export async function muteMainBeforeRoom(provider:{getSnapshot:()=>{local:{microphoneOn:boolean}};muteMicrophone?:()=>Promise<void>}|null):Promise<void> {
  if(!provider?.getSnapshot().local.microphoneOn)return;
  if(!provider.muteMicrophone)throw new Error("microphone-mute-unavailable");
  await provider.muteMicrophone();
  if(provider.getSnapshot().local.microphoneOn)throw new Error("microphone-still-on");
}
