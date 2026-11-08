const api = window.classroomClient;
const state = { tab: 'members', user: null, runtime: null, groups: [], groupId: '', query: '', filter: 'all', selected: new Set(), page: 0, busy: false, loading: true, error: '', context: null };
const app = document.getElementById('app');
const label = { teacher: '教师', assistant: '助教', student: '学生' };
const h = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'class') node.className = value;
    else if (['value', 'checked', 'disabled'].includes(key)) node[key] = value;
    else if (value !== null && value !== undefined) node.setAttribute(key, String(value));
  }
  node.append(...children.flat(Infinity).filter(child => child !== null && child !== undefined).map(child => child instanceof Node ? child : document.createTextNode(String(child))));
  return node;
};
const button = (text, action, props = {}) => h('button', { type: 'button', disabled: state.busy, onClick: action, ...props }, text);
const normalize = value => String(value || '').split('/').at(-1);
const own = () => state.runtime?.members?.find(member => normalize(member.userId) === normalize(state.user?.userId));
const canManage = () => ['teacher', 'assistant'].includes(own()?.role) && state.runtime?.status !== 'ended';
const selectedGroup = () => state.groups.find(group => group.id === state.groupId) || state.groups[0];
const flatten = (groups, prefix = '') => groups.flatMap(group => { const name = prefix ? `${prefix} / ${group.name}` : group.name; return [{ ...group, name }, ...flatten(group.children || [], name)]; });
let loadGeneration = 0, loadPromise = null;
function load(initial = false) {
  if (loadPromise) return loadPromise.then(() => load(initial));
  loadPromise = loadOnce(initial).finally(() => { loadPromise = null; });
  return loadPromise;
}
const fingerprint = () => JSON.stringify([state.loading, state.error, state.context, state.user, state.groups, state.runtime && {revision:state.runtime.revision,status:state.runtime.status,members:state.runtime.members?.map(member => [member.userId,member.displayName,member.role,member.online,member.onStage,member.stageState,member.handRaisedAt,member.microphoneAllowed,member.cameraAllowed,member.whiteboardWritable,member.rewardCount])}]);
async function loadOnce(initial = false) {
  const generation = ++loadGeneration, tab = state.tab, before = fingerprint();
  try {
    const context = await api.context();
    const identity = await api.request('identity');
    if (generation !== loadGeneration || tab !== state.tab) return;
    if (state.context?.sessionId !== context.sessionId || state.user?.userId !== identity.user?.userId) { state.runtime = null; state.groups = []; state.selected.clear(); }
    state.context = context; state.user = identity.user;
    if (!state.user) { state.runtime = null; state.groups = []; throw new Error('请先在主窗口登录。'); }
    if (tab === 'members') { const result = context.hasClassroom ? await api.request('runtime', { sessionId: context.sessionId }) : null; if (generation !== loadGeneration || tab !== state.tab) return; state.runtime = result?.runtime || null; }
    else if (state.user.role === 'teacher') { const result = await api.request('groups'); if (generation !== loadGeneration || tab !== state.tab) return; state.groups = flatten(result.groups || []); }
    state.error = '';
  } catch (error) { if (generation === loadGeneration) state.error = error.message || '同步失败，已保留现有内容。'; }
  finally { if (generation === loadGeneration) { state.loading = false; if (initial || before !== fingerprint()) render(); } }
}
async function mutate(operation, args) {
  if (state.busy) return false;
  loadGeneration++; state.busy = true; state.error = ''; render();
  try { await api.request(operation, args); await load(); state.selected.clear(); return true; }
  catch (error) { state.error = error.message || '操作未确认，请刷新后重试。'; return false; }
  finally { state.busy = false; render(); }
}
const command = action => mutate('command', { action, commandId: crypto.randomUUID(), expectedRevision: state.runtime?.revision, sessionId: state.context?.sessionId });
function dialog(title, body, actionText, onConfirm, danger = false) {
  const pane = h('dialog', { 'aria-label': title }, h('h2', {}, title), body);
  const close = () => { pane.close(); pane.remove(); };
  pane.append(h('footer', {}, button('取消', close), button(actionText, async () => { if (await onConfirm(pane)) close(); }, { class: danger ? 'danger' : 'primary' })));
  document.body.append(pane); pane.addEventListener('close', () => pane.remove(), { once: true }); pane.showModal(); return pane;
}
function person(member, actions = [], selectable = false) {
  const name = member.displayName || member.userName || member.username || member.userId;
  const away = 'online' in member && !member.online;
  return h('li', { class: 'person', 'data-away': away }, selectable ? h('input', { type: 'checkbox', 'aria-label': `选择 ${name}`, checked: state.selected.has(member.userId), disabled: state.busy || (!state.selected.has(member.userId) && state.selected.size >= 100), onChange: event => { if (event.target.checked) state.selected.add(member.userId); else state.selected.delete(member.userId); render(); } }) : null,
    h('span', { class: 'avatar', 'aria-hidden': 'true' }, [...name].slice(0, 1).join('')), h('div', { class: 'identity' }, h('strong', {}, name), member.handRaisedAt && member.online ? h('span', { class: 'badge' }, '举手') : null,
      h('small', {}, member.role ? `${label[member.role] || member.role} · ${away ? member.connectionStatus === 'reconnecting' ? '重连中' : '暂离' : member.onStage ? '台上' : member.stageState === 'invited' ? '等待上台' : '台下'}` : member.username || member.userId)), h('div', { class: 'actions' }, actions));
}
function membersView() {
  if (!state.context?.hasClassroom) return h('div', { class: 'empty' }, '请在主窗口进入课堂，再打开花名册。', h('p', {}, button('回到课堂', () => api.focusClassroom())));
  if (!state.runtime) return h('p', { class: 'empty' }, '正在同步花名册…');
  const all = state.runtime.members || [], online = all.filter(member => member.online), hands = online.filter(member => member.handRaisedAt);
  const filters = [['all', '全部', all.length], ['hands', '举手', hands.length], ['stage', '台上', online.filter(member => member.onStage).length], ['away', '暂离', all.length - online.length]];
  const list = all.filter(member => (member.displayName || member.userId).toLocaleLowerCase().includes(state.query.toLocaleLowerCase()) && (state.filter === 'all' || state.filter === 'hands' && member.online && member.handRaisedAt || state.filter === 'stage' && member.online && member.onStage || state.filter === 'away' && !member.online))
    .sort((a, b) => Number(b.online) - Number(a.online) || (['teacher', 'assistant', 'student'].indexOf(a.role) - ['teacher', 'assistant', 'student'].indexOf(b.role)) || Number(Boolean(b.handRaisedAt)) - Number(Boolean(a.handRaisedAt)) || String(a.handRaisedAt || '').localeCompare(String(b.handRaisedAt || '')) || a.displayName.localeCompare(b.displayName));
  return h('section', { class: 'members-view' }, h('div', { class: 'toolbar' }, h('input', { id: 'query', type: 'search', 'aria-label': '搜索课堂成员', placeholder: '搜索姓名', value: state.query, onInput: event => { state.query = event.target.value; render(); } }), button('刷新', () => load())),
    h('div', { class: 'toolbar counts' }, filters.map(([key, text, count]) => button(`${text} ${count}`, () => { state.filter = key; render(); }, { 'aria-pressed': state.filter === key }))),
    canManage() ? h('div', { class: 'toolbar' }, button('全体静音', () => command({ type: 'muteAllMicrophones' })), button('全体下台', () => dialog('全体下台', h('p', {}, '所有台上学生将回到台下。'), '确认下台', () => command({ type: 'removeAllStudentsFromStage' }), true))) : h('p', { class: 'muted' }, '只读花名册；成员管理操作由授课教师或助教执行。'),
    h('ul', { class: 'roster', 'aria-label': '课堂花名册' }, list.map(member => person(member, member.role === 'student' && member.online && canManage() ? [
      button(member.onStage ? '下台' : member.stageState === 'invited' ? '取消邀请' : '邀请上台', () => command({ type: member.onStage || member.stageState === 'invited' ? 'removeStage' : 'inviteStage', targetUserId: member.userId })),
      button(member.microphoneAllowed ? '静音' : '允许发言', () => command({ type: 'setMediaAllowed', targetUserId: member.userId, microphoneAllowed: !member.microphoneAllowed, cameraAllowed: Boolean(member.cameraAllowed) })),
      button(member.whiteboardWritable ? '取消授权' : '授权板书', () => command({ type: 'setWhiteboardWritable', targetUserId: member.userId, writable: !member.whiteboardWritable })),
      button(`奖励 ${member.rewardCount || 0}`, () => command({ type: 'giveReward', targetUserIds: [member.userId] })),
    ] : []))), !list.length ? h('p', { class: 'empty' }, '没有符合条件的成员') : null,
    h('p', { class: 'status', role: 'status' }, `在线 ${online.length} / ${all.length} · ${state.runtime.status === 'ended' ? '课堂已结束' : '每 3 秒同步，重连时保留名单'}`));
}
function createGroup() {
  dialog('新建学生分组', h('input', { id: 'group-name', placeholder: '分组名称', 'aria-label': '分组名称', maxlength: '100' }), '创建', async pane => {
    const name = pane.querySelector('input').value.trim(); if (!name) return false;
    return mutate('createGroup', { name });
  });
}
function addStudents() {
  const group = selectedGroup(), picked = new Map(); let request = 0;
  const result = h('ul', { class: 'roster', 'aria-live': 'polite' }), input = h('input', { 'aria-label': '搜索学生账号或姓名', placeholder: '姓名或账号' });
  const form = h('form', { class: 'toolbar', onSubmit: async event => {
    event.preventDefault(); if (!input.value.trim()) return; const version = ++request; result.replaceChildren(h('li', { class: 'empty' }, '正在搜索…'));
    try { const data = await api.request('searchStudents', { query: input.value }); if (version !== request || !result.isConnected) return;
      result.replaceChildren(...(data.users || []).map(user => { const id = user.id, exists = group.members.some(member => normalize(member.userId) === normalize(id) || Boolean(user.casdoorUuid && normalize(member.userId) === user.casdoorUuid));
        return person({ userId: id, displayName: user.displayName || user.name, username: user.name }, [button(exists ? '已在分组' : picked.has(id) ? '已选' : '选择', event => { if (picked.has(id)) picked.delete(id); else if (picked.size < 100) picked.set(id, { userId: id, userName: user.displayName || user.name, userAvatar: user.avatar || '' }); event.currentTarget.textContent = picked.has(id) ? '已选' : '选择'; }, { disabled: exists })]); }));
      if (!(data.users || []).length) result.append(h('li', { class: 'empty' }, '没有找到学生'));
    } catch (error) { result.replaceChildren(h('li', { class: 'empty error' }, error.message)); }
  } }, input, h('button', { type: 'submit' }, '搜索'));
  const pane = dialog(`添加到 ${group.name}`, h('div', {}, h('p', { class: 'muted' }, '可跨搜索选择，单次最多添加 100 名学生。'), form, result), '添加所选学生', async () => picked.size ? mutate('addMembers', { groupId: group.id, members: [...picked.values()] }) : false);
  pane.addEventListener('close', () => { request++; }, { once: true });
}
function groupsView() {
  if (state.user?.role !== 'teacher') return h('p', { class: 'empty' }, '学生分组仅向教师开放。');
  const group = selectedGroup(), matches = (group?.members || []).filter(member => [member.userName, member.username, member.userId].some(value => String(value || '').toLocaleLowerCase().includes(state.query.toLocaleLowerCase())));
  const pages = Math.max(1, Math.ceil(matches.length / 12)), page = Math.min(state.page, pages - 1), visible = matches.slice(page * 12, (page + 1) * 12);
  return h('div', { class: 'layout' }, h('nav', { class: 'group-nav', 'aria-label': '学生分组' }, button('新建分组', createGroup, { class: 'primary' }), state.groups.map(item => button(`${item.name}  ${item.members.length}`, () => { state.groupId = item.id; state.query = ''; state.page = 0; state.selected.clear(); render(); }, { 'aria-current': group?.id === item.id }))),
    h('section', { class: 'content' }, group ? [h('div', { class: 'heading' }, h('div', {}, h('h2', {}, group.name), h('p', { class: 'muted' }, `${group.members.length} 名学生`)), button('添加学生', addStudents, { class: 'primary' })),
      h('div', { class: 'toolbar' }, h('input', { id: 'query', type: 'search', value: state.query, 'aria-label': '搜索分组成员', placeholder: '搜索姓名或账号', onInput: event => { state.query = event.target.value; state.page = 0; render(); } })),
      state.selected.size ? h('div', { class: 'selection' }, h('span', {}, `已选 ${state.selected.size} 人`), button('清空', () => { state.selected.clear(); render(); }), button('移出分组', () => dialog('移出分组', h('p', {}, `将 ${state.selected.size} 名学生移出此分组？不会删除学生账号。`), '确认移出', () => mutate('removeMembers', { groupId: group.id, userIds: [...state.selected] }), true), { class: 'danger' })) : null,
      h('ul', { class: 'roster', 'aria-label': '分组成员' }, visible.map(member => person(member, [], true))), !visible.length ? h('p', { class: 'empty' }, '此分组暂无匹配学生') : null,
      pages > 1 ? h('footer', { 'aria-label': '成员分页' }, button('上一页', () => { state.page = page - 1; render(); }, { disabled: page === 0 }), h('span', {}, `${page + 1} / ${pages}`), button('下一页', () => { state.page = page + 1; render(); }, { disabled: page === pages - 1 })) : null,
    ] : h('div', { class: 'empty' }, '还没有学生分组。请先创建一个分组。')));
}
function render() {
  const focused = document.activeElement?.id, start = document.activeElement?.selectionStart, end = document.activeElement?.selectionEnd;
  app.replaceChildren(...[h('header', { class: 'app' }, h('div', { class: 'heading' }, h('div', {}, h('h1', {}, '课堂工作台'), h('p', {}, state.user ? `${state.user.displayName || state.user.name} · ${state.tab === 'members' ? '课堂成员' : '学生与分组'}` : '先在主窗口完成登录')), button('返回课堂', () => api.focusClassroom())),
    h('div', { class: 'tabs', role: 'tablist', 'aria-label': '人员管理' }, [['members', '课堂花名册'], ['groups', '学生与分组']].map(([key, title]) => button(title, () => { state.tab = key; state.query = ''; state.selected.clear(); render(); void load(); }, { role: 'tab', 'aria-selected': state.tab === key })))),
    state.error ? h('div', { class: 'notice', role: 'status' }, state.error, ' ', button('重新加载', () => load())) : null,
    h('main', {}, state.loading ? h('p', { class: 'empty', role: 'status' }, '正在同步课堂与成员…') : state.tab === 'members' ? membersView() : groupsView())].filter(Boolean));
  const input = focused && document.getElementById(focused); if (input && input.tagName === 'INPUT') { input.focus({ preventScroll: true }); try { input.setSelectionRange(start, end); } catch { /* Non-text inputs have no selection range. */ } }
}
render(); void load(true);
const polling = setInterval(() => { if (!document.hidden && !loadPromise && !state.busy && state.tab === 'members' && !document.querySelector('dialog[open]')) void load(); }, 3000);
window.addEventListener('beforeunload', () => clearInterval(polling), { once: true });

window.addEventListener('focus', () => { if (!state.busy) void load(); });
