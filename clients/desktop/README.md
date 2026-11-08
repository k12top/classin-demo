# 桌面客户端（Electron）

客户端承载现有在线课堂，音视频、白板、互动题与录制仍使用原课堂内核。在独立的非模态「人员工作台」管理课堂成员与课外分组，管理窗口不会替换课堂页。普通网页不加载这些客户端界面或样式。

- 左下角「人员工作台」或 `⌘/Ctrl + 2` 打开；`⌘/Ctrl + 1` 返回课堂。
- 花名册支持搜索、举手/台上/暂离筛选、邀请/取消邀请/下台、发言权限、板书授权、奖励、全体静音与确认全体下台。
- 学生与分组支持新建分组、搜索添加、跨搜索多选、已加入提示、确认批量移出与每页 12 人；每批最多 100 人。
- 教师/助教的课堂权限与教师分组权限仍由现有服务端验证；学生花名册只读。
- 可见花名册每 3 秒尝试同步，同一时间只执行一个读取请求；操作使用命令 ID、课堂版本和当前课次，网络失败保留内容并提示刷新确认。

## 开发与构建

```bash
cd clients/desktop
npm ci
CLASSROOM_WEB_URL=http://127.0.0.1:3000 npm run dev
npm test
npm run package
```

打包默认打开 `https://live.xiangyuwenshu.cn`，可用 `CLASSROOM_WEB_URL` 指定 HTTPS 部署；HTTP 仅接受本机回环地址。用户在课堂页正常登录。固定操作桥在主进程复用该窗口的 HttpOnly 登录会话，不把 Cookie、Token 或任意网络/文件接口暴露给管理界面。自定义协议限制资源白名单并禁用缓存，工作台禁止跳转和弹窗。

本地验收不需要生产账号：

```bash
node test/fixture-server.cjs
# 在另一终端运行，本地夹具使用虚构老师、学生和课堂数据
CLASSROOM_WEB_URL=http://127.0.0.1:3180 npm run dev
```

这次已在 macOS ARM64 验证原生窗口、邀请上台、添加/移出与分页；构建产物为 `dist/mac-arm64/翔宇文淑课堂.app`。当前产物未配置 Developer ID 签名/公证；Windows 安装包、真实课堂摄像头/麦克风/屏幕共享仍需设备验收。macOS 包含摄像头与麦克风用途说明。独立管理界面不替代媒体 SDK。

设计参考 [ClassIn 教师手册](https://www.classin.com/classin-teacher-manual-an-ultimate-guide-to-classin/) 的课堂角色、举手和成员操作，以及 [ClassIn 班级管理](https://docs.eeo.cn/product/zh-hans/function/3ClassInIM.html) 的班级成员批量管理。按当前服务端能力实现，不表示完整功能对齐。

## 桌面界面设计

[ClassIn 布局设计 v1](design/classin-v1/README.md) 包含首页、课堂成员、屏幕共享互动和课外学生分组四张设计稿，以及完整提示词和实现规范。设计稿尚未替换运行中的客户端界面。
