const { app, BrowserWindow } = require('electron');
const path = require('node:path');

// Isolated local design preview. No production session or classroom IPC.
app.setName('ClassIn 参考设计预览');
app.whenReady().then(() => {
  const window = new BrowserWindow({
    width: 1366, height: 860, minWidth: 1024, minHeight: 680,
    title: 'ClassIn 参考设计预览', backgroundColor: '#f5f5f5',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  window.webContents.setZoomFactor(1);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.loadFile(path.join(__dirname, 'index.html'));
});
app.on('window-all-closed', () => app.quit());
