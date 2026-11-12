export type DriveUploadTarget={id:string;complete?:boolean;uploadUrl?:string;fields?:Record<string,string>};

function confirmed(value:unknown,id:string){
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const item=(value as {item?:unknown}).item;
 if(!item||typeof item!=="object"||Array.isArray(item))return false;
 const row=item as Record<string,unknown>;
 return row.id===id&&row.kind==="file"&&row.status==="ready";
}

/** Once storage accepts the bytes, retry only the idempotent completion step. */
export async function runDriveUpload(
 uploadedId:string|undefined,
 prepare:()=>Promise<DriveUploadTarget>,
 send:(url:string,fields:Record<string,string>)=>Promise<void>,
 complete:(id:string)=>Promise<unknown>,
 onUploaded:(id:string)=>void,
){
 const confirm=async(id:string)=>{if(!confirmed(await complete(id),id))throw new Error("Upload confirmation is unavailable");};
 if(uploadedId){await confirm(uploadedId);return;}
 const target=await prepare();
 if(!target||typeof target!=="object"||typeof target.id!=="string"||!target.id)throw new Error("Upload unavailable");
 if(target.complete===true)return;
 if(target.complete!==undefined&&target.complete!==false)throw new Error("Upload unavailable");
 if(typeof target.uploadUrl!=="string"||!target.fields||typeof target.fields!=="object"||Array.isArray(target.fields)||Object.values(target.fields).some(value=>typeof value!=="string"))throw new Error("Upload unavailable");
 await send(target.uploadUrl,target.fields);
 onUploaded(target.id);
 await confirm(target.id);
}
