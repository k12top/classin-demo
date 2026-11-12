import type {CaptionDisplayMode} from "./caption-display";

export type CaptionAppearance = {background:"solid"|"transparent";size:"small"|"medium"|"large";position:"top"|"bottom"};
export type PlaybackCaptionPreferences = {mode:CaptionDisplayMode;language:string;appearance:CaptionAppearance};
type StorageAccess = () => Pick<Storage,"getItem"|"setItem">;

export function readPlaybackCaptionPreferences(storage:StorageAccess):PlaybackCaptionPreferences {
  let mode:string|null=null,language:string|null=null,background:string|null=null,size:string|null=null,position:string|null=null;
  try {
    const source=storage();
    mode=source.getItem("playback_caption_mode");language=source.getItem("playback_caption_language");
    background=source.getItem("playback_caption_background");size=source.getItem("playback_caption_size");position=source.getItem("playback_caption_position");
  } catch { /* Storage can be unavailable in private or embedded contexts. */ }
  return {mode:mode==="original"||mode==="translated"||mode==="bilingual"?mode:"off",language:language||"",appearance:{background:background==="transparent"?"transparent":"solid",size:size==="small"||size==="large"?size:"medium",position:position==="top"?"top":"bottom"}};
}

export function writePlaybackCaptionPreferences(storage:StorageAccess,value:PlaybackCaptionPreferences):void {
  try {
    const target=storage();
    target.setItem("playback_caption_mode",value.mode);target.setItem("playback_caption_language",value.language);
    target.setItem("playback_caption_background",value.appearance.background);target.setItem("playback_caption_size",value.appearance.size);target.setItem("playback_caption_position",value.appearance.position);
  } catch { /* The current view continues using its in-memory settings. */ }
}
