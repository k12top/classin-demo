/* eslint-disable @typescript-eslint/no-require-imports -- Build asset generator. */
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process'),sharp=require('sharp');
const root=path.resolve(__dirname,'../../..'),output=path.join(__dirname,'../resources');
async function generate(){
 const background=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect x="50" y="50" width="924" height="924" rx="205" fill="#fbfbfd" stroke="#e5e4eb" stroke-width="6"/></svg>');
 const logo=await sharp(await fs.readFile(path.join(root,'public/site-logo.svg'))).resize(640,640).png().toBuffer();
 await fs.mkdir(output,{recursive:true});
 const png=await sharp(background).composite([{input:logo,left:192,top:192}]).png().toBuffer();
 await fs.writeFile(path.join(output,'app-icon.png'),png);
 const sizes=[16,24,32,48,64,128,256],images=await Promise.all(sizes.map(size=>sharp(png).resize(size,size).png().toBuffer()));
 const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
 images.forEach((image,index)=>{const at=6+index*16,size=sizes[index];header[at]=size===256?0:size;header[at+1]=header[at];header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(image.length,at+8);header.writeUInt32LE(offset,at+12);offset+=image.length;});
 await fs.writeFile(path.join(output,'app-icon.ico'),Buffer.concat([header,...images]));
 if(process.platform==='darwin'){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'classroom-icon-')),set=path.join(temp,'app.iconset');
  try{await fs.mkdir(set);for(const size of [16,32,128,256,512])for(const scale of [1,2])await sharp(png).resize(size*scale,size*scale).png().toFile(path.join(set,`icon_${size}x${size}${scale===2?'@2x':''}.png`));execFileSync('/usr/bin/iconutil',['-c','icns','-o',path.join(output,'app-icon.icns'),set]);}finally{await fs.rm(temp,{recursive:true,force:true});}
 }
}
module.exports={generate};
if(require.main===module)generate().catch(error=>{console.error(error);process.exitCode=1;});
