# 国际课堂与教学角色补充调研

日期：2026-11-08。本轮为发布者公开资料核对，未宣称当前 Mac 客户端的角色菜单已经原生实测。

ClassIn 的公开定义区分 Class、Course、Lesson，以及班级管理的 Head Teacher 与课节内 Teacher、Co-teacher。教师目录身份、班级管理权限、具体课节授课身份不能合并为一个全局布尔值。[ClassIn 角色与概念定义](https://classin.vn/huong-dan/cac-dinh-nghia-cua-classin/)

Co-teacher 教程从创建或编辑具体 Lesson 添加助教，说明课节团队配置与班级人员管理的关系。[ClassIn 助教教程](https://classin.vn/huong-dan/them-tro-giang-vao-bai-hoc-co-teacher/)。较早的中文客户端文档也按班主任、授课教师和助教描述创建课节及编辑团队的权限，应注意其页面较旧，不能当作当前版本逐项实测。[中文班级管理资料](https://docs.eeo.cn/product/zh-hans/function/3ClassInIM.html)

本项目的设计选择：班级管理身份单独显示；教师、助教、旁听教师授权记录明确关联课节ID；提供单节/多节选择、替换教师提醒、撤销助教/旁听、历史课只读。多课批量范围和旁听权限矩阵是本项目的设计提案，不能据此声称 ClassIn 提供完全相同的窗口或权限集合。本地原型不修改真实账号，也不提供后端鉴权。

国际排课使用 UTC 时间点与 IANA 时区分离，按观看者显示区格式化。`Intl.DateTimeFormat` 支持按指定时区生成日期与时间部分；原型在此基础上对本地时间进行候选匹配，显式处理 DST 不存在/重复时间。[MDN Intl.DateTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)

界面语言、中英示例译文、观看者时区、原始排课时区分别存储。翻译内容是明确标注的 fixture；回放是本地教学画面与控件演示。以上设计需要分别对接真实翻译、录像和权限服务，不能用前端预览状态替代实际服务结果。
