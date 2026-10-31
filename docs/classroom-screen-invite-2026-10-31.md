# 邀请学生共享屏幕流程修复

本地确认并复现的缺口：

1. 已上台学生具有主发布凭证，但接受共享邀请时尚未拿到独立屏幕发布凭证。原“开始共享”按钮只看 `studentPublishReady`，可能过早启用，并在选共享方式后报“当前角色不能共享屏幕”。
2. 上台凭证准备缺少明确的失败重试路径，短暂请求失败会停留在准备状态。已上台后的共享授权还走另一条续期路径，两种准备逻辑可能并行。
3. 紧凑邀请的 revision 落后于字幕等更新后的全局 revision 时，客户端既不应用邀请，也不一定读取当前状态，因此可能等到慢速兜底才发现邀请。
4. 功能分支原先只有一个主共享位置；合入 main 时保留既有多人准备和老师选择展示能力，准备新共享不能抢占当前展示。

现在的流程：老师邀请 → 学生收到提示 → 学生接受并按规则上台 → 后台准备主发布与屏幕凭证 → 凭证和共享位置均就绪后启用按钮 → 学生点击并选择共享方式 → 浏览器选屏 → 服务端登记准备中的共享 → RTC 发布 → 老师选择后向全班展示。准备阶段不调用系统选屏，也不自动开启摄像头或麦克风。系统选屏仍由后续用户点击触发。

学生统一使用发布凭证准备路径；网络/服务端暂时失败最多重试 3 次，403 等权限错误不自动重试。失败后提供显式重试入口。主发布已经可用时，准备屏幕失败保留其现有发布资格。授权状态改变或离开课堂时中止准备；迟到结果不能安装到新的课堂或已撤销的邀请。

认证教师/助教发来的有效邀请同时触发 runtime 分区读取，即使该邀请版本低于当前全局版本。旧邀请不直接覆盖新权限，最终状态仍以授权 HTTP 为准。收到紧凑邀请的发起端也会核对权威状态。

main 的主课堂允许多名已获邀请的学生同时准备共享，只有老师/助教可以选择当前向全班展示的那一路。学生准备、取消或退出共享不会抢占或关闭别人正在展示的屏幕；独立分组房间仍按自己的共享位置权限处理。

验证：

- `node --import tsx --test tests/classroom-publishing-credential.test.ts tests/classroom-screen-share-request.test.ts tests/classroom-screen-share-lifecycle.test.ts tests/classroom-screen-permissions.test.ts tests/classroom-sync-scheduler.test.ts`：22 项通过。
- `node --test tests/integration/agora-connection-recovery.cjs`：48 项通过，SDK/设备及网络由夹具模拟。
- `clients/desktop/node_modules/.bin/electron tests/integration/classroom-sync-ui.cjs --sharing-only --functional-only --reuse-css`：真实 ClassroomV3 和凭证准备代码，模拟邀请、HTTP、RTC 与选屏，覆盖旧版本邀请核对、已上台凭证延迟、403 显式重试、一次发布占位、取消不占位、保留当前展示并准备另一位学生、台下接受和准备期间撤销。首次运行需去掉 `--reuse-css` 生成样式缓存。

详细记录：`outputs/classroom-screen-invite-2026-10-31/sharing-checks.json`。没有部署，没有操作生产课堂或发送真实邀请，真实系统选屏、真实师生账号与远端观看仍待验收。
