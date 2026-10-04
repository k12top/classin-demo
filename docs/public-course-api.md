# 匿名课程与课次 REST API v1

基础路径：`/api/public/v1/courses`。这些接口按当前需求完全匿名，不要求 Cookie、Bearer token 或 API Key，支持浏览器 CORS（`Access-Control-Allow-Origin: *`，调用时不要携带 credentials）。

公开接口创建的课程标记为 `publicApiManaged=true`，所有公开查询和写入都限定在该范围。现有课程默认标记为 `false`；经这些接口访问时返回 404。`ownerId` 是业务归属字段，不证明调用者身份；任何调用者都能查询、修改、删除公开课程，不能依靠课程 ID 或用户 ID 做权限保护。公开字段及课次名单应只包含允许公开的信息。

接口定义：[OpenAPI 3.1 JSON](../contracts/public-course-api.openapi.json)，可导入 Postman 或 Swagger。

## 路由

| 方法 | 路径（相对基础路径） | 用途 |
| --- | --- | --- |
| POST | `/` | 创建课程 |
| GET | `/` | 分页查询公开课程，可按 ownerId 筛选 |
| GET | `/{courseId}` | 查询课程 |
| PATCH | `/{courseId}` | 修改课程内容 |
| DELETE | `/{courseId}` | 删除或归档课程 |
| POST | `/{courseId}/sessions` | 在课程下创建一个课次 |
| GET | `/{courseId}/sessions` | 分页查询课次 |
| GET | `/{courseId}/sessions/{sessionId}` | 查询课次 |
| PATCH | `/{courseId}/sessions/{sessionId}` | 修改课次内容 |
| DELETE | `/{courseId}/sessions/{sessionId}` | 删除或取消课次 |
| POST | `/{courseId}/sessions/{sessionId}/join-links` | 生成固定课次分享 / iframe 链接 |

所有路由支持 OPTIONS 预检。修改使用 PATCH，仅提交变化字段；没有提交的字段保持原值。课程和课次 ID 均从创建响应获取。

## 创建课程

```http
POST /api/public/v1/courses
Content-Type: application/json
Idempotency-Key: rc-course-1001
```

```json
{
  "name": "英语口语课程",
  "description": "课程介绍",
  "ownerId": "organization/teacher-1001",
  "ownerName": "课程负责人",
  "teacherId": "organization/teacher-1002",
  "teacherName": "主讲老师",
  "courseKind": "series",
  "roomType": 4,
  "autoStudentOnStage": true,
  "studentRemarks": "课程公开说明"
}
```

| 字段 | 约束 / 默认值 |
| --- | --- |
| name | 必填，1–200 字符 |
| ownerId | 必填，1–200 字符，归属用户 ID |
| ownerName | 可选，最多 200 字符，默认 ownerId |
| teacherId | 可选，1–200 字符，默认 ownerId |
| teacherName | 可选，最多 200 字符，默认归属用户名称或 teacherId |
| description、studentRemarks | 可选，各最多 10000 字符，默认空字符串 |
| courseKind | `series`（默认）或 `standalone` |
| roomType | `0` 一对一（默认）、`4` 小班、`2` 大班、`10` 公开直播 |
| autoStudentOnStage | 可选布尔值，默认沿用所选课堂类型的规则 |

返回 `201 { "course": { "id": "...", "ownerId": "...", "teacherId": "...", "lifecycleStatus": "draft", "sessionCount": 0, ... } }`。创建课程本身不创建课次；下一步单独创建课次。`standalone` 课程最多一个课次，`series` 可包含多个。

要让指定用户在现有课堂页面管理或授课，ownerId / teacherId 应对应该用户的实际身份系统 ID。这里不检查用户是否已注册，也不通过提供这些 ID 获得课堂登录身份。

## 创建课次

```http
POST /api/public/v1/courses/<courseId>/sessions
Content-Type: application/json
Idempotency-Key: rc-lesson-1001
```

```json
{
  "title": "第一课：自我介绍",
  "startTime": "2026-11-03T09:00:00+08:00",
  "endTime": "2026-11-03T10:00:00+08:00",
  "roomType": 4,
  "students": [
    { "userId": "organization/student-1001", "displayName": "学生甲" }
  ]
}
```

startTime 和 endTime 必填，必须是包含 `Z` 或显式时区偏移的 ISO 8601 时间，endTime 必须晚于 startTime。title 可选（提交时不能为空），最多 200 字符，默认课程名称及课次编号。roomType 可选，默认课程的课堂类型。主讲老师继承课程 teacherId。

students 可选，最多 100 人，userId 不能为空且不得重复，displayName 默认 userId。未提供 students 时继承课程名单；提供列表时使用独立课次名单；提供 `[]` 表示明确清空名单。课次返回的 students 只包含该课次直接设置的名单，不展开课程或学生组的继承名单。

返回 `201 { "session": { "id": "...", "courseId": "...", "position": 1, "title": "...", "status": "scheduled", "classroomStatus": "waiting", "startedAt": null, ... } }`。时间输出统一为 UTC ISO 格式。

## 生成内嵌链接

生成内嵌链接时调用 `POST /api/public/v1/courses/<courseId>/sessions/<sessionId>/join-links`，提交 `{ "parentOrigin": "https://rc.example.com" }`。RC 使用返回的 `link.ssoEmbedUrl` 作为 iframe.src，自动经 Casdoor 单点登录后进入指定课次；`ssoUrl` 为普通窗口的单点登录地址。原 `embedUrl`、`embedSnippet`、`joinUrl` 同时保留。接口完全匿名，只允许公开 API 管理的课程，拒绝已归档课程和已取消课次；已结束课次可生成回放入口。

### RC 接入步骤与完整示例

1. 创建课程，保存响应的 `course.id` 作为 courseId。
2. 在该课程下创建课次，保存响应的 `session.id` 作为 sessionId。
3. 调用该课次的链接生成接口，保存响应的 `link.ssoEmbedUrl`。
4. 把这个地址设置为 RC 页面中 iframe 的 src。每次打开使用同一个地址；课次结束后自动进入对应回放。

```bash
curl -X POST 'https://classroom.example.com/api/public/v1/courses/COURSE_ID/sessions/SESSION_ID/join-links' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: rc-embed-lesson-1001' \
  -d '{"parentOrigin":"https://rc.example.com","lang":"zh-CN","label":"第一课入口"}'
```

将课堂域名、COURSE_ID、SESSION_ID 和 parentOrigin 替换为实际值。响应示例（仅列出接入所需字段；分享 token 为示例）：

```json
{
  "link": {
    "courseId": "COURSE_ID",
    "sessionId": "SESSION_ID",
    "ssoEmbedUrl": "https://classroom.example.com/api/auth/login?next=%2Fjoin%2Fabc%3Fembed%3D1%26lang%3Dzh-CN%26parentOrigin%3Dhttps%253A%252F%252Frc.example.com",
    "requiresPasscode": false,
    "passcode": null,
    "expiresAt": null
  }
}
```

生成接口返回首次创建为 HTTP 201；使用相同 Idempotency-Key 和参数重试为 HTTP 200。以下代码直接使用实际接口响应，不自行拼接或修改 ssoEmbedUrl：

```html
<iframe id="classroom" title="在线课堂"
  allow="camera; microphone; display-capture; autoplay; fullscreen"
  style="width:100%;height:100vh;border:0"></iframe>
<script>
  // response 是上方生成接口返回的 JSON。
  document.getElementById("classroom").src = response.link.ssoEmbedUrl;
</script>
```

RC 与课堂使用同一 Casdoor、同一组织，用户身份通过 SSO 确认；生成接口无需用户 token，iframe 地址也无需附加用户 token 或自行拼接 next。课堂部署需配置 CLASSROOM_PUBLIC_BASE_URL、父平台 iframe 白名单和跨站 Cookie，Casdoor 应用需登记课堂 `/api/auth/callback` 地址，具体配置见 [iframe 接入](./classroom-platform-integration.md#iframe-接入)。

可选字段：label（最多 200 字符）、lang（1–20 字符）、parentOrigin（具体 HTTP(S) origin）、requirePasscode（布尔值）、passcode（六位数字，提交时启用口令，不能与 requirePasscode=false 同时传入）、expiresAt（未来带时区 ISO 时间）。支持 Idempotency-Key，作用域为对应课次的链接创建；相同键和参数返回原链接快照，避免生成多个链接。链接默认无口令、不过期，任何匿名调用者均可创建，应按公开范围使用。

同一 embedUrl 在课堂结束后再次打开会跳转到对应课次的内嵌回放页。完整 iframe 示例、登录规则、白名单和回调配置参见 [嵌入课堂与 RC 状态回调](./classroom-platform-integration.md)。

## 修改课程 / 课次

课程 PATCH 支持 name、description、studentRemarks、roomType、autoStudentOnStage。ownerId、教师归属和 courseKind 在公开接口中不能变更。课程 roomType 的修改影响后续创建的课次；已有课次的 roomType 需单独修改。

```http
PATCH /api/public/v1/courses/<courseId>
Content-Type: application/json
```

```json
{ "name": "更新后的课程名称", "description": "更新后的介绍" }
```

课次 PATCH 支持 title、startTime、endTime、roomType、students。未开始且排期状态为 scheduled 的课次可修改全部字段；已开课的课次只允许修改 title；已结束或取消的课次返回 409。独立修改周期课中的一个课次时，该课次会标记为 detached，不更改后续其他课次。

```http
PATCH /api/public/v1/courses/<courseId>/sessions/<sessionId>
Content-Type: application/json
```

```json
{
  "title": "调整后的课次标题",
  "startTime": "2026-11-04T09:00:00+08:00",
  "endTime": "2026-11-04T10:00:00+08:00"
}
```

修改成功返回 `200 { "course": ... }` 或 `200 { "session": ... }`。时间变更会同时校准课程的排期展示字段。接口拒绝空修改对象、未知字段、无效时间和不支持的课堂类型，返回 400。

## 查询和分页

```http
GET /api/public/v1/courses?ownerId=organization%2Fteacher-1001&limit=20
GET /api/public/v1/courses/<courseId>/sessions?limit=20
```

响应为 `{ "courses": [...], "nextCursor": "..." }` 或 `{ "sessions": [...], "nextCursor": "..." }`。下一页传 `after=<nextCursor>`；末页为 `nextCursor: null`。limit 默认 20，范围 1–100；按 ID 排序分页。课次展示顺序使用返回字段 position / startTime。

查询单个资源返回 `{ "course": ... }` / `{ "session": ... }`。不存在的资源、非公开 API 管理的课程、属于其他课程的课次均返回 404。公开响应只返回接口定义中的课程/课次字段，不包含录制下载链接、登录令牌或分享口令。

## 删除行为

```http
DELETE /api/public/v1/courses/<courseId>/sessions/<sessionId>
DELETE /api/public/v1/courses/<courseId>
```

- 未使用的 scheduled 课次：真正删除，返回 `{ "deleted": true, "cancelled": false }`。
- 课次已有课堂 runtime、上课状态、出勤、录制或学生提交记录：取消并保留记录，返回 `{ "deleted": false, "cancelled": true, "session": ... }`。
- 所有课次都未使用，且课程没有课件或回放进度记录：真正删除课程及其计划课次，返回 `{ "deleted": true, "archived": false }`。
- 课程已有使用记录或内容：归档课程、取消课次并撤销分享链接，返回 `{ "deleted": false, "archived": true, "course": ... }`。归档课程可查询，不能修改或新增课次。

取消正在使用的课次会在数据库事务内将 runtime 设为 ended、关闭出勤、将活动录制设为 stopping；响应后停止外部录制和转写。配置了前面的生命周期 webhook 时，第一次结束会入队 `classroom.ended`，reason 为 `deleted`、ended 为 true，且不声明匿名调用者是某个已认证用户。回调及供应商清理由持久状态和已有调度继续处理。重复取消保持原结束时间；真正删除后的资源再次访问返回 404。

DELETE 成功表示数据库删除/取消/归档已提交，不表示供应商停止或录制文件处理已完成。归档后的课程仍属于公开接口范围，其内容可匿名查询。

## 创建重试

课程、课次和链接创建 POST 支持可选 `Idempotency-Key` 请求头，推荐第三方每次业务创建生成一个唯一键。长度 1–160，不含空格，仅可打印 ASCII。

- 同一创建操作、同一键、相同参数：返回首次创建的资源快照，HTTP 200，`Idempotency-Replayed: true`。
- 首次成功创建：HTTP 201，`Idempotency-Replayed: false`。
- 同一键但参数不同：HTTP 409，不产生第二个资源。
- 未传键：每个成功 POST 都创建新资源。

课程创建键按 ownerId 分隔，课次创建键按 courseId 分隔。首次创建的结果即使资源随后修改或删除仍保留；重放不会复活已删除对象，应使用 GET 查询当前状态。失败请求不保存创建结果，修正后可重试。并发创建课次会在课程范围内分配唯一 position。

## 错误响应

```json
{ "error": { "code": "invalid_request", "message": "endTime must be after startTime" } }
```

| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | invalid_request | 参数、JSON 或字段无效 |
| 404 | not_found | 找不到公开范围内的资源 |
| 409 | conflict | 幂等键冲突、已结束/归档、排期冲突或并发写入冲突 |
| 413 | body_too_large | 请求 body 超过 64 KiB |
| 415 | unsupported_media_type | 请使用 application/json |
| 503 | database_unavailable | 临时数据库异常，按 Retry-After 重试 |
| 500 | internal_error | 未预期错误 |

## cURL 最小流程

```bash
curl -X POST 'https://classroom.example.com/api/public/v1/courses' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: rc-course-1001' \
  -d '{"name":"英语课程","ownerId":"organization/teacher-1001","roomType":4}'

curl -X POST 'https://classroom.example.com/api/public/v1/courses/<courseId>/sessions' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: rc-lesson-1001' \
  -d '{"title":"第一课","startTime":"2026-11-03T09:00:00+08:00","endTime":"2026-11-03T10:00:00+08:00"}'

curl -X PATCH 'https://classroom.example.com/api/public/v1/courses/<courseId>/sessions/<sessionId>' \
  -H 'Content-Type: application/json' -d '{"title":"新的课次名称"}'

curl -X DELETE 'https://classroom.example.com/api/public/v1/courses/<courseId>/sessions/<sessionId>'
```

## 部署与验证

先执行 `npm run db:migrate`，应用 `20261003010000_public_course_api`，再部署应用。迁移将已有课程的 publicApiManaged 初始化为 false，并创建 POST 幂等记录表；不把已有课程转换为公开课程。

`npm test` 覆盖参数校验和请求 body 限制。`node scripts/verify-public-course-api.cjs` 在独立临时 PostgreSQL 及本机 HTTP 服务中验证匿名 CRUD、CORS、归属、范围隔离、并发幂等/课次编号、分页、修改、删除、取消/归档与结束回调。测试使用真实数据库和路由函数，Next.js after 和外部录制/转写供应商使用测试替身，不连接生产数据库或实际第三方平台。

构建后执行 `node scripts/verify-public-course-api.cjs --production`，会额外启动本机 Next.js 生产构建并使用同一临时数据库验证真实 HTTP 路由、中间件、CORS、幂等重试结果及课程/课次完整 CRUD。测试完成后关闭临时服务并删除临时数据库。
