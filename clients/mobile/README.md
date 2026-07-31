# iOS / iPadOS / Android 原生课堂（Flutter）

该工程是移动端教学壳：手机保持“舞台 + 底部面板”，平板保持“舞台 + 检查器”。它直接请求现有 `POST /api/classroom/session`，仅接受服务端签发的课次、权限和临时 RTC 凭证。

## 本地启动

先安装 Flutter stable，然后执行：

```bash
cd clients/mobile
flutter create --platforms=android,ios .
flutter pub get
flutter run \
  --dart-define=CLASSROOM_API_BASE_URL=https://live.xiangyuwenshu.cn \
  --dart-define=CLASSROOM_SESSION_ID=<session-id> \
  --dart-define=CLASSROOM_ACCESS_TOKEN=<short-lived-casdoor-token>
```

调试本机服务时，真机不能使用 `localhost`；请使用可访问的 HTTPS 测试域名或开发机局域网地址。生产版必须由 Casdoor 系统浏览器登录 + App Link 回调写入安全存储，不能把 access token 编译进 App。

## 下一步

1. 接入 `agora_rtc_engine`，将 bootstrap 的 `mediaProfile` 原样映射为低流、HD、Full HD 和屏幕共享参数。
2. 接入系统 Keychain/Keystore，完成登录、刷新令牌、推送与深链接。
3. 将舞台占位区替换为媒体、白板和课件适配器；服务端仍是唯一权限判断方。
