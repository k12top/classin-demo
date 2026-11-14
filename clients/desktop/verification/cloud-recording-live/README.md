# 真实云录制、字幕与互动回放验收

2026-11-14，在 `feature/classin-unified-workspace` 完成。结果保存在 [checks.json](checks.json)；原始截图、请求状态及本地夹具位于忽略提交的 `outputs/cloud-recording-live/`。

## 已验证的完整流程

本地隔离 PostgreSQL `classin_unified_dev` + Next 生产构建，使用真实声网 RTC、网页云录制、实时转写、Netless 白板和私有阿里云 OSS。摄像头输入为带时间与运动图形的合成画面，麦克风输入为合成英文教学语音，没有录入用户摄像头、麦克风或桌面。没有把预生成 MP4 当作云录制产物。

1. 教师先通过实际课堂 bootstrap 取得当前连接的 RTC 凭据，初始化可写白板并持续 heartbeat，然后上课、启动云录制及 ASR。录制页收到真实媒体和白板，调用 ready 后恢复录制。
2. 通过实际 HTTP 发布三道互动题，两名学生分别作答；先验证全体下发、仅已作答下发和未下发答案三种状态。
3. 结束课堂，ASR 停止；声网同一 SID 同步停止成功且文件上传完成。成功录像 ID `eff905df-686c-4f93-966d-c59428278124`，开始 `07:59:30.804Z`，课堂结束边界 `08:00:25.497Z`，退出确认 `08:00:32.320Z`。媒体实际时长约 59.31 秒，服务端课堂时间约 54.69 秒；媒体尾部不用于扩大课堂互动时间边界。
4. OSS 生成 MP4/HLS。真实回放页由原生解码器解码为 1920×1080，帧数持续增加；截图及像素检查确认摄像头小窗和实际共享白板可见。音轨独立解码得到 RMS 约 0.151、峰值约 0.808，确认不是静音文件。
5. 归档读取到 27 条字幕（页面摘要使用其中 26 条最终字幕）。CC 字幕显示通过；点击 `00:07` 字幕按既有规则提前 3 秒播放；互动跳转到约 33.423 秒，等待实际解码、结束 seek 并继续播放后才通过。
6. 老师页面可按学生查看两人的记录与统计；两名学生页面仅显示自己的记录。已作答学生看到已下发的答案与解析，未作答学生在“仅已作答”范围下仍看不到答案。
7. 再把同一道题升级为“全体学生”范围，未作答学生的实际 API 与回放页面均可看到参考答案，同时仍没有他人的作答、统计或身份信息。

## 权限和测试边界

- 20 次真实回放 HTTP 检查覆盖老师全部作答、学生 ownResponse、概览隔离、未下发答案隐藏、CSV 权限、他人分页 cursor 拒绝、未入班用户拒绝及录像下载授权。另有两次全体下发/未作答学生读取检查。
- 使用有效期 20 分钟的本地签名身份夹具，分别模拟课程教师、两名已入班学生和未入班用户；请求经过实际鉴权、数据库与业务路由。不是新增一轮 Casdoor 登录验收。
- 真实 provider 的开始/结束由同一业务编排函数调用，互动发布、作答、下发和回放读取走实际 HTTP。没有 mock provider、数据库、录像、ASR 或回放页面。
- 本机合成输入不证明实体摄像头、跨设备远控、Windows 或物理弱网体验；本次没有部署线上。

## 本次修正

- 录制页 URL 使用 `sessionId`，旧的签名录制 URL 也不会被普通课堂的 canonical 跳转劫走。
- 增加可选 `CLASSROOM_RECORDER_BASE_URL`，临时录制入口不再改变登录、Cookie 或写操作的公共 origin；Vercel preview 仍保留当前部署地址优先规则。
- 同一任务明确同步停止、网页录制仍 on-hold 且空文件时，记录为“未生成回放”，终止无意义的上传等待；没有把空录像标成可播放，也不将单次 404 视为成功停止。
- 测试推流复用真实 bootstrap UID，避免与当前连接的人员映射不一致；测试进程隔离用户目录、使用合成媒体和受限录制桥接。

## 失败尝试与清理

首次开发模式启动尝试没有进入 ready，停止接口及后续六次查询均返回 404，跨度超过 25 分钟。缺少明确的 provider 退出回执，仍保留该尝试的处理记录，未伪造成功状态。第二次未恢复录制的任务收到明确同步空退出，已正确标为 failed/no-content；后续成功任务均有同步退出确认。

测试推流、受限桥接和临时公网隧道已关闭，临时录制环境配置已恢复；两个未启动 provider 的诊断课程已删除。隔离验收课程及 OSS 录像保留用于复核，也保留首次未确认退出的记录。`--cleanup` 会检查所有课节的录制和转写退出，遇到未确认任务时拒绝删除，避免只检查最新课节便级联删除旧记录。

## 复现入口

这些脚本会调用真实云服务并产生计费，仅显式 `CLASSIN_TEST_CLOUD_RECORDING=1` 且数据库为本地 `classin_unified_dev` 时运行。必须配置现有声网、转写、白板、OSS 凭据，并提供录制端可访问的生产构建；不要把生产数据库或业务站点反向代理到本地夹具。

1. 将受限桥接端口 3186 通过临时隧道暴露，隧道日志写入 `/tmp/classin-recorder-tunnel.log`。设置 `CLASSIN_TEST_SOURCE_COURSE` 为本地已有教师与学生的测试课程，再运行 `node tests/fixtures/cloud-recording-live.cjs --prepare`。该脚本会克隆独立课程。
2. 准备 `node_modules/.cache/cloud-recording-live/speech.wav`，使用系统语音合成英文测试句；启动 Next 生产构建（读取 `.env.local` 和 `env.local`），运行 fixture `--serve`，再运行 Electron `tests/integration/cloud-recording-publisher.cjs`。
3. 等待 `publisher.json` 的 connected、cameraOn、microphoneOn、whiteboardReady 均正常，再运行 fixture `--start`；等待录制 startedAt / ready 200。
4. 运行 `node tests/integration/cloud-recording-access.cjs --activities`，保持录制至少 30 秒，再运行 fixture `--stop`。检查停止确认和 OSS 文件后运行 access 脚本（不带参数），再运行 Electron `tests/integration/cloud-recording-replay-ui.cjs`。
5. 运行 access 脚本 `--release-all`，再运行 replay-ui 脚本 `--released-all`，验证未作答学生可见参考答案且仍不能看到他人作答。
6. 停止所有测试进程与隧道；执行 fixture `--restore-environment` 恢复临时配置。只有所有课节的 provider 退出均有证据时才运行 `--cleanup`。不要提交 `fixture.json`、签名 URL、Cookie、凭据或合成语音缓存。

最终检查：根目录 1064 项、桌面 107 项测试通过；录制生命周期 21 项专项通过；类型、变更文件 lint 和生产构建通过。网页与 Electron 使用相同回放页面，本次实际播放由 Electron 原生 Chromium 完成。
