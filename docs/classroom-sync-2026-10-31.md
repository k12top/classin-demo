# 课堂同步调度收敛

原实现分别启动：在线保活约 15 秒、课堂状态与消息 5/15 秒、字幕偏好 20 秒、活动发现 5 秒、聊天活动列表 8 秒、每张活动卡片详情 3 秒、活动管理面板 5 秒、录制活动展示 2 秒及待转换课件 5 秒。多组件同时显示同一活动时，还会重复请求相同 URL。这些请求多数是数据轮询，不是维持在线的心跳。

本次统一由课堂级 `ClassroomSyncScheduler` 安排周期读取、恢复和通知触发，使用一个调度计时器。倒计时、音量动画、HTTP 超时、SDK 连接重试和全局字幕持久化重放队列保持各自的必要生命周期，不能将它们误作可删除的在线心跳。

- 保留一条人类连接保活，约 15 秒加少量随机错峰；后台继续，离线暂停，失败保留原有有限重试和诊断。
- 已有 RTM 通知优先驱动按需刷新，50ms 内通知合并，同一任务不重入；请求途中发生变化时，最多排入一次后续读取。活动、字幕和消息按主题刷新；runtime/member 变动只读取授权 runtime 分区，避免每次扩散到整份课堂数据。
- RTM 健康时，普通活动、消息及状态只作 60 秒兜底校验；断开后恢复 5 秒轮询。请求失败退避，最长 60 秒。不能把 RTM 连接健康当作事务提交必达证明，所以仍保留兜底。
- 同一课堂同一完整 URL/请求头的并发 GET 共享一次 HTTP 请求，响应由消费者各自复制；权限敏感参数和录制请求头不混用。仅合并正在进行的请求，不缓存已经完成的响应以隐藏新修改。一个组件卸载不取消其他消费者的请求，所有消费者取消时终止网络请求。
- 隐藏页面暂停非必要数据读取，返回前台或恢复网络后统一补齐；关闭聊天时暂停其活动卡片详情任务，结束课堂时停止整个调度器。
- 活动截止时间安排一次准确唤醒，避免延长兜底周期后延迟关题；正在 AI 判题的详情维持 5 秒读取。录制端没有人类 RTM 订阅，保留活动展示 2 秒及录制状态必要的短间隔读取，但由同一调度器安排。
- 字幕语言持久化在连接的 captionLanguage 字段，普通保活续接其租约。字幕偏好在配置变化、重连和前台恢复时重存，失败才退避重试，取消无条件 20 秒重复保存。

这是“一条保活、一个统一调度器、多个业务按需读取”，不是把所有业务响应拼成一个巨大接口。现有 RTM 仍只发送变更提示，敏感内容继续经过授权 HTTP 获取。没有启用尚未接通的服务端 RTM/outbox，也没有修改数据库、环境变量或生产部署。

验证包括调度器的虚拟时钟测试，以及真实 ClassroomV3、活动发现/聊天列表/卡片详情和共享读取代码的 Chromium 集成测试。集成测试将调度时钟加快 20 倍，HTTP 权限、RTC 和信令使用夹具；50 个连续活动通知只产生一次共享活动列表 GET，覆盖安静连接、RTM 断开兜底、后台仅保活、离线暂停、联网恢复及结束取消。字幕增量同步另作回归。

真实网络、多账号长课及生产请求量尚未验收；本地未部署。

复核命令：

```sh
node --import tsx --test tests/classroom-sync-scheduler.test.ts tests/classroom-resilience.test.ts tests/classroom-activities.test.ts tests/classroom-state-sections.test.ts tests/classroom-caption-delta.test.ts
clients/desktop/node_modules/.bin/electron tests/integration/classroom-sync-ui.cjs --sync-only --functional-only --reuse-css
clients/desktop/node_modules/.bin/electron tests/integration/classroom-sync-ui.cjs --captions-only --functional-only --reuse-css
```

`--reuse-css` 使用现有测试样式缓存；首次运行时去掉该参数。检查记录见 `outputs/classroom-sync-2026-10-31/sync-checks.json` 和字幕差量记录目录。

本地结果：42 项专项测试通过；统一同步和字幕差量两组页面联调通过；`tsc --noEmit` 通过。网络行为来自模拟服务与加速调度时钟，不代表生产请求量实测。
