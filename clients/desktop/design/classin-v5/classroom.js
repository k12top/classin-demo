'use strict';
/* Desktop teaching design only. No media, messages or permissions leave this page. */
Object.assign(paths, {
  mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>',
  micOff:'<path d="m3 3 18 18M9 9v2a3 3 0 0 0 5 2M9 5a3 3 0 0 1 6 0v4M5 11v1a7 7 0 0 0 12 5m2-6v1M12 19v3m-4 0h8"/>',
  cameraOff:'<path d="m3 3 18 18M10 5h3a2 2 0 0 1 2 2v3l6-4v12l-6-4v3M5 5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h8"/>',
  camera:'<rect x="3" y="5" width="12" height="14" rx="2"/><path d="m15 10 6-4v12l-6-4"/>',
  pen:'<path d="m4 16 12-12 4 4L8 20l-5 1Z"/><path d="m13 7 4 4"/>',
  eraser:'<path d="m3 14 9-10a2 2 0 0 1 3 0l6 6-10 11H8Z"/><path d="m8 9 9 9M11 21h10"/>',
  text:'<path d="M4 6V3h16v3M12 3v18m-4 0h8"/>',
  undo:'<path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 0 14"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  share:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4m0-8V7m-3 3 3-3 3 3"/>',
  chat:'<path d="M21 11a9 9 0 0 1-9 9H3l2-5a9 9 0 1 1 16-4Z"/><path d="M8 10h8m-8 4h5"/>',
  hand:'<path d="M8 12V5a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v10a8 8 0 0 1-14 5L2 14a2 2 0 0 1 3-3l3 3"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  minus:'<path d="M5 12h14"/>',
  signal:'<path d="M4 20v-4m5 4v-8m5 8V8m5 12V4"/>',
  pin:'<path d="m14 3 7 7-4 1-3 5-2-2-7 7m7-7-4-4 5-3Z"/>',
});
Object.assign(EN, {
  '教学界面':'Teaching room','课堂设计预览':'Classroom design preview','返回课程':'Back to course',
  '课堂成员':'Class members','关闭侧栏':'Close panel','画笔':'Pen','橡皮':'Eraser','文字批注':'Text note','撤销批注':'Undo annotation','清空本页批注':'Clear page annotations',
  '白色画笔':'White pen','绿色画笔':'Green pen','橙色画笔':'Orange pen','上一页白板':'Previous board','下一页白板':'Next board','新建白板':'New board','缩小白板':'Zoom out','放大白板':'Zoom in','适合窗口':'Fit board',
  '教学白板':'Teaching board','白板':'Whiteboard','课堂课件':'Lesson slides','双指针与有序数组':'Two pointers & sorted arrays','在有序数组中，找到和为 10 的两个数。':'Find two numbers in a sorted array that sum to 10.','相向而行，逐步缩小查找范围。':'Move inward to narrow the search.','移动指针':'Move pointers','重置演示':'Reset demo','两数之和等于目标值。':'The pair sums to the target.','两数之和偏小，左指针右移。':'The sum is too small. Move the left pointer.','两数之和偏大，右指针左移。':'The sum is too large. Move the right pointer.',
  '独立白板，可自由书写。':'A blank board, ready for your notes.','双指针课堂笔记':'Two-pointer lesson notes','有序 · 相向 · 边界':'Sorted · Inward · Bounds','每次移动后，检查 left < right。':'After each move, check left < right.','课件内容为示例':'Demo slide content','本地批注':'Local annotations','添加文字批注':'Add text note','批注内容':'Note text','在白板中补充重点':'Add a teaching note','添加到白板':'Add to board','请填写批注内容。':'Enter a note.','只清空当前页的批注，课件内容保留。':'Clear this page’s annotations; keep slide content.','清空批注':'Clear annotations',
  '摄像头示意':'Camera placeholder','摄像头已关闭':'Camera off','教师自览':'Self preview','自己':'You','授课教师':'Teacher','学生':'Student','已静音':'Muted','正在发言':'Speaking','麦克风开启':'Mic on','麦克风关闭':'Mic off','关闭麦克风':'Mute microphone','开启麦克风':'Unmute microphone','关闭摄像头':'Turn camera off','开启摄像头':'Turn camera on','共享屏幕':'Share screen','停止共享':'Stop sharing','共享方式':'Sharing mode','仅共享':'Screen only','共享＋人像':'Screen + camera','共享预览':'Sharing preview','共享时保留自己的摄像头位置，真实画面需接入客户端媒体服务。':'Keep your camera position while sharing. Live video requires the client media service.','本地模拟共享，不读取屏幕或摄像头。':'Simulated sharing. No screen or camera is accessed.','共享的窗口内容将在这里显示。':'The shared window will appear here.','返回白板':'Back to whiteboard',
  '全部消息':'All messages','课堂消息':'Class messages','课堂提问':'Questions','搜索课堂成员':'Search class members','全部静音':'Mute students','允许学生发言':'Allow student messages','输入课堂消息':'Message the class','输入课堂提问':'Ask a question','消息仅在本地预览中展示':'Messages stay in this local preview','还没有课堂提问':'No questions yet','发布提问，与全班一起讨论。':'Ask a question to discuss with the class.','没有匹配成员':'No matching members','举手':'Hand raised','上台':'On stage','下台':'Off stage','邀请上台':'Invite on stage','移下讲台':'Remove from stage','白板权限':'Board access','允许书写':'Allow writing','收回书写':'Revoke writing','已允许书写':'Can write','未授权书写':'No board access','本节课的临时操作，不改变授课角色':'Temporary lesson controls; teaching roles stay unchanged','最多同时展示三名学生。':'Up to three students can be on stage.','本地示例状态':'Local demo states','查看课堂成员':'Show members','查看课堂聊天':'Show chat','离开课堂':'Leave room','退出设计预览，返回当前课程。':'Exit the preview and return to this course.','退出预览':'Exit preview','网络未接入':'Network not connected','未连接真实媒体或课堂服务':'Live media and classroom services are not connected',
  '白板批注已清空':'Page annotations cleared','老师，这里为什么移动左指针？':'Why do we move the left pointer here?','先比较两数之和，再决定移动方向。':'Compare the sum first, then choose the direction.','因为数组有序，右移左指针可以增大两数之和。':'The array is sorted. Moving the left pointer right increases the sum.',
});
const classroomRooms = new Map();
function currentRoom() {
  const lesson = lessons.find(l=>l.id===state.classroomLesson) || lessons.find(l=>l.id==='l5');
  if (!classroomRooms.has(lesson.id)) {
    const course = classes.find(c=>c.id===lesson.classId);
    classroomRooms.set(lesson.id, {
      lesson, teacher:course.role==='teacher', panel:'chat', chatTab:'messages', query:'', tool:'pen', color:'#f5f5ec',
      mic:true, camera:true, sharing:null, page:0, zoom:1, pointer:0, chatAllowed:true, translate:state.autoTranslate,
      pages:[{kind:'slide',annotations:[]},{kind:'notes',annotations:[]}], drafts:{messages:'',questions:''}, chatScroll:{},
      people:course.members.map((id,i)=>({...students.find(s=>s.id===id),mic:i===0,stage:i<2,write:false,hand:i===1})),
      messages:[{name:staffName(lesson.teacherId),own:false,text:'先比较两数之和，再决定移动方向。',lang:'zh',en:'Compare the sum first, then choose the direction.'}, {name:'小林',own:false,text:'Could you explain why we move the left pointer?',zh:'老师，这里为什么移动左指针？',lang:'en'}],
      questions:[{name:'小林',own:false,text:'老师，这里为什么移动左指针？'}],
    });
  }
  return classroomRooms.get(lesson.id);
}
function enterClassroom(lesson) {
  state.classroomLesson=lesson.id; state.classId=lesson.classId; state.programId=lesson.programId; go('classroom');
}
function roomRefresh(keepChatScroll=true) {
  const room=currentRoom(), log=document.querySelector('.room-message-log');
  if(log&&keepChatScroll)room.chatScroll[log.dataset.channel]=log.scrollTop;
  render();
}
function roomTool(name,label,action,active=false,disabled=false) {
  return button(icon(name,18),action,'room-tool',{'aria-label':label,title:label,'aria-pressed':active,disabled});
}
function cameraTile(room,person,self=false) {
  const isTeacher=person.id===room.lesson.teacherId;
  const camera=self?room.camera:false;
  return h('article',{class:`room-camera${self?' self':''}${person.mic?' speaking':''}`,'aria-label':`${person.name} · ${tr(self?(room.teacher?'教师自览':'自己'):'摄像头示意')}`},
    h('div',{class:'camera-placeholder'},h('span',{class:'camera-initial',translate:'no'},person.name.slice(0,1)),h('small',{},self?(camera?'摄像头示意':'摄像头已关闭'):'摄像头示意')),
    self?h('span',{class:'camera-self-label'},room.teacher?'教师自览':'自己'):null,
    h('footer',{},h('span',{translate:'no'},person.name),isTeacher?h('small',{},'授课教师'):null,h('span',{class:`camera-mic${person.mic?' on':''}`,title:tr(person.mic?'麦克风开启':'已静音')},icon(person.mic?'mic':'micOff',12))));
}
function roomCameraStrip(room) {
  const teacher={id:room.lesson.teacherId,name:staffName(room.lesson.teacherId),mic:room.teacher?room.mic:true};
  const tiles=[cameraTile(room,teacher,room.teacher)];
  if(!room.teacher)tiles.push(cameraTile(room,{id:'self',name:'李明',mic:room.mic},true));
  for(const person of room.people.filter(p=>p.stage && (room.teacher||p.id!=='liming')))tiles.push(cameraTile(room,person));
  return h('section',{class:'room-camera-strip','aria-label':tr('摄像头示意')},tiles,h('div',{class:'camera-strip-note'},icon('camera',17),h('span',{},'课堂设计预览'),h('small',{},'未连接真实媒体或课堂服务')));
}
function boardSlide(room,page) {
  if(page.kind==='blank')return h('div',{class:'blank-board-label'},'独立白板，可自由书写。');
  if(page.kind==='notes')return h('div',{class:'board-notes'},h('h2',{},'双指针课堂笔记'),h('p',{},'有序 · 相向 · 边界'),h('pre',{},'while left < right:\n    total = nums[left] + nums[right]\n    if total == target:\n        return left, right\n    elif total < target:\n        left += 1\n    else:\n        right -= 1'),h('small',{},'每次移动后，检查 left < right。'));
  const pairs=[[0,5],[0,4],[1,4],[2,4]], [left,right]=pairs[room.pointer];
  const values=[1,2,3,5,7,11], sum=values[left]+values[right];
  return h('div',{class:'board-slide'},h('h2',{},room.lesson.title),h('p',{},'在有序数组中，找到和为 10 的两个数。'),
    h('div',{class:'board-array'},values.map((v,i)=>h('div',{class:`array-item${i===left?' left-pointer':''}${i===right?' right-pointer':''}${i<left||i>right?' excluded':''}`},h('small',{},String(i)),h('strong',{},String(v)),h('span',{},i===left?'left':i===right?'right':'')))),
    h('div',{class:'board-equation'},h('span',{class:'left-number'},String(values[left])),h('span',{},'+'),h('span',{class:'right-number'},String(values[right])),h('span',{},'='),h('strong',{},String(sum)),h('small',{},'target = 10')),
    h('p',{class:'board-conclusion'},sum===10?'两数之和等于目标值。':sum<10?'两数之和偏小，左指针右移。':'两数之和偏大，右指针左移。'),
    h('div',{class:'board-demo-controls'},button('移动指针',()=>{room.pointer=Math.min(pairs.length-1,room.pointer+1);roomRefresh();},'board-step',{disabled:!room.teacher||room.pointer===pairs.length-1}),button('重置演示',()=>{room.pointer=0;roomRefresh();},'board-reset',{disabled:!room.teacher})));
}
function svgAnnotation(item) {
  const node=document.createElementNS('http://www.w3.org/2000/svg',item.type==='text'?'text':'polyline');
  node.setAttribute('fill',item.type==='text'?item.color:'none'); node.setAttribute('stroke',item.type==='text'?'none':item.color);
  if(item.type==='text'){node.setAttribute('x',item.x);node.setAttribute('y',item.y);node.setAttribute('font-size','21');node.textContent=item.text;}
  else{node.setAttribute('points',item.points.map(p=>p.join(',')).join(' '));node.setAttribute('stroke-width','3');node.setAttribute('stroke-linecap','round');node.setAttribute('stroke-linejoin','round');}
  return node;
}
function teachingBoard(room) {
  const page=room.pages[room.page], svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 1000 650');svg.setAttribute('class',`board-annotations tool-${room.tool}`);svg.setAttribute('aria-label',tr('本地批注'));svg.setAttribute('role','img');
  svg.append(...page.annotations.map(svgAnnotation));
  let drawing=null, strokeNode=null;
  function point(e){const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());return [Math.max(0,Math.min(1000,p.x)),Math.max(0,Math.min(650,p.y))];}
  svg.addEventListener('pointerdown',e=>{
    if(!room.teacher||e.button!==0)return;
    if(room.tool==='text'){addBoardText(room,point(e));return;}
    if(room.tool==='eraser'){const [x,y]=point(e);const index=page.annotations.findLastIndex(item=>item.type==='text'?x>=item.x-10&&x<=item.x+item.text.length*23&&Math.abs(y-item.y)<28:item.points.some(p=>Math.hypot(p[0]-x,p[1]-y)<22));if(index>=0){page.annotations.splice(index,1);roomRefresh();}return;}
    svg.setPointerCapture(e.pointerId);drawing={type:'stroke',color:room.color,points:[point(e),point(e)]};strokeNode=svgAnnotation(drawing);svg.append(strokeNode);
  });
  svg.addEventListener('pointermove',e=>{if(drawing){drawing.points.push(point(e));strokeNode.setAttribute('points',drawing.points.map(p=>p.join(',')).join(' '));}});
  const finish=()=>{if(drawing){page.annotations.push(drawing);drawing=null;roomRefresh();}};
  svg.addEventListener('pointerup',finish);svg.addEventListener('pointercancel',finish);
  const surface=h('div',{class:'board-surface'},boardSlide(room,page),svg);surface.style.transform=`scale(${room.zoom})`;
  const tools=h('aside',{class:'board-tools','aria-label':tr('白板')},
    roomTool('pen','画笔',()=>{room.tool='pen';roomRefresh();},room.tool==='pen',!room.teacher),
    roomTool('eraser','橡皮',()=>{room.tool='eraser';roomRefresh();},room.tool==='eraser',!room.teacher),
    roomTool('text','文字批注',()=>{room.tool='text';addBoardText(room);},room.tool==='text',!room.teacher),
    h('span',{class:'tool-divider'}),['#f5f5ec','#afd4b8','#e8b07e'].map((color,i)=>{const b=button(h('span',{}),()=>{room.color=color;room.tool='pen';roomRefresh();},`board-color color-${i}`,{'aria-label':['白色画笔','绿色画笔','橙色画笔'][i],'aria-pressed':room.color===color,disabled:!room.teacher});return b;}),
    h('span',{class:'tool-divider'}),roomTool('undo','撤销批注',()=>{page.annotations.pop();roomRefresh();},false,!room.teacher||!page.annotations.length),
    roomTool('trash','清空本页批注',()=>modal('清空批注',h('p',{},'只清空当前页的批注，课件内容保留。'),'清空批注',()=>{page.annotations=[];roomRefresh();},true),false,!room.teacher||!page.annotations.length));
  return h('section',{class:'room-board-area','aria-label':tr('教学白板')},
    h('header',{class:'board-heading'},h('span',{class:'row gap4'},icon('document',14),h('span',{},'课堂课件')),h('span',{class:'grow'}),h('small',{},'课件内容为示例')),
    h('div',{class:'board-stage'},h('div',{class:'board-viewport'},surface),tools),
    h('footer',{class:'board-footer'},h('div',{class:'row gap4'},iconButton('left','上一页白板',()=>{room.page=Math.max(0,room.page-1);roomRefresh();}),h('span',{class:'board-page'},`${room.page+1} / ${room.pages.length}`),iconButton('right','下一页白板',()=>{room.page=Math.min(room.pages.length-1,room.page+1);roomRefresh();}),room.teacher?iconButton('plus','新建白板',()=>{room.pages.push({kind:'blank',annotations:[]});room.page=room.pages.length-1;roomRefresh();}):null),
    h('div',{class:'row gap4'},iconButton('minus','缩小白板',()=>{room.zoom=Math.max(.7,+(room.zoom-.1).toFixed(1));roomRefresh();}),button(`${Math.round(room.zoom*100)}%`,()=>{room.zoom=1;roomRefresh();},'board-fit',{'aria-label':'适合窗口'}),iconButton('plus','放大白板',()=>{room.zoom=Math.min(1.3,+(room.zoom+.1).toFixed(1));roomRefresh();}))))
}
function addBoardText(room,position=[100,550]) {
  const input=h('input',{'aria-label':'批注内容',placeholder:'在白板中补充重点',maxlength:60});
  modal('添加文字批注',input,'添加到白板',()=>{const text=input.value.trim();if(!text){toast('请填写批注内容。');return false;}room.pages[room.page].annotations.push({type:'text',text,color:room.color,x:Math.min(position[0],430),y:position[1]});roomRefresh();});input.focus();
}
function roomChat(room) {
  const channel=room.chatTab, messages=room[channel], log=h('div',{class:'room-message-log','aria-label':tr(channel==='messages'?'课堂消息':'课堂提问'),'data-channel':channel});
  for(const message of messages){const target=(state.translationTarget==='auto'?state.locale:state.translationTarget).split('-')[0],translation=!message.own&&room.translate&&message.lang!==target?message[target]:null;log.append(h('article',{class:`room-message${message.own?' own':''}`},h('header',{},h('span',{class:'room-chat-avatar',translate:'no'},message.name.slice(0,1)),h('strong',{translate:'no'},message.name),message.own?h('small',{},'自己'):null),h('p',{translate:'no'},message.text),translation?h('div',{class:'room-translation'},h('small',{},'示例译文'),h('p',{translate:'no'},translation)):null));}
  if(!messages.length)log.append(h('div',{class:'room-empty'},icon('chat',24),h('p',{},'还没有课堂提问'),h('small',{},'发布提问，与全班一起讨论。')));
  queueMicrotask(()=>{if(log.isConnected)log.scrollTop=room.chatScroll[channel]??log.scrollHeight;});
  const input=h('textarea',{'aria-label':channel==='messages'?'输入课堂消息':'输入课堂提问',placeholder:channel==='messages'?'输入课堂消息':'输入课堂提问',rows:2,maxlength:1000,onInput:e=>{room.drafts[channel]=e.target.value;send.disabled=!e.target.value.trim();},onKeydown:e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();submit();}}});input.value=room.drafts[channel];
  function submit(){const text=input.value.trim();if(!text)return;messages.push({name:room.teacher?staffName(room.lesson.teacherId):'李明',own:true,text});room.drafts[channel]='';delete room.chatScroll[channel];roomRefresh(false);document.querySelector('.room-compose textarea')?.focus();}
  const send=button('发送',submit,'btn primary compact',{disabled:!input.value.trim()});
  return h('section',{class:'room-chat'},h('div',{class:'room-chat-tabs'},['messages','questions'].map(tab=>button(tab==='messages'?'全部消息':'课堂提问',()=>{room.chatScroll[channel]=log.scrollTop;room.chatTab=tab;roomRefresh();},'',{'aria-pressed':channel===tab}))),
    h('label',{class:'room-translate-switch'},h('input',{type:'checkbox',checked:room.translate,onChange:e=>{room.translate=e.target.checked;roomRefresh();}}),'自动翻译',h('small',{},'示例译文')),log,
    h('div',{class:'room-compose'},input,h('div',{class:'row'},h('small',{class:'grow'},'Enter 发送'),send),h('small',{class:'room-local-note'},'消息仅在本地预览中展示')));
}
function roomMemberRow(room,person,isTeacher=false) {
  const row=h('article',{class:'room-member'},avatar(person),h('div',{class:'grow'},h('strong',{translate:'no'},person.name),h('small',{},isTeacher?'授课教师':person.hand?'举手':person.stage?'上台':'学生')));
  if(isTeacher)row.append(h('span',{class:'member-teacher-icon'},icon(room.mic?'mic':'micOff',14)));
  else if(room.teacher)row.append(h('div',{class:'member-actions'},
    roomTool(person.mic?'mic':'micOff',`${person.name} · ${tr(person.mic?'关闭麦克风':'开启麦克风')}`,()=>{person.mic=!person.mic;roomRefresh();},person.mic),
    roomTool('camera',`${person.name} · ${tr(person.stage?'移下讲台':'邀请上台')}`,()=>{if(!person.stage&&room.people.filter(p=>p.stage).length>=3){toast('最多同时展示三名学生。');return;}person.stage=!person.stage;if(person.stage)person.hand=false;roomRefresh();},person.stage),
    roomTool('pen',`${person.name} · ${tr(person.write?'收回书写':'允许书写')}`,()=>{person.write=!person.write;roomRefresh();},person.write)));
  row.append(h('span',{class:'visually-hidden'},person.write?'已允许书写':isTeacher?'授课教师':'未授权书写'));return row;
}
function roomMembers(room) {
  const matches=room.people.filter(p=>p.name.toLowerCase().includes(room.query.toLowerCase()));
  return h('section',{class:'room-members'},search('搜索课堂成员',room.query,value=>{room.query=value;roomRefresh();const input=document.querySelector('.room-members input[type=search]');input?.focus();}),
    h('div',{class:'room-member-list'},roomMemberRow(room,{id:room.lesson.teacherId,name:staffName(room.lesson.teacherId)},true),matches.length?matches.map(p=>roomMemberRow(room,p)):h('p',{class:'room-empty'},'没有匹配成员')),
    h('footer',{},room.teacher?h('div',{class:'row'},button('全部静音',()=>{room.people.forEach(p=>p.mic=false);roomRefresh();},'btn compact'),h('span',{class:'grow'}),h('small',{},'本地示例状态')):null,
      room.teacher?h('label',{class:'room-chat-permission'},h('input',{type:'checkbox',checked:room.chatAllowed,onChange:e=>{room.chatAllowed=e.target.checked;roomRefresh();}}),'允许学生发言'):null,h('p',{},'本节课的临时操作，不改变授课角色')));
}
function roomDock(room) {
  if(!room.panel)return null;
  return h('aside',{class:'room-dock'},h('header',{class:'room-dock-header'},['chat','members'].map(panel=>button([icon(panel==='chat'?'chat':'students',15),panel==='chat'?'课堂聊天':'课堂成员',panel==='members'?h('small',{},String(room.people.length+1)):null],()=>{room.panel=panel;roomRefresh();},'room-panel-tab',{'aria-pressed':room.panel===panel})),iconButton('close','关闭侧栏',()=>{room.panel=null;roomRefresh();})),room.panel==='chat'?roomChat(room):roomMembers(room));
}
function startRoomShare(room) {
  if(room.sharing){room.sharing=null;roomRefresh();return;}
  const pane=modal('共享方式',h('div',{class:'room-share-options'},h('p',{},'共享时保留自己的摄像头位置，真实画面需接入客户端媒体服务。'),h('div',{class:'row'},button([icon('share',20),'仅共享'],()=>{room.sharing='screen';pane.close();roomRefresh();},'btn'),button([icon('camera',20),'共享＋人像'],()=>{room.sharing='portrait';pane.close();roomRefresh();},'btn')),h('small',{},'本地模拟共享，不读取屏幕或摄像头。')),'返回白板',()=>{});
}
function roomControl(name,label,action,active=false,extra='') {return button([icon(name,19),h('span',{},label)],action,`room-control ${extra}`,{'aria-pressed':active});}
function classroomView() {
  const room=currentRoom(), lesson=room.lesson;
  return h('div',{class:'teaching-room'},h('header',{class:'room-header'},button([icon('left',15),'返回课程'],()=>{state.courseTab='lessons';state.courseMode='lessons';go('courses');},'room-back'),h('span',{class:'room-divider'}),h('div',{class:'room-title'},h('h1',{translate:'no'},lesson.title),h('span',{},`${courseName(lesson.classId)} · ${tr('第 '+lesson.no+' 课')}`)),h('time',{class:'room-schedule'},lessonWhen(lesson)),h('span',{class:'room-demo-badge'},'课堂设计预览')),
    roomCameraStrip(room),
    h('div',{class:`room-workspace${room.panel?'':' dock-closed'}`},h('div',{class:'room-stage-column'},room.sharing?h('section',{class:'room-share-stage'},h('header',{},icon('share',15),h('span',{},room.sharing==='screen'?'仅共享':'共享＋人像'),button('返回白板',()=>{room.sharing=null;roomRefresh();},'btn compact')),h('div',{class:'share-window-preview'},icon('share',38),h('h2',{},'共享预览'),h('p',{},'共享的窗口内容将在这里显示。'),h('small',{},'本地模拟共享，不读取屏幕或摄像头。')),room.sharing==='portrait'?h('div',{class:'share-portrait'},cameraTile(room,{id:lesson.teacherId,name:staffName(lesson.teacherId),mic:room.mic},true)):null):teachingBoard(room)),roomDock(room)),
    h('footer',{class:'room-bottom-bar'},h('span',{class:'room-network'},icon('signal',14),h('span',{},'网络未接入')),h('div',{class:'room-controls'},roomControl(room.mic?'mic':'micOff',room.mic?'关闭麦克风':'开启麦克风',()=>{room.mic=!room.mic;roomRefresh();},room.mic,room.mic?'':'off'),roomControl(room.camera?'camera':'cameraOff',room.camera?'关闭摄像头':'开启摄像头',()=>{room.camera=!room.camera;roomRefresh();},room.camera,room.camera?'':'off'),room.teacher?roomControl('share',room.sharing?'停止共享':'共享屏幕',()=>startRoomShare(room),!!room.sharing):null,h('span',{class:'room-divider'}),roomControl('chat','课堂聊天',()=>{room.panel=room.panel==='chat'?null:'chat';roomRefresh();},room.panel==='chat'),roomControl('students','课堂成员',()=>{room.panel=room.panel==='members'?null:'members';roomRefresh();},room.panel==='members')),
      button('离开课堂',()=>modal('离开课堂',h('p',{},'退出设计预览，返回当前课程。'),'退出预览',()=>{state.courseTab='lessons';state.courseMode='lessons';go('courses');}),'btn room-leave')));
}
render();
