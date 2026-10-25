import sharp from "sharp";
import { ActivityError } from "../activities";
import { CLASSROOM_IMAGE_MAX_BYTES } from "../chat-image-message";

export async function normalizeChatImage(input:Buffer){
 if(!input.length||input.length>CLASSROOM_IMAGE_MAX_BYTES)throw new ActivityError('Image must be at most 5 MB',413);
 try{const source=sharp(input,{limitInputPixels:16000000,failOn:'warning'}),metadata=await source.metadata();if(!['jpeg','png','webp'].includes(metadata.format||'')||(metadata.pages??1)>1)throw new ActivityError('Use a static PNG, JPEG or WebP image');
 const result=await source.rotate().resize({width:1920,height:1920,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer({resolveWithObject:true});if(result.data.length>CLASSROOM_IMAGE_MAX_BYTES)throw new ActivityError('Image is too large',413);return {data:result.data,width:result.info.width,height:result.info.height};
 }catch(error){if(error instanceof ActivityError)throw error;throw new ActivityError('Invalid image data')}
}
