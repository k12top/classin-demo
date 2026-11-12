# Windows x64 远控接收验证

2026-11-12，分支 `feature/classin-unified-workspace`。本轮补齐 Windows 学生端接收程序，复用现有学生确认、服务端短时授权、共享连接绑定和签名输入链路。网页与 Electron 继续使用同一课堂组件；Windows 仅在客户端明确声明包含原生接收程序时显示可接收能力。

## 已验证

- 桌面 107 项测试通过，包括 Windows 与 macOS 主进程路由、授权后才启动接收程序、物理像素转换、拒绝无效坐标、输入积压和独立停止通道。测试使用 Electron 与原生输入替身。
- 项目远控相关 18 项测试通过，覆盖签名、握手、传输、授权范围和平台能力。隔离 Electron 的实际授权同步组件回归通过，网络和身份使用测试边界。
- C++ 协议在 macOS 主机编译并执行；AddressSanitizer / UndefinedBehaviorSanitizer 自检通过。覆盖 99 个物理键位、严格 JSON、授权到期、不可恢复的失效状态、输入频率、按键及鼠标释放、负坐标与多屏边界。没有执行实际系统输入。
- 使用 MinGW-w64 交叉编译 `RemoteInput.exe`，将清单嵌入 x64 PE。程序以 `asInvoker` / `uiAccess=false` / `PerMonitorV2` 运行；仅依赖 Windows 系统库，无外置 GCC 或 pthread DLL。
- `npm run package -- --win --x64 --config.directories.output=dist-windows-verified` 成功，生成 `dist-windows-verified/win-unpacked/`。核对应用及辅助程序架构、包内辅助程序与构建产物哈希一致，以及 7 个 ASAR 模块与当前源码 SHA-256 一致。没有制作或验收 NSIS 安装程序，没有发行签名。
- 同一工作树重新制作 `dist/mac-arm64/翔宇文淑课堂.app`，核对 8 个 ASAR 模块哈希、深度签名校验和通用辅助程序自检；包内实际 Electron 的四语言 × 两种宽度连接恢复与真实 IPC 重连集成通过。Mac 包为本地 ad-hoc 签名，关闭 hardened runtime，未公证；这不代表真实账号与媒体在新包中已验收。
- 真实本地教师 `test1` 会话读取 3 个班级、进入“本地师生共享联调”的 5 个已结束课节，并在“师生实时共享和远控联调”互动记录查看学生 rainy 的选项 A 和 10/10 分数。该课节没有可播放录像；不据此认定回放视频、学生权限或双机输入通过。截图仅存于本机 `outputs/remote-windows-validation/teacher-real-response.png`。

## 实现约束与待验收

学生须共享整个屏幕并允许该次控制。主进程使用 Electron 的 DIP 到物理像素转换，辅助程序定位唯一匹配屏幕后绑定其实际边界；屏幕、旋转、输入桌面变化或父进程退出即停止。停止时通过独立命名事件通知辅助程序，先释放按键及鼠标；卡死时才兜底终止。辅助程序不请求管理员权限，不控制权限更高的程序或系统安全桌面。

当前仅支持 Windows x64 构建。仍需 Windows 10/11 实机确认启动、不同 DPI 与多屏、左右键/拖动/滚动、组合键、学生撤销、断网和锁屏；真实师生远控需要两台设备。协议自检、交叉编译和模拟 Electron 测试均不能替代这些验收。课堂其余逐页、弱网、媒体及完整录像验证仍继续，不把本轮平台补齐记为整体目标完成。
