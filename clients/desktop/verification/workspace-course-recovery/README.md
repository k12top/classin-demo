# 工作区课程读取自动恢复

2026-11-14，独立 worktree `feature/classin-unified-workspace`。本轮没有修改 main、数据库、线上配置或实际课堂。

本文件记录课程读取恢复阶段。随后真实云录制联合验收已运行完整 Next 生产构建，根目录测试增至 1064 项；见[云录制验收](../cloud-recording-live/README.md)。下述 1061 项与未构建边界保留为该阶段的历史记录。

## 问题与修改

首页与课程/回放的工作区外层各自读取班级列表，临时失败后可能等待正常的 60 秒周期。手动刷新、焦点及课节变更事件可能同时发起读取。新增回归在修改前因首次 HTTP 503 后不能在 3.5 秒内自行恢复而失败。

现在两处共用 `useWorkspaceCourses`，复用既有调度器：暂时失败按 2/4/8 秒退避，成功后恢复 60 秒正常周期；手动重试可以提前触发，同一在途读取只合并一次后续读取。可见性及网络恢复驱动同步，断网和后台暂停重复请求。一次初始读取仍允许桌面端访问已有 SQLite 缓存。

桌面缓存继续标记为离线数据，并继续联网复核，不将缓存命中视为网络恢复。401 清空工作区并跳转登录，403/404/409 清空旧课程；权限拒绝不进入快速重试。网页请求可取消，桌面 IPC 迟到结果在失效后不再更新状态；不同账号之间没有共用课程快照。

## 本轮通过的检查

- 根目录测试 1061 项、桌面测试 107 项。
- 新的隔离 Electron 集成运行实际 DashboardPage、WorkspaceSubpage、React hooks、读取调度器和 HTTP 客户端；开发 StrictMode 和生产 React 模式均通过 18 组检查。
- 首页与详情页分别覆盖：首次 503 自动恢复、手动读取失败保留数据并自动恢复、刷新事件合并、403 清空且不快速重试、无效响应恢复、离线/后台暂停、迟到旧账号响应忽略、401 清空并停止读取。
- 桌面入口覆盖：带离线标识的缓存结果继续核验、首次离线读取、组件卸载后移除监听和计时器。既有 `desktop-offline-courses-ui.cjs` 与 `workspace-subpage-access-ui.cjs` 回归通过。
- TypeScript、修改范围 ESLint、diff 检查通过。按 React best practices 检查了 effect 的账号依赖、监听清理、重复读取与过期响应处理。没有新增依赖或视觉布局修改。

## 边界与复现

身份、课程内容、用于检查状态的页面壳展示和桌面 IPC 返回均为夹具；503 来自临时本地 HTTP 服务。不是生产环境、真实 SQLite/权限服务或物理弱网的本轮端到端验收，也不证明 RTC、云录制或跨设备远控通过。本轮未运行完整 Next 生产构建；生产 React 集成与生产构建是不同检查。

从仓库根目录运行：

```sh
clients/desktop/node_modules/.bin/electron tests/integration/workspace-course-recovery-ui.cjs
clients/desktop/node_modules/.bin/electron tests/integration/workspace-course-recovery-ui.cjs --production
clients/desktop/node_modules/.bin/electron tests/integration/desktop-offline-courses-ui.cjs
clients/desktop/node_modules/.bin/electron tests/integration/workspace-subpage-access-ui.cjs
```

集成使用临时独立 Electron 配置和随机本地端口，结束后移除配置并关闭服务，不使用已有登录会话。本地证据位于 `outputs/workspace-course-recovery/checks.json` 和 `production-checks.json`；测试日志为 `/tmp/classin-course-recovery-*.log`，不提交这些产物。
