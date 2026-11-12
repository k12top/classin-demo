export function workspacePreviewKind(name:string):"video"|"audio"|"image"|"pdf"|"text"|"document"{
 if (/\.mp4$/i.test(name)) return "video";
 if (/\.mp3$/i.test(name)) return "audio";
 if (/\.(png|jpe?g|webp|gif)$/i.test(name)) return "image";
 if (/\.pdf$/i.test(name)) return "pdf";
 if (/\.(txt|md|csv|json)$/i.test(name)) return "text";
 return "document";
}

export function workspacePreviewable(name:string):boolean {
 return workspacePreviewKind(name)!=="document";
}
