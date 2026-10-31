# Redis 课堂心跳与共享缓存

PG 是入退课、课堂权限、课件、字幕、聊天、录制和其他业务数据的持久化来源。Redis 保存实时连接租约和短期课堂共享缓存。正常心跳不再逐条同步写 PG：已登录且经过 PG 注册的连接优先更新 Redis，每个课次约 60 秒批量更新一次 PG 的连接和成员活跃时间。

## 配置与上线

配置服务器环境变量 `CLASSROOM_REDIS_URL`（也接受 `REDIS_URL`）：使用实例提供的 `redis://` 或 TLS `rediss://` 连接地址。部署平台应能连接 Redis TCP 端口；只有 REST URL 的实例需要另外提供 TCP 地址。URL 和密码不进入客户端、响应或诊断日志。

建议 Redis、PG 与 Functions 使用同一区域。通过 `CLASSROOM_REDIS_PREFIX` 隔离生产、预览与各自独立的 PG 数据库；相同数据库的多个实例使用相同前缀。默认前缀是 `classroom:${VERCEL_ENV || NODE_ENV || "development"}:v1`。多个预览部署默认同属 preview，因此使用不同 PG 时必须设置不同前缀。`CLASSROOM_REDIS_TIMEOUT_MS` 默认 350，支持 100–2000 毫秒。

部署前执行 `npm ci` 与 `npm run db:migrate`，应用迁移 `20261011030000_classroom_redis_sync`。现有 Vercel `build:deploy` 已包含 PG 迁移。保持 `CRON_SECRET` 和每分钟 `/api/cron/promote-course-status` 调度有效，自定义 live 环境继续使用现有 cron 转发机制。没有配置 Redis URL 时保持原 PG 路径。

## 一致性与降级

- 课堂入退课、权限及其他业务变更先提交 PG。PG 触发器在同一事务内更新每课次一行的 `ClassroomRedisSync`，事务回滚不会遗留同步任务。心跳活跃时间更新不触发该队列。
- 入退课、课堂动作完成后主动发布控制状态；其他持久化更新由 cron 补偿。Redis 发布采用版本比较，旧任务不能覆盖新状态，PG 也只确认实际发布的版本。失败保留待同步行并指数退避重试。
- Redis 只续租已注册、未退出的连接，不承担新入课或业务授权。控制状态每 60 秒需重新从 PG 验证；过期必须回到 PG 校验。短暂 PG 故障期间，已有且控制状态仍有效的连接可续租；新入课仍需要 PG。
- 45 秒无心跳显示“重连中”，120 秒内保留席位及 RTC 身份。席位分配仍由 PG 行锁和课堂权限决定，计算容量时包含 Redis 的有效租约。随机点名和视频编排同样参考 Redis 实时租约，并确认对应连接仍在 PG 注册且未退出。显式退出及课堂结束拒绝迟到心跳。
- Redis 内待落库心跳保留最新时间；批量 SQL 跳过忙碌行，失败保留待重试值，确认时只删除已落库且没有被更新的值。`after()` 提供及时处理，cron 承担补偿。Redis 租约和待同步心跳 TTL 为 6 小时；Redis 数据整体丢失时，最近未落库的心跳可能丢失，下一次 PG 降级心跳或注册可恢复；业务数据始终保留在 PG。
- 共享缓存覆盖 runtime、互动、字幕和按角色隔离的课件，TTL 为 2 秒。请求仍先验证访问权限；分组、个人问题等视角数据不共享。分布式填充锁减少重复查询，写回时再次验证版本，防止迟到读取覆盖新缓存。发布失败时，缓存到期后重新读取 PG；缓存条目的 TTL 为 2 秒，正在执行的读取及网络延迟也会影响实际观察时间。权限决定继续使用 PG。
- Redis 连接超时 500 毫秒，命令默认 350 毫秒；失败熔断 10 秒、关闭离线队列，避免恢复后重放积压。缓存失效或 Redis 不可用时降级 PG，同实例降级读取最多 2 个并发、等待 500 毫秒；排队耗尽走现有可重试 503。PG 读取失败继续返回错误，不伪造空成员列表。
- 仍有访问权限、录制、个人数据等 PG 查询；此方案减少高频心跳和重复共享读取，不保证所有课堂请求完全脱离 PG。

## 诊断与验证

关注 `[classroom:redis]` 的 `unavailable` / `recovered`，以及 `[classroom:redis-sync]` 的 `pending` / `presence-checkpoint-pending`。PG 待同步行的 `processedAt`、`attempts`、`nextAttemptAt`、`lastError` 可用于排查积压；诊断不包含密码、连接地址或字幕正文。

运行 `node scripts/verify-classroom-redis.cjs`：自动创建并清理仅监听 loopback 的独立 PG 16、Redis 7.4 容器，PG 池限制为 3；覆盖并发零 PG 心跳、批量落库、忙碌行、失败重试、确认竞态、跨实例缓存、角色隔离、版本竞态、事务回滚、席位保留、退出、课堂结束、真实 Redis 停机/恢复/超时和 PG 降级限流。不会使用配置中的线上 PG 或 Redis。

同时运行 `npm test`、`npx tsc --noEmit`、相关 ESLint、`node scripts/verify-classroom-resilience.cjs` 和生产构建。自动化验证不等于线上域名切换及真实多设备上课验收。

2026-10-11 本次提交范围的独立副本验证：242 项单元测试通过；20 项真实 Redis/PG 场景通过（含 80 个并发心跳零 PG 读写）；原有连接恢复 13 项、并发压力 8 项及课堂生命周期集成通过；TypeScript、相关 ESLint、Next.js 16.2.6 生产构建通过。测试数据库与 Redis 均为临时容器，已清理；未进行线上 Redis 配置、线上迁移或域名切换。

## 心跳超时与熔断（2026-10-31）

`CLASSROOM_REDIS_TIMEOUT_MS` 默认 1500ms，允许 100–3000ms；连接建立使用同一预算。
发布时应核对实际环境值，旧的 350ms 显式配置不会被代码默认值覆盖。
单次命令失败保留共享连接，连续三次失败才熔断。连接建立失败直接熔断。
恢复等待从 500ms 指数退避到最多 4 秒，半开时仅放行一个请求；仅成功执行 Redis 命令后报告 recovered。
不自动重放超时命令，因为写入可能已经在 Redis 执行。

Redis 日志记录 operation、phase、errorKind、durationMs、timeoutMs、consecutiveFailures、retryAfterMs、region；不记录 URL、命令参数、键或原始异常消息。
心跳 503 另外记录 presence_unavailable 以及 redis_unavailable / control_or_lease_unverified 原因。
缓存不可用、重建繁忙和缓存回退限流返回 classroom_cache_unavailable，不再伪装为 Prisma P2024 / database_unavailable；真实数据库故障仍使用原分类。
本变更不修改键前缀、租约结构、RTC 身份、成员权限或课堂生命周期，不需要迁移或清空缓存。
