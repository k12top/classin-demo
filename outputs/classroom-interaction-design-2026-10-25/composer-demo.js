(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => ICONS[name] || '';
  const btn = (name, label, action, extra = '') => `<button class="icon-button" title="${label}" aria-label="${label}" data-action="${action}" ${extra}>${icon(name)}</button>`;
  const people = [
    {id:'lin',name:'林子涵',initial:'涵',color:'p1'}, {id:'chen',name:'陈以安',initial:'安',color:'p2'},
    {id:'zhou',name:'周雨桐',initial:'桐',color:'p3'}, {id:'xu',name:'许嘉宁',initial:'宁',color:'p4'},
    {id:'zhao',name:'赵一诺',initial:'诺',color:'p5'}, {id:'wu',name:'吴昊',initial:'昊',color:'p6'},
    {id:'shen',name:'沈知夏',initial:'夏',color:'p7'}, {id:'wang',name:'王景行',initial:'行',color:'p1',offline:true}
  ];
  const initial = () => ({activities:[{id:1,type:'single',prompt:'快慢指针为什么会在环中相遇？',options:['快指针每轮比慢指针多走一步','快慢指针每轮走相同距离','只在环入口相遇','链表长度不变'],open:true,responses:{lin:{answer:'A',version:1,time:'14:29',history:[]},chen:{answer:'B',version:1,time:'14:29',history:[]},zhou:{answer:'A',version:1,time:'14:30',history:[]}}}],drafts:{},messages:[],pendingNudge:false,cooldown:0});
  const key = 'classroom-composer-design-v1';
  let state = initial();
  try { const saved = JSON.parse(localStorage.getItem(key)); if (saved?.activities?.length) state = saved; } catch {}
  const query = new URLSearchParams(location.search);
  let role = query.get('role') === 'student' ? 'student' : 'teacher';
  let device = query.get('device') === 'mobile' || innerWidth < 600 ? 'mobile' : 'desktop';
  let floatMode = 'hidden', floatPosition = null, selectedStudent = null, selectedActivity = null;
  let popover = null, closeTimer, toastTimer, nudgeTimer;
  let creator = {open:false,step:'prompt',prompt:'',type:'single',question:'',options:[],error:''};
  let activeTab = 'chat';
  const current = () => state.activities.at(-1);
  const answer = () => current().responses.xu;
  const save = () => { try { localStorage.setItem(key,JSON.stringify(state)); } catch {} };
  const now = () => new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
  const announce = text => { $('#announcer').textContent = text; };
  function toast(text) { clearTimeout(toastTimer); $('#toast').textContent = text; $('#toast').hidden = false; toastTimer = setTimeout(() => $('#toast').hidden = true,2600); announce(text); }
  const avatar = (p,extra='') => `<span class="person ${p.color} ${extra}" aria-hidden="true">${p.initial}</span>`;
  const typeLabel = q => ({single:'单选题',boolean:'判断题',essay:'简答题'})[q.type];
  const answerText = (q,r) => q.type === 'essay' ? r.answer : `${r.answer} · ${q.options[r.answer.charCodeAt(0)-65] || ''}`;
  function rosterButton(q, submitted) {
    const list = people.filter(p => Boolean(q.responses[p.id]) === submitted);
    const label = `${submitted?'已作答':'未作答'}学生，${list.length} 人，点击固定名单`;
    return `<div class="roster-group"><div class="group-label">${submitted?'<i class="answered-dot"></i>':''}${submitted?'已答':'待答'} <strong>${list.length}</strong></div><button class="avatar-stack" aria-label="${label}" aria-expanded="false" aria-controls="roster-popover" data-roster="${submitted?'answered':'pending'}" data-q="${q.id}">${list.length ? list.slice(0,4).map(p => avatar(p,q.responses[p.id]?.unread?'has-update':'')).join('') + (list.length>4?`<span class="person more-person">+${list.length-4}</span>`:'') : '<span class="no-person">暂无</span>'}</button></div>`;
  }
  function teacherCard(q,archived=false) {
    const n = Object.keys(q.responses).length;
    const unread = people.filter(p => q.responses[p.id]?.unread);
    const remaining = Math.max(0,Math.ceil((state.cooldown-Date.now())/1000));
    const selected = selectedActivity === q.id && q.responses[selectedStudent];
    const student = people.find(p => p.id === selectedStudent);
    return `<article class="activity-card ${archived?'archived':''}" data-question="${q.id}"><div class="question-head"><span class="question-symbol">${icon('FileText')}</span><span>${typeLabel(q)}</span><span class="status">${q.open?'作答中':'已结束'}</span>${q.open?btn('CircleStop','结束作答','end',`data-q="${q.id}"`):''}</div><h3>${esc(q.prompt)}</h3>${q.type !== 'essay'?`<div class="distribution" aria-label="各选项作答人数">${q.options.map((o,i)=>{const letter=String.fromCharCode(65+i),count=Object.values(q.responses).filter(r=>r.answer===letter).length;return `<span title="${letter} · ${esc(o)}，${count} 人" style="--ratio:${n?count/n*100:0}%">${letter}<strong>${count}</strong></span>`;}).join('')}</div>`:''}<div class="roster-summary">${rosterButton(q,true)}${rosterButton(q,false)}</div>${unread.length?`<button class="change-notice" data-action="view-updated" data-q="${q.id}" data-person="${unread[0].id}">${icon('History')}${esc(unread[0].name)}修改了答案 · 第 ${q.responses[unread[0].id].version} 次提交${unread.length>1?`，另 ${unread.length-1} 人`:''}${icon('ChevronDown')}</button>`:''}<div class="activity-actions"><span class="answer-meta">${n} / ${people.length} 人已答</span><button class="text-button accent" data-action="remind" data-q="${q.id}" ${!q.open||n===people.length||remaining?'disabled':''}>${icon('Bell')}<span data-remind-label>${!q.open?'已结束':n===people.length?'全部已作答':remaining?`已提醒 · ${remaining}s`:'催交'}</span></button></div>${selected?`<section class="answer-peek" aria-label="${esc(student.name)}的回答"><header>${avatar(student)}<strong>${esc(student.name)}</strong>${btn('X','收起学生答案','close-answer')}</header><p class="answer-text">${esc(answerText(q,selected))}</p><div class="answer-meta"><span>第 ${selected.version} 次提交</span><time>${selected.time}</time></div>${selected.history.length?`<div class="answer-history">${icon('History')}<span>上次：${esc(answerText(q,{answer:selected.history.at(-1).answer}))}</span></div>`:''}</section>`:''}</article>`;
  }
  function studentCard(q,archived=false) {
    const r = q.responses.xu;
    return `<article class="activity-card ${archived?'archived':''}"><div class="question-head"><span class="question-symbol">${icon('FileText')}</span><span>${typeLabel(q)}</span><span class="status">${q.open?'随堂题':'已结束'}</span></div><h3>${esc(q.prompt)}</h3><div class="student-summary"><span class="${r?'submitted-label':'pending-label'}">${r?icon('CheckCheck')+'已作答'+(r.version>1?' · 已修改':''):q.open?'等待你的回答':'未作答'}</span><button class="text-button accent" data-action="open-student" data-q="${q.id}">${r?q.open?'修改':'查看答案':q.open?'去作答':'查看题目'}${icon('ArrowUpRight')}</button></div></article>`;
  }
  function renderFeed() {
    const feed = $('#activity-feed');
    if (activeTab === 'captions') { feed.innerHTML = '<div class="caption-placeholder"><strong>Will · 14:30</strong><p>快指针每轮多走一步，环内的相对距离就会不断缩小。</p><p>The faster pointer gains one step each round.</p></div>'; return; }
    feed.innerHTML = state.activities.map(q => role==='teacher'?teacherCard(q,q.id!==current().id):studentCard(q,q.id!==current().id)).join('') + state.messages.map(m=>`<div class="demo-message"><span class="sender">${esc(m.name)} <time>${m.time}</time></span><p>${esc(m.text)}</p></div>`).join('');
    bindRosters();
  }
  function render() {
    closeRoster();
    $$('.review-controls [data-role]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.role===role));
    $$('.review-controls [data-device]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.device===device));
    $('#classroom').classList.toggle('mobile',device==='mobile');
    $('#student-notice').hidden = !state.pendingNudge;
    $('#create-question').hidden = role!=='teacher';
    $('#reopen-question').querySelector('i').hidden = role!=='student'||!!answer()||!current().open;
    $('#review-hint').textContent = role==='teacher'?'悬停头像组查看名单，点选学生在聊天内查看答案。':'拖动题目标题可移动位置；关闭后从聊天卡片或底部题目图标打开。';
    $('#stage-caption').textContent = '';
    renderFeed(); renderCreator(); renderFloat();
    if (role==='student' && state.pendingNudge && !answer()) showNudge();
    if (role==='teacher') $('#nudge').hidden=true;
  }
  function renderFloat() {
    const root = $('#floating-root'); root.innerHTML='';
    if(role!=='student'||floatMode==='hidden')return;
    const q = state.activities.find(q=>q.id===selectedActivity) || current();
    const r=q.responses.xu;
    if(floatMode==='capsule' && r){ root.innerHTML=`<div class="answer-capsule"><span class="capsule-check">${icon('CheckCheck')}</span><span>已作答${r.version>1?' · 已修改':''}</span><button class="text-button" data-action="open-student" data-q="${q.id}">${q.open?'修改':'查看'}</button>${btn('X','收起答题状态','hide-float')}</div>`;return; }
    const savedDraft=state.drafts[q.id] ?? r?.answer ?? '';
    root.innerHTML=`<section class="quiz-float" aria-label="${typeLabel(q)}答题卡"><header><div class="drag-handle" tabindex="0" role="button" aria-label="拖动题目，方向键也可移动，Esc 收起" title="拖动移动 · 方向键移动">${icon('Grip')}<span>${typeLabel(q)}${!q.open?' · 已结束':r?' · 修改答案':''}</span></div>${btn('X','关闭题目，可从聊天重新打开','hide-float')}</header><h3>${esc(q.prompt)}</h3>${q.type==='essay'?`<textarea class="answer-area" id="student-answer" aria-label="你的回答" placeholder="写下你的想法…" ${!q.open?'readonly':''}>${esc(savedDraft)}</textarea>`:`<div class="answer-options">${q.options.map((o,i)=>{const letter=String.fromCharCode(65+i);return `<label class="answer-option"><input type="radio" name="student-answer" value="${letter}" ${savedDraft===letter?'checked':''} ${!q.open?'disabled':''}><span class="letter">${letter}</span><span>${esc(o)}</span></label>`;}).join('')}</div>`}<footer><small>${!q.open?'本题已结束':r?'修改后老师会收到更新':'提交后自动收起'}</small><button class="primary" data-action="submit-answer" data-q="${q.id}" ${!String(savedDraft).trim()||!q.open?'disabled':''}>${r?'保存修改':'提交答案'}${icon('Check')}</button></footer></section>`;
    const card = root.querySelector('.quiz-float');
    requestAnimationFrame(()=>placeFloat(card));
    const updateDraft = value => { state.drafts[q.id]=value;save();card.querySelector('[data-action="submit-answer"]').disabled=!String(value).trim()||!q.open; };
    card.querySelectorAll('input[name="student-answer"]').forEach(el=>el.addEventListener('change',()=>updateDraft(el.value)));
    card.querySelector('textarea')?.addEventListener('input',e=>updateDraft(e.target.value));
    const handle=card.querySelector('.drag-handle');
    handle.addEventListener('pointerdown',e=>{if(e.button!==0)return;const start={x:e.clientX,y:e.clientY,left:card.offsetLeft,top:card.offsetTop};handle.setPointerCapture(e.pointerId);handle.onpointermove=ev=>{floatPosition={x:start.left+ev.clientX-start.x,y:start.top+ev.clientY-start.y};placeFloat(card);};handle.onpointerup=()=>{handle.onpointermove=null;};});
    handle.addEventListener('keydown',e=>{const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(delta){e.preventDefault();const step=e.shiftKey?40:12;floatPosition={x:card.offsetLeft+delta[0]*step,y:card.offsetTop+delta[1]*step};placeFloat(card);}if(e.key==='Enter'){floatMode='hidden';renderFloat();toast('题目已收起，可从聊天重新打开');}});
  }
  function placeFloat(card) {
    if(!card?.isConnected)return;
    const room=$('#classroom'),maxX=room.clientWidth-card.offsetWidth-12,maxY=room.clientHeight-card.offsetHeight-80;
    if(!floatPosition)floatPosition={x:device==='mobile'?12:Math.max(16,room.clientWidth-400-card.offsetWidth-20),y:Math.max(62,maxY-8)};
    floatPosition={x:Math.max(12,Math.min(maxX,floatPosition.x)),y:Math.max(60,Math.min(maxY,floatPosition.y))};
    card.style.left=floatPosition.x+'px';card.style.top=floatPosition.y+'px';
  }
  function bindRosters() {
    $$('[data-roster]').forEach(el=>{
      el.addEventListener('pointerenter',()=>{if(device==='desktop')openRoster(el,false);});
      el.addEventListener('pointerleave',scheduleClose);
      el.addEventListener('focus',()=>openRoster(el,false));
      el.addEventListener('click',()=>openRoster(el,true));
    });
  }
  function closeRoster() { clearTimeout(closeTimer); if(popover?.anchor?.isConnected)popover.anchor.setAttribute('aria-expanded','false');popover=null;$('#roster-popover').hidden=true; }
  function scheduleClose(){clearTimeout(closeTimer);if(!popover?.pinned)closeTimer=setTimeout(closeRoster,220);}
  function openRoster(anchor,pinned) {
    clearTimeout(closeTimer);
    if(popover?.pinned&&!pinned&&popover.anchor!==anchor)return;
    const q=state.activities.find(q=>q.id===Number(anchor.dataset.q));
    const submitted=anchor.dataset.roster==='answered';
    if(popover?.anchor!==anchor)popover?.anchor?.setAttribute('aria-expanded','false');
    popover={anchor,pinned:pinned||popover?.anchor===anchor&&popover.pinned};anchor.setAttribute('aria-expanded','true');
    const list=people.filter(p=>Boolean(q.responses[p.id])===submitted),panel=$('#roster-popover');
    panel.innerHTML=`<header><strong>${submitted?'已作答':'未作答'} · ${list.length} 人</strong><small>${submitted?'点选查看答案':'仅提醒未作答学生'}</small>${btn('X','关闭学生名单','close-roster')}</header>${list.length?list.map(p=>{const r=q.responses[p.id];return `<div class="roster-row ${p.offline?'offline':''}">${avatar(p)}<button class="roster-info" data-action="${submitted?'select-student':'pending-info'}" data-person="${p.id}" data-q="${q.id}"><strong>${p.name}</strong><small>${p.offline?'离线':'在线'}${r?` · ${r.time} · 第 ${r.version} 次提交`:p.offline?' · 上线后提示':' · 尚未提交'}</small></button>${r?`<span class="row-state ${r.unread?'updated':''}">${r.version>1?'已修改':'已作答'}</span>`:`<button class="remind-single" data-action="remind-one" data-person="${p.id}" data-q="${q.id}" title="提醒${p.name}${p.offline?'，上线后提示':''}" aria-label="提醒${p.name}" ${!q.open||state.cooldown>Date.now()?'disabled':''}>${icon('Bell')}</button>`}</div>`;}).join(''):'<p class="roster-empty">暂无学生</p>'}`;
    panel.hidden=false;
    const room=$('#classroom').getBoundingClientRect(),a=anchor.getBoundingClientRect();
    const x=Math.max(12,Math.min(room.width-panel.offsetWidth-12,a.right-room.left-panel.offsetWidth));
    let y=a.bottom-room.top+8;if(y+panel.offsetHeight>room.height-78)y=Math.max(60,a.top-room.top-panel.offsetHeight-8);
    panel.style.left=x+'px';panel.style.top=y+'px';
  }
  $('#roster-popover').addEventListener('pointerenter',()=>clearTimeout(closeTimer));
  $('#roster-popover').addEventListener('pointerleave',scheduleClose);
  function showNudge() {
    if(role!=='student'||answer()||!current().open)return;
    clearTimeout(toastTimer);$('#toast').hidden=true;
    const n=$('#nudge');n.innerHTML=`<span class="nudge-icon">${icon('Bell')}</span><span>老师提醒你完成随堂题</span><button data-action="nudge-open">去作答</button>${btn('X','关闭催交提示','dismiss-nudge')}`;n.hidden=false;
    $('#reopen-question').classList.remove('nudge-pulse');requestAnimationFrame(()=>$('#reopen-question').classList.add('nudge-pulse'));
    announce('老师提醒你完成随堂题，可在方便时打开作答');
    clearTimeout(nudgeTimer);nudgeTimer=setTimeout(dismissNudge,10000);
  }
  function dismissNudge(){state.pendingNudge=false;save();$('#nudge').hidden=true;$('#student-notice').hidden=true;}
  function remind(q,personId) {
    if(!q.open||state.cooldown>Date.now())return;
    const targets=people.filter(p=>!q.responses[p.id]&&(!personId||p.id===personId));
    if(!targets.length){toast('所有学生均已作答');return;}
    state.cooldown=Date.now()+30000;
    if(targets.some(p=>p.id==='xu'))state.pendingNudge=true;
    save();render();toast(`已提醒 ${targets.length} 名未作答学生${targets.some(p=>p.offline)?'，离线学生上线后提示':''}`);
  }
  function openCreator(){role='teacher';activeTab='chat';creator.open=true;$('#classroom').classList.remove('chat-hidden');render();requestAnimationFrame(()=>$('#ai-requirement')?.focus());}
  function renderCreator() {
    const target=$('#creator'),open=creator.open&&role==='teacher';$('.conversation').classList.toggle('creator-open',open);
    if(!open){target.innerHTML='';return;}
    target.innerHTML=`<section class="creator" aria-label="创建互动题目"><header><h3>${icon('Sparkles')}${creator.step==='preview'?'出题预览':'AI 出题'}</h3>${btn('X','收起出题面板，保留草稿','close-creator')}</header>${creator.step==='prompt'?`<label class="sr-only" for="ai-requirement">出题要求</label><textarea class="prompt" id="ai-requirement" placeholder="例如：出一道判断题，检查学生是否理解快慢指针">${esc(creator.prompt)}</textarea>${creator.error?`<p class="error" role="alert">${esc(creator.error)}</p>`:''}<div class="creator-toolbar"><select id="question-type" aria-label="题型"><option value="single" ${creator.type==='single'?'selected':''}>单选题</option><option value="boolean" ${creator.type==='boolean'?'selected':''}>判断题</option><option value="essay" ${creator.type==='essay'?'selected':''}>简答题</option></select><button class="manual-link" data-action="manual-question">手动出题</button><button class="primary" data-action="generate" ${!creator.prompt.trim()?'disabled':''}>${icon('Sparkles')}生成题目</button></div>`:creator.step==='loading'?'<div class="generation-skeleton" role="status" aria-label="正在生成题目"><span></span><span></span><span></span></div><p class="publish-consequence">正在根据要求生成…</p>':`<div class="preview-top"><button class="text-button" data-action="back-prompt">${icon('ArrowLeft')}修改要求</button><span class="answer-meta">${typeLabel({type:creator.type})} · 可直接编辑</span></div><textarea class="question-edit" id="question-prompt" aria-label="题干">${esc(creator.question)}</textarea>${creator.type!=='essay'?creator.options.map((o,i)=>`<label class="option-edit"><span>${String.fromCharCode(65+i)}</span><input data-option="${i}" aria-label="选项 ${String.fromCharCode(65+i)}" value="${esc(o)}"></label>`).join(''):''}<p class="publish-consequence">${current().open?'发布后结束当前题，学生收到新题。':'确认后发布给全班学生。'}</p><div class="creator-toolbar">${btn('RefreshCw','重新生成题目','generate')}<button class="primary" data-action="publish">发布给学生${icon('Send')}</button></div>`}</section>`;
    $('#ai-requirement')?.addEventListener('input',e=>{creator.prompt=e.target.value;target.querySelector('[data-action="generate"]').disabled=!creator.prompt.trim();});
    $('#question-type')?.addEventListener('change',e=>creator.type=e.target.value);
    $('#question-prompt')?.addEventListener('input',e=>{creator.question=e.target.value;validatePublish();});
    target.querySelectorAll('[data-option]').forEach(el=>el.addEventListener('input',e=>{creator.options[Number(el.dataset.option)]=e.target.value;validatePublish();}));
  }
  function validatePublish(){const b=$('[data-action="publish"]');if(b)b.disabled=!creator.question.trim()||(creator.type!=='essay'&&creator.options.some(o=>!o.trim()));}
  function generate() {
    if(!creator.prompt.trim()){creator.error='先写下你的出题要求。';renderCreator();return;}
    creator.step='loading';creator.error='';renderCreator();
    setTimeout(()=>{
      if(creator.prompt.includes('失败')){creator.step='prompt';creator.error='生成未完成，要求已保留。可重试或手动出题。';renderCreator();return;}
      const aboutLoop=/快慢|指针|环/.test(creator.prompt);
      creator.question=creator.type==='boolean'?(aboutLoop?'在有环链表中，快指针每轮走两步、慢指针走一步，二者最终会相遇。':'每轮开始时先明确不变量，有助于判断循环逻辑是否正确。'):creator.type==='essay'?(aboutLoop?'用自己的话解释：为什么快慢指针一定会在环中相遇？':'请用一个例子解释本节课的核心方法，并说明它为什么成立。'):(aboutLoop?'快慢指针在环中移动时，二者的相对距离如何变化？':'使用双指针解决问题时，首先应该明确什么？');
      creator.options=creator.type==='boolean'?['正确','错误']:creator.type==='essay'?[]:aboutLoop?['每轮缩短一步，最终重合','始终保持不变','每轮增加两步','只有指针从同一点出发才重合']:['两个指针各自的含义与移动条件','先把两个指针移到末尾','让两个指针始终同步','每轮重新遍历整个数组'];
      creator.step='preview';if(creator.open)renderCreator();
    },850);
  }
  function openStudent(qid) {selectedActivity=Number(qid)||current().id;role='student';floatMode='open';floatPosition=null;render();}
  function submit(q) {
    const value=String(state.drafts[q.id]??q.responses.xu?.answer??'').trim();if(!value||!q.open)return;
    const previous=q.responses.xu;
    if(!previous||previous.answer!==value){q.responses.xu={answer:value,version:(previous?.version||0)+1,time:now(),history:[...(previous?.history||[]),...(previous?[{answer:previous.answer,time:previous.time}]:[])],unread:!!previous};}
    delete state.drafts[q.id];state.pendingNudge=false;save();floatMode='capsule';$('#nudge').hidden=true;render();announce(previous?'答案修改已保存，老师可看到更新':'答案已提交，题目已自动收起');
  }
  document.addEventListener('click',e=>{
    const el=e.target.closest('[data-action]');
    if(el){const q=state.activities.find(q=>q.id===Number(el.dataset.q))||current();switch(el.dataset.action){
      case 'hide-float':floatMode='hidden';renderFloat();$('#reopen-question').focus();break;
      case 'open-student':openStudent(q.id);break;
      case 'submit-answer':submit(q);break;
      case 'end':q.open=false;save();render();toast('已结束作答，答案保留在聊天中');break;
      case 'remind':remind(q);break;
      case 'remind-one':remind(q,el.dataset.person);break;
      case 'close-roster':closeRoster();break;
      case 'pending-info':toast('尚未提交答案，可点击右侧铃铛单独提醒');break;
      case 'view-updated':case 'select-student':selectedStudent=el.dataset.person;selectedActivity=q.id;q.responses[selectedStudent].unread=false;save();renderFeed();closeRoster();requestAnimationFrame(()=>$('.answer-peek')?.scrollIntoView({block:'nearest',behavior:'smooth'}));break;
      case 'close-answer':selectedStudent=null;renderFeed();break;
      case 'close-creator':creator.open=false;renderCreator();$('#create-question').focus();break;
      case 'generate':generate();break;
      case 'back-prompt':creator.step='prompt';renderCreator();break;
      case 'manual-question':creator.step='preview';creator.question='';creator.options=creator.type==='boolean'?['正确','错误']:creator.type==='essay'?[]:['','','',''];renderCreator();validatePublish();$('#question-prompt').focus();break;
      case 'publish':if(!creator.question.trim())break;current().open=false;state.activities.push({id:Date.now(),type:creator.type,prompt:creator.question.trim(),options:[...creator.options],open:true,responses:{}});state.pendingNudge=false;state.cooldown=0;save();creator.open=false;selectedStudent=null;selectedActivity=current().id;floatPosition=null;floatMode='open';render();toast('题目已发布给全班学生');$('#chat-scroll').scrollTop=$('#chat-scroll').scrollHeight;break;
      case 'dismiss-nudge':dismissNudge();break;
      case 'nudge-open':dismissNudge();openStudent(current().id);break;
    }}
    const r=e.target.closest('[data-role]');if(r){role=r.dataset.role;creator.open=false;selectedActivity=current().id;floatMode='hidden';floatPosition=null;render();}
    const d=e.target.closest('[data-device]');if(d){device=d.dataset.device;floatPosition=null;render();}
    const demo=e.target.closest('[data-demo-toast]');if(demo)toast(demo.dataset.demoToast);
    const toggle=e.target.closest('[data-toggle-device]');if(toggle){toggle.setAttribute('aria-pressed',toggle.getAttribute('aria-pressed')!=='true');toast('设计稿状态演示，不会开启设备');}
    if(popover&&!e.target.closest('#roster-popover,[data-roster]'))closeRoster();
  });
  $('#demo-create').onclick=$('#create-question').onclick=openCreator;
  $('#demo-edit').onclick=()=>{const q=current();if(!q.open){toast('本题已结束，重置示例后可演示变更');return;}const previous=q.responses.xu||{answer:'A',version:1,time:'14:31',history:[]};q.responses.xu={answer:q.type==='essay'?'相对速度为一步，因此经过有限轮后，环内距离会变为零。':previous.answer==='B'?'A':'B',version:previous.version+1,time:now(),history:[...previous.history,{answer:previous.answer,time:previous.time}],unread:true};delete state.drafts[q.id];state.pendingNudge=false;role='teacher';creator.open=false;selectedStudent=null;save();render();toast('示例：许嘉宁保存了答案修改');};
  $('#demo-nudge').onclick=()=>{if(answer()||!current().open){toast('已作答或题目已结束，不会收到催交');return;}role='student';floatMode='hidden';creator.open=false;state.pendingNudge=true;save();render();};
  $('#reset').onclick=()=>{state=initial();save();creator={open:false,step:'prompt',prompt:'',type:'single',question:'',options:[],error:''};selectedStudent=null;selectedActivity=null;floatMode='hidden';floatPosition=null;$('#nudge').hidden=true;render();toast('示例已重置');};
  $('#reopen-question').onclick=()=>{if(role==='teacher'){activeTab='chat';$('#classroom').classList.remove('chat-hidden');renderFeed();$('.activity-card:last-of-type')?.scrollIntoView({block:'nearest'});}else openStudent(current().id);};
  $('#close-chat').onclick=()=>{$('#classroom').classList.add('chat-hidden');$('#dock-chat').setAttribute('aria-pressed','false');closeRoster();};
  $('#dock-chat').onclick=()=>{const hidden=$('#classroom').classList.toggle('chat-hidden');$('#dock-chat').setAttribute('aria-pressed',!hidden);floatPosition=null;renderFloat();};
  $('#fullscreen').onclick=()=>{$('#classroom').classList.toggle('full-preview');floatPosition=null;renderFloat();};
  function tab(name){activeTab=name;$('#chat-tab').setAttribute('aria-selected',name==='chat');$('#caption-tab').setAttribute('aria-selected',name==='captions');creator.open=false;renderCreator();renderFeed();closeRoster();}
  $('#chat-tab').onclick=()=>tab('chat');$('#caption-tab').onclick=()=>tab('captions');
  $('#chat-composer').onsubmit=e=>{e.preventDefault();const input=$('#chat-input');if(!input.value.trim())return;state.messages.push({name:role==='teacher'?'Will':'许嘉宁',text:input.value.trim(),time:now()});save();input.value='';tab('chat');$('#chat-scroll').scrollTop=$('#chat-scroll').scrollHeight;};
  document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(popover){closeRoster();return;}if(creator.open){creator.open=false;renderCreator();return;}if($('#classroom').classList.contains('full-preview')){$('#classroom').classList.remove('full-preview');return;}if(role==='student'){floatMode='hidden';renderFloat();$('#reopen-question').focus();}});
  window.addEventListener('resize',()=>{placeFloat($('.quiz-float'));closeRoster();});
  setInterval(()=>{const remaining=Math.max(0,Math.ceil((state.cooldown-Date.now())/1000));$$('[data-action="remind"]').forEach(b=>{const q=state.activities.find(q=>q.id===Number(b.dataset.q));if(!q?.open||Object.keys(q.responses).length===people.length)return;b.disabled=remaining>0;b.querySelector('[data-remind-label]').textContent=remaining?`已提醒 · ${remaining}s`:'催交';});},1000);
  $$('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
  if(query.get('scene')==='creator'){creator.open=true;creator.prompt='出一道判断题，检查学生是否理解快慢指针';creator.type='boolean';}
  render();
})();
