# ClassIn 教学界面参考 · 2026-11-08

参考 ClassIn Việt Nam / EEO Việt Nam 的公开帮助文档，不是当前 Mac 原生课堂的实测还原：

- [虚拟课堂结构](https://classin.vn/huong-dan/cau-truc-lop-hoc-ao/)：顶部状态栏、上方摄像头区、主教学舞台和教师工具。公开图路径为2025/08，不能代表已登录的 Mac 版本。保存的三幅发布者截图仅用于研究：`sources/classroom-top-publisher.png`、`sources/classroom-cameras-publisher.png`、`sources/classroom-tools-publisher.png`。
- [聊天与提问](https://classin.vn/huong-dan/su-dung-chatbox/)：课堂消息和提问区、教师管理学生发言。原型将消息和成员并入可收起的右侧面板，避免遮挡白板。
- [摄像头和麦克风](https://classin.vn/huong-dan/cai-dat-camera-va-micro-trong-lop-hoc-ao/)：设备状态与课堂控制分离；原型仅展示设计状态，不接入真实设备。

早期原型采用现有 v5 的系统字体、13px正文与深绿教学舞台。用户随后明确要求课堂沿用当前前端站点效果，该方案已被替换；以上公开参考仅保留为研究历史。当前视觉依据为项目 `src/app/classroom-responsive.css`、`src/app/classroom-light.css` 与现有课堂截图：浅色白板、居中摄像头、底部悬浮工具条、按需展开的右侧聊天/成员。没有修改生产站点样式，真实账号截图不提交。

本地演示涵盖白板书写/文字批注/撤销/擦除/清空/翻页、双指针示例、聊天和提问草稿、成员搜索/上台/静音/临时白板操作状态。仅共享和共享＋人像均保留教师自览位置，但没有采集、推流、跨端同步或真实授权。公开截图不作为界面素材；真实账号截图不提交。
