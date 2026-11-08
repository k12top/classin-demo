# 桌面客户端设计生成提示词

生成方式：内置 `image_gen` 工具；三个独立的 `ui-mockup` 生成请求，无参考图上传，无 CLI/API 密钥。

## 1

```text
Use case: ui-mockup
Asset type: high-fidelity desktop Electron teaching application design, main classroom, a single flat full-window UI screenshot at 16:10 landscape, large crisp 2560px-class resolution.
Primary request: Design the Chinese desktop app “翔宇文淑课堂” closely following ClassIn's established classroom interaction layout: compact title bar, a horizontal row of live video seats across the top, a very large dark green blackboard, compact teaching tool rail, right collapsible member panel. A real desktop classroom work surface, dense but calm, practical and implementable. This is an original product design inspired by ClassIn, no ClassIn logo.
Composition: Application fills entire image; no laptop, no perspective, no presentation surround. Top title bar 40px; below it a 128px video strip occupying left classroom region; right member panel about 300px wide extending beneath title bar. Central board dominates remaining area. Narrow vertical drawing tools at left of board. Bottom compact control bar. Integrate member tools in classroom instead of a huge detached admin page. Use realistic 14–16px Chinese UI typography, precise dividers, small 6px radii, accessible contrast. No giant cards, no marketing layout, no gradients, no glass.
Visual system: Charcoal chrome #20252B, green blackboard #173D35, toolbar #2A3038, warm white ink #EDF3F1, muted gray-green secondary text, ClassIn-like clear lime green accent #9BCB53 for active teaching actions, red reserved for end-class and errors. Member sidebar white with dark text, green active tab. Professional matte flat surfaces, crisp vector line icons.
Details: Six video seats: teacher “陈老师” first then five students “李明”, “小林”, “小宇”, “安安”, “琪琪”. Generic fictional Chinese teacher and pupils in natural webcam crops, modest small thumbnails, name and microphone state at bottom. Teacher tile lime outline and tiny “我” tag; teacher sees live camera preview. One pupil has a small raised hand badge. No duplicated teacher floating bubble in this board state.
Board content: Chinese heading “双指针 · 有序数组去重”; simple clear teaching content with an array of numbers [1, 1, 2, 2, 3], two arrows labeled slow and fast, concise Python code “if nums[fast] != nums[slow]:” and “    slow += 1”. Chalk-like educational writing limited to board content, UI labels remain crisp sans-serif.
Member sidebar heading “课堂成员”, close icon. Tabs “成员” “聊天” “互动”. Search “搜索成员”. Filter chips “全部 7” “举手 1” “台上 6” “暂离 1”. Seven list rows: teacher plus the five students from seats and an offline “小雨”. Teacher and students distinguished clearly. Selected Li Ming row expanded with compact line-icon actions labeled “下台” “静音” “板书” “奖励”. Other rows have restrained mic, stage and more icons. Footer buttons “全体静音” and “全体下台”; online indicator “6 / 7 在线”.
Title text: “翔宇文淑课堂”, “Python 算法基础班”, small status “上课中  23:18”, green network signal and “28 ms”.
Left tool icons: pointer, pen selected, eraser, shapes, text, undo, teaching tools.
Bottom action labels verbatim: “麦克风” “摄像头” “共享屏幕” “课件” “互动题” “学情看板” “更多”; right red outlined button “结束课堂”. Tiny footer corner label “桌面端设计稿 · 示例数据”.
Constraints: polished native desktop application screenshot; every essential label legible Simplified Chinese; coherent aligned grid and consistent icon strokes; no invented extra branding, no watermark, no browser address bar, no decorative illustrations outside live thumbnails.
```

## 2

```text
Use case: ui-mockup
Asset type: high-fidelity desktop Electron classroom screenshot, screen-sharing + live teacher self-preview + interactive-question panel, one landscape 16:10 screen, crisp readable large interface.
Primary request: A ClassIn-inspired Chinese desktop teaching app named exactly “翔宇文淑课堂”, visually consistent with a compact charcoal title bar, six webcam seats at the top, a charcoal teaching tool rail to the left, large central teaching canvas and a white right sidebar. Native professional desktop app, realistic implementable UI, no browser address bar, no laptop frame, no presentation page. This is the screen-sharing state of the classroom, not a separate video-conferencing product.
Visual system: charcoal #20252B, green blackboard edges #173D35, warm white #EDF3F1, lime accent #9BCB53 for teaching actions, precise thin dividers and 6px corners, 14–16px Simplified Chinese UI labels, high contrast, flat matte finish, consistent line icons. No gradient, no glass, no card dashboard.
Title bar: product “翔宇文淑课堂”, lesson “Python 算法基础班”, small “上课中  26:42”, green network indicator.
Critical layout invariant: Six live video thumbnails across the top-left area, ABOVE the shared screen. First teacher thumbnail “陈老师” must show an actual fictional adult Chinese female teacher looking at camera, with tiny label “我” and “本地摄像头”. It must NEVER be replaced by an avatar, initial letters, a blank tile or a screen-sharing icon. The other five modest student video tiles have names “李明”, “小林”, “小宇”, “安安”, “琪琪”. Use generic generated people only. Teacher preview remains visible even in ONLY SCREEN sharing mode.
Central area: a large shared code editor showing a short Python “remove_duplicates” function with nums = [1, 1, 2, 2, 3], Python syntax colors, line numbers and a small terminal result [1, 2, 3]. Editor is an in-class shared application, no browser chrome. Small top sharing strip with green border and literal labels “正在共享屏幕” and “仅共享” plus restrained outlined “停止共享” button. Keep self-preview above canvas; no duplicate webcam bubble obscuring code.
Right white sidebar about 320px wide: tabs “成员” “聊天” “互动”, “互动” selected. Question title “当前互动题”, small “单选题”, prompt “原地去重时，哪个指针记录有效元素位置？” Four options exactly “A  fast” “B  left” “C  slow” “D  right”. Restrained horizontal distribution bars, C marked correct in green. Small progress “已作答 4 / 6”. Below, a short row of four student avatars with tiny TOP-RIGHT corner result bubbles: three green check marks, one red X. Clear legend “正确 3 · 错误 1”. Red is directly on the wrong answer/result marker, no duplicated lower error paragraph.
Lower part of sidebar: green main button “下发答案” with open compact attached dropdown containing exactly two distinct actions “仅已作答学生（4人）” and “全体学生（6人）”; beneath first action small explanation “未作答学生继续答题”; beneath second small explanation “结束作答，所有学生查看结果”. This makes release scope explicit without waiting for everyone to finish. No claims that features are live; this is concept UI.
Bottom teaching controls verbatim “麦克风” “摄像头” “共享屏幕” (active green) “课件” “互动题” “学情看板” “更多”, red outlined “结束课堂”. Tiny corner “桌面端设计稿 · 示例数据”.
Constraints: prioritize screen space for shared content; teacher camera is plainly visible during only-screen share; crisp aligned native desktop composition; no ClassIn logo, no additional brand marks, no floating decorative UI.
```

## 3

```text
Use case: ui-mockup
Asset type: high-fidelity Chinese desktop Electron app screenshot, student and group management outside the classroom, single 16:10 landscape flat full-window design.
Primary request: Design the desktop app “翔宇文淑课堂” in the same ClassIn-inspired visual system as a charcoal classroom with lime-green accents, but use a light neutral main surface for reading student lists. Show practical native classroom software, not a generic website admin dashboard. No browser chrome, no laptop frame, no presentation background, no marketing content.
Visual system: compact charcoal #20252B title bar and 64px dark vertical app navigation at left; light gray #F4F5F6 pane surfaces, white dense table, dark ink #22282D, restrained lime-green #9BCB53 primary buttons with DARK TEXT for contrast, green-tinted selected rows, 1px gray dividers, 6px corners, system Chinese sans-serif 14–16px, clear 24px title. No gradients, no glass, no rounded metric cards.
Composition: top compact native title bar product “翔宇文淑课堂” and profile “陈老师”, minimize/maximize/close icons. Below title bar a restrained full-width status strip within main region: small green dot, “课堂进行中 · Python 算法基础班”, right compact “返回课堂” button. Left narrow dark app rail includes meaningful consistent line icons and short labels “课堂” “课程” “学生” selected with lime indicator, “设置” near bottom. Secondary left panel about 240px wide titled “学生与分组”, search “搜索分组”, simple “＋ 新建分组”. Group navigation: “全部学生 18”, “Python 算法基础班 6” selected, “Python 进阶班 12”. No invented cloud messaging features.
Main workspace: heading “Python 算法基础班”, muted “6 名学生”, primary “添加学生” button at top-right. Single search field “搜索学生姓名或账号”. Slim green-tinted batch selection toolbar under search: “已选 2 人”, “清空选择” text button and red text action “移出分组”. No permanent giant operation area.
Student table with header selection checkbox, “学生”, “账号”, “分组”, “操作”. Exactly six aligned rows with small subtle circular initial avatars and fictional names “李明”, “小林”, “小宇”, “安安”, “琪琪”, “小雨”; accounts “liming”, “xiaolin”, “xiaoyu”, “anan”, “qiqi”, “xiaoyu02”; group cell “Python 算法基础班”. First two rows selected with visible checked boxes and very pale green fill. Each row has restrained “移出” action and more menu, no needless badges. Comfortable but compact 60px row heights, readable table, no empty oversized cards.
Footer table count “共 6 名学生” and muted note “移出分组不会删除学生账号”. Thin empty remaining canvas below list is intentional desktop breathing room.
Tiny bottom-right “桌面端设计稿 · 示例数据”.
Constraints: polished consistent native desktop operational software with ClassIn-like two-level navigation; table and management actions are the focus. Preserve clear return path to ongoing classroom; do not show camera thumbnails on external management page; no irrelevant graphs, no giant KPIs, no ClassIn logo or other brand marks. Render Simplified Chinese labels exactly and legibly.
```

