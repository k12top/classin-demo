const { webBase, classroomContext } = require('./client-contract.cjs');
const validId = value => typeof value === 'string' && value.length > 0 && !['.','..'].includes(value) && value.length <= 200 && !/[\x00-\x1f]/.test(value);
const HOME_URL = 'classroom-client://home/index.html';
const CAPTURE_URL = 'classroom-client://capture/index.html';
function navigationFor(page, args = {}, base) {
  base = webBase(base);
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid navigation');
  const id = () => { if (!validId(args.courseId)) throw new Error('Choose a course'); return encodeURIComponent(args.courseId); };
  let path;
  if (page === 'login') path = '/api/auth/login';
  else if (page === 'portal') path = '/?view=' + (['schedule','learning','courses','students'].includes(args.view) ? args.view : 'courses');
  else if (page === 'createCourse') path = '/courses/create';
  else if (page === 'course') path = '/courses/' + id();
  else if (page === 'playback') {
    path = '/courses/' + id() + '/playback';
    if (args.sessionId !== undefined) { if (!validId(args.sessionId)) throw new Error('Choose a lesson'); path += '?sessionId=' + encodeURIComponent(args.sessionId); }
  } else throw new Error('Unsupported destination');
  return new URL(path, base).toString();
}
function verifiedClassroomUrl(value, base, requestedSessionId) {
  if (!value || value.allowed !== true || typeof value.classroomUrl !== 'string') throw new Error(value?.reason || '无权进入本节课堂');
  const url = new URL(value.classroomUrl, base), context = classroomContext(url.toString(), base);
  if (!context || url.username || url.password || url.hash || (requestedSessionId && context.sessionId !== requestedSessionId)) throw new Error('课堂入口校验失败，请刷新课节');
  if ([...url.searchParams.keys()].some(key=>!['sessionId','courseId','shareAccess'].includes(key))) throw new Error('Unsupported classroom URL');
  return url.toString();
}
function trustedMediaFrame(url, base) { try { return Boolean(classroomContext(url, base)); } catch { return false; } }
module.exports = { HOME_URL, CAPTURE_URL, navigationFor, verifiedClassroomUrl, trustedMediaFrame };
