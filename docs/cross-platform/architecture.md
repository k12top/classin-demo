# 跨端课堂架构

## 已落地的第一阶段

本仓库保留 Next.js 作为课程管理、Web 教室和 BFF；新增的端侧工程不复制业务规则，而是使用同一份课堂会话契约：

```text
课程 / 课次 / 权限 / 录制 / 考勤              PostgreSQL + Next.js API
                 │
                 ├── Web                 Next.js + 声网 Web SDK + Fastboard
                 ├── Desktop              Electron 壳 + 同一 Web 教室 + 原生桌面选择桥
                 ├── iOS / iPadOS / Android Flutter 教学壳 + 原生媒体适配器
                 └── HarmonyOS NEXT       ArkUI 教学壳 + 声网 Harmony 原生适配器
```

共享的协议在 [`contracts/classroom-v1.schema.json`](../../contracts/classroom-v1.schema.json)，设计令牌在 [`design-tokens/classroom.tokens.json`](../../design-tokens/classroom.tokens.json)。它们是三端实现的唯一公共输入；各端不能自行推导 `roomUuid`、课堂角色、发布权限或结束时间。

## 服务端协议

所有原生端使用已有的 Bearer 鉴权能力。Web 保留 HttpOnly Cookie 流程；原生端通过系统浏览器完成 Casdoor 登录，安全地保存上游 access token，并仅向 HTTPS API 发送：

```http
Authorization: Bearer <Casdoor access token or Classroom session JWT>
```

| 目的 | 调用 | 说明 |
| --- | --- | --- |
| 启动课堂 | `POST /api/classroom/session` | Body 仅传 `sessionId` 和可选 `shareAccess`；服务端返回媒体、RTM、白板、录制、权限和课件快照。 |
| 同步权威状态 | `GET /api/sessions/:sessionId/classroom/state` | RTM 提醒或轮询后重新读取。 |
| 课堂操作 | `POST /api/sessions/:sessionId/classroom/actions` | Body 为 `action` 和 `expectedRevision`；`409` 必须用最新快照重试。 |
| 聊天/字幕/提问 | `/api/sessions/:sessionId/classroom/{messages,captions,questions}` | 仅服务端鉴权后返回可见范围内的数据。 |
| 分组教室 | `/api/sessions/:sessionId/classroom/spaces` | 仅大课且按课次隔离。 |

RTC、RTM、白板与录制凭证均来自 bootstrap，且有过期时间。客户端不保存服务端密钥、声网 App Certificate、OSS 密钥或 Wordly 内部令牌。刷新或媒体断线只重新 bootstrap；不会结束课堂。桌面共享刷新后必须由新的用户手势重新触发系统选择器。

## 各端信息架构

同一份教学状态，按屏幕尺寸采用不同交互，而不是把桌面页面缩小：

| 端 | 课堂结构 | 主要用户 | 关键差异 |
| --- | --- | --- | --- |
| Web / 桌面 | 教学舞台 + Teaching Rail + 右侧检查器 | 主讲、助教 | 多窗口、窗口/屏幕分享、快捷键、完整白板工具。 |
| iPad / Android 平板 | 舞台 + 可折叠席位栏 + 浮层工具 | 主讲、助教、学生 | 注释与成员管理以覆盖层打开，横竖屏均保留舞台。 |
| iPhone / Android 手机 | 单一教学舞台 + 底部控制坞 + 全屏底部面板 | 学生优先 | 成员、聊天、字幕、课件不常驻；通过底部面板进入。 |
| HarmonyOS NEXT | Android 式移动布局，ArkUI 原生导航 | 学生优先，教师可用平板 | 使用 Harmony 原生 RTC；白板先通过 Web 组件适配，后续可替换为原生实现。 |

视觉上共享 Obsidian/Graphite 舞台、Iris 主操作、Signal 在线状态和 Coral 结束/录制状态。所有端保持“Teaching Rail”这一标志性结构：教学内容始终占主舞台，成员和工具只在需要时出现，避免卡片堆叠。

## 平台适配器边界

每端都实现以下能力，而业务 UI 只消费 bootstrap 与权限：

```text
ClassroomMediaAdapter       connect / publish / subscribe / devices / screen share
ClassroomSignalingAdapter   notify revision / reconnect / poll fallback
ClassroomWhiteboardAdapter  join / writable / add courseware / snapshot
ClassroomAuthAdapter        system sign-in / refresh token / secure storage
```

- Electron 首期复用 Web 声网和 Fastboard，实现成本最低；预加载桥只负责系统窗口/屏幕选择，不能暴露 Node 或文件系统给页面。
- Flutter 使用 `agora_rtc_engine` 的 Android、iOS、Windows、macOS 支持面；移动端不能将“选择某一个窗口”作为产品承诺，只能共享整个屏幕。
- HarmonyOS NEXT 使用声网 Harmony RTC/RTM 原生 SDK。当前白板能力应做成可替换 Web 白板适配器，避免把业务层绑定到某一个页面容器。

## 配置与安全

端侧只需要以下公开配置；应通过 CI 的端侧构建变量注入，不提交真实令牌：

| 端 | 配置 |
| --- | --- |
| Electron | `CLASSROOM_WEB_URL=https://live.xiangyuwenshu.cn` |
| Flutter | `--dart-define=CLASSROOM_API_BASE_URL=https://live.xiangyuwenshu.cn` |
| HarmonyOS NEXT | 在 `ClassroomEnvironment.ets` 设置 `apiBaseUrl` |

`sessionId` 和 access token 是运行时值，不应写入包配置或日志。原生登录回调 URI 必须逐端注册到 Casdoor；生产环境仅允许 HTTPS API 与签名后的发行包。

## 后续落地顺序

1. 为 Flutter 与 Harmony 实现 Casdoor 系统浏览器登录、加密令牌存储和 token 刷新。
2. 接入各端声网 RTC/RTM 适配器，严格应用 bootstrap 中的低流、HD 和 Full HD 参数。
3. 接入白板、课件和录制回放；Harmony 的白板先用 Web 适配器。
4. 以同一 `sessionId` 完成主讲、助教、学生、分享链接学生四种身份的联调与视觉回归。
