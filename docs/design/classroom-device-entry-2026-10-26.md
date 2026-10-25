# 同账号多设备入会 · 2026-10-26

状态：实现与本地验证完成；唯一计分文案问题已修正并通过最终复审（`disposition: ship`）。未提交、推送或部署。

## 设计范围

这是已批准的[极简课堂原型](../../outputs/classroom-minimal-design-2026-10-25/prototype.html)的局部扩展，沿用白、灰、靛蓝、系统字体和 Lucide 线性图标。[PRODUCT.md](../../PRODUCT.md)与[DESIGN.md](../../DESIGN.md)保持原样，不把此次选择页升级为全局视觉规则。具体决策见[方向记录](../../.impeccable/review/classroom-device-entry-20261025/direction.json)。

同一账号已有连接时，新浏览器身份先看到两个同等权重的操作及后果说明：

- **一起入会**：保留原连接；新连接的麦克风和摄像头默认关闭。
- **覆盖入会**：让原连接退出；当前连接继续进入课堂。

选择前不签发新的 RTC、RTM 或白板凭证。页面保留返回课程操作；320px 宽度仍按标题、解释、两个选择、返回的顺序阅读。使用语义按钮、可见键盘焦点、装饰图标 `aria-hidden`，遵循减少动态效果设置。

被替换页说明当前连接已结束，提供显式“重新入会”操作。初次复审发现旧文案“重新选择入会方式”可能承诺一个不会出现的选择步骤，现已修正为简体“重新入会”、繁体“重新入會”和英文“Rejoin class”。修正后的被替换页截图已重新打开检查；[最终复审](../../.impeccable/review/classroom-device-entry-20261025/verdict-pass.md)确认这一计分问题解决、无可见回归，其余范围沿用[初次复审](../../.impeccable/review/classroom-device-entry-20261025/finish-review.md)已接受的结论；最终复审未重新审查整个页面。

## 身份与连接行为

“设备”使用浏览器 `localStorage` 中的随机身份，不采集硬件指纹。相同浏览器的新窗口或刷新复用已批准的入会方式，同时退休旧窗口的连接租约；独立认证、独立存储的浏览器配置视为不同设备。

一起入会仍只占一个账号席位，各连接拥有独立 RTC 身份。覆盖入会为旧连接写入 `leftAt` / `replacedAt` 墓碑，释放屏幕共享租约，清理旧连接字幕语言并刷新字幕需求；账号已有的上台权限保留。并发准入通过服务端串行处理避免双重放行。

已退休连接的心跳、凭证续签、发布、白板、分组空间及课堂动作接口拒绝继续操作并返回 409。已更新客户端在下一次课堂状态、心跳或运行时失效通知后停止媒体、RTM 和白板，进入被替换页，等待用户主动重新入会。迟到的退出请求不会误伤新连接。

这不是提供商层面的即时密钥撤销：已签发凭证不因此获得即时加密封禁；缓存旧版前端的页面需要重新加载才能具备新的退出界面与清理逻辑。

## 实现位置

- [选择页组件](../../src/components/classroom/device-entry.tsx)、[局部样式](../../src/components/classroom/device-entry.module.css)、[课堂客户端接入](../../src/components/classroom/classroom-v3.tsx)。
- [准入类型](../../src/lib/classroom/device-admission.ts)、[连接生命周期](../../src/lib/classroom/server/connections.ts)、[会话引导接口](../../src/app/api/classroom/session/route.ts)。
- [数据库迁移](../../prisma/migrations/20261025180000_classroom_device_admission/migration.sql)：新增 `deviceId`、`deviceLabel`、`entryMode`、`replacedAt`。仅应用到本地 `classroom_local` 与一次性验证数据库；生产环境尚未迁移。

## 验证证据与边界

| 层级 | 已获得证据 | 边界 |
| --- | --- | --- |
| 单元测试 | [unit.log](../../.impeccable/review/classroom-device-entry-20261025/unit.log)：514 项通过 | 不代表真实设备或提供商验收 |
| 隔离 PostgreSQL | [connections.log](../../.impeccable/review/classroom-device-entry-20261025/connections.log)：18 组通过；覆盖一起入会、刷新、退休围栏、覆盖清理、迟到请求、凭证与动作 409、并发竞争 | 实际使用 `localhost:55438/classroom_recovery_devices_20261025`；认证及 RTM 为模拟 |
| 静态与构建 | [tsc.log](../../.impeccable/review/classroom-device-entry-20261025/tsc.log)、[lint.log](../../.impeccable/review/classroom-device-entry-20261025/lint.log)、[build.log](../../.impeccable/review/classroom-device-entry-20261025/build.log)通过；文案修正后的 [build-reviewed.log](../../.impeccable/review/classroom-device-entry-20261025/build-reviewed.log)退出码 0 | 文案修正后未重跑单元及连接测试；上两行是此前已通过的结果 |
| 真实本地浏览器 | [runtime-evidence.json](../../.impeccable/review/classroom-device-entry-20261025/runtime-evidence.json)：两个 Chrome 窗口共享一个浏览器身份；选择一起入会后新连接麦克风、摄像头关闭；刷新使旧窗口退休并显示退出页；显式重新入会成功 | 实际为一个浏览器身份，不能作为不同设备双端覆盖验收；两个账号席位来自 test1 与 test10，不是同账号重复席位 |
| 真实替换入口 | 学生 test10 在内置浏览器点击“替换原设备”后进入课堂；数据库回读新连接 `entryMode=replace` 且只有一个活动连接，28 条旧历史连接均已退休 | 原连接来自更新前的测试历史，不能作为两台实体设备同时在线的替换验收 |
| 视觉检查 | 已打开并检查 [1440px](../../.impeccable/review/classroom-device-entry-20261025/desktop.png)、[390px](../../.impeccable/review/classroom-device-entry-20261025/mobile.png)、[320px](../../.impeccable/review/classroom-device-entry-20261025/user-320.png)、[被替换页 390px](../../.impeccable/review/classroom-device-entry-20261025/replaced-390.png)；后者已同路径更新，按钮显示“重新入会” | 最终复审仅确认计分文案修正；移动截图是浏览器视口验证 |

尚未完成不同硬件或独立浏览器身份的真实双端覆盖验收、物理移动设备验收和生产迁移部署。尝试使用回环地址别名建立第二存储身份时被 Casdoor 重定向回 `localhost`，未获得可接受的独立浏览器身份；不同设备的策略正确性目前由隔离数据库测试支持。
