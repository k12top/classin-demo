# 课堂字幕增量同步

原先 `classroom/state?scope=captions` 每次通知均返回最近 100 条字幕，普通状态轮询也重复携带同一窗口。现在首次读取返回快照和 `captionSync.cursor`，后续请求携带 `captionCursor`，只返回新增或内容变化的字幕。无变化时返回 `captions: []` 和 `captionSync: { mode: "delta" }`，不再重复返回游标。

字幕通知拉取和完整状态轮询共用前端游标。游标仅在授权 HTTP 响应的字幕已合并后更新；字幕响应不能推进全局课堂版本。完整状态响应先单独合并字幕，避免较旧的 runtime 版本使字幕被整体丢弃、游标却前移。旧服务端不带同步元数据时，客户端恢复快照兼容模式。

游标包含当前窗口内字幕 ID 和完整公开内容的摘要，绑定课次，并限制在约 3.2KB；不包含原文或译文，不具有访问权限。每次请求仍先执行原有访问校验。对比包含临时/最终状态、文字更正、翻译内容及翻译任务状态，不依赖发言时间或更新时间水位，因此同毫秒的新句和迟到翻译也会返回。游标无服务端存储，不依赖单实例内存，格式错误、协议版本变化或来自其他课次时退回快照。断线期间超出窗口的历史不会分页补发；恢复范围仍与原先一致，为最近 100 条。字幕完整历史和回放不由此接口承担。

服务端继续共享原来的 `captions:100` 缓存，在授权后的响应组装阶段计算差量。此项减少网络重复传输及客户端重复合并，不代表数据库查询已经变成逐行增量，也没有改变字幕写入推动全局 runtime revision 的机制。未增加表、列、索引或环境变量。

验证：

- `node --import tsx --test tests/classroom-caption-delta.test.ts tests/classroom-state-sections.test.ts tests/classroom-feedback-state.test.ts tests/classroom-caption-translation.test.ts`：32 项通过，覆盖授权、空差量、单句变化、旧句修订和翻译、任务状态、相同时间戳、乱序响应、游标失效和旧服务端兼容。
- `clients/desktop/node_modules/.bin/electron tests/integration/classroom-sync-ui.cjs --captions-only --functional-only --reuse-css`：真实 ClassroomV3 页面与真实差量代码经 loopback HTTP 验证快照、空差量、新字幕显示、迟到翻译显示和完整状态恢复；授权、RTC、白板及信令由夹具模拟。
- TypeScript 和相关 ESLint 检查通过。

尚未部署，也未进行生产流量或真实多设备验收。
