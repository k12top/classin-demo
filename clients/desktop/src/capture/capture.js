'use strict';
document.getElementById('cancel').onclick=()=>window.capturePicker.cancel();
(async()=>{try {
 const sources=await window.capturePicker.sources(), list=document.getElementById('sources');
 if(!sources.length){document.getElementById('error').textContent='未找到可共享内容，请检查系统屏幕录制权限后重试。';return;}
 for(const source of sources){const button=document.createElement('button'),image=document.createElement('img'),name=document.createElement('span');image.src=source.thumbnailDataUrl;image.alt='';name.textContent=source.name;button.append(image,name);button.onclick=async()=>{button.disabled=true;try{await window.capturePicker.select(source.id);}catch{document.getElementById('error').textContent='该窗口已关闭，请取消后重新选择。';button.disabled=false;}};list.append(button);}
}catch{document.getElementById('error').textContent='无法读取共享窗口，请检查系统屏幕录制权限。';}})();
