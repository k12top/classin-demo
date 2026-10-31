# HLS-first playback with MP4 compatibility

## Behavior

Logical recording clips retain their existing `recordingId:index` values and MP4 links. When a single MP4 has a matching HLS playlist, the recording list additionally returns `hlsPlaybackUrl`. The player uses native HLS on Safari/WebKit and prefers lazy-loaded hls.js/MSE on Chromium; native playback remains available when MSE is unsupported. Explicit HarmonyOS/OpenHarmony user agents use MP4 directly. Unknown/hidden user agents are handled by capability detection and runtime recovery.

Unsupported HLS, fatal network/media errors and the 12-second startup/buffering watchdog fall back to MP4 at most once. Current position and playback intent survive the switch. A stale HLS import/error cannot reattach after fallback, retry or clip change. If MP4 also fails, the existing localized help and manual retry remain available. Native HLS-only and legacy MP4-only recordings retain their existing paths. Ambiguous multi-MP4 recordings retain clip boundaries rather than pairing every clip with one full-length playlist.

## Delivery

Manifest requests keep session/enrollment authorization and private/no-store responses. Child playlists remain behind the authenticated route; media, initialization and encryption-key references inside the permitted recording directory receive scoped six-hour OSS signatures. This removes an application/DB round trip for each media fragment. The signature lifetime covers long lessons and slower playback; the storage bucket remains private. Existing bucket CORS was checked; no bucket policy or CORS changes were made.

## Edited recording

Session `0237942b-6502-4aa1-88fc-423f95531aed`, recording `1393f5cc-5b34-49b5-a296-901396b853fe` has a trimmed MP4. HLS was remuxed from that trimmed file with stream copy, rather than selecting the original playlist with its blank tail. Fragmented MP4 HLS passes a full decode check and has duration 6574.067 seconds, matching the retained MP4 (6574.069) within container rounding. All uploaded object MD5s were verified. The original MP4 and its backup remain unchanged. The companion manifest key is stored in the existing edit audit; recordings with edit metadata and no verified HLS companion remain on MP4.

## Verification and limits

- Unit tests cover native HLS, unsupported MSE, HarmonyOS signatures, timeouts, lost imports, fatal errors, one-way fallback, position/resume, private authorization, manifest path confinement and edited-tail protection.
- Chromium integration runs the actual playback page with real H264/AAC MP4 and fragmented MP4 HLS. Desktop/mobile HLS, simulated HarmonyOS and unsupported MSE pass. A mid-play network failure at 120 seconds falls back and continues after 120.3 seconds. Background list polling preserves the same video element.
- Local first-frame observations were about 1.1 seconds for both formats, without network throttling. This does not establish a production speedup or represent a slow mobile network. The measured architectural change is that HLS fragments no longer traverse the application API.
- Physical HarmonyOS and Safari hardware were not available for acceptance. HarmonyOS coverage uses a simulated user agent and real MP4 decoding; native HLS uses a unit fixture.
- Existing clip IDs, captions, watch-time tracking and manual MP4 entry remain in place. No live lesson is ended or restarted for verification or deployment.

Derived HLS files live beside the edited MP4 under `recording-edits/`, outside Agora's recording-discovery prefix. Their manifest is selected only through the matching recording's verified edit metadata. This prevents initialization objects from being rediscovered as extra recorded MP4 clips.

Production browser verification found Chromium advertising native HLS but remaining at readyState 0 after successful manifest/fragment responses, until the startup watchdog selected MP4. Chromium now prefers hls.js/MSE when available, while Safari/WebKit retains native playback. Native HLS remains a fallback when MSE is unavailable. A regression fixture explicitly advertises native support on a Chromium UA and verifies MSE selection.

A real archived-media smoke test also exposed an internalException in the installed hls.js 1.1 worker bundle. Inline demuxing (enableWorker: false) decoded the same fMP4 recording successfully, with a MediaSource URL, readyState 4 and advancing playback. Forward/back buffers remain bounded. This supplements the synthetic media fixture; it is not a physical HarmonyOS/Safari test.
