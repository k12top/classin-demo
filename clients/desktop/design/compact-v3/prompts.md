# 简约清晰方案 v3 · 完整生成提示词

内置 `image_gen` 生成。三个独立的 `ui-mockup` 请求，日期 2026-11-08，无参考图上传，无 CLI 或 API 密钥。

## 首页

```text
Use case: ui-mockup.
Asset type: one high-fidelity Chinese desktop client screen, 16:10 landscape, flat complete window, no browser address bar or hardware surround.
Product: “翔宇文淑课堂”. This is desktop teaching software. User wants ClassIn-inspired 简约、精明、紧凑、功能明晰. Earlier mockups were too oversized, airy and generic. Create a precise useful daily-work interface with modest native desktop typography, NOT a website dashboard.
Shared visual system for a coherent 3-page set: soft-white #FAFBFC window, white main content, narrow very-light-gray #F2F3F5 navigation rail. Graphite #252932 text, readable secondary #626975. A restrained blue #4768CF only for active navigation and main action. No neon green, no black chrome, no gradient, no glass, no heavy shadow, no huge page title, no hero area, no KPI cards. Chinese UI font body 13–14px, page heading only 18–20px, row titles 14–15px, metadata 12px. Comfortable native click targets 32–36px, table/list rows 44–48px. Strong alignment, narrow gutters, restrained 6px corners, 1px light separators only where useful. Do not scale every label up to presentation size. Native desktop density, not mobile-on-desktop.
Shared application chrome: light 36px top title strip with exact product name at left and small standard window controls at right. Far-left 76px light navigation rail, same in all screens: profile circle “陈” at top; consistent thin line icons with small visible Chinese labels underneath: “首页”, “课程”, “学生”, “分组”, “课件”; small “设置” at bottom. Active item very pale blue with a small blue icon and dark-blue label. Navigation is intentionally narrow, main content has meaningful working space. Never use a 240px global sidebar or huge 50px titles.
Footer tiny “桌面端设计稿 · 示例数据”. No new logo. All data synthetic. UI must be visually polished, precise, calm and immediately intelligible.
SCREEN 1 — HOME.
Primary task: see today's lessons and enter the next one. Active global navigation “首页”. One main content column after narrow rail. No permanent right calendar, no class-tree sidebar, no all-purpose admin dashboard.
Main content top: compact heading “今日课程”, small date selector “11月8日 周日” with calendar icon beside it. Far-right compact outlined action “查看课表”. Search field “搜索课程” aligned upper-right, not huge.
Below: a thin, compact horizontal week selector with exactly 7 evenly spaced small cells, each 2 lines: “一 2”, “二 3”, “三 4”, “四 5”, “五 6”, “六 7”, “日 8”; last date 8 selected as a SMALL blue circle. Week strip is shallow, no giant calendar cards. Tiny link “今天” at right.
Lesson list header modest “待上课 · 2”. Native compact list, NOT boxed cards:
First row starts at left time “15:30” then small “17:00”. Course title “双指针与有序数组”; subtitle “Python 算法基础班 · 4 名学生”; restrained blue status “10 分钟后开始”. At right the one solid-blue primary button “进入课堂”, and three-dot menu. The row may have a nearly imperceptible pale-blue fill, no shadow, no colored left border.
Second row time “19:00” and “20:30”; title “滑动窗口”; subtitle “Python 进阶班 · 3 名学生”; at right outlined button “备课” and three-dot menu. Avoid displaying the same status twice.
Below after 24px gap: section “最近课程” with right link “全部课程”. Exactly three clean horizontal course entries, using tiny neutral initials and text rather than thumbnails: “Python 算法基础班” / “下次上课：今天 15:30” with right tertiary “查看课程”; “Python 进阶班” / “下次上课：今天 19:00”; “C++ 入门班” / “下次上课：11月10日 19:00”. Small text links “回放与互动记录” in the appropriate row menu or as a quiet footer entry, not repeated large buttons.
This page should feel like an efficient native ClassIn daily-work homepage: modest type, compact agenda, one clear next action, no giant greeting or massive empty hero. Meaningful rows occupy a useful amount of the screen, evenly aligned and tastefully restrained.
```

## 学生通讯录

```text
Use case: ui-mockup.
Asset type: one high-fidelity Chinese desktop client screen, 16:10 landscape, flat complete window, no browser address bar or hardware surround.
Product: “翔宇文淑课堂”. This is desktop teaching software. User wants ClassIn-inspired 简约、精明、紧凑、功能明晰. Earlier mockups were too oversized, airy and generic. Create a precise useful daily-work interface with modest native desktop typography, NOT a website dashboard.
Shared visual system for a coherent 3-page set: soft-white #FAFBFC window, white main content, narrow very-light-gray #F2F3F5 navigation rail. Graphite #252932 text, readable secondary #626975. A restrained blue #4768CF only for active navigation and main action. No neon green, no black chrome, no gradient, no glass, no heavy shadow, no huge page title, no hero area, no KPI cards. Chinese UI font body 13–14px, page heading only 18–20px, row titles 14–15px, metadata 12px. Comfortable native click targets 32–36px, table/list rows 44–48px. Strong alignment, narrow gutters, restrained 6px corners, 1px light separators only where useful. Do not scale every label up to presentation size. Native desktop density, not mobile-on-desktop.
Shared application chrome: light 36px top title strip with exact product name at left and small standard window controls at right. Far-left 76px light navigation rail, same in all screens: profile circle “陈” at top; consistent thin line icons with small visible Chinese labels underneath: “首页”, “课程”, “学生”, “分组”, “课件”; small “设置” at bottom. Active item very pale blue with a small blue icon and dark-blue label. Navigation is intentionally narrow, main content has meaningful working space. Never use a 240px global sidebar or huge 50px titles.
Footer tiny “桌面端设计稿 · 示例数据”. No new logo. All data synthetic. UI must be visually polished, precise, calm and immediately intelligible.
SCREEN 2 — STUDENT DIRECTORY.
Primary task: find a student and understand which groups they belong to, keeping global students separate from group member management. Active global navigation “学生”.
Two functional panes after the narrow global rail, like an elegant ClassIn contact list: left student directory pane about 280px, right student detail pane filling remaining space. This is NOT the groups page and NOT a huge generic table.
Directory pane heading “学生” with a small “8” count. Search field “搜索姓名或账号”. A subtle segmented filter “全部学生” selected and “按分组”. Eight compact rows, each small neutral initials avatar, readable name and smaller account:
李明 / liming (selected in very pale blue)
小林 / xiaolin
小宇 / xiaoyu
安安 / anan
琪琪 / qiqi
小雨 / xiaoyu02
橙橙 / chengcheng
依依 / yiyi
Rows 48px, small text, no rainbow avatars, no gratuitous status badges. Tiny footer “共 8 名学生”.
Right pane: restrained profile header with 40px neutral avatar “李”, name “李明” at 20px, small “学生账号：liming”. Single clear blue action “添加至分组” at right; a three-dot menu for other available actions. No global delete-account control.
Thin separator. Section heading “所属分组” and small count “2”. Exactly two clean group membership rows: “Python 基础组” / “4 名学生”, and “Python 进阶组” / “3 名学生”. Each row has subtle “查看分组” action plus a more menu. Each group row is a simple 44px text row, not a giant card.
Below a concise muted explanatory line “同一学生可加入多个分组”. Useful whitespace is allowed, but never enlarge the profile or put it inside a giant rounded card to fill space.
This screen must communicate a CONTACT DIRECTORY clearly: quick searchable left list, selected person details on the right, membership actions accessible and named. No made-up grades, private phone numbers, engagement scores or online statuses.
```

## 分组管理

```text
Use case: ui-mockup.
Asset type: one high-fidelity Chinese desktop client screen, 16:10 landscape, flat complete window, no browser address bar or hardware surround.
Product: “翔宇文淑课堂”. This is desktop teaching software. User wants ClassIn-inspired 简约、精明、紧凑、功能明晰. Earlier mockups were too oversized, airy and generic. Create a precise useful daily-work interface with modest native desktop typography, NOT a website dashboard.
Shared visual system for a coherent 3-page set: soft-white #FAFBFC window, white main content, narrow very-light-gray #F2F3F5 navigation rail. Graphite #252932 text, readable secondary #626975. A restrained blue #4768CF only for active navigation and main action. No neon green, no black chrome, no gradient, no glass, no heavy shadow, no huge page title, no hero area, no KPI cards. Chinese UI font body 13–14px, page heading only 18–20px, row titles 14–15px, metadata 12px. Comfortable native click targets 32–36px, table/list rows 44–48px. Strong alignment, narrow gutters, restrained 6px corners, 1px light separators only where useful. Do not scale every label up to presentation size. Native desktop density, not mobile-on-desktop.
Shared application chrome: light 36px top title strip with exact product name at left and small standard window controls at right. Far-left 76px light navigation rail, same in all screens: profile circle “陈” at top; consistent thin line icons with small visible Chinese labels underneath: “首页”, “课程”, “学生”, “分组”, “课件”; small “设置” at bottom. Active item very pale blue with a small blue icon and dark-blue label. Navigation is intentionally narrow, main content has meaningful working space. Never use a 240px global sidebar or huge 50px titles.
Footer tiny “桌面端设计稿 · 示例数据”. No new logo. All data synthetic. UI must be visually polished, precise, calm and immediately intelligible.
SCREEN 3 — GROUP MANAGEMENT.
Primary task: organize student collections and manage membership. Active global navigation “分组”. Groups are separate from teaching courses; do not relabel groups as classes.
Two functional panes after narrow global rail: about 250px group list on left, selected group's members in main right pane. Same compact type and controls as student directory.
Group-list heading “分组” with small count “3”, compact plus action labeled “新建”. Small search “搜索分组”. Three simple rows:
“Python 基础组” / “4 名学生” selected pale blue
“Python 进阶组” / “3 名学生”
“C++ 入门组” / “2 名学生”
No decorative subject icons bigger than 24px, no colored blocks or nested hierarchy for these flat groups. Small bottom note “共 3 个分组”.
Right header at 20px “Python 基础组”, small nearby “4 名学生”. To right a single solid-blue button “添加学生” and a three-dot group menu. A quiet top-right “返回课堂” text link can be present but must not compete with primary action.
Under header small tabs “成员” selected with thin blue underline and “关联课程”. Under tabs search field “搜索组内学生”.
Members table is compact with columns checkbox, “学生”, “账号”, “操作”. Exactly four rows with neutral initial avatars: 李明 / liming; 小林 / xiaolin; 小宇 / xiaoyu; 安安 / anan. First TWO checkboxes selected with very faint blue row tint. Each row has only a small three-dot menu under 操作.
Because selection exists show a SLIM inline batch bar ABOVE table “已选 2 人”, “清空”, red text action “移出分组”. No colored panel or destructive button repeated on every row. Footer left “共 4 名学生”; subdued note “移出分组不会删除学生账号”. Do not add redundant group-name column on every row.
Use clear controls and efficient native desktop density. Counts are consistent: 3 groups have 4,3,2 memberships, 李明 belongs to first two groups, union student directory has 8 unique students. No fake chat area, no analytics, no unsupported delete-account actions.
```
