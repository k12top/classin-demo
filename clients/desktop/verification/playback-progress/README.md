# 课节回放与观看进度

2026-11-12，`feature/classin-unified-workspace`。网页和 Electron 使用同一播放器与接口。

## 修复

原进度接口只接受已结束班级的旧 `recordUrl`。课节录像虽能播放，但班级没有该地址或仍在进行时，学生计时会被拒绝。

- 课节录像启动计时携带课节 ID，按当前有效名单校验，支持单课临时学生；已结束且存在可播放录像的课节可以计时。旧班级录像入口保留原校验。
- 活动计时会话保存 `playbackLessonId`，后续心跳沿用数据库绑定并重新核对课节授权。心跳参数不能切换目标；排除、撤销和跨班请求被拒绝。教师、助教和旁听预览不计入学生时长。
- 保留服务端时间、媒体位移、最大间隔/单次计时上限和轮换 nonce。存储仍为班级维度的学生累计时长。
- 播放器请求使用覆盖响应体读取的 8 秒超时；失败时丢弃可能已过期的 nonce，在继续播放、上线或获得焦点后重新建立计时会话。队列在组件卸载时停止并取消在途请求；切换课节不会让旧队列读取新播放器。统计故障不卸载或暂停视频。

数据库迁移 `20261112123000_playback_progress_lesson` 已应用于本地 Docker `classin_unified_dev`，Prisma Client 已重新生成；线上发布时同样需要执行迁移。本轮未进行线上发布。

## 验证

```bash
DOTENV_CONFIG_PATH=.env.local node -r dotenv/config tests/integration/playback-progress-lessons.cjs
CLASSROOM_PLAYBACK_TEST_MEDIA=/absolute/path/to/synthetic.mp4 \
  clients/desktop/node_modules/.bin/electron tests/integration/playback-stability.cjs --tracking-only
```

- 真实本地 PostgreSQL 及实际路由/名单/计时逻辑验证课节录像、临时/继承名单、单课排除、撤权、跨班拒绝、教师与助教预览、旧接口兼容、教师统计和 nonce 重放。登录身份为测试边界；为验证计时计算，测试调整了测试记录的上次心跳时间。临时班级清理已确认。
- 实际学生播放器在隔离 Electron 解码合成 H.264 MP4，HTTP 服务分别挂起请求头和已开始的响应体，验证原生 8 秒超时、上线/焦点恢复、新会话、不重放旧 nonce、视频不中断，以及切课取消和旧队列停止。身份和计时回执使用夹具，不能代替真实学生登录与持久化时长的完整闭环。
- 原播放器稳定性测试重新通过：后台状态轮询、503/异常成功响应不移除播放器，初次失败自动恢复、拒绝访问停止重试、切课后忽略旧响应。47 项回放相关项目测试、TypeScript、定向 ESLint 和 diff 检查通过。
- 真实教师 `test1` 在正常本地页面/接口读取临时班级，从实际 OSS 签名地址加载 50 秒、640×360 的合成测试图视频，播放推进至 20.52 秒后暂停；未触发真实课堂录制。数据库确认教师预览的学生计时记录为零。截图仅在本机 `outputs/playback-live/real-oss-teacher-playback.png`。
- 实测结束已关闭临时页面，删除本轮合成文件和临时班级/课节/录像，并确认 OSS 对象不存在、班级记录为零；清理记录 `outputs/playback-live/cleanup.json`。原有课程和文件未变更。

后续已使用真实学生 Chrome 会话完成 OSS 合成视频播放、1.5×、数据库累计与页面读回 28 秒的闭环，详见 [真实学生验收](../student-replay-live/README.md)。该验证没有进行实际课堂录制；真实弱网代理、完整课堂录像、字幕/互动联动和 Windows 实机仍需验收，整体目标继续进行。
