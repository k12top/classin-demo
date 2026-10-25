# 课堂反馈扩展 · 2026-10-25

## 范围与状态

本次延续[已批准极简原型](../../outputs/classroom-minimal-design-2026-10-25/prototype.html)的白灰表面、少量靛蓝、Lucide 图标和悬停／聚焦提示，按用户标注调整助教、成员席位、设置、顶部控制、共享邀请、举手、附件与竖屏聊天。用户追加的摄像头要求指向**底部本机摄像头按钮**：关闭本机后不能改用同账户另一设备的画面；已结束的采集只在用户明确重新开启时申请恢复。

**状态：实现与限定范围的本地验证已完成，两项视觉修复已复核通过。** 首轮[独立复核](../../.impeccable/review/classroom-feedback-20261025/finish-review.md)为 `disposition: fix`，发现共享邀请标题／正文可读性和设置语言控件宽度两项问题。两项 CSS 修复后重新捕获截图，[后续复核](../../.impeccable/review/classroom-feedback-20261025/verdict-pass.md)均判定 resolved，`disposition: ship`；该结论仅覆盖这两项修复，首轮接受的其他项目及其证据限制保持有效。修复后构建成功。方向及验收范围见 [direction.json](../../.impeccable/review/classroom-feedback-20261025/direction.json)。

## 实现约束

| 区域 | 本次行为与视觉约束 |
| --- | --- |
| 私人助教 | 默认显示左下圆角头像与 AI 气泡；可隐藏，从功能菜单重新打开；隐藏保留私人会话。展开、隐藏及菜单状态可区分。 |
| 成员席位 | 从左侧排列，使用普通字母头像占位，减少重复共享说明。折叠后只留迷你头像、人数和展开柄；成员仍可横向滚动访问。 |
| 设置 | 紧凑、可滚动的单列；语言控件占满可用宽度，不保留空白右栏。 |
| 顶部控制 | 桌面提供内容最大化入口；时钟菜单承接课堂控制与结束确认。录制按钮区分未录制、启动中、录制中、停止中。 |
| 共享邀请 | 白色简洁卡片位于 dock 上方，只使用一次克制入场动效并尊重减少动态偏好；保留关闭、稍后与开始入口。待开始状态必须显示可读标题和选择来源说明。 |
| 举手 | 保存时保持同一个手形图标挂载，仅短暂挥手提示。教师确认绑定精确 `handRaisedAt`，不能清除后续新举手，也不授予麦克风／摄像头权限。 |
| 图片附件 | 仅显示缩略图；右上删除按钮在悬停、聚焦时出现，触摸环境保持可发现。 |
| 聊天／同传 | 再次点击当前 dock 入口关闭；切换保留选中状态。竖屏使用底部面板，非活动面板以 `display: none` 隐藏，不能残留绘制。 |
| 本机摄像头 | 本机身份优先决定自身画面，关闭后不回退到同账户远端视频；关闭时取消发布且恢复流程不重新挂载。已结束采集需明确重新开启才申请，用户保持关闭的目标不能被恢复流程唤醒。 |

## 本地验证与证据边界

留存环境为 `feature/classroom-share-portrait`、本地 `localhost:3000` 与隔离 PostgreSQL 55438；教师 `test1` 和学生 `test10` 参与真实本地界面检查。以下结果来自已有日志和运行时材料，本文编写过程没有运行测试、浏览器或修改源代码。

| 证据层级 | 结果 | 可支持的结论与限制 |
| --- | --- | --- |
| 单元 | [514 passed，0 failed](../../.impeccable/review/classroom-feedback-20261025/unit.log) | 受测逻辑通过；不能代替真实设备和云服务。 |
| provider 回归 | [47 passed，0 failed](../../.impeccable/review/classroom-feedback-20261025/provider-camera.log) | Agora SDK 替身下的生命周期回归通过，不代表实体设备恢复验收。 |
| 举手 API／数据库 | [8 组通过](../../.impeccable/review/classroom-feedback-20261025/hand-api.log) | 临时真实 PG；鉴权和 RTM 为替身。覆盖精确确认、不授予媒体权限及旧确认保留新举手。 |
| 成员条 | [25 人、5 个视口通过](../../.impeccable/review/classroom-feedback-20261025/scroll.log) | 隔离 Electron 验证首尾可达、滚轮／触摸、RTL 与左对齐；不是实体手机。 |
| 静态检查／构建 | [最终 UI lint 无发现](../../.impeccable/review/classroom-feedback-20261025/lint-final.log)；[build-final 成功](../../.impeccable/review/classroom-feedback-20261025/build-final.log) | 两项复核 CSS 修复后的 [build-reviewed](../../.impeccable/review/classroom-feedback-20261025/build-reviewed.log) 退出 0。本次 CSS 收尾未重跑单元或 provider 测试，514／47 项为前述留存结果。 |
| 真实本地举手／面板 | [runtime-evidence.json](../../.impeccable/review/classroom-feedback-20261025/runtime-evidence.json) | 学生举手 → 教师看到待处理项 → 教师确认 → 学生恢复可举手；DB 回读举手为空且学生麦克风／摄像头仍无授权。聊天第二次点击关闭，聊天／同传切换时非活动区不绘制。 |
| 真实本机摄像头 | [camera-runtime-evidence.json](../../.impeccable/review/classroom-feedback-20261025/camera-runtime-evidence.json) | 本机 1280×720 → 关闭后 0 个视频 → 明确开启后 1280×720，再关闭。另一台同账户设备仍活动；不能宣称整个账户摄像头全部熄灭或实体设备恢复通过。 |
| 助教／附件 | [验证汇总](../../.impeccable/review/classroom-feedback-20261025/verification-summary.json) | 助教默认显示、隐藏、菜单重开及 Enter 展合已检查。320px 附件实际选择成功，聚焦删除可见，删除后未发送；文件选择工具曾超时，不能把超时改写为选择失败。 |
| 共享邀请／结束确认 | [验证汇总](../../.impeccable/review/classroom-feedback-20261025/verification-summary.json) | 教师请求 → 学生接受 → 待开始卡片 → 稍后清除；没有进行实际屏幕采集。时钟菜单打开结束确认后取消，未结束课堂。 |

本批没有启动／停止实际云录制，录制状态只具备界面与源码证据。没有部署、生产或实体手机验收。此前共享人像、大小／边框和 Shift 临时直线／恢复画笔的用户本地人工反馈记录在[共享人像与绘图扩展](classroom-portrait-drawing-2026-10-25.md)，本批没有重新验收，也不扩大原反馈覆盖范围。

## 截图与复核

下列为复核要求的十个状态。设置与共享邀请已在同一路径更新为修复后截图：1002px 设置的语言选择器以单列占满 633px 可用宽度；320px 邀请显示深色标题（`rgb(32, 36, 43)`）、可见说明段落（`display: block`）和可读的稍后／开始按钮。两张重捕获已打开检查，并由[后续复核](../../.impeccable/review/classroom-feedback-20261025/verdict-pass.md)关闭对应问题。

| 状态 | 留存截图 |
| --- | --- |
| 桌面／移动课堂 | [desktop](../../.impeccable/review/classroom-feedback-20261025/desktop.png)、[mobile](../../.impeccable/review/classroom-feedback-20261025/mobile.png) |
| 390px 助教展开／320px 附件 | [assistant-open-390](../../.impeccable/review/classroom-feedback-20261025/assistant-open-390.png)、[attachment-320](../../.impeccable/review/classroom-feedback-20261025/attachment-320.png) |
| 954px 竖屏聊天／1002px 折叠席位 | [chat-954](../../.impeccable/review/classroom-feedback-20261025/chat-954.png)、[collapsed-1002](../../.impeccable/review/classroom-feedback-20261025/collapsed-1002.png) |
| 1002px 设置／结束确认 | [settings-1002](../../.impeccable/review/classroom-feedback-20261025/settings-1002.png)、[end-confirm](../../.impeccable/review/classroom-feedback-20261025/end-confirm.png) |
| 桌面本机摄像头关闭／320px 待共享邀请 | [camera-off-desktop](../../.impeccable/review/classroom-feedback-20261025/camera-off-desktop.png)、[invitation-ready-320](../../.impeccable/review/classroom-feedback-20261025/invitation-ready-320.png) |

首轮复核接受本次范围内其他呈现与交互；[detector.json](../../.impeccable/review/classroom-feedback-20261025/detector.json) 留存设计 token 提示，未据此进行全局视觉修复。教学画布的浅色空白是本地检查场景，不代表加载失败。

收尾时本地服务 PID 为 6140；测试邀请和附件均已清除，教师本机摄像头关闭，视口覆盖已重置，教师／学生页面保留。此环境整理不增加云服务、实体设备或部署验收结论。

## 全局上下文保持情况

本记录是课堂局部扩展文档，不替代全局视觉系统。全局文件 SHA-1 已核对：`DESIGN.md` 为 `ee23368cd823f0317ec6b7b4a3cb28d42e632281`，`PRODUCT.md` 为 `bb98f384d9d9778ab0cd176416c37e959d123235`；两者均未修改。原本缺少的 `.impeccable/design.json` 与 `.impeccable/config.json` 仍不存在，未补建。无关脏工作区保持原状。
