# 移动客户端（Flutter）

iOS / iPadOS / Android 共用 Flutter 客户端。课堂页面由官方 WebView 组件承载现有课堂内核，登录、互动题、白板与历史数据继续使用原服务端；成员面板和课外学生分组采用 Flutter 原生界面。

手机使用底部导航、80% 高度花名册抽屉和分组逐级页面；平板使用课堂右侧成员面板及分组主从布局。支持系统明暗主题、安全区、原生触控控件和确认对话框。

## 功能

- 花名册：搜索、全部/举手/台上/暂离筛选、邀请/取消邀请/下台、发言权限、板书授权、奖励、全体静音及确认全体下台。
- 分组：教师新建分组、搜索学生、跨搜索多选、已加入提示、确认批量移出与每页 12 人；每批最多 100 人。学生只读花名册，不加载教师分组数据。
- 可见花名册每 3 秒尝试同步，不重叠慢请求；管理命令携带课次、版本和命令 ID。失败保留当前内容，页面切换取消待回复请求，避免在旧课堂操作。
- 固定同源请求通过 WebView 复用 HttpOnly 登录，不在应用中编译或读取用户 Token/Cookie。只接受 HTTPS 服务地址，回环 HTTP 仅用于本机开发。
- 摄像头/麦克风请求仅接受当前课堂来源，并经过应用内确认和系统授权；拒绝授权时保留课堂页面。

## 开发

要求 Flutter stable 3.47 或更新兼容版本、Dart 3.13、Android SDK 37 和 Xcode iOS SDK。原生 Android/iOS 工程已入库，无需再次 `flutter create`。

```bash
cd clients/mobile
flutter pub get
flutter run --dart-define=CLASSROOM_WEB_URL=https://live.xiangyuwenshu.cn
flutter analyze
flutter test
flutter build apk --debug
flutter build ios --simulator --debug
```

模拟器连接桌面端附带的本地夹具：

```bash
# 在仓库根目录开启虚构课堂服务
node clients/desktop/test/fixture-server.cjs
# Android 模拟器将设备回环端口映射到开发机
adb reverse tcp:3180 tcp:3180
cd clients/mobile
flutter run --dart-define=CLASSROOM_WEB_URL=http://127.0.0.1:3180
```

Android 仅 debug manifest 允许本机明文调试；release 不开放明文。正式发布需要配置自己的应用 ID、签名/分发证书。默认 Android 模板的 debug 签名不能作为商店发布方案。

## 验证边界

已通过静态检查、8 项测试（含手机/平板布局、教师/学生权限、命令版本、页面切换取消和慢请求不被轮询饿死），以及 Android 调试 APK、iOS 模拟器目标编译。Android 模拟器已安装并启动调试包；当前电脑的界面自动化无法选取独立模拟器窗口，且缺少可启动的 iOS Simulator.app，因此未宣称两端原生界面或真实音视频设备验收通过。

当前移动端复用 WebView 音视频能力，尚未接入原生 Agora、ReplayKit/MediaProjection、推送或应用商店发布。尤其 iOS WebView 屏幕共享不能当作已实现的原生系统共享能力；需要后续原生媒体适配和真机验证。现有旧 bootstrap/占位组件仍保留供后续迁移，应用入口已改为 `ClientWorkspace`。

参考 [ClassIn iPad 教室](https://docs.eeo.cn/product/zh-hans/function/APPClassIn/Ipadjiaoshijieshao.html) 与 [班级管理](https://docs.eeo.cn/product/zh-hans/function/3ClassInIM.html) 的课堂角色、成员工具与班级组织方式，按本项目现有接口实现。
