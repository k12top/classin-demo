import {createHash,randomUUID} from "node:crypto";

export const DRIVE_MAX_BYTES=200*1024*1024;
export const drivePublicSelect={id:true,parentId:true,kind:true,name:true,size:true,contentType:true,status:true,createdAt:true,updatedAt:true,lastOpenedAt:true} as const;
export function driveName(value:unknown){
 if(typeof value!=="string"||!value.trim()||value.trim().length>200||/[\u0000-\u001f\u007f/\\]/.test(value))throw new Error("Invalid name");
 return value.trim();
}
export function driveParent(value:unknown){if(value===null||value===undefined||value==="")return null;if(typeof value!=="string"||value.length>100)throw new Error("Invalid folder");return value;}
export function driveFile(value:unknown){
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Invalid file");
 const input=value as Record<string,unknown>,name=driveName(input.name),parentId=driveParent(input.parentId),size=input.size;
 if(!Number.isSafeInteger(size)||(size as number)<=0||(size as number)>DRIVE_MAX_BYTES)throw new Error("File must be between 1 byte and 200 MB");
 const contentType=typeof input.contentType==="string"&&/^[\w.+-]+\/[\w.+-]+$/.test(input.contentType)&&input.contentType.length<=100?input.contentType:"application/octet-stream";
 return {name,parentId,size:size as number,contentType};
}
/** Opaque account prefix and random key; names never become object paths. */
export function driveObjectKey(userId:string){return `workspace-drive/${createHash("sha256").update(userId).digest("hex")}/${randomUUID()}`;}
