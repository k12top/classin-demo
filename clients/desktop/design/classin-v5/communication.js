'use strict';
paths.chat = '<path d="M21 12a8 8 0 0 1-8 8H5l-3 2V10a8 8 0 0 1 8-8h3a8 8 0 0 1 8 8Z"/><path d="M7 10h.01M12 10h.01M17 10h.01"/>';
paths.send = '<path d="m3 3 18 9-18 9 3-9Zm3 9h15"/>';
paths.help = '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 2-2.5 2-2.5 4M12 17h.01"/>';
const conversations = [
  {id:'class-base',name:'Python 算法基础班',classId:'base',kind:'class',unread:2,time:'14:58',messages:[{by:'system',text:'11月8日 周日'},{by:'me',text:'同学们，今天我们学习双指针与有序数组。课前可以先复习数组的遍历。',time:'14:30'},{by:'liming',text:'老师，今天的讲义在哪里可以查看？',time:'14:52'},{by:'xiaolin',text:'我已经完成课前练习，期待今天的课！',time:'14:58'}]},
  {id:'private-liming',name:'李明',studentId:'liming',kind:'private',unread:1,time:'14:45',messages:[{by:'system',text:'11月8日 周日'},{by:'liming',text:'老师好，二分查找最后一次练习我有个问题。',time:'14:43'},{by:'me',text:'可以把你的思路写下来，我们一起看看边界如何更新。',time:'14:44'},{by:'liming',text:'好的，我先整理一下。',time:'14:45'}]},
  {id:'class-advanced',name:'Python 进阶班',classId:'advanced',kind:'class',unread:0,time:'昨天',messages:[{by:'system',text:'11月7日 周六'},{by:'me',text:'明天19:00学习滑动窗口，大家可以提前准备好代码编辑器。',time:'18:20'},{by:'qiqi',text:'收到，老师。',time:'18:25'}]},
];
Object.assign(state,{conversation:'class-base',chatFilter:'all',chatDrafts:{},globalQuery:''});
function chatUnread(){return conversations.reduce((sum,c)=>sum+c.unread,0);}
function chatAvatar(conversation){return conversation.kind==='class'?h('span',{class:`chat-avatar class-avatar ${conversation.classId==='advanced'?'sand':''}`},icon('students',19)):h('span',{class:'chat-avatar'},conversation.name.slice(0,1));}
function closeAccountMenu(){const menu=document.getElementById('account-menu');if(menu){menu.hidePopover();menu.remove();}navigation.querySelector('.profile-row')?.setAttribute('aria-expanded','false');}
function closeQuickMenu(){const menu=document.getElementById('quick-create-menu');if(menu){menu.hidePopover();menu.remove();}document.getElementById('quick-create')?.setAttribute('aria-expanded','false');}
function accountAction(name){closeAccountMenu();if(name==='账号设置'){modal('账号设置',h('div',{class:'account-settings'},h('span',{class:'profile-avatar'},'陈'),h('h3',{},'陈老师'),h('p',{class:'muted'},'教师账号'),h('dl',{class:'settings-info'},h('dt',{},'账号身份'),h('dd',{},'教师'),h('dt',{},'工作空间'),h('dd',{},'翔宇文淑课堂')),h('p',{class:'detail-note'},'此处为账号信息示例，未连接账号服务。')),'关闭',()=>{});}else if(name==='设置'){modal('设置',h('div',{class:'settings-rows'},h('div',{},h('strong',{},'外观'),h('span',{},'浅色 · 跟随当前设计')),h('div',{},h('strong',{},'消息通知'),h('span',{},'默认开启 · 示例')),h('div',{},h('strong',{},'语言'),h('span',{},'简体中文')),h('p',{class:'detail-note'},'设置内容为设计展示，未更改系统偏好。')),'关闭',()=>{});}else if(name==='设备检测'){modal('设备检测',h('div',{class:'preview-sheet'},h('h3',{},'上课前检查设备'),h('p',{},'摄像头、麦克风和扬声器将在真实客户端中进行检测。'),h('small',{},'设计预览不申请摄像头或麦克风权限。')),'关闭',()=>{});}else{modal('帮助与关于',h('div',{class:'preview-sheet'},h('h3',{},'翔宇文淑课堂'),h('p',{},'桌面工作台 · 设计预览'),h('small',{},'所有课堂、会话与账号信息均为本地示例。')),'关闭',()=>{});}}
function toggleAccountMenu(){
  if(document.getElementById('account-menu')?.matches(':popover-open')){closeAccountMenu();return;}closeAccountMenu();closeQuickMenu();
  const panel=h('div',{id:'account-menu',popover:'auto',class:'account-popover',role:'menu','aria-label':'账号与设置'},h('div',{class:'account-menu-profile'},h('span',{class:'profile-avatar'},'陈'),h('div',{},h('strong',{},'陈老师'),h('small',{},'教师账号'))));
  for(const [name,symbol] of [['账号设置','students'],['设置','settings'],['设备检测','courses'],['帮助与关于','help']])panel.append(button([icon(symbol,16),name],()=>accountAction(name),'account-menu-item',{role:'menuitem'}));
  panel.addEventListener('toggle',e=>navigation.querySelector('.profile-row')?.setAttribute('aria-expanded',String(e.newState==='open')));document.body.append(panel);panel.showPopover();panel.querySelector('[role=menuitem]').focus();
}
function renderGlobalActions(){
  const next=lessons.filter(l=>!l.done&&l.date>=today).sort((a,b)=>`${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`))[0];
  const trigger=button(icon('plus',18),toggleQuickCreate,'top-icon',{'aria-label':'新建课堂或班级','aria-haspopup':'menu','aria-expanded':false,id:'quick-create'});
  document.getElementById('global-actions').replaceChildren(button(icon('search',18),globalSearch,'top-icon',{'aria-label':'全局搜索'}),button(next?[h('span',{class:'lesson-live-dot'}),`${next.date===today?'下节课':dateLabel(next.date)} ${next.start}`,h('span',{},'· 上课')]:['暂无待上课课节'],()=>{if(next)lessonDialog(next);else go('calendar');},'window-lesson',{'aria-label':next?`下节课 ${next.title} ${next.start}`:'查看课表'}),trigger);
}
function toggleQuickCreate(){
  if(document.getElementById('quick-create-menu')?.matches(':popover-open')){closeQuickMenu();return;}closeQuickMenu();closeAccountMenu();const menu=h('div',{id:'quick-create-menu',class:'quick-create-popover',popover:'auto',role:'menu','aria-label':'课堂快捷新建'});
  for(const [label,symbol,action] of [['新建课堂','courses',createLesson],['新建班级','students',createClass]])menu.append(button([icon(symbol,16),label],()=>{closeQuickMenu();action();},'account-menu-item',{role:'menuitem'}));
  menu.addEventListener('toggle',e=>document.getElementById('quick-create')?.setAttribute('aria-expanded',String(e.newState==='open')));document.body.append(menu);menu.showPopover();const trigger=document.getElementById('quick-create').getBoundingClientRect();menu.style.left=`${Math.min(trigger.left,innerWidth-210)}px`;menu.style.top=`${trigger.bottom+8}px`;menu.querySelector('[role=menuitem]').focus();
}
function createLesson(){
  const classField=h('select',{'aria-label':'课堂所属班级'},classes.map(c=>h('option',{value:c.id},c.course)));classField.value=state.classId;
  const title=h('input',{'aria-label':'课堂名称',placeholder:'例如：双指针综合练习',maxlength:60,required:true});
  const date=h('input',{type:'date',value:today,'aria-label':'课堂日期',required:true}),start=h('input',{type:'time',value:'16:00','aria-label':'开始时间',required:true}),end=h('input',{type:'time',value:'17:00','aria-label':'结束时间',required:true});
  const error=h('p',{class:'form-error',role:'alert'});
  modal('新建课堂',h('div',{class:'lesson-form'},h('label',{},'所属班级',classField),h('label',{},'课堂名称',title),h('label',{},'日期',date),h('div',{class:'row'},h('label',{},'开始时间',start),h('label',{},'结束时间',end)),error,h('p',{class:'detail-note'},'创建后显示在本地日历和课节列表，刷新将恢复示例数据。')),'创建课堂',()=>{
    if(!title.value.trim()){error.textContent='请填写课堂名称。';title.focus();return false;}if(!date.value||date.value<today){error.textContent='请选择示例日期 11月8日或之后的日期。';return false;}if(!start.value||!end.value||end.value<=start.value){error.textContent='结束时间需要晚于开始时间。';return false;}
    const id=crypto.randomUUID();lessons.push({id,classId:classField.value,title:title.value.trim(),no:String(Math.max(0,...lessons.filter(l=>l.classId===classField.value).map(l=>Number(l.no)))+1).padStart(2,'0'),date:date.value,start:start.value,end:end.value,done:false});
    tasks.push({id:crypto.randomUUID(),title:title.value.trim(),classId:classField.value,type:'课节',due:date.value,status:date.value===today?'pending':'scheduled',detail:`${start.value}–${end.value} · 新建课节`,lesson:id,action:'查看课节'});state.classId=classField.value;state.calendarDate=date.value;state.month=date.value.slice(0,8)+'01';state.calendarClass='all';go('calendar');toast('示例课堂已创建');
  });title.focus();
}
function globalSearch(){
  const input=h('input',{type:'search',placeholder:'搜索班级、学生或会话','aria-label':'全局搜索关键词',class:'global-search-input'}),results=h('div',{class:'global-search-results'});
  const pane=modal('搜索',h('div',{},input,results),'关闭',()=>{});
  function update(){const q=input.value.trim().toLowerCase();results.replaceChildren();if(!q){results.append(h('p',{class:'small'},'输入名称，快速前往班级、学生或聊天。'));return;}
    const items=[...classes.map(c=>({name:c.course,type:'班级',symbol:'courses',action:()=>openClass(c.id)})),...students.map(s=>({name:s.name,type:'学生',symbol:'students',action:()=>{state.student=s.id;go('students');}})),...conversations.map(c=>({name:c.name,type:'聊天',symbol:'chat',action:()=>openConversation(c)}))].filter(item=>item.name.toLowerCase().includes(q));
    if(!items.length)results.append(h('p',{class:'small'},'没有找到匹配内容，请尝试其他名称。'));
    for(const item of items)results.append(button([icon(item.symbol,17),h('span',{class:'grow'},item.name),h('small',{},item.type)],()=>{pane.close();item.action();},'global-search-result'));
  }input.addEventListener('input',update);update();input.focus();
}
function openConversation(conversation){state.chatToLatest=true;state.conversation=conversation.id;conversation.unread=0;go('chat');}
function openStudentChat(student){let c=conversations.find(item=>item.studentId===student.id);if(!c){c={id:`private-${student.id}`,studentId:student.id,name:student.name,kind:'private',unread:0,time:'现在',messages:[]};conversations.unshift(c);}openConversation(c);}
function chatView(){
  const conversation=conversations.find(c=>c.id===state.conversation)||conversations[0];conversation.unread=0;
  // Refresh only the unread badge after opening a conversation; no network side effect.
  const unread=navigation.querySelector('.nav-unread');if(unread){if(chatUnread())unread.textContent=chatUnread();else unread.remove();}
  const matches=conversations.filter(c=>(state.chatFilter==='all'||c.kind==='private')&&c.name.toLowerCase().includes(state.query.toLowerCase()));
  const side=h('aside',{class:'chat-sidebar'},h('header',{},h('div',{class:'section-head'},h('h1',{},'聊天'),iconButton('plus','发起聊天',newChat)),pageSearch('搜索会话')),h('div',{class:'chat-list-tabs'},[['all','全部'],['private','私聊']].map(([id,label])=>button(label,()=>{state.chatFilter=id;render();},'',{'aria-pressed':state.chatFilter===id}))),h('ul',{class:'conversation-list','aria-label':'会话列表'},matches.map(c=>{const last=c.messages.filter(m=>m.by!=='system').at(-1);return h('li',{},button([chatAvatar(c),h('span',{class:'conversation-copy'},h('span',{class:'conversation-title'},h('strong',{},c.name),h('time',{},c.time)),h('span',{class:'conversation-snippet'},last?.text||'开始一段新的对话')),c.unread?h('span',{class:'chat-unread'},c.unread):null],()=>openConversation(c),'conversation-choice',{'aria-current':c.id===conversation.id?'page':null,'aria-label':`打开会话 ${c.name}`}));})));
  if(!matches.length)side.querySelector('ul').append(h('li',{class:'chat-empty-search'},'没有找到匹配会话'));
  const content=h('section',{class:'chat-content','aria-label':`与${conversation.name}的会话`},h('header',{class:'chat-header'},chatAvatar(conversation),h('div',{class:'grow'},h('h1',{},conversation.name),h('p',{},conversation.kind==='class'?`${classes.find(c=>c.id===conversation.classId)?.members.length||0} 名学生 · 班级群聊`:'学生 · 私聊')),conversation.kind==='class'?button('查看班级',()=>openClass(conversation.classId),'text-btn'):button('查看学生',()=>{state.student=conversation.studentId;go('students');},'text-btn')));
  if(conversation.kind==='class')content.append(h('div',{class:'chat-class-notice'},icon('calendar',14),h('span',{class:'grow'},'今日课堂安排与资料，请在班级内查看。'),button('查看课节',()=>openClass(conversation.classId),'text-btn')));
  const previousMessages=document.querySelector('.chat-messages');
  const savedScroll=previousMessages?.dataset.conversation===conversation.id&&!state.chatToLatest?previousMessages.scrollTop:null;state.chatToLatest=false;
  const messages=h('div',{class:'chat-messages','data-conversation':conversation.id,role:'log','aria-label':'聊天记录','aria-live':'polite'});
  requestAnimationFrame(()=>{if(messages.isConnected)messages.scrollTo({top:savedScroll===null?messages.scrollHeight:savedScroll,behavior:'instant'});});
  for(const message of conversation.messages){if(message.by==='system'){messages.append(h('p',{class:'chat-date'},message.text));continue;}const own=message.by==='me',person=students.find(s=>s.id===message.by);messages.append(h('article',{class:`message${own?' own':''}`},h('span',{class:'message-avatar'},own?'陈':person?.name.slice(0,1)||'学'),h('div',{class:'message-body'},h('div',{class:'message-meta'},h('span',{},own?'陈老师':person?.name||'学生'),h('time',{},message.time)),h('p',{class:'message-bubble'},message.text))));}
  if(!conversation.messages.length)messages.append(emptyState('开始聊天','发送第一条消息，与学生沟通学习安排。'));
  const composer=h('textarea',{'aria-label':'输入聊天消息',placeholder:'输入消息，Enter 发送，Shift + Enter 换行',rows:3,maxlength:2000}),draft=state.chatDrafts[conversation.id]||'';composer.value=draft;
  const count=h('span',{class:'compose-count'},`${draft.length}/2000`),send=button([icon('send',14),'发送'],sendMessage,'btn primary compact',{disabled:!draft.trim()});
  function sendMessage(){const text=composer.value.trim();if(!text)return;const time=new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());conversation.messages.push({by:'me',text,time});conversation.time=time;state.chatDrafts[conversation.id]='';state.chatToLatest=true;render();document.querySelector('.chat-composer textarea')?.focus();}
  composer.addEventListener('input',()=>{state.chatDrafts[conversation.id]=composer.value;count.textContent=`${composer.value.length}/2000`;send.disabled=!composer.value.trim();});composer.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();sendMessage();}});
  content.append(messages,h('div',{class:'chat-composer'},h('div',{class:'composer-label'},h('span',{},'文字消息'),h('small',{},'本地演示，不会发送给真实学生')),composer,h('footer',{},count,h('span',{class:'end small'},'Enter 发送'),send)));
  return h('div',{class:'chat-workspace'},side,content);
}
function newChat(){const list=h('div',{class:'choices'});const pane=modal('发起聊天',h('div',{},h('p',{class:'small'},'选择学生，打开私聊会话。'),list),'关闭',()=>{});for(const person of students)list.append(button([avatar(person),h('span',{class:'grow'},person.name),h('small',{},person.id)],()=>{pane.close();openStudentChat(person);},'new-chat-person'));}
render();
