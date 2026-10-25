# 网页课堂「共享＋人像」本地实现

分支交付：`feature/classroom-share-portrait`，提交身份以 Git 历史为准。本地验证快照不声明尚未执行的推送结果；原工作区已有的无关改动保留在交付范围之外。本次没有修改生产数据或声网控制台配置，也没有合并 main 或部署。

## 使用流程

桌面 Chrome / Edge 的课堂共享入口打开「共享设置」，可选「仅共享」或「共享＋人像」。后一模式用浏览器 Canvas 把屏幕与当前主摄像头合成 1920×1080、15fps 的单条自定义视频轨道，通过原屏幕 UID 发布，保留原授权租约、共享声音和主麦克风。老师可调整四角位置，也可在共享过程中切换模式。

共享＋人像期间，主摄像头继续本地采集但从主 RTC 客户端取消发布，避免学生、录制端重复接收该老师的独立摄像头视频。画面中的人像读取摄像头当前状态：关闭摄像头就移除人像，之后打开仍只进入合成画面。结束共享、切回仅共享时，只有摄像头仍开启且有权限、连接可用才恢复独立发布；断线时延后到重连，并同步发布状态避免调用两次 publish。

老师席位保留账户头像、姓名和「正在共享」状态；其他成员的语音和席位保留。接收端在未取得共享流实际尺寸前先为其预留 Full HD 全部像素预算，测得720p后才分配余量；模式切换重发和重连均重置共享流的尺寸缓存。1080p合成已占满Full HD预算，此时其他视频暂停接收。仅共享继续720p，按实测尺寸和小流预算恢复可接收的其他视频。计费仍需以线上实际收发分辨率与账户合同验收。

原有本地共享预览防递归保护保留：分享人本机默认显示正在共享状态，学生和网页录制端渲染输出轨道。学生已有舞台放大/全屏入口；这不改变共享内容。

## 页面展示

共享中的入口统一称「共享设置」，菜单中使用明确的「停止共享」。顶部和底部减少常驻说明，保留图标可访问名称、悬停/聚焦提示、必要状态与原菜单功能；共用 `icon-button.tsx` portal tooltip 支持鼠标与键盘并避免面板裁切。聊天和同传继续共用右侧栏；桌面/横屏可拖动交界线，最大480px且不超过工作区40%，支持键盘、双击恢复和记住宽度。手机竖屏保留底部面板。成员管理按钮在席位悬停/聚焦/触屏点按后出现，姓名始终保留；手机共享状态与头像、媒体徽标分别占位。

## 验证与边界

本节以交付暂存树导出的隔离检出 `/tmp/classroom-minimal-delivery-20261025` 为准，汇总见 `outputs/classroom-goal-2026-10-25/final-verification.json`。此前 41/42、旧麦克风失败及 494 项统计已过期；504 项来自包含未交付时区测试的较大脏工作区，本次交付的准确结果为 496 项。

- 真实 Electron Canvas / MediaStream：1080p 输出、屏幕保留、人像右下与左上位置、摄像头关闭、720p 尺寸切换、仅释放输出资源均通过；输入为合成色块，不是真人设备。日志：`/tmp/classroom-staged-canvas.log`；像素/轨道材料：`outputs/classroom-share-portrait-2026-10-25/canvas-check.json`。
- 提供器替身 44/44 通过，包含快速麦克风切换、初始采集连点、失败回滚、浏览器停止、共享模式切换、摄像头开关及重连不重复发布。日志：`/tmp/classroom-staged-provider.log`。实时与权限测试另有 15/15 通过：`/tmp/classroom-staged-realtime.log`。
- 真实 ClassroomV3 组件、本地 HTTP/RTC 替身：修正 740px 横屏舞台零高度后，7 种尺寸回归通过；共享模式、四角位置、共享头像席位、停止恢复、真实鼠标拖动侧栏、键盘上限、宽度记忆与键盘 tooltip 均有本地验证。日志：`/tmp/classroom-goal-ui.log`。独立完整复核的两项实质问题修正后，同一 reviewer 均判定 resolved，最终 disposition 为 ship，结论限于复核范围；最新 23 张 PNG 位于 `.impeccable/review/minimal-final-3`。
- 25 人席位、5 种尺寸、首尾可达、真实横向滚轮/触摸、RTL 与少人数居中通过。日志：`/tmp/classroom-staged-stage.log`；材料：`outputs/classroom-stage-scroll-2026-10-25/stage-scroll-checks.json`。
- 单元测试 496/496 通过：`/tmp/classroom-staged-unit.log`。最终 tooltip 组件加入后的交付暂存树生产构建成功：`/tmp/classroom-staged-build.log`。范围内 lint 零错误；`server/runtime.ts` 有一项已有 unused-target 警告，选中改动未修改该处。

本次课堂整体实现同时涵盖聊天内活动、图片、全局撤回/禁言与课后结果页。完整 `npm run test:activities` 已通过，包含迁移/schema 对齐、实际 Next 路由、隔离 PostgreSQL、双端聊天 UI 和活动工作区/课后结果 UI；最终 tooltip 改动后聊天链路再次通过。鉴权、对象存储、AI 与信令为 fixture，未调用生产 AI。证据：`/tmp/classroom-staged-activities.log`、`/tmp/classroom-staged-chat-ui.log` 和 `outputs/classroom-goal-2026-10-25/chat-ui.json`。历史独立 `classroom-feedback` 脚本因专用固定端口 fixture 数据库未配置而拒绝执行，未进入产品断言；新增消息/图片范围已有真实路由与隔离数据库覆盖，不表示已运行仓库全部集成脚本。活动记录可供后续课后 AI 集成使用，但自动汇入全局课程总结尚未实现。完整课堂规则、三份新增 migration 和证据分层见 `docs/design/classroom-minimal-implementation-2026-10-25.md`。

没有验证真实 Agora 传输、线上账单、实体手机、长时间后台/切网络，以及各设备的合成性能。Worker 计时避免仅依赖后台会停止的 requestAnimationFrame；浏览器/操作系统仍可能暂停捕获。浏览器结束屏幕采集后走停止流程，需要用户重新选择共享内容。

全部证据为本地检查。没有合并 main、部署或生产数据库操作；分支禁自动部署保护按官方 schema 配置 `deploymentEnabled: false`。全局设计文档偏差、无关排课/时区和原生客户端改动不在本次交付范围。
