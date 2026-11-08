# 首页生成提示词

生成工具：内置 `image_gen`。输出：`00-home.png`。仅设计参考，示例数据不代表已上线。

```text
Use case: ui-mockup
Asset type: high-fidelity desktop Electron application HOME screen redesign, a single complete flat 16:10 landscape UI screenshot, crisp large readable Simplified Chinese interface.
Primary request: Redesign the home screen of “翔宇文淑课堂” to look and behave like the ClassIn DESKTOP CLIENT's class-centered workspace, not a web landing page or a generic admin dashboard. Match the established sibling screens: compact charcoal #20252B native title bar and app rail, white/light-gray class and lesson surfaces, restrained lime #9BCB53 active indicators with dark button text. Preserve our own product name and do not use ClassIn logos.
Layout: realistic full application window, no browser address bar, no laptop device, no perspective, no marketing surround. Four practical zones: narrow 64px dark app rail at far left; about 250px light class list column; large white main workspace for selected class and its lessons; a restrained 260px right agenda panel. Native title bar about 40px high shows “翔宇文淑课堂” at left, global search “搜索班级、课程”, profile “陈老师” and minimal window controls at right. Coherent 14–16px body text, 24px selected class title, straight aligned 1px dividers and modest 6px radii. Use available space productively, without a giant welcome headline or disconnected cards.
App rail: small profile avatar at top; consistent line icons with short labels “首页” selected, “课程”, “学生”, “课件”; “设置” bottom. Active item uses lime icon and subtle fill, not a giant block.
Class-list column header “我的班级” and small plus icon with “新建班级” tooltip-style label. Search field “搜索班级”. Exactly four class rows with simple restrained square initial icons, names and subtitle: selected “Python 算法基础班” / “6 名学生 · 今日有课”, then “Python 进阶班” / “12 名学生”, “C++ 入门班” / “8 名学生”, “信息学竞赛班” / “10 名学生”. Selected row pale green, left-to-right aligned and readable. Small secondary entry “已归档班级” near list bottom. This should feel like ClassIn's class list and group workspace, not a sales catalog.
Main workspace header: selected class “Python 算法基础班”, small subtitle “陈老师 · 6 名学生”, discreet “管理班级” text action. Under this, tabs exactly “课程” selected, “班级成员”, “课堂记录”, “资料”. Main tab header below: “课节安排”, small segmented filter “全部” selected, “待上课”, “已结束”; far right compact green button “＋ 添加课节”.
Main list: three wide horizontal lesson rows separated by thin dividers, not a grid of floating cards.
Row one: small date column “11月08日” “周日”; title “第 08 课 · 双指针与有序数组”; meta “15:00–16:30 · 陈老师”; soft green status “进行中”; small green primary button at right “进入课堂”; secondary link “课前准备”. Add a small vertical lime status line or dot, no oversized image.
Row two: date “11月10日” “周二”; title “第 09 课 · 滑动窗口”; meta “19:00–20:30 · 陈老师”; neutral status “未开始”; secondary outlined button “备课”.
Row three: date “11月06日” “周五”; title “第 07 课 · 二分查找”; meta “19:00–20:30 · 陈老师”; neutral status “已结束”; restrained links “查看回放” and “互动记录”. No fabricated large analytics or progress scores.
Leave calm useful whitespace below the three rows, not giant boxes.
Right agenda pane: heading “我的日程”; month navigation “2026年11月”. Small simple calendar for November 2026 with weekday headings “一 二 三 四 五 六 日”, 1 correctly on Sunday, highlight Sunday November 8 in green. Thin separator then “今天 · 11月8日 周日”. Timeline exactly two entries: “15:00–16:30” / “Python 算法基础班” / green “进行中”; and “19:00–20:30” / “Python 进阶班” / gray “未开始”. The current live lesson in the agenda must agree with the main lesson list. Bottom small link “查看完整课表”.
Tiny bottom-right caption “桌面端首页设计稿 · 示例数据”.
Visual constraints: all important labels readable and spelled as supplied. Dense yet calm educational desktop software, native desktop controls, minimal shadows. Green is a restrained action color, no neon glow. No gradients, no glass, no hero banners, no big welcome text, no metric cards, no pie charts, no decorative stock art, no irrelevant chatbot. The home screen must clearly answer: which class, what lesson, when, and how to enter.
```
