# HarmonyOS NEXT 原生课堂（ArkUI）

这里是可在 DevEco Studio 中继续开发的 ArkUI 入口模块。视觉结构与 Flutter 手机/平板端一致：教学内容占主舞台，成员、聊天、字幕与课件在可收起的检查器中呈现。

## 启动前准备

1. 用与 `build-profile.json5` 匹配的 DevEco Studio / HarmonyOS NEXT SDK 打开 `clients/harmony`。
2. 在 CI 或本地构建配置中替换 `entry/src/main/ets/common/ClassroomEnvironment.ets` 的 API 域名；只能使用 HTTPS。
3. 增加 Casdoor 系统登录和安全令牌存储，使用 Bearer token 调用 `POST /api/classroom/session`。
4. 集成声网 Harmony RTC/RTM 原生 SDK。RTC Token、频道名和发布权限必须来自 bootstrap，绝不能写在应用配置中。

## 适配边界

- `common/ClassroomContract.ets` 是 UI 与声网 SDK 的隔离层。先实现 `ClassroomMediaAdapter`，再把其状态映射到舞台、Teaching Rail 和底部控制坞。
- 白板通过独立 Web 组件适配器接入，并保留替换为原生实现的空间；业务权限仍从服务端返回。
- Harmony 手机端以学生体验为优先；教师完整控制台在 Harmony 平板使用可收起检查器展示。
