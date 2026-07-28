# 自研在线课堂 V2 设计

## 目标

移除灵动课堂整包 SDK，由平台自己掌握课堂 UI、课程状态和权限；声网只作为默认的实时媒体、信令、白板与录制能力提供方。业务代码只依赖平台定义的 Provider 接口，后续可以替换为其他 RTC、消息、白板或录制服务。

课堂面向教师和学生，单页的唯一任务是：稳定完成授课、互动和回放生产。教师刷新、暂时离开或切换屏幕共享都不能结束课程或录制。

## 分层

```text
课程业务层
  ├── 权限、排课、教师/学生、考勤
  ├── 开始/结束上课、举手、上台、课件、回放
  └── 不认识声网的 resourceId、sid、RTC track
             │
             ▼
课堂能力接口
  ├── MediaProvider       音视频、大小流、屏幕共享
  ├── SignalingProvider   成员状态、聊天、举手、上台指令
  ├── WhiteboardProvider  白板房间与协作
  └── RecordingProvider   开始、查询、停止、回放文件
             │
             ▼
Provider 实现
  ├── Agora RTC / Signaling / Whiteboard / Cloud Recording
  └── 后续可接入其他供应商或自建服务
```

REST API 只负责服务端控制和鉴权，浏览器中的实时音视频仍由 RTC Web SDK 处理。App Certificate、REST Customer Secret、OSS Secret 永远只保留在服务端。

## 生命周期

1. 用户进入 `/classroom`，平台服务端根据 `courseId` 和当前登录会话判定角色。
2. `ClassroomServerProvider` 签发短期加入凭证，返回业务统一格式，不暴露供应商私有结构。
3. 客户端创建 `MediaProvider` 并加入频道。教师/助教是 host，学生默认 audience。
4. 教师点击“开始上课”时，业务状态切换为 `live`。若开启自动录制，同时调用 `RecordingProvider.start`。
5. 刷新页面只关闭当前浏览器的媒体轨道，不改变课程状态，不停止云端录制。
6. 教师点击“结束课堂”时先停止录制并保存文件清单，再把课程置为下课状态。后台任务负责重试查询上传状态。
7. 回放页面访问平台内部的鉴权播放地址，由服务端生成 OSS 临时地址。

## 媒体策略

媒体参数集中在 `src/lib/classroom/config.ts`，不散落在组件中。

| 场景 | 分辨率 | 帧率 | 目标码率 | 策略 |
| --- | --- | --- | --- | --- |
| 视频宫格小流 | 160 × 120 | 15 fps | 65 Kbps | 默认订阅 |
| 摄像头大流 | 1280 × 720 | 15 fps | 1200 Kbps | 放大/主讲时订阅 |
| 屏幕共享 | 1920 × 1080 | 15 fps | 2500 Kbps | 独立 RTC 用户、始终大流、文字优先 |
| 合流录制 | 1280 × 720 | 15 fps | 1800 Kbps | HLS + MP4 |

摄像头发布大小双流。接收端默认订阅小流；被放大的用户切换为大流，取消放大后恢复小流。屏幕共享使用独立 RTC client 和独立 UID，避免同一用户多视频轨限制，也避免刷新后遗留“正在共享”的错误状态。

## 录制

默认实现采用声网云端合流录制 REST API：

```text
acquire -> start(mode=mix) -> query/monitor -> stop -> OSS file list
```

每次录制单独保存 `resourceId`、`sid`、录制机器人 UID、状态、输出文件和错误信息。不能只在 `Course` 上保存一个布尔值，因为服务端重试和异常恢复需要这些供应商状态。

录制输出同时请求 HLS 和 MP4。平台鉴权回放只发布 MP4，HLS 保留在存储中作为原始分片容灾；私有 OSS 的 HLS 分片若要直接播放，还需要 CDN 鉴权或逐分片签名。录制最大空闲时间配置为 300 秒，允许教师刷新或短时断流；课程结束仍必须主动调用 stop，避免持续计费。

必要环境变量：

```dotenv
CLASSROOM_MEDIA_PROVIDER=agora
CLASSROOM_RECORDING_PROVIDER=agora

AGORA_APP_ID=
AGORA_APP_CERTIFICATE=
AGORA_REST_CUSTOMER_ID=
AGORA_REST_CUSTOMER_SECRET=

# 声网云录制 storageConfig 的数字区域 ID；不要直接填 oss-ap-southeast-1。
AGORA_RECORDING_STORAGE_REGION=
AGORA_RECORDING_MAX_IDLE_SECONDS=300
AGORA_RECORDING_PREFIX=recordings

# 课堂实时转写（声网 ASR）
AGORA_STT_ENABLED=true
AGORA_STT_REGION=cn
AGORA_API_BASE_URL=https://api.sd-rtn.com
AGORA_STT_MAX_IDLE_SECONDS=300

# 可选：Wordly 翻译桥。Token 必须与 Wordly 服务的
# BRIDGE_INTERNAL_TOKEN 完全一致。
WORDLY_API_URL=
WORDLY_INTERNAL_TOKEN=

ALIYUN_OSS_REGION=
ALIYUN_OSS_BUCKET=
ALIYUN_OSS_ACCESS_KEY_ID=
ALIYUN_OSS_ACCESS_KEY_SECRET=
```

`AGORA_RECORDING_STORAGE_REGION` 必须按声网“第三方云存储地区说明”配置，供应商不同，数字映射也不同。
声网与 Wordly 两种同传模式都使用声网 ASR；声网模式单堂课最多配置 10
个目标语言，Wordly 模式只把最终句发送到 Bridge。ASR 或翻译失败只影响字幕，
不会阻止教师和学生进入课堂。

## ClassIn 对标能力

| 能力 | 实现组合 | 阶段 |
| --- | --- | --- |
| 教师/学生音视频 | MediaProvider / Agora RTC | 第一阶段 |
| 大小流与聚焦高清 | MediaProvider | 第一阶段 |
| 屏幕共享 | 独立 screen client | 第一阶段 |
| 云端录制与回放 | RecordingProvider + OSS | 第一阶段 |
| 考勤 | 现有课程考勤 API | 第一阶段 |
| 开始/结束课堂 | 平台业务状态，不跟随 SDK 离开事件 | 第一阶段 |
| 聊天、举手、上台 | SignalingProvider | 第二阶段 |
| 成员禁言、踢出、全体静音 | 信令命令 + 服务端权限 | 第二阶段 |
| 互动白板 | WhiteboardProvider | 第二阶段 |
| 课件下载 | 现有 OSS 课件库 | 保留 |
| 课件上白板 | PPT 转码 + WhiteboardProvider | 可选 |
| 课堂测验、计时器 | 平台 Widget 接口 | 第三阶段 |
| 录制布局动态切换 | RecordingProvider.updateLayout | 第三阶段 |

## UI 方向

课堂使用“教学控制台”而不是会议软件模板：主舞台承担屏幕/主讲内容，右侧是一条可折叠成员胶片，底部是一条明确的授课控制轨。深墨蓝背景、冷白内容面和紫色课堂状态光带延续现有品牌；唯一强调元素是舞台顶部的“课堂脉冲线”，只表达连接、发言和录制状态，不增加无意义装饰。

移动端把成员胶片变为底部横向列表，控制条允许水平滚动；所有控制有文本标签、键盘焦点和明确错误反馈。

## 迁移与回退

1. 新 `/api/classroom/session` 与自研课堂页先上线。
2. 旧 `/api/token`、`/api/courses/:id/class-state` 及教育场景 REST 模块已删除，课堂只使用新会话接口。
3. RTC、屏幕共享和录制验证通过后，灵动课堂 bundle、补丁脚本、依赖和全局样式清理代码已删除。
4. 业务数据继续使用现有 `roomUuid`，在领域层称为 `channelName`；以后再做无停机字段重命名。
