/* Client UI only. Every operation still uses the server's authenticated session. */
const OPERATIONS = new Set(['identity', 'groups', 'searchStudents', 'createGroup', 'addMembers', 'removeMembers', 'runtime', 'command', 'courses', 'course', 'sessions', 'verifyAccess', 'createCourse']);
const MANAGEMENT = new Set(['inviteStage', 'removeStage', 'setMediaAllowed', 'setWhiteboardWritable', 'giveReward', 'acknowledgeHand', 'muteAllMicrophones', 'unmuteAllMicrophones', 'removeAllStudentsFromStage']);
function webBase(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('Use an HTTPS classroom origin, or loopback HTTP for local development');
  return url.origin;
}
const identifier = value => typeof value === 'string' && value.length > 0 && !['.','..'].includes(value) && value.length <= 200 && !/[\x00-\x1f]/.test(value);
function classroomContext(value, origin) {
  const url = new URL(value);
  if (url.origin !== origin || url.pathname !== '/classroom') return null;
  const sessionId = url.searchParams.get('sessionId') || url.searchParams.get('courseId');
  return identifier(sessionId) ? { sessionId, shareAccess: url.searchParams.get('shareAccess') || '' } : null;
}
function requestFor(operation, args = {}, context) {
  if (!OPERATIONS.has(operation) || !args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Unsupported client operation');
  if (operation === 'identity') return { path: '/api/auth/me', method: 'GET' };
  if (operation === 'createCourse') {
    if (typeof args.name !== 'string' || !args.name.trim() || args.name.trim().length > 100 || !identifier(args.requestId)) throw new Error('填写1–100字的课程名称');
    const body = { name:args.name.trim(), description:String(args.description||'').slice(0,2000), roomType:0, courseKind:'series' };
    if (args.startTime !== undefined || args.endTime !== undefined) {
      if (typeof args.startTime !== 'string' || typeof args.endTime !== 'string' || !/Z$/.test(args.startTime) || !/Z$/.test(args.endTime) || !Number.isFinite(Date.parse(args.startTime)) || !Number.isFinite(Date.parse(args.endTime)) || Date.parse(args.endTime)<=Date.parse(args.startTime)) throw new Error('课节起止时间无效');
      try { new Intl.DateTimeFormat('en',{timeZone:args.timezone}); } catch { throw new Error('排课时区无效'); }
      Object.assign(body,{startTime:args.startTime,endTime:args.endTime,timezone:args.timezone});
    }
    return {path:'/api/courses',method:'POST',headers:{'Idempotency-Key':args.requestId},body};
  }
  if (operation === 'courses') return { path: '/api/courses', method: 'GET' };
  if (['course', 'sessions', 'verifyAccess'].includes(operation)) {
    if (!identifier(args.courseId)) throw new Error('Choose a course');
    const path = `/api/courses/${encodeURIComponent(args.courseId)}`;
    if (operation === 'course') return { path, method: 'GET' };
    if (operation === 'sessions') return { path: path + '/sessions', method: 'GET' };
    if (args.sessionId !== undefined && !identifier(args.sessionId)) throw new Error('Choose a lesson');
    return { path: path + '/verify-access' + (args.sessionId ? '?sessionId=' + encodeURIComponent(args.sessionId) : ''), method: 'GET' };
  }
  if (operation === 'groups') return { path: '/api/groups', method: 'GET' };
  if (operation === 'searchStudents') {
    if (typeof args.query !== 'string' || !args.query.trim() || args.query.length > 120) throw new Error('Enter a student name or account');
    return { path: '/api/users/search?role=student&q=' + encodeURIComponent(args.query.trim()), method: 'GET' };
  }
  if (operation === 'runtime' || operation === 'command') {
    if (!context || !identifier(context.sessionId)) throw new Error('Enter a classroom first');
    const path = `/api/sessions/${encodeURIComponent(context.sessionId)}/classroom/`;
    if (operation === 'runtime') return { path: path + 'state?scope=runtime' + (context.shareAccess ? '&shareAccess=' + encodeURIComponent(context.shareAccess) : ''), method: 'GET' };
    if (!args.action || !MANAGEMENT.has(args.action.type) || !identifier(args.commandId)) throw new Error('Unsupported classroom command');
    return { path: path + 'actions', method: 'POST', body: { action: args.action, commandId: args.commandId, ...(Number.isSafeInteger(args.expectedRevision) && args.expectedRevision >= 0 ? { expectedRevision: args.expectedRevision } : {}), ...(context.shareAccess ? { shareAccess: context.shareAccess } : {}) } };
  }
  if (operation === 'createGroup') {
    if (typeof args.name !== 'string' || !args.name.trim() || args.name.trim().length > 100) throw new Error('Use a group name with 1–100 characters');
    return { path: '/api/groups', method: 'POST', body: { action: 'create', name: args.name.trim() } };
  }
  if (!identifier(args.groupId)) throw new Error('Choose a student group');
  if (operation === 'addMembers') {
    if (!Array.isArray(args.members) || !args.members.length || args.members.length > 100 || args.members.some(member => !identifier(member?.userId))) throw new Error('Choose 1–100 students');
    return { path: '/api/groups', method: 'POST', body: { action: 'addMembers', groupId: args.groupId, members: args.members.map(member => ({ userId: member.userId, userName: String(member.userName || '').slice(0, 200), userAvatar: String(member.userAvatar || '').slice(0, 2000) })) } };
  }
  if (!Array.isArray(args.userIds) || !args.userIds.length || args.userIds.length > 100 || args.userIds.some(id => !identifier(id))) throw new Error('Choose 1–100 students');
  return { path: '/api/groups', method: 'POST', body: { action: 'removeMembers', groupId: args.groupId, userIds: args.userIds } };
}
module.exports = { webBase, classroomContext, requestFor };
