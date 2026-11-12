'use strict';
const locale=(navigator.language||'en').toLowerCase();
document.getElementById('label').textContent=locale.startsWith('zh-tw')?'老師':locale.startsWith('zh')?'老师':locale.startsWith('vi')?'Giáo viên':'Teacher';
const feedback=document.querySelector('.click-feedback');
window.teacherPointer?.onClick(()=>{
 feedback.getAnimations().forEach(animation=>animation.cancel());
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 feedback.animate(reduced?[{opacity:.75},{opacity:0}]:[{opacity:.8,transform:'scale(.45)'},{opacity:0,transform:'scale(1.5)'}],{duration:reduced?120:220,easing:'cubic-bezier(.16,1,.3,1)'});
});
