# 工作台继续验收：读取恢复、设备检测和页面回归

2026-11-12，`feature/classin-unified-workspace` 的独立 worktree。网页与 Electron 继续复用相同 React 页面，未改原目录 main，未部署线上或执行数据库迁移。

## 本轮修复

- 互动看板首次读取或手动刷新失败后，原先可能等到正常的 30/60 秒周期才重读。现在失败按 2/4/8 秒退避，成功恢复正常周期；手动刷新也进入同一调度器，显式重试只重置自己的退避，运行中的读取仍合并，不并发重读。断网和后台暂停仍保留。
- 设备检测补齐简中、繁中、英文、越南语，准备设备时提供可访问状态。权限拒绝、未找到设备、被其他应用占用、超时、断开、扬声器失败分别给出恢复提示；已有错误随语言切换更新。
- 课程摘要补齐繁中、越南语，按语言格式化人数与正确率；未下发/无评分仍显示“—”，不伪装成 0%。学生入口改为“课节安排”，教师保留“课节管理”。课程和非嵌入回放页去除嵌套 main；独立嵌入回放保留自己的 main。

## 真实账号与桌面证据

使用已有真实学生 rainy/test 的 Electron 会话，进入原有本地课节的互动回看。只读代理仅影响该课节互动接口的 GET；成功请求的认证、返回内容及原有记录保持原样。

1. 读取正常时显示“我的互动”、1 条作答、100% 正确率。
2. `review-read-network.cjs` 设置 offline，让对应 GET 返回 503；实际看板保留本人内容并显示读取失败提示。
3. 设置 ready 后，没有点击刷新或发送焦点/上线事件，代理记录到 overview 200，原页面错误节点消失；随后展开题目显示本人 A、正确、10/10，没有教师的学生选择器。

此处证明原生客户端在页 API 故障恢复；不代替物理弱网、RTC 媒体或双机远控验收。前一次重启开发服务的尝试被客户端进程退出打断，未计作恢复通过。测试结束后只读代理已关闭，客户端已重新启动于正常的 3000 入口，没有修改课节或作答。

本地证据：`outputs/workspace-final-audit/native-review-proxy.json`、`native-student-recovered.txt`、`native-student-recovered.png`。真实教师网页验证课程越南语摘要，1366 与 390 宽度均无横向页面溢出，且只有一个 main；设备检测越南语界面通过真实账号菜单打开，未启动真实摄像头或改变权限。

## 自动化与构建

- 根目录 1052 项、桌面端 107 项测试通过。
- 看板真实组件：四语言 × 教师/学生 × 1366/320 共 16 组；初始读取和手动刷新 socket 故障自动恢复、403 清空、焦点恢复通过。增加的自动恢复断言先在修复前失败，修复后通过；开发 StrictMode 与生产 React 模式均验证。身份、数据和时区为测试替身。
- 设备检测真实组件/CSS：四语言 × 1366/1024/390/320 共 16 组；拒绝/缺失/占用/超时提示、重试、等待状态、卸载后迟到授权释放、停止摄像头、麦克风断开释放和扬声器错误通过。硬件与权限结果均为合成测试，不宣称真实设备授权通过。
- 11 组既有页面集成回归通过：home-state、student-layout、calendar-access、todo-access、drive-access、public-join、course-members、course-staff、chat-translation、replay-student-access、classroom-responsive。课堂覆盖 7 个视口，HTTP/媒体为替身。另通过 course-program-scope 与 playback-stability 的 speed-only 回归，后者复用已生成的合成 H.264 测试图，进行实际解码，不调用真实录制服务。
- TypeScript、改动页面 ESLint、语法和 diff 检查通过。隔离 Next webpack 生产构建通过，包含实际 PostCSS 配置，并核验已输出 Tailwind utility CSS；使用不可连接的本地占位数据库地址，不加载本地密钥文件。没有改变运行中的开发目录 `.next`。

页面测试日志、布局截图和回归清单保存在本地 `outputs/workspace-final-audit/`、`outputs/workspace-device-check/` 和 `outputs/activity-dashboard-recovery/`，不推送验证产物。

## 尚未完成的范围

完整目标继续按 `docs/plans/classin-unified-workspace.md` 的 14 类清单验收，当前索引见 `docs/plans/classin-workspace-acceptance.md`，不能将上述回归当作整站所有功能已经完成。仍需补足完整操作证据、实际双机远控、Windows 实机输入/多屏/DPI、真实音视频弱网，以及完整录制/字幕/互动时间线闭环。用户已说明暂时没有第二台设备；Mac 本机测试、交叉编译和合成回放均不能替代这些项目。
