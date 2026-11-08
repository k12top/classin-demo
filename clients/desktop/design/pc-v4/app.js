'use strict';
const paths = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-6v-7h-4v7H4a1 1 0 0 1-1-1Z"/>',
  courses: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M9 21h6m-3-3v3m-2-13 5 3-5 3Z"/>',
  students: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/>',
  groups: '<rect x="3" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="4" width="7" height="7" rx="1.5"/><rect x="3" y="15" width="7" height="7" rx="1.5"/><rect x="14" y="15" width="7" height="7" rx="1.5"/>',
  files: '<path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  left: '<path d="m14 6-6 6 6 6"/>', right: '<path d="m10 6 6 6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="m9 3 1-1h4l1 3 3 1 3 2-1 3v3l1 3-3 2-3 1-1 2h-4l-1-2-3-1-3-2 1-3v-3L3 8l3-2 3-1Z"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
};
function icon(name, size = 17) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('width', size); node.setAttribute('height', size); node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('fill', 'none'); node.setAttribute('stroke', 'currentColor'); node.setAttribute('stroke-width', '1.6');
  node.setAttribute('stroke-linecap', 'round'); node.setAttribute('stroke-linejoin', 'round'); node.setAttribute('aria-hidden', 'true');
  node.innerHTML = paths[name] || paths.more; // Only fixed, authored SVG paths.
  return node;
}
function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'class') node.className = value;
    else if (['checked', 'value', 'disabled'].includes(key)) node[key] = value;
    else if (value !== undefined && value !== null) node.setAttribute(key, String(value));
  }
  node.append(...children.flat(Infinity).filter(child => child !== undefined && child !== null).map(child => child instanceof Node ? child : document.createTextNode(String(child))));
  return node;
}
const button = (text, action, className = 'btn', props = {}) => h('button', { type: 'button', class: className, onClick: action, ...props }, text);
const iconButton = (name, label, action) => button(icon(name), action, 'icon-btn', { title: label, 'aria-label': label });
const students = [
  { id: 'liming', name: '李明' }, { id: 'xiaolin', name: '小林' },
  { id: 'xiaoyu', name: '小宇' }, { id: 'anan', name: '安安' },
  { id: 'qiqi', name: '琪琪' }, { id: 'xiaoyu02', name: '小雨' },
  { id: 'chengcheng', name: '橙橙' }, { id: 'yiyi', name: '依依' },
];
const groups = [
  { id: 'base', name: 'Python 基础组', members: ['liming', 'xiaolin', 'xiaoyu', 'anan'], course: 'Python 算法基础班' },
  { id: 'advanced', name: 'Python 进阶组', members: ['liming', 'qiqi', 'xiaoyu02'], course: 'Python 进阶班' },
  { id: 'cpp', name: 'C++ 入门组', members: ['chengcheng', 'yiyi'], course: 'C++ 入门班' },
];
const state = { page: 'home', day: 8, student: 'liming', group: 'base', query: '', groupQuery: '', selected: new Set(), groupTab: 'members', creating: false };
const main = document.getElementById('main'), navigation = document.getElementById('navigation');
let toastTimer;
function toast(message) {
  const node = document.getElementById('toast'); node.textContent = message; node.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('visible'), 2800);
}
function go(page) { state.page = page; state.query = ''; state.groupQuery = ''; state.creating = false; state.selected.clear(); render(); }
function avatar(student, active = false) { return h('span', { class: `avatar${active ? ' blue' : ''}`, 'aria-hidden': 'true' }, student.name.slice(0, 1)); }
function search(label, value, onInput) {
  return h('label', { class: 'search' }, icon('search', 15), h('span', { class: 'visually-hidden' }, label), h('input', { type: 'search', placeholder: label, 'aria-label': label, value, onInput: event => onInput(event.target.value) }));
}
function modal(title, body, actionLabel, action, danger = false) {
  const pane = h('dialog', { 'aria-label': title }, h('h2', {}, title), body);
  const close = () => { pane.close(); pane.remove(); };
  pane.append(h('footer', {}, button('取消', close), button(actionLabel, () => { if (action() !== false) close(); }, `btn ${danger ? 'danger' : 'primary'}`)));
  pane.addEventListener('close', () => pane.remove(), { once: true }); document.body.append(pane); pane.showModal();
  return pane;
}
function menu(title, entries) {
  const body = h('div', { class: 'menu-list' });
  const pane = modal(title, body, '关闭', () => {});
  for (const [name, action] of entries) body.append(button(name, () => { pane.close(); action(); }, ''));
}
function renderNav() {
  const navItems = [['home', '首页', 'home'], ['courses', '课程', 'courses'], ['students', '学生', 'students'], ['groups', '分组', 'groups'], ['files', '课件', 'files']];
  navigation.replaceChildren(h('div', { class: 'teacher-mark', title: '陈老师' }, '陈'), ...navItems.map(([page, name, symbol]) => button([icon(symbol, 20), h('span', {}, name)], () => go(page), 'nav-button', { 'aria-label': name, 'aria-current': state.page === page ? 'page' : null })),
    button([icon('settings', 19), h('span', {}, '设置')], () => menu('设置', [['设备检测', () => toast('示例：打开摄像头与麦克风检测')], ['账号设置', () => toast('示例：打开账号设置')]]), 'nav-button nav-bottom'), h('span', { class: 'nav-avatar' }, '陈老师'));
}
function datePicker() {
  const input = h('input', { type: 'date', value: `2026-11-${String(state.day).padStart(2, '0')}`, 'aria-label': '选择日期' });
  modal('选择日期', h('div', { class: 'row' }, input), '查看课程', () => {
    const date = new Date(`${input.value}T12:00:00`);
    if (!Number.isFinite(date.getTime()) || date.getFullYear() !== 2026 || date.getMonth() !== 10 || date.getDate() < 2 || date.getDate() > 8) { toast('此设计预览展示 11 月 2 日至 8 日的数据'); return false; }
    state.day = date.getDate(); render();
  });
}
function home() {
  const page = h('section', { class: 'page' });
  page.append(h('header', { class: 'page-header' }, h('h1', {}, '今日课程'), button([icon('calendar', 14), `11月${state.day}日`, icon('down', 13)], datePicker, 'btn date-switch'), h('span', { class: 'label' }, ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][state.day - 2]), search('搜索课程或班级', state.query, value => { state.query = value; renderMainPreservingFocus(); }), button('查看课表', () => go('courses'))));
  page.append(h('div', { class: 'week', 'aria-label': '本周日期' }, iconButton('left', '上一周', () => toast('示例：查看上一周课程')), ['一', '二', '三', '四', '五', '六', '日'].map((name, index) => button([h('span', {}, `周${name}`), h('b', {}, index + 2)], () => { state.day = index + 2; render(); }, 'week-button', { 'aria-label': `11月${index + 2}日 周${name}`, 'aria-pressed': state.day === index + 2 })), iconButton('right', '下一周', () => toast('示例：查看下一周课程')), button('今天', () => { state.day = 8; render(); }, 'text-btn')));
  const lessons = state.day === 8 ? [
    { title: '双指针与有序数组', group: groups[0], start: '15:30', end: '17:00', next: true },
    { title: '滑动窗口', group: groups[1], start: '19:00', end: '20:30' },
  ].filter(item => `${item.title}${item.group.course}`.toLowerCase().includes(state.query.toLowerCase())) : [];
  page.append(h('div', { class: 'section-head' }, h('h2', {}, '待上课', h('span', { class: 'section-count' }, `${lessons.length} 节课`)), h('span', { class: 'small' }, '按上课时间排序')));
  const agenda = h('ul', { class: 'agenda' });
  if (!lessons.length) agenda.append(h('li', { class: 'empty' }, state.query ? '没有找到匹配的课程' : '当天暂无课程安排'));
  for (const item of lessons) agenda.append(h('li', { class: `lesson-row${item.next ? ' next' : ''}` }, h('div', { class: 'lesson-time' }, h('strong', {}, item.start), h('small', {}, `至 ${item.end}`)), h('div', { class: 'lesson-copy' }, h('h3', {}, item.title), h('p', {}, `${item.group.course} · ${item.group.members.length} 名学生`)), h('div', { class: 'lesson-state' }, item.next ? h('span', { class: 'state-note' }, h('span', { class: 'state-dot' }), '10 分钟后开始') : h('span', { class: 'muted' }, '未开始')), h('div', { class: 'lesson-actions' }, button(item.next ? '进入课堂' : '备课', () => toast(`示例：${item.next ? '进入' : '准备'}「${item.title}」课堂`), `btn${item.next ? ' primary' : ''}`), iconButton('more', `${item.title} 更多操作`, () => menu(item.title, [['查看课程', () => go('courses')], ['课前资料', () => go('files')]])))));
  page.append(agenda, h('section', { class: 'recent-section' }, h('div', { class: 'section-head' }, h('h2', {}, '最近课程'), button(['全部课程', icon('right', 13)], () => go('courses'), 'text-btn')), courseTable()));
  page.append(h('footer', { class: 'page-footer' }, button(['回放与互动记录', icon('arrow', 13)], () => toast('示例：查看课程回放和本课互动记录'), 'text-btn'), h('span', {}, '课程时间按本地时区显示')));
  return page;
}
function courseTable() {
  const table = h('table', { class: 'course-table', 'aria-label': '最近课程' }, h('thead', {}, h('tr', {}, ['课程', '下次上课', '学生', '操作'].map(text => h('th', {}, text)))));
  const body = h('tbody');
  for (const [index, group] of groups.filter(group => group.course).entries()) body.append(h('tr', {}, h('td', {}, h('div', { class: 'row' }, h('span', { class: `course-mark${index === 2 ? ' amber' : ''}` }, index === 2 ? 'C++' : 'PY'), h('strong', {}, group.course))), h('td', {}, index === 0 ? '今天 15:30' : index === 1 ? '今天 19:00' : '11月10日 19:00'), h('td', {}, `${group.members.length} 人`), h('td', {}, button('查看课程', () => { state.group = group.id; go('courses'); }, 'text-btn'))));
  table.append(body); return table;
}
function studentView() {
  const student = students.find(item => item.id === state.student) || students[0];
  const ownedIds = new Set(groups.flatMap(group => group.members));
  const list = students.filter(item => ownedIds.has(item.id) && `${item.name}${item.id}`.toLowerCase().includes(state.query.toLowerCase()));
  const side = h('aside', { class: 'directory-side', 'aria-label': '学生通讯录' }, h('header', {}, h('h1', {}, '学生', h('span', { class: 'count' }, ownedIds.size)), search('搜索姓名或账号', state.query, value => { state.query = value; renderMainPreservingFocus(); })));
  const listing = h('ul', { class: 'side-list' });
  if (!list.length) listing.append(h('li', { class: 'empty' }, '未找到匹配的学生'));
  for (const person of list) listing.append(h('li', {}, button([avatar(person, person.id === student.id), h('div', { class: 'grow' }, h('strong', {}, person.name), h('small', {}, person.id)), person.id === student.id ? icon('right', 12) : null], () => { state.student = person.id; render(); }, 'side-choice', { 'aria-current': person.id === student.id, 'aria-label': `查看学生 ${person.name}` })));
  side.append(listing, h('footer', { class: 'side-foot' }, `共 ${ownedIds.size} 名学生 · 已按账号去重`));
  const memberships = groups.filter(group => group.members.includes(student.id));
  const content = h('section', { class: 'directory-content' }, h('header', { class: 'detail-header' }, avatar(student, true), h('div', {}, h('h1', {}, student.name), h('p', {}, `学生账号：${student.id}`)), button([icon('plus', 14), '添加至分组'], () => addToGroups(student), 'btn primary end')));
  const rows = h('ul', { class: 'membership-list' });
  for (const group of memberships) rows.append(h('li', {}, h('span', { class: 'course-mark' }, '组'), h('div', { class: 'grow' }, h('h3', {}, group.name), h('small', {}, `${group.members.length} 名学生${group.course ? ` · ${group.course}` : ''}`)), button(['查看分组', icon('right', 12)], () => { state.group = group.id; go('groups'); }, 'text-btn'), iconButton('more', `${student.name} 在 ${group.name} 中的操作`, () => menu(group.name, [['移出此分组', () => confirmRemove(group, [student.id])]]))));
  if (!memberships.length) rows.append(h('li', { class: 'empty' }, '尚未加入分组'));
  content.append(h('section', { class: 'detail-section' }, h('div', { class: 'section-head' }, h('h2', {}, '所属分组', h('span', { class: 'section-count' }, `${memberships.length} 个`))), rows, h('p', { class: 'detail-note' }, '同一学生可加入多个分组，分组之间互不影响。')));
  return h('div', { class: 'directory' }, side, content);
}
function addToGroups(student) {
  const picked = new Set();
  const choices = h('div', { class: 'choices' });
  for (const group of groups) {
    const exists = group.members.includes(student.id);
    choices.append(h('label', { class: 'choice-row' }, h('input', { type: 'checkbox', disabled: exists, checked: exists, onChange: event => { if (event.target.checked) picked.add(group.id); else picked.delete(group.id); } }), h('span', { class: 'grow' }, group.name), h('small', {}, exists ? '已在分组' : `${group.members.length} 名学生`)));
  }
  modal(`将 ${student.name} 添加至分组`, h('div', {}, h('p', {}, '选择要加入的分组。已有分组关系会保留。'), choices), '确认添加', () => {
    if (!picked.size) { toast('请选择至少一个尚未加入的分组'); return false; }
    for (const id of picked) groups.find(group => group.id === id).members.push(student.id);
    render(); toast('示例数据：已添加至所选分组');
  });
}
function confirmRemove(group, ids) {
  modal('移出分组', h('p', {}, `将 ${ids.length} 名学生移出「${group.name}」？学生账号和其他分组关系会保留。`), '确认移出', () => {
    group.members = group.members.filter(id => !ids.includes(id)); state.selected.clear(); render(); toast('示例数据：已移出分组');
  }, true);
}
function groupView() {
  const group = groups.find(item => item.id === state.group) || groups[0];
  const side = h('aside', { class: 'directory-side', 'aria-label': '分组列表' }, h('header', {}, h('div', { class: 'group-side-title' }, h('h1', {}, '分组', h('span', { class: 'count' }, groups.length)), button([icon('plus', 13), '新建'], () => { state.creating = !state.creating; render(); document.getElementById('new-group-name')?.focus(); }, 'text-btn'))));
  if (state.creating) {
    const input = h('input', { id: 'new-group-name', placeholder: '分组名称', 'aria-label': '新分组名称', maxlength: 30 });
    side.append(h('form', { class: 'inline-create', onSubmit: event => { event.preventDefault(); const name = input.value.trim(); if (!name) return; const created = { id: crypto.randomUUID(), name, members: [] }; groups.push(created); state.group = created.id; state.creating = false; state.selected.clear(); render(); toast('示例数据：已创建分组'); } }, input, h('button', { type: 'submit', class: 'btn primary' }, '创建')));
  }
  const groupSearch = search('搜索分组', state.groupQuery, value => { state.groupQuery = value; renderMainPreservingFocus(); }); groupSearch.classList.add('side-search'); side.append(groupSearch);
  const rows = h('ul', { class: 'side-list' });
  const matches = groups.filter(item => item.name.toLowerCase().includes(state.groupQuery.toLowerCase()));
  if (!matches.length) rows.append(h('li', { class: 'empty' }, '未找到匹配的分组'));
  for (const item of matches) rows.append(h('li', {}, button([h('span', { class: 'course-mark' }, '组'), h('div', { class: 'grow' }, h('strong', {}, item.name), h('small', {}, item.course || '暂无关联课程')), h('span', { class: 'group-count' }, item.members.length)], () => { state.group = item.id; state.query = ''; state.selected.clear(); render(); }, 'side-choice side-group', { 'aria-current': item.id === group.id, 'aria-label': `查看分组 ${item.name}` })));
  side.append(rows, h('footer', { class: 'side-foot' }, `共 ${groups.length} 个分组`));
  const content = h('section', { class: 'directory-content' }, h('header', { class: 'group-head' }, h('h1', {}, group.name), h('span', { class: 'small' }, `${group.members.length} 名学生`), button(['返回课堂', icon('arrow', 13)], () => toast('示例：返回正在进行的课堂'), 'text-btn end')));
  content.append(h('div', { class: 'tabs', role: 'tablist', 'aria-label': '分组内容' }, [['members', '成员'], ['courses', '关联课程']].map(([tab, label]) => button(label, () => { state.groupTab = tab; render(); }, '', { role: 'tab', 'aria-selected': state.groupTab === tab }))));
  if (state.groupTab === 'courses') {
    content.append(h('section', { class: 'detail-section' }, group.course ? h('div', { class: 'membership-list' }, h('div', { class: 'row associated-course' }, h('span', { class: 'course-mark' }, 'PY'), h('h3', {}, group.course), button('查看课程', () => go('courses'), 'text-btn end'))) : h('p', { class: 'empty' }, '暂无关联课程')));
    return h('div', { class: 'directory' }, side, content);
  }
  content.append(h('div', { class: 'group-tools' }, search('搜索组内学生', state.query, value => { state.query = value; renderMainPreservingFocus(); }), button([icon('plus', 14), '添加学生'], () => addStudents(group), 'btn primary')));
  if (state.selected.size) content.append(h('div', { class: 'selection', role: 'status' }, h('span', {}, `已选 ${state.selected.size} 人`), button('清空', () => { state.selected.clear(); render(); }, 'text-btn'), button('移出分组', () => confirmRemove(group, [...state.selected]), 'text-btn danger')));
  const members = students.filter(student => group.members.includes(student.id) && `${student.name}${student.id}`.toLowerCase().includes(state.query.toLowerCase()));
  const allSelected = members.length > 0 && members.every(student => state.selected.has(student.id));
  const table = h('table', { class: 'members-table', 'aria-label': '分组成员' }, h('thead', {}, h('tr', {}, h('th', {}, h('input', { type: 'checkbox', checked: allSelected, 'aria-label': '选择当前列表所有学生', onChange: event => { for (const person of members) { if (event.target.checked) state.selected.add(person.id); else state.selected.delete(person.id); } render(); } })), h('th', {}, '学生'), h('th', {}, '账号'), h('th', {}, '操作'))));
  const tbody = h('tbody');
  for (const person of members) tbody.append(h('tr', { 'data-selected': state.selected.has(person.id) }, h('td', {}, h('input', { type: 'checkbox', checked: state.selected.has(person.id), 'aria-label': `选择 ${person.name}`, onChange: event => { if (event.target.checked) state.selected.add(person.id); else state.selected.delete(person.id); render(); } })), h('td', {}, h('div', { class: 'row' }, avatar(person), h('strong', {}, person.name))), h('td', { class: 'muted' }, person.id), h('td', {}, iconButton('more', `${person.name} 更多操作`, () => menu(person.name, [['查看学生', () => { state.student = person.id; go('students'); }], ['移出分组', () => confirmRemove(group, [person.id])]])))));
  if (!members.length) tbody.append(h('tr', {}, h('td', { colspan: 4 }, h('p', { class: 'empty' }, state.query ? '未找到匹配的学生' : '分组还没有学生，点击“添加学生”开始组织'))));
  table.append(tbody); content.append(table, h('footer', { class: 'group-foot' }, h('span', {}, `共 ${group.members.length} 名学生`), h('span', {}, '移出分组不会删除学生账号')));
  return h('div', { class: 'directory' }, side, content);
}
function addStudents(group) {
  const picked = new Set(), choices = h('div', { class: 'choices' });
  for (const student of students) { const exists = group.members.includes(student.id); choices.append(h('label', { class: 'choice-row' }, h('input', { type: 'checkbox', checked: exists, disabled: exists, onChange: event => { if (event.target.checked) picked.add(student.id); else picked.delete(student.id); } }), avatar(student), h('span', { class: 'grow' }, student.name), h('small', {}, exists ? '已在分组' : student.id))); }
  modal(`添加学生至 ${group.name}`, h('div', {}, h('p', {}, '选择已有学生加入当前分组。'), choices), '添加所选学生', () => {
    if (!picked.size) { toast('请至少选择一名尚未加入的学生'); return false; }
    group.members.push(...picked); render(); toast('示例数据：已添加所选学生');
  });
}
function coursesView() {
  return h('section', { class: 'page' }, h('header', { class: 'page-header' }, h('h1', {}, '课程'), h('span', { class: 'small' }, '3 门课程'), button('返回首页', () => go('home'), 'text-btn end')), courseTable());
}
function filesView() {
  return h('section', { class: 'page' }, h('header', { class: 'page-header' }, h('h1', {}, '课件'), h('span', { class: 'small' }, '本地设计示例')), h('ul', { class: 'membership-list' }, [['双指针 · 课堂讲义.pdf', '2.4 MB'], ['有序数组去重.py', '1.2 KB']].map(([name, size]) => h('li', {}, icon('files', 20), h('span', { class: 'grow' }, name), h('span', { class: 'small' }, size), button('预览', () => toast(`示例：预览 ${name}`), 'text-btn')))));
}
function renderMainPreservingFocus() {
  const active = document.activeElement, label = active?.getAttribute('aria-label'), start = active?.selectionStart;
  render();
  if (label) { const input = [...document.querySelectorAll('input')].find(node => node.getAttribute('aria-label') === label); if (input) { input.focus(); try { input.setSelectionRange(start, start); } catch { /* Search controls may not support selection. */ } } }
}
function render() {
  renderNav();
  main.replaceChildren(state.page === 'home' ? home() : state.page === 'students' ? studentView() : state.page === 'groups' ? groupView() : state.page === 'files' ? filesView() : coursesView());
}
render();
