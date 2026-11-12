# 3183 工作台实现与验收索引

2026-11-12。固定目标仍为 `classin-v5` 设计稿的真实网页/Electron 实现。本文件将原计划的 14 类要求对应到当前入口和证据，避免把旧进度记录中的“待开发”直接当成当前缺失功能，也避免把组件测试写成真实双端验收。

| 要求 | 当前入口与证据 | 验收边界 / 剩余项 |
| --- | --- | --- |
| 首页与顶部操作 | `workspace-home.tsx`、`workspace-shell.tsx`、全局功能/文件搜索；workspace-search-keyboard 验证回车、草稿、输入法事件、浮层收起；真实教师网页/学生桌面搜索进入日历，3/1 个班级 | 设计稿使用示例班级和固定日期，真实空课表不能填入示例数据。输入法事件夹具不代表所有系统输入法；真实写入与弱网检查仍按各次操作记录签收 |
| 日历与时区 | `workspace-calendar.tsx`、个人日程、迷你月历、冲突区、任务全天栏；calendar-access 回归和 DST/跨午夜单元、集成测试 | 组件回归不能代替真实跨国设备的系统时区差异；已有真实课程显示换区/刷新不改 UTC 的证据见原计划 2026-11-12 条目 |
| 学生与分组 | `workspace-student-detail.tsx`、`workspace-groups.tsx`、班级成员；student-layout、course-members 回归 | 用户目录与分组授权由接口控制；真实本地班级仅有一名测试学生，不能将其当作多名真实账号并发验收 |
| To Do | `workspace-todo.tsx`、版本化任务 API、课节关联、日历联动；todo-access 及任务写入/回执恢复测试 | 状态与真实作业批改分开；已有实测写入记录见原计划，本轮未重新创建真实任务 |
| 云盘 | `workspace-drive.tsx`、预览/文件夹/回收站 API、OSS 读写；drive-access、资源恢复与真实 OSS 预览记录 | 测试替身的上传/预览不能代替每种真实文件；已完成的真实 OSS 文本、图片与合成录像证据分别注明，不扩展到所有文件格式 |
| 聊天 | `workspace-chat.tsx`、班级/私聊 API、草稿和发件箱、翻译；`verification/workspace-chat-live-network/README.md`、chat-translation 回归 | 真实教师/学生双向、发送中刷新、丢回执与去重通过；sessionStorage 草稿不承诺跨设备或关闭标签页后恢复 |
| 公开课 | `workspace-app.tsx` 的加入入口、公开课预览/报名与现有邀请 API；public-join 回归、重复加入和访问规则测试 | 无效/冲突口令不能绕过预览；加入不授予教学权限。组件/规则测试不等于新一轮真实跨设备报名 |
| 课程工作区 | `course-workspace.tsx`、课程/单元树、资料、作业与课节入口；course-program-scope、course-members 和原计划的写入验收 | 本轮真实越南语互动摘要及 1366/390 布局通过；学生课节入口不再宣称管理权限，未增加学生写权限 |
| 教学人员 | `course-staff-assignments.tsx`、`course-teaching-team-settings.tsx`、按课节授权 API；course-staff 回归和原计划“真实课节授权写入验收” | 历史授权只读，班级教师与单/多课助教、旁听分开；不能由一个教师会话推断所有跨账号可见性 |
| 回放 | 实际 playback 页面、媒体/字幕/聊天/互动接口；student-replay-live、replay-locales、playback-speed、recording-slices 证据；分段时间保留、字幕/互动跳转、交界和尾部回归 | 真实 OSS 合成视频与观看进度已验证；分段场景使用实际页面/API 映射和合成视频，仍缺完整真实课堂“录制→字幕→互动定位→回放”的统一闭环 |
| 教学界面 | 现有声网/Netless 教学界面、独立课堂窗口、共享和悬浮工具；classroom-responsive 七视口回归及 classroom-live-network 实测 | 真实互动 HTTP 延迟、范围下发及统计已验证；仍缺真实音视频物理弱网与完整跨设备屏幕控制验收 |
| 两端同源 | Electron 加载同一网页工作区，隔离 preload/IPC、Casdoor、导航和单课堂限制；107 项桌面测试，原生学生本轮 GET 503 自动恢复 | macOS 本机已实测，Windows 仅交叉编译及协议测试；Windows 实机、多屏/DPI和跨设备输入尚未验证 |
| 国际化与设置 | 四语言工作区、语言/城市时区选择器、账号与设备检测；本轮设备 16 组布局/失败恢复，真实教师越南语菜单 | 合成设备测试没有授予真实系统权限，也不能证明实际麦克风、扬声器、摄像头都可用 |
| 总体质量门槛 | 最新 1061 项根目录测试、107 项桌面测试、分段及重叠录像集成、类型/lint 与隔离生产构建通过；此前 11 组页面回归、看板 16 组、设备 16 组证据见各次记录 | 自动化、真实账号、真实硬件与线上部署是不同证据；目前不宣称整站所有功能和平台已全部验收 |

实现路径均相对 `src/components/workspace/`，另注明的页面/API除外。每项测试的替身范围、真实账号及清理记录以各 verification README 和原计划相应日期为准；不能只凭测试文件存在判定通过。本轮日志清单保存在本地 `outputs/workspace-final-audit/integration-checks.json`。

## 下一轮优先项

1. 完整录制、字幕和互动回看闭环，保留逐段的服务端权限与时间对齐证据。
2. 按上表继续补足尚未形成完整操作记录的真实写入/失败恢复，不能只做静态页面截图。
3. 双机远控、Windows 实机和物理音视频弱网：用户已说明暂时没有第二台设备，保持未验证；现阶段继续独立可做的实现与自动化，不将本机两会话当成双机。
