# 嵌入课堂与 RC 状态回调

需要第三方通过 REST 创建、修改和删除课程/课次时，参见 [匿名课程 REST API](./public-course-api.md)。

课堂提供两条通知通道：iframe 内向父平台发送 `window.postMessage`，服务器向配置的 RC 地址发送签名 webhook。实际课堂状态以 `classroomStatus` / `ended` 为准：老师手动下课后，排期状态 `courseStatus` 可能仍是 `afterClass`，此时 `ended` 已是 `true`。录制文件处理完成是另一个流程，这里的结束通知不表示回放文件已就绪。

## 事件约定

| type | 触发点 | ended |
| --- | --- | --- |
| `classroom.started` | 老师成功开始上课、计划自动开课、重新开课 | false |
| `classroom.ended` | 老师成功结束课堂、到达计划结束时间加宽限期 | true |
| `classroom.user_left` | 用户主动离开，或页面触发 pagehide | 当前课堂是否已结束 |

老师暂时离开、学生离开不会结束课程。仅排期状态从 `scheduled` 变为 `live` 不表示课堂已开始；需要实际课堂 runtime 进入 `live`。录制机器人不发送浏览器生命周期通知。

示例载荷（两条通道使用相同结构，但各自生成独立事件 ID）：

```json
{
  "source": "classroom",
  "version": 1,
  "eventId": "d218081d-489c-4bc1-b778-6eeac54cc011",
  "type": "classroom.ended",
  "occurredAt": "2026-10-03T02:00:00.000Z",
  "courseId": "课程ID",
  "sessionId": "课次ID",
  "courseStatus": "afterClass",
  "classroomStatus": "ended",
  "ended": true,
  "reason": "teacher_end",
  "startedAt": "2026-10-03T01:00:00.000Z",
  "actor": { "userId": "用户ID", "role": "teacher" }
}
```

`actor` 是操作人；自动开始/结束不一定有此字段。`startedAt` 标识一次开课周期，未开过课时为 `null`。重新开课会产生新周期。`sessionId` 用来记录具体课次，`courseId` 用来关联长期课程。

浏览器 `reason` 通常为 `state_sync`、`teacher_end`、`user_leave`、`pagehide`。初次进入已开课的课堂也会发送状态同步事件，不能用其 `occurredAt` 计算实际上课起点，应使用 `startedAt`。服务端还有 `teacher_start`、`scheduled_start`、`scheduled_end`、`reopened`；取消课次的终止 runtime 由生命周期调度补发 `cancelled`。

## iframe 接入

服务端配置父平台白名单，重建并部署后生效：

```dotenv
CLASSROOM_EMBED_ALLOWED_ORIGINS=https://rc.example.com,https://lms.example.com
CLASSROOM_SESSION_COOKIE_SAME_SITE=none
```

白名单只接受具体 origin，不接受通配符或路径。分享入口、课堂、课程详情及访问提示页使用白名单 `frame-ancestors`；其他页面保留 SAMEORIGIN 限制。空白名单保持现有仅同源嵌入限制。跨站 cookie 设置为 `none` 时同时启用 Secure，因此必须使用 HTTPS；cookie 认证的 API 写入由 Proxy 校验请求 Origin，父平台不直接调用 cookie API。反向代理部署还应将 `CLASSROOM_PUBLIC_BASE_URL` 设为课堂公开 HTTPS 地址，以便 Origin 校验匹配外部站点。已有登录用户需重新登录以获得新 cookie 属性。浏览器自身可能仍禁止第三方 cookie，SSO 也可能禁止 iframe 登录；建议先在顶层窗口完成登录，再加载课堂，并在实际平台验证浏览器兼容性。

使用现有“直播分享”链接 `/join/<token>`，追加 `embed=1` 和父平台的 `parentOrigin`。该参数会穿过登录、口令验证，传到课堂。它只指定消息接收来源，不提供课程访问权限。

```html
<iframe id="classroom" allow="camera; microphone; display-capture; autoplay; fullscreen"></iframe>
<script>
  const classroomOrigin = "https://classroom.example.com";
  const frame = document.getElementById("classroom");
  const seen = new Set();
  window.addEventListener("message", (event) => {
    if (event.origin !== classroomOrigin || event.source !== frame.contentWindow) return;
    const data = event.data;
    if (data?.source !== "classroom" || data.version !== 1) return;
    if (data.type === "classroom.ready") {
      frame.contentWindow.postMessage({ type: "classroom.subscribe" }, classroomOrigin);
      return;
    }
    if (!["classroom.started", "classroom.ended", "classroom.user_left"].includes(data.type)) return;
    if (typeof data.eventId !== "string" || seen.has(data.eventId)) return;
    seen.add(data.eventId);
    if (data.type === "classroom.ended") {
      // 更新本平台课程状态；正式记录以服务端 webhook 为准。
      console.log("课次结束", data.sessionId, data.ended);
    }
    if (data.type === "classroom.user_left") {
      // 可以关闭课堂弹窗，不要直接标记课程结束。
      console.log("用户离开", data.sessionId, data.ended);
    }
  });
  const url = new URL("/join/替换为有效分享token", classroomOrigin);
  url.searchParams.set("embed", "1");
  url.searchParams.set("parentOrigin", window.location.origin);
  frame.src = url.toString();
</script>
```

监听器应先注册再加载 iframe。父平台收到 `classroom.ready` 后发送 `classroom.subscribe`，课堂会重发最近一条事件（保留同一个 `eventId`），便于监听器恢复。未提供 `parentOrigin` 时，课堂尝试使用 referrer；如果 referrer 丢失，订阅握手仍可确定父窗口来源。含课程信息的消息始终发送到具体 HTTP(S) origin；只有不含课程/用户信息的 ready 消息可广播。

浏览器离开通知覆盖离开按钮及正常关闭/跳转的 `pagehide`；浏览器崩溃、强制终止、断电可能不触发通知。页面进入往返缓存不当作真正离开。不同页面刷新会生成新的浏览器事件 ID；浏览器事件不保证送达，不应作为权威账目。分享链接的跨站登录/cookie 和部署的 iframe 响应头限制仍需在真实父平台验证。

## RC webhook 配置

在服务端设置：

```dotenv
CLASSROOM_LIFECYCLE_WEBHOOK_URL=https://rc.example.com/api/classroom/events
CLASSROOM_LIFECYCLE_WEBHOOK_SECRET=替换为高强度共享签名密钥
# 接收方额外要求 Bearer 鉴权时设置，可省略
CLASSROOM_LIFECYCLE_WEBHOOK_TOKEN=替换为RC接口令牌
CRON_SECRET=替换为调度鉴权密钥
```

URL 和 SECRET 同时存在才启用事件入队，不追溯启用前的历史事件。URL 只接受 HTTPS（本机测试允许 loopback HTTP），来自服务端配置，不能通过分享链接传入。令牌和签名密钥不下发到浏览器。单个部署使用一个接收地址，由 RC 依据课程/课次 ID 分发到业务记录。

部署前执行 `npm run db:migrate` 应用 `20261003000000_classroom_integration_events`，再部署构建结果。新增表 `ClassroomIntegrationEvent` 保存发送状态及错误；不修改现有课程数据。

服务器在课程状态变更事务内保存事件，提交后尽快发送。外部接口超时/失败不会撤销已提交的课程结束。发送超时为 5 秒，禁用重定向；2xx 表示成功，其他状态及网络错误重试。失败后的间隔为 30、60、120 秒逐步增加，最大 1 小时，持续保留待发送事件。

已有 `/api/cron/promote-course-status` 会发送事件；建议额外每分钟调用独立端点，避免录制供应商处理占用生命周期调度时间：

```http
GET /api/cron/classroom-webhooks
Authorization: Bearer <CRON_SECRET>
```

该端点一次最多处理 10 条，返回 `{ "ok": true, "delivered": 2, "failed": 0 }`。待发送量较大时可提高调度频率。单次手动开始、结束、离开也会在响应后触发发送。

同一课次按入队顺序发送；前一条失败时阻塞该课次后续事件，其他课次仍可发送。并发 worker 使用数据库锁和 30 秒租约。进程退出后的未完成租约可被回收。接收方已处理但响应丢失时仍会重发，因此采用至少一次投递，接收方必须按 `eventId` 做持久化去重。浏览器和 webhook 的 ID 不互通，正式业务记录应统一使用 webhook 通道。

### 请求鉴权

```http
POST /api/classroom/events
Content-Type: application/json
X-Classroom-Event-Id: <eventId>
X-Classroom-Timestamp: <Unix秒>
X-Classroom-Signature: sha256=<hex HMAC>
Authorization: Bearer <可选RC令牌>
```

签名输入是 `timestamp + "." + 原始请求body`，算法为 HMAC-SHA256。必须使用原始 body 字节，不能解析 JSON 后重新序列化再校验。重试保留 body 和 eventId，重新签名并生成发送时间戳。

Node.js 接收方校验示例：

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(headers, rawBody, secret) {
  const timestamp = headers["x-classroom-timestamp"];
  const signature = headers["x-classroom-signature"];
  if (!/^\d+$/.test(timestamp || "")) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  if (!/^sha256=[a-f0-9]{64}$/.test(signature || "")) return false;
  const expected = createHmac("sha256", secret)
    .update(timestamp + ".").update(rawBody).digest();
  const actual = Buffer.from(signature.slice(7), "hex");
  return timingSafeEqual(expected, actual);
}

// 验证可选 Bearer 令牌及签名 -> 解析 JSON -> 校验 eventId 与请求头一致。
// 在同一个业务事务中，插入唯一 eventId 并更新对应 sessionId 的状态。
// 已存在的 eventId 直接返回 2xx；成功持久化以后才确认 2xx。
```

可查询 `deliveredAt IS NULL` 的队列积压、`attempts` 和 `lastError` 做监控。修复 RC 后会自动重试；紧急补发可由运维将对应行 `nextAttemptAt` 调整为当前时间。切换 URL 会把尚未完成的事件发往新地址，应在切换前确认积压和业务映射。

## 本地验证

`npm test` 覆盖事件去重、离开语义、签名、网络失败和重试间隔。`node scripts/verify-classroom-lifecycle.cjs` 创建独立临时 PostgreSQL 并使用本机 HTTP 接收端，验证迁移、真实事务、并发开课、手动下课、自动开始/结束、重开、离开重入、回滚、重试 ID、发送顺序和 worker 租约。其课程流程保留真实 DB/runtime，认证及录制供应商调用使用测试替身，不连接实际 RC 或生产数据库。`clients/desktop/node_modules/.bin/electron tests/integration/classroom-host.cjs` 用真实 Chromium 跨域 iframe 验证生产消息 hook 的来源、开始/结束、握手重放、兄弟窗口拒绝和离开去重，课堂快照由测试模拟。
