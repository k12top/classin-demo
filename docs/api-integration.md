# Classroom API 对接文档

外部服务通过 REST API 获取用户课程信息及进入课堂。

## 认证方式

所有接口支持两种认证：

| 方式 | 适用场景 | 说明 |
|------|----------|------|
| Cookie | 浏览器前端 | HttpOnly cookie，现有流程不变 |
| Bearer Token | 服务端间调用 | `Authorization: Bearer <casdoor_access_token>` |

Bearer Token 直接使用你服务的统一认证 access_token（同一认证体系，不同 app），无需额外换 token。我们会自动解析认证 JWT 提取用户身份和角色。

---

## 接口列表

### 1. 获取用户课程列表

教师返回自己创建的所有课程；学生返回已报名的课程（直接分配 + 班级分配）。

```
GET /api/courses
Authorization: Bearer <casdoor_access_token>
```

可选查询参数：

| 参数 | 类型 | 说明 |
|------|------|------|
| status | string? | 筛选课程状态（`scheduled` / `live` / `afterClass` / `finished` / `cancelled`）；`active` 已废弃 |
| createdAt | `asc` \| `desc`? | 按创建时间全局排序，**覆盖**下方默认规则 |

**默认排序**（省略 `createdAt` 时，按课堂列表展示规则）：

- 整体顺序：未开始+进行中+已下课 → 已结束 → 已取消
- `scheduled` + `live` + `afterClass`：按 `startTime` **升序**；同时间时 `live` > `afterClass` > `scheduled`
- `finished` / `cancelled`：按 `endTime` **降序**（从近到远）；无 `endTime` 时回退按 `startTime` 降序

**课后延时结束**：课程只会在计划结束时间 `endTime` 加默认 **20 分钟** 后自动变为 `finished`（已结束），延时可通过环境变量 `COURSE_FINISHED_DELAY_MINUTES` 配置。声网的 `afterClass`/`close` 不能提前触发自动结束；计划结束时间前收到的 `afterClass` 会被忽略。列表/详情 API 读取和后台定时任务都会推进已到期课程。

示例：

```http
GET /api/courses?createdAt=desc
GET /api/courses?createdAt=asc
GET /api/courses?status=live
GET /api/courses?status=afterClass
GET /api/courses?status=scheduled
```

`createdAt` 传非法值（如 `foo`）时返回 `400`：`{ "error": "createdAt must be asc or desc" }`

`status=active` 返回 `400`：`{ "error": "status 'active' is deprecated; use 'scheduled'" }`

**教师响应**

```json
{
  "courses": [
    {
      "id": "a1b2c3d4-e5f6-...",
      "name": "数学一对一",
      "description": "课程描述",
      "roomType": 0,
      "teacherId": "uuid-xxx",
      "teacherName": "张老师",
      "status": "scheduled",
      "statusLabel": "未开始",
      "startTime": "2024-01-15T10:00:00.000Z",
      "endTime": "2024-01-15T11:00:00.000Z",
      "studentRemarks": "想多练习几何",
      "createdAt": "2024-01-10T...",
      "updatedAt": "2024-01-10T...",
      "students": [
        { "studentId": "student1", "studentName": "小明" }
      ],
      "groupLinks": [
        { "id": "...", "group": { "id": "...", "name": "A班" } }
      ],
      "activeJoinLinks": [
        { "id": "...", "label": "分享链接", "joinUrl": "https://.../join/xxx", "requiresPasscode": true, "passcode": "123456", "useCount": 3 }
      ],
      "activeCourseShareLinks": [
        { "id": "...", "label": "课程分享链接", "courseShareUrl": "https://.../course-share/xxx", "requiresPasscode": true, "passcode": "123456", "useCount": 5 }
      ]
    }
  ]
}
```

**学生响应**

```json
{
  "courses": [
    {
      "id": "a1b2c3d4-e5f6-...",
      "name": "数学一对一",
      "description": "课程描述",
      "roomType": 0,
      "teacherId": "uuid-xxx",
      "teacherName": "张老师",
      "status": "scheduled",
      "statusLabel": "未开始",
      "startTime": "2024-01-15T10:00:00.000Z",
      "endTime": "2024-01-15T11:00:00.000Z",
      "studentRemarks": "想多练习几何",
      "createdAt": "2024-01-10T...",
      "updatedAt": "2024-01-10T...",
      "students": [
        { "studentId": "student1", "studentName": "小明" }
      ]
    }
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 课程 UUID |
| name | string | 课程名称 |
| description | string | 课程描述 |
| roomType | int | 房间类型：0=一对一，2=大班课，4=小班课 |
| teacherId | string | 教师用户 ID |
| teacherName | string | 教师显示名 |
| status | string | 状态：`scheduled` / `live` / `afterClass` / `finished` / `cancelled` |
| statusLabel | string | 中文展示：`未开始` / `进行中` / `已下课` / `已结束` / `已取消` |
| endedAt | string? | 下课时刻（ISO）；`afterClass` 时存在，用于计算何时晋升为 `finished` |
| startTime | string? | 开始时间（ISO 格式） |
| endTime | string? | 结束时间（ISO 格式） |
| studentRemarks | string | 学生需求备注 |
| students | array | 直接分配的学生列表 |
| activeJoinLinks | array | 教师可见：活跃的直播分享链接，打开后进入直播教室；如 `requiresPasscode=true`，需先输入该链接的 6 位 `passcode`；直播分享链接不会把用户加入学生名单（学生无此字段） |
| activeCourseShareLinks | array | 教师可见：活跃的课程分享链接，学生登录/注册并通过可选链接密码后自动加入课程并进入课程详情页（学生无此字段） |

---

### 2. 获取课程详情

```
GET /api/courses/{courseId}
Authorization: Bearer <casdoor_access_token>
```

**响应**

```json
{
  "course": {
    "id": "...",
    "name": "数学一对一",
    "description": "...",
    "roomType": 0,
    "teacherId": "...",
    "teacherName": "张老师",
    "status": "scheduled",
    "statusLabel": "未开始",
    "startTime": "...",
    "endTime": "...",
    "studentRemarks": "...",
    "createdAt": "...",
    "updatedAt": "...",
    "students": [
      { "id": "...", "courseId": "...", "studentId": "student1", "studentName": "小明", "joinedAt": "..." }
    ],
    "groupLinks": [
      {
        "id": "...",
        "courseId": "...",
        "groupId": "...",
        "linkedAt": "...",
        "group": {
          "id": "...",
          "name": "A班",
          "parentId": null,
          "createdBy": "...",
          "createdAt": "...",
          "updatedAt": "...",
          "members": [
            { "id": "...", "groupId": "...", "userId": "student1", "userName": "小明", "joinedAt": "..." }
          ]
        }
      }
    ]
  }
}
```

---

### 3. 验证课程访问权限 + 获取课堂入口

**这是进入课堂的关键接口**——返回用户是否允许访问、角色信息、以及课堂入口 URL。

```
GET /api/courses/{courseId}/verify-access
Authorization: Bearer <casdoor_access_token>
```

**允许访问响应**

```json
{
  "allowed": true,
  "role": "student",
  "courseInfo": {
    "name": "数学一对一",
    "roomType": 0,
    "teacherName": "张老师"
  },
  "classroomUrl": "/classroom?roomUuid=a1b2c3d4e5f67890&roomType=0&roomName=数学一对一&courseId=a1b2c3d4-e5f6-..."
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| allowed | bool | 是否允许访问 |
| role | string | `"teacher"`、`"assistant"` 或 `"student"`；课程主讲老师返回 `teacher`，其他授课老师返回 `assistant` |
| courseInfo.name | string | 课程名称 |
| courseInfo.roomType | int | 房间类型 |
| courseInfo.teacherName | string | 教师名 |
| classroomUrl | string | **课堂入口路径**，拼接域名即可跳转 |

**拒绝访问响应**

```json
{
  "allowed": false,
  "role": null,
  "reason": "您未被分配到此课程，请联系老师获取访问权限"
}
```

`reason` 值：`"未登录"` / `"课程不存在"` / `"您未被分配到此课程..."`

**课堂入口 URL 使用**：拼接域名即可直接跳转

```
https://your-domain.com/classroom?roomUuid=...&roomType=...&roomName=...&courseId=...
```

---

### 4. 获取课堂 Token（嵌入模式）

如果要在 iframe 中嵌入课堂，需要额外获取课堂 token。

```
POST /api/token
Authorization: Bearer <casdoor_access_token>
Content-Type: application/json

{
  "roomUuid": "a1b2c3d4e5f67890",
  "courseId": "a1b2c3d4-e5f6-..."
}
```

| 参数 | 类型 | 说明 |
|------|------|------|
| roomUuid | string | 从 classroomUrl 中取的 roomUuid |
| courseId | string | 课程 UUID |

**响应**

```json
{
  "token": "007eJx...",
  "appId": "c99134753386...",
  "classroomUrl": "/classroom?roomUuid=...&roomType=...&roomName=...&courseId=...",
  "role": "assistant",
  "roleType": 3
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| token | string | 课堂访问 token，用于课堂启动 |
| appId | string | 课堂应用标识 |
| classroomUrl | string | 课堂入口路径 |
| role | string | `"teacher"`、`"assistant"` 或 `"student"` |
| roleType | int | 声网 SDK 角色：`1`=老师，`2`=学生，`3`=助教 |

---

### 5. 取消课程

教师和学生均可取消；教师还可以结束课程。

```
PATCH /api/courses/{courseId}
Authorization: Bearer <casdoor_access_token>
Content-Type: application/json

{ "status": "cancelled" }
```

教师手动结束课程：`{ "status": "finished" }`。该操作会立即结束课程；自动结束仍以计划结束时间 `endTime` 加延时时间为准。

`scheduled` / `live` / `afterClass` 通常由计划时间和课堂状态同步，教师可通过管理页面手动纠正。

**响应**：同课程详情结构，`status` / `statusLabel` 字段已更新。

---

### 6. 学生留言给老师

```
PATCH /api/courses/{courseId}
Authorization: Bearer <casdoor_access_token>
Content-Type: application/json

{ "studentRemarks": "我想多练习几何题" }
```

**响应**：同课程详情结构，`studentRemarks` 字段已更新。

---

## 最简对接流程

只需 2 个接口即可完成对接：

```bash
# 1. 获取课程列表（默认：未开始+进行中 startTime 升序，已结束/已取消 endTime 降序）
curl https://your-domain.com/api/courses \
  -H "Authorization: Bearer <casdoor_access_token>"

# 仅进行中的课程
curl "https://your-domain.com/api/courses?status=live" \
  -H "Authorization: Bearer <casdoor_access_token>"

# 按创建时间升序
curl "https://your-domain.com/api/courses?createdAt=asc" \
  -H "Authorization: Bearer <casdoor_access_token>"

# 2. 获取课堂入口
curl https://your-domain.com/api/courses/{courseId}/verify-access \
  -H "Authorization: Bearer <casdoor_access_token>"

# 3. 拼接域名跳转
# https://your-domain.com + classroomUrl
```

### 定时任务配置（已启用）

项目已配置定时任务，每 **1 分钟** 后台自动触发一次 `/api/cron/promote-course-status`：

1. **自动状态更新**：定时任务负责将到达开始时间的课程推进为 `live`，并在 `endTime + COURSE_FINISHED_DELAY_MINUTES` 后推进为 `finished`。
2. **请求时兜底**：读取课程列表、详情或校验课堂访问权限时也会推进当前涉及的到期课程，避免定时任务延迟造成状态滞后。
3. **本地开发测试**：开发环境可直接访问 `http://localhost:3000/api/cron/promote-course-status`（本地开发已跳过 `CRON_SECRET` 校验）来手动触发状态更新。


---

## 错误响应

```json
{ "error": "错误描述" }
```

| HTTP 状态码 | 含义 |
|-------------|------|
| 400 | 请求参数错误 |
| 401 | 未认证（token 无效或过期） |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 500 | 服务端错误 |
