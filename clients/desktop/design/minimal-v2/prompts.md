# 简约方案 v2 · 完整生成提示词

工具：内置 `image_gen`；日期：2026-11-08。每个界面为独立的新图生成请求，无参考图上传、CLI 或 API 密钥。

## 首页

```text
Use case: ui-mockup
Asset type: revised Chinese DESKTOP CLIENT HOME, one high-fidelity 16:10 flat full-window screenshot, large crisp typography.
Primary request: User rejected the earlier heavy ClassIn-style design and now explicitly wants “简约、时尚、功能明晰”. Create a substantially lighter, more contemporary desktop teaching app home for “翔宇文淑课堂”. Retain ClassIn's useful class/lesson organization but redesign the visual language and information density. Make this feel carefully designed, quiet, fresh and efficient.
Visual direction: nearly white #FCFCFD canvas, very pale cool-gray #F3F4F6 sidebar, graphite #24272E text and primary action, one restrained blue #526DDD for links and small state cues. Dark readable secondary labels #606773, thin light separators. Absolutely NO charcoal sidebars, NO lime or neon green, NO gradients, NO glass, NO heavy shadows. Elegant spacing, 14–16px body, 20px lesson titles, 28px page title, modest 8–10px button radii. Crisp thin consistent line icons. Avoid the cramped enterprise admin/table look. Avoid large decorative rounded cards, giant hero sections, KPI tiles, charts, illustrations and stock photos.
Composition: minimal native desktop window, no browser chrome, no device frame, no external background. Only TWO persistent layout regions: a 184px light left sidebar and one generous main workspace. No separate class-list column, no permanent right agenda/calendar panel. Fewer surfaces, strong clear hierarchy, carefully aligned horizontal rows. App title strip is light, about 44px; product name “翔宇文淑课堂” in modest dark text, minimize/maximize/close at far right. Sidebar navigation text with icons: “首页” active using very subtle pale-blue fill, “课程”, “学生”, “课件”. Near bottom “设置” and small profile “陈老师”. Icons always have labels.
Main header: “首页” at left, unobtrusive search field at right with placeholder “搜索课程或班级”. A short tab row below heading: “今日课程” selected with thin dark underline, “我的班级” unselected. On the same baseline at right a compact calendar icon and date control “11月8日，周日” with chevron; the calendar is CLOSED. No repeated month calendar, no redundant list filters.
Today's content: exactly TWO spacious horizontal lesson rows, no nested cards. Small secondary section count “今天 2 节课”.
First row: time column “15:30” and smaller “17:00”; main title “双指针与有序数组”; one clean metadata line “Python 算法基础班 · 6 名学生”. Small restrained blue text “10 分钟后开始” near title, not a loud pill. At far right ONE strongly visible graphite-filled button with white text “进入课堂”, and small separate three-dot menu for secondary lesson actions. Primary lesson can have the faintest cool-gray background only if it helps, no visible outer frame or shadow.
Second row: time “19:00” and smaller “20:30”; title “滑动窗口”; metadata “Python 进阶班 · 12 名学生”; far right quiet outlined “备课” and a three-dot menu. No repeated status tags, no duplicate entry buttons.
Below a generous but controlled gap, a subtle “最近课堂” heading at left and quiet link “查看全部” at right. Exactly TWO lean history rows separated by hairline rules: “二分查找” with “Python 算法基础班 · 11月6日” and right text actions “回放” “互动记录”; then “数组与循环” with “Python 算法基础班 · 11月3日” and same right actions. No large lesson thumbnails or colored subject badges.
Whitespace: generous margins, 32px gap between sections, aligned course title/start-time/action columns. Keep the main content at a comfortable readable max width; intentionally quiet lower canvas, but no giant empty hero. This is a daily work screen whose primary task is obvious in one glance: find next lesson, enter it. Classes are available through the “我的班级” tab, students via navigation, other features use progressive disclosure.
Text: all labels in legible Simplified Chinese exactly as supplied. Footer tiny and discreet “桌面端首页 · 简约方案 v2 · 示例数据”.
Constraints: minimal fashion-forward native productivity UI, understated detail, strong usable contrast, no old bright green or dark chrome anywhere. Preserve recognizable app identity through product name, not decorative logo. This is a UI design concept, no claim of running software.
```

## 课堂

```text
Use case: ui-mockup. Single high-fidelity 16:10 flat desktop application screenshot for “翔宇文淑课堂”. User requires 简约、时尚、功能明晰 and rejected heavy dark/green ClassIn decoration. Minimal contemporary native productivity app, paper-white #FCFCFD, pale cool gray #F3F4F6 surfaces, graphite #24272E primary text, readable secondary #606773, one restrained blue #526DDD for selection and links. Thin consistent line icons with labels. Precise typography and spacing; 14–16px text, 24–28px main headings, restrained weight contrast. Light slim native title bar with own product name and window controls, no browser chrome. No black sidebars, no neon/lime green, no gradients, no glass, no heavy shadows, no metric cards, no decorative graphics. Modest corners, quiet surfaces. Fictional data, not running app proof. Caption small “桌面端设计稿 · 简约方案 v2 · 示例数据”.
Design the CLASSROOM screen using ClassIn's functional teaching layout but with the LIGHT minimalist visual language above. Primary teaching canvas dominant and useful, not a home/admin dashboard.
Title bar 40px, text “翔宇文淑课堂” and “Python 算法基础班”, small “上课中  23:18” and network indicator with no bright pill.
A slim strip of six fictional webcam video seats across the top of the left classroom region, approximately 120px high. First is a Chinese adult female teacher labeled “陈老师 · 我” with actual live-camera-style portrait and tiny blue outline; five modest student thumbnails labeled 李明、小林、小宇、安安、琪琪. Small discreet mic state icons. Student portraits are generic generated pupils. No huge borders or saturated tiles.
Main area below videos: very pale gray stage surrounding a LARGE WHITE teaching board with minimal margins, slim white drawing toolbar at left, white member sidebar 280px at right separated by one hairline. On white board, clean dark ink heading “双指针 · 有序数组去重”; restrained content with [1,1,2,2,3] drawn as simple numbered cells and two blue arrows “slow” and “fast”; short neatly aligned Python snippet in a pale-gray code area. Blue annotations limited to explanatory arrows. Board is content, not decorative illustration. No green blackboard.
Left drawing tools: icons + small labels “选择”, “画笔” selected subtle blue, “橡皮”, “形状”, “文本”, “撤销”. Keep tool rail slim and flat.
Right sidebar heading “成员 7” with close control. Small tabs “成员” selected, “聊天”, “互动”. Compact search “搜索成员”, restrained text filters “全部 7”, “举手 1”, “台上 6”, “暂离 1”. Seven rows: 陈老师 tagged “教师”; 李明 showing a raised-hand outline; 小林, 小宇, 安安, 琪琪, and offline 小雨 with subdued status. Small neutral avatars, one mic state and more menu per row; use no rainbow badges. Selected 李明 row expands a SINGLE compact action row “下台” “静音” “板书” “奖励” in thin line icons. Footer small outlined “全体静音” and tertiary “全体下台”, no giant action blocks.
Bottom control row on light surface: icons and clear labels “麦克风”, “摄像头”, “共享屏幕”, “课件”, “互动题”, “学情”, “更多”; far right discreet red TEXT “结束课堂”. No red primary button. All necessary actions findable, low visual noise. Teacher self camera stays visibly first in video seats.

```

## 学生与分组

```text
Use case: ui-mockup. Single high-fidelity 16:10 flat desktop application screenshot for “翔宇文淑课堂”. User requires 简约、时尚、功能明晰 and rejected heavy dark/green ClassIn decoration. Minimal contemporary native productivity app, paper-white #FCFCFD, pale cool gray #F3F4F6 surfaces, graphite #24272E primary text, readable secondary #606773, one restrained blue #526DDD for selection and links. Thin consistent line icons with labels. Precise typography and spacing; 14–16px text, 24–28px main headings, restrained weight contrast. Light slim native title bar with own product name and window controls, no browser chrome. No black sidebars, no neon/lime green, no gradients, no glass, no heavy shadows, no metric cards, no decorative graphics. Modest corners, quiet surfaces. Fictional data, not running app proof. Caption small “桌面端设计稿 · 简约方案 v2 · 示例数据”.
Design STUDENTS AND GROUPS page, consistent with a two-region light home page. Only a 184px very light left app sidebar and one generous main area; do not add a second group-tree sidebar.
Sidebar text icons “首页”, “课程”, “学生” selected with pale blue fill, “课件”; bottom “设置”, profile “陈老师”. All sidebar readable dark text.
Main heading “学生与分组” at 28px. Far top-right quiet outlined “返回课堂” because lesson still running. Under heading two understated tabs “全部学生” and “分组” selected with thin graphite underline.
Group context inline below tabs: a clean dropdown “Python 算法基础班” with small nearby “6 名学生” and tertiary “管理分组”. No giant class icon or banner. Row below a search field “搜索学生姓名或账号” at left and single graphite primary button “添加学生” at right.
An unobtrusive inline selection bar shows “已选 2 人”, “清空” link, red text “移出分组”. No colored box around batch toolbar.
Clean table with checkbox, “学生”, “账号”, “操作”. Exactly six rows: 李明 / liming; 小林 / xiaolin; 小宇 / xiaoyu; 安安 / anan; 琪琪 / qiqi; 小雨 / xiaoyu02. Small neutral gray initial avatars, no colored subject badges. First two checkboxes selected in blue, very faint selected-row blue tint. Rows separated by extremely light horizontal rules, 60px row height; columns aligned. Each row has only a three-dot more menu, not repeated destructive actions. Avoid printing same group name in every row when already selected at the top.
Footer left “共 6 名学生”; muted concise note “移出分组不会删除学生账号”. Comfortable whitespace. The page's main job is obvious: choose group, find students, add or select and remove. Hidden management actions remain accessible through named controls, no mystery icon-only navigation.

```
