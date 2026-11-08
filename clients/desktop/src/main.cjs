const { app, BrowserWindow, desktopCapturer, ipcMain, shell, protocol, net, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { webBase, classroomContext, requestFor } = require('./client-contract.cjs');
const base = webBase(process.env.CLASSROOM_WEB_URL || (app.isPackaged ? 'https://live.xiangyuwenshu.cn' : 'http://localhost:3000'));
const workspaceUrl = 'classroom-client://app/index.html';
let classroomWindow, workspaceWindow;
protocol.registerSchemesAsPrivileged([{ scheme: 'classroom-client', privileges: { standard: true, secure: true } }]);
const topFrame = (event, window) => window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === event.sender.mainFrame;
function requireWorkspace(event) {
  if (!topFrame(event, workspaceWindow) || event.senderFrame.url !== workspaceUrl) throw new Error('Untrusted client frame');
}
function requireClassroom(event) {
  if (!topFrame(event, classroomWindow) || new URL(event.senderFrame.url).origin !== base) throw new Error('Untrusted classroom frame');
}
function currentContext() {
  if (!classroomWindow || classroomWindow.isDestroyed()) return null;
  try { return classroomContext(classroomWindow.webContents.getURL(), base); } catch { return null; }
}
function openWorkspace() {
  if (workspaceWindow && !workspaceWindow.isDestroyed()) { workspaceWindow.show(); workspaceWindow.focus(); return; }
  workspaceWindow = new BrowserWindow({ parent: classroomWindow, width: 1080, height: 800, minWidth: 720, minHeight: 560, title: '课堂工作台', backgroundColor: '#f4f6fa',
    webPreferences: { preload: path.join(__dirname, 'workspace/preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  workspaceWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  workspaceWindow.webContents.on('will-navigate', (event, url) => { if (url !== workspaceUrl) event.preventDefault(); });
  workspaceWindow.on('closed', () => { workspaceWindow = null; });
  void workspaceWindow.loadURL(workspaceUrl);
}
function createWindow() {
  classroomWindow = new BrowserWindow({ width: 1440, height: 920, minWidth: 1024, minHeight: 700, title: '翔宇文淑课堂', backgroundColor: '#171a20',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), additionalArguments: [`--classroom-origin=${base}`], contextIsolation: true, nodeIntegration: false, sandbox: true } });
  classroomWindow.webContents.setWindowOpenHandler(({ url }) => {
    try { if (['https:', 'http:'].includes(new URL(url).protocol)) void shell.openExternal(url); } catch { /* Invalid links stay closed. */ }
    return { action: 'deny' };
  });
  classroomWindow.webContents.on('will-navigate', (event, url) => {
    try { if (!['https:', 'http:'].includes(new URL(url).protocol)) event.preventDefault(); } catch { event.preventDefault(); }
  });
  classroomWindow.webContents.on('dom-ready', () => {
    try { if (new URL(classroomWindow.webContents.getURL()).origin === base) void classroomWindow.webContents.insertCSS(fs.readFileSync(path.join(__dirname, 'client-classroom.css'), 'utf8')); } catch { /* No client CSS on identity-provider pages. */ }
  });
  classroomWindow.on('closed', () => { if (workspaceWindow && !workspaceWindow.isDestroyed()) workspaceWindow.close(); classroomWindow = null; });
  void classroomWindow.loadURL(base);
}
app.whenReady().then(() => {
  protocol.handle('classroom-client', async request => {
    const url = new URL(request.url), file = url.pathname.slice(1);
    if (url.hostname !== 'app' || !['index.html', 'workspace.js', 'workspace.css'].includes(file)) return new Response('Not found', { status: 404 });
    const response = await net.fetch(pathToFileURL(path.join(__dirname, 'workspace', file)).toString());
    const headers = new Headers(response.headers); headers.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, headers });
  });
  ipcMain.handle('classroom:list-desktop-sources', async event => {
    requireClassroom(event);
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: true });
    return sources.map(source => ({ id: source.id, name: source.name, displayId: source.display_id, thumbnailDataUrl: source.thumbnail.toDataURL() }));
  });
  ipcMain.handle('client:open-workspace', event => { requireClassroom(event); openWorkspace(); });
  ipcMain.handle('client:context', event => { requireWorkspace(event); const context = currentContext(); return { hasClassroom: Boolean(context), sessionId: context?.sessionId || '' }; });
  ipcMain.handle('client:focus-classroom', event => { requireWorkspace(event); classroomWindow?.show(); classroomWindow?.focus(); });
  ipcMain.handle('client:request', async (event, operation, args) => {
    requireWorkspace(event);
    const context = currentContext();
    if (args?.sessionId && args.sessionId !== context?.sessionId) return { ok: false, status: 409, error: '当前课堂已切换，请重新加载花名册。' };
    const request = requestFor(operation, args, context), url = new URL(request.path, base);
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await classroomWindow.webContents.session.fetch(url.toString(), { method: request.method, credentials: 'include', redirect: 'error', cache: 'no-store', signal: controller.signal,
        ...(request.body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request.body) } : {}) });
      const value = await response.json();
      if (operation === 'identity' && response.status === 401) return { ok: true, data: { user: null } };
      return response.ok ? { ok: true, data: value } : { ok: false, status: response.status, error: value.error || (response.status === 409 ? '名单已更新，请重新加载后操作。' : '操作未完成，请重试。') };
    } catch { return { ok: false, status: 0, error: '网络请求未确认，已保留当前内容。请刷新检查后重试。' }; }
    finally { clearTimeout(timeout); }
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: '课堂', submenu: [{ label: '返回课堂', accelerator: 'CmdOrCtrl+1', click: () => { classroomWindow?.show(); classroomWindow?.focus(); } }, { label: '人员工作台', accelerator: 'CmdOrCtrl+2', click: openWorkspace }, { type: 'separator' }, { role: 'reload' }, { role: 'togglefullscreen' }] },
    { role: 'editMenu' }, { role: 'windowMenu' },
  ]));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
