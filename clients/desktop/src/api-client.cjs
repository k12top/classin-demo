const { requestFor } = require('./client-contract.cjs');
function createApiClient({ session, base, timeoutMs = 15000 }) {
  let refreshPromise = null;
  return async function request(operation, args, context) {
    const spec = requestFor(operation, args, context), controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const options = { method: spec.method, credentials: 'include', redirect: 'error', cache: 'no-store', signal: controller.signal,
      ...(spec.body ? { headers: { 'Content-Type': 'application/json', Origin:base, ...spec.headers }, body: JSON.stringify(spec.body) } : {}) };
    try {
      let response = await session.fetch(new URL(spec.path, base).toString(), options);
      if (response.status === 401 && spec.method === 'GET') {
        if (!refreshPromise) refreshPromise = session.fetch(new URL('/api/auth/refresh',base).toString(), {
          method:'POST',headers:{Origin:base},credentials:'include',redirect:'error',cache:'no-store',signal:controller.signal,
        }).finally(()=>{refreshPromise=null;});
        const renewed = await refreshPromise;
        if (renewed.ok) response = await session.fetch(new URL(spec.path,base).toString(),options);
        else if (renewed.status !== 401) return {ok:false,status:renewed.status,error:'登录续期暂时不可用，请稍后重试。'};
      }
      const data = await response.json();
      if (operation === 'identity' && response.status === 401) return { ok: true, data: { user: null } };
      return response.ok ? { ok: true, data } : { ok: false, status: response.status, error: data.error || data.reason || '请求未完成，请刷新后重试。' };
    } catch {
      return { ok: false, status: 0, error: '网络请求未确认，已保留当前内容。请刷新检查后重试。' };
    } finally { clearTimeout(timer); }
  };
}
module.exports = { createApiClient };
