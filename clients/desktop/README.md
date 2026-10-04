# 桌面端课堂（Electron）

这个壳承载现有 Web 教室，因此课程、课次、字幕、录制与白板都与浏览器完全使用同一服务端状态。它不在 Electron 主进程保存课堂密钥或用户 Token。

```bash
cd clients/desktop
npm install
CLASSROOM_WEB_URL=http://localhost:3000 npm run dev
```

生产环境将 `CLASSROOM_WEB_URL` 指向 `https://live.xiangyuwenshu.cn`。用户仍在页面内使用 Casdoor 登录；预加载桥只暴露经过白名单限制的屏幕/窗口列表，Next.js 页面不能访问 Node、文件系统或任意 IPC。

后续 Web 端在检测到 `window.classroomDesktop` 后，可在“共享屏幕”前显示原生窗口选择器，再将被选择的 source id 传给 `getUserMedia`。刷新页面后该选择必须重新由用户触发，不能复用旧 source 或轨道。
