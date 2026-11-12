# 回放课节名单边界

2026-11-12，`feature/classin-unified-workspace`。网页与 Electron 共用权限接口和播放器。

## 修复

`resolveCoursewareAccess` 原先在检查单课临时成员后，仍允许班级直接报名或分组成员回退到班级授权。显式排除或自定义名单因此不能阻止这些学生访问指定课节的录像、总结和回放聊天。

指定课节现在必须属于当前班级，并重新检查有效名单。直接报名与分组继承均遵循自定义名单和排除规则；临时教师/助教/学生只限其实际获授权课节，撤销立即影响后续接口请求。班级教师保留管理访问，显式旁听规则仍优先限制为只读。拥有班级学生身份、同时被授予单课教学角色时，只在该课节得到教学权限，不获得班级管理权限。

已完成的录像不再轮询录制状态，因此新增播放器在上线、返回前台或恢复页面时复查课节授权；150ms 合并同一组恢复事件。正常读取及 503 保留视频，确认 401/403/404 后移除旧播放器；之后恢复授权可重新加载。该检查保护应用的新请求与显示状态；此前已签发的 OSS 地址仍按原有效期工作，本轮未改变存储链接策略。

## 验证

```bash
DOTENV_CONFIG_PATH=.env.local node -r dotenv/config tests/integration/replay-lesson-roster-access.cjs
CLASSROOM_PLAYBACK_TEST_MEDIA=/absolute/path/to/synthetic.mp4 \
  clients/desktop/node_modules/.bin/electron tests/integration/playback-stability.cjs --access-resume-only
```

- 修改前先用新增测试复现班级成员绕过课节名单，失败为 `true !== false`；修复后通过。
- 真实本地 PostgreSQL 与实际课节名单、录像列表、播放地址、总结、聊天及课件下载路由验证直接报名、真实分组继承、自定义名单、显式排除、临时成员、旁听/助教、撤权、班级教师和跨班课节绑定。登录身份、文件交付及存储地址签发是替身；拒绝访问后确认未调用交付或签发边界。临时班级、分组和记录已清理。
- 隔离 Electron 使用真实回放页面与合成 H.264 MP4 验证恢复事件合并、相同媒体保留、503 保留播放、403 移除、恢复权限重新创建播放器。截图 `outputs/playback-stability/resume-permission-denied.png` 是夹具功能证据；不代表真实学生已完成验收。测试加载全局与组件 CSS。
- 82 项相关项目测试、TypeScript、定向 ESLint、数据库的课程目录/临时人员与观看进度回归通过；原播放器稳定性与 8 秒心跳请求恢复集成重新通过。

真实学生 Electron 仍受本机锁屏影响，当前连接的 Chrome 没有学生课堂页，未操作其他标签页。后续仍需真实师生账号的撤权/恢复、学生观看到数据库时长、实际弱网及设备验收；整体目标继续进行。
