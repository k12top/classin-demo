import sharp from "sharp";
import { ActivityError } from "../activities";

/** Preserve transparent pen strokes while bounding memory and stored bytes. */
export async function normalizeScreenInkImage(input: Buffer) {
  const maxBytes=2*1024*1024,maxPixels=8_000_000;
  if (!input.length || input.length>maxBytes) throw new ActivityError("Invalid ink image size",413);
  try {
    const source=sharp(input,{limitInputPixels:maxPixels,failOn:"warning"});
    const metadata=await source.metadata();
    if(metadata.format!=="png"||(metadata.pages??1)!==1||!metadata.width||!metadata.height||!metadata.hasAlpha)throw new ActivityError("Invalid ink image");
    const result=await source.webp({lossless:true,effort:3}).toBuffer({resolveWithObject:true});
    if(result.data.length>maxBytes)throw new ActivityError("Invalid ink image size",413);
    return {data:result.data,width:result.info.width,height:result.info.height,contentType:"image/webp" as const};
  } catch(error) {
    if(error instanceof ActivityError)throw error;
    throw new ActivityError("Invalid ink image");
  }
}
