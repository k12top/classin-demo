# 顶部课程浮层与全局搜索键盘操作

2026-11-12，`feature/classin-unified-workspace`。对照 3183 的共享工作区和后续已确认的 macOS 搜索样式，网页/Electron 使用同一实现。

## 本轮修复

- 搜索框输入关键词后，Enter 打开第一个可用结果；无结果保持当前搜索。方向键仍在结果之间移动，输入法选词事件（`isComposing` 或兼容键码 229）不激活结果或移走焦点。
- Cmd/Ctrl+K 在已有搜索中只重新聚焦并选中关键词，不清空查询；新建班级、课节详情、文件预览和其他已打开弹窗存在时，不替换正在处理的内容。检测全部弹窗，避免只检查 DOM 中第一个弹窗而漏掉后来的弹窗。
- 搜索功能切换到设置等弹窗后，恢复弹窗内的可操作焦点。监听和延迟聚焦在状态变化/卸载时清理。
- 顶部课程浮层保留展开动画和直接上课入口，新增 Escape 收起、焦点回到入口、新一次聚焦/移入再展开；同步 `aria-expanded`、关联内容和隐藏状态。收起时内容立即 `inert`，避免动画结束前按 Tab 又进入隐藏按钮并重新展开。
- 补齐空课表提示的繁中和越南语，不改变账号权限或课程时间。

## 验证

```sh
clients/desktop/node_modules/.bin/electron tests/integration/workspace-search-keyboard-ui.cjs
clients/desktop/node_modules/.bin/electron tests/integration/workspace-header-date-ui.cjs --dismiss-only
clients/desktop/node_modules/.bin/electron tests/integration/workspace-header-date-ui.cjs
clients/desktop/node_modules/.bin/electron tests/integration/workspace-people-access-ui.cjs
clients/desktop/node_modules/.bin/electron tests/integration/workspace-people-access-ui.cjs --spotlight-layout
```

- 修改前，真实教师网页复现输入后回车不导航、搜索快捷键覆盖未提交班级表单；自动化分别复现草稿清空、输入法方向键被接管及浮层 Escape 无效。修复后通过。
- 新的隔离检查运行真实 WorkspaceApp、搜索输入和 Radix 弹窗，覆盖草稿、其他/后续弹窗、输入法事件、Enter、重复快捷键、空结果与焦点。四语言分别检查 1366/1024/390/320 像素，无弹窗横向溢出。截图等待展开动画完成，避免把初始透明帧当成布局证据。
- 隐藏 Electron 的 DOM focus 不一定派发原生 focusin，头部夹具显式派发焦点事件；实际网页另用原生 Tab/Escape 验证展开、收起及立即 Tab 到新增按钮。API、身份及设备检测内容在隔离检查中为夹具，不代表真实操作系统输入法、设备授权或后端写入验收。
- 原头部日期/跨年、macOS/Windows 按钮留位、加号无边框、直接进入课堂、状态与调度权限回归通过；原人员授权拒绝/恢复和 Spotlight 三语言四宽度回归通过。
- 根目录 1061 项、桌面 107 项、TypeScript、定向 lint、diff 和隔离生产构建通过。构建不复制本地环境文件，并检查 13 个 CSS 输出与 Tailwind/PostCSS 生成结果；临时构建目录已清理。

## 真实账号检查

- 网页教师 test1：搜索 Calendar 后直接回车进入日历；未提交的 `Keyboard draft check` 在 Cmd+K 后仍留在原表单，焦点仍为班级名称。验证后关闭表单，没有创建班级。
- macOS 桌面学生 rainy/test：Cmd+K 搜索 Calendar，Enter 从首页进入日历；重复快捷键后查询仍为 calendar，Enter 可继续打开功能。学生仍只有一个已加入班级，没有教师目录/分组导航。当前保留桌面日历、网页首页及原登录会话。
- 本轮没有开启真实摄像头、麦克风、屏幕共享或远控，没有修改课程、学生及作答数据。

本机证据：`outputs/workspace-search-keyboard/teacher-draft-preserved.png`、`student-desktop-search.png`、四语言截图及 `checks.json`。日志以 `/tmp/classin-search-keyboard-` 为前缀，另有 `classin-island-dismiss.log`、`classin-header-date.log`、`classin-search-people-regression.log`、`classin-search-spotlight-regression.log`；输出不入库。

## 设计检查与剩余范围

完成两个 TSX 的 React hooks、焦点语义、清理和状态依赖检查。Impeccable 机械扫描对共享 CSS 报告 246 项：241 项为旧 DESIGN token 与已确认的 v5 紧凑字号/配色/圆角不同，另有 3 项缓动和 2 项尺寸动画。后者属于用户明确要求的灵动岛扩展效果，保留现有实现与 reduced-motion 分支；本轮没有新增这些视觉值，也不把扫描描述为全绿。旧产品/设计元数据可另行同步，当前以已确认的工作区 surface brief 和 3183 为准。

本轮完成的是搜索和头部交互，整体目标继续 active。完整真实云录制/字幕闭环、物理音视频弱网、双设备远控和 Windows 实机等验收仍未完成，不能由此次 UI 或夹具测试推断通过。
