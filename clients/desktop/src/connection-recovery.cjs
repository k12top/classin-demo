'use strict';

const CONNECTION_URL = 'classroom-client://connection/index.html';

function recoveryTarget(value, base) {
  try {
    const url = new URL(value);
    // OAuth codes/state are single-use. Restart the login flow rather than
    // replaying a failed callback or keeping the provider URL in the page.
    if (url.origin === base && !url.username && !url.password && !url.pathname.startsWith('/api/')) {
      url.hash = '';
      return url.href;
    }
  } catch { /* A failed external/invalid address returns through fresh SSO. */ }
  return new URL('/api/auth/login', base).href;
}

function createConnectionRecovery(window, { base, onRecover = () => {}, beforeRetry = () => {}, timeoutMs = 30000,
  clock = { set: setTimeout, clear: clearTimeout } }) {
  let pending = '', timer, state = null, disposed = false;
  const clearTimer = () => { if (timer !== undefined) clock.clear(timer); timer = undefined; };
  const alive = () => !disposed && !window.isDestroyed();
  const load = target => window.loadURL(target).catch(() => undefined);
  const recover = (url, reason) => {
    if (!alive() || url === CONNECTION_URL || state && window.webContents.getURL() === CONNECTION_URL) return;
    clearTimer();
    state = { target: recoveryTarget(url, base), reason };
    window.webContents.stop();
    onRecover();
    void load(CONNECTION_URL);
  };
  const started = (event, url, sameDocument, mainFrame) => {
    const target = event.url ?? url;
    if (!(event.isMainFrame ?? mainFrame) || (event.isSameDocument ?? sameDocument)) return;
    clearTimer();
    pending = target;
    if (target === CONNECTION_URL) return;
    const current = target;
    timer = clock.set(() => { if (pending === current) recover(current, 'timeout'); }, timeoutMs);
    timer?.unref?.();
  };
  window.webContents.on('did-start-navigation', started);
  window.webContents.on('did-redirect-navigation', started);
  window.webContents.on('dom-ready', () => {
    // Chromium may finish its failed document after recovery navigation starts.
    // That old document must not clear the local page's retry capability.
    if (window.webContents.getURL() !== pending) return;
    clearTimer();
    if (window.webContents.getURL() !== CONNECTION_URL) state = null;
  });
  window.webContents.on('did-fail-load', (_event, code, _description, url, mainFrame) => {
    if (!mainFrame || code === -3 || pending && pending !== url) return;
    recover(url, 'network');
  });
  window.webContents.on('render-process-gone', () => {
    recover(state?.target || window.webContents.getURL(), 'crash');
  });
  window.once('closed', () => { disposed = true; clearTimer(); state = null; });
  return {
    get active() { return Boolean(state); },
    snapshot: () => ({ reason: state?.reason || 'network' }),
    retry: async () => {
      if (!alive() || !state) throw Error('Recovery unavailable');
      const target = state.target;
      beforeRetry(target);
      // A second failure must update the existing recovery state.
      state = null;
      await load(target);
    },
    home: async () => {
      if (!alive() || !state) throw Error('Recovery unavailable');
      state = null;
      await load(new URL('/', base).href);
    },
  };
}

module.exports = { CONNECTION_URL, recoveryTarget, createConnectionRecovery };
