This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Brand Configuration

The public site brand can be overridden with environment variables:

```bash
NEXT_PUBLIC_SITE_NAME=翔宇文淑直播平台
NEXT_PUBLIC_SITE_TITLE=翔宇文淑-在线课堂
NEXT_PUBLIC_SITE_LOGO=/site-logo.svg
NEXT_PUBLIC_SITE_ICON=/favicon.ico
```

If these variables are not set, the app uses the values above.

`NEXT_PUBLIC_SITE_LOGO` and `NEXT_PUBLIC_SITE_ICON` support either site-relative paths or absolute HTTPS URLs.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

### Automatic database migrations

Vercel uses `npm run build:deploy`, which runs `prisma migrate deploy` before the
application build. Committed migrations in `prisma/migrations` are therefore
applied automatically on every deployment; already-applied migrations are
skipped safely.

Set `DATABASE_URL` in the Vercel environment for every deployment environment
that should build this application. If a migration fails, the build stops and
the new application version is not deployed. Create schema changes locally with
`npm run db:migrate:dev`, review and commit the generated migration directory,
then deploy normally. Do not use `prisma db push` for production deployments.

### Courseware storage (Alibaba Cloud OSS)

Courseware files are uploaded directly from the teacher's browser to a private
Alibaba Cloud OSS bucket. The application only issues short-lived upload and
download signatures, and courseware is not sent to the classroom whiteboard.
Configure these server-only environment variables in each deployment
environment:

```bash
ALIYUN_OSS_REGION=oss-cn-hangzhou
ALIYUN_OSS_BUCKET=your-private-bucket
ALIYUN_OSS_ACCESS_KEY_ID=your-ram-access-key-id
ALIYUN_OSS_ACCESS_KEY_SECRET=your-ram-access-key-secret
# Optional. Defaults to courseware.
ALIYUN_OSS_COURSEWARE_PREFIX=courseware
```

The RAM credentials need permission to read and write only the configured
prefix. Configure the OSS bucket CORS rule to allow your web domains to use
the `PUT` method and the `Content-Type` request header; students download via
the application's authenticated download URL.

### Self-managed classroom and cloud recording

The classroom UI and lifecycle are owned by this application. Agora is the
default RTC and cloud-recording provider behind provider-neutral interfaces;
the removed Flexible Classroom bundle is no longer loaded. Configure the
following server-only variables:

```bash
CLASSROOM_MEDIA_PROVIDER=agora
CLASSROOM_RECORDING_PROVIDER=agora
# v3 (default), v2, or rollout.
CLASSROOM_UI_VERSION=v3
# Used only when CLASSROOM_UI_VERSION=rollout.
CLASSROOM_V3_ROLLOUT_PERCENT=0
# classin (default) or legacy; this only changes the V3 classroom layout.
CLASSROOM_V3_LAYOUT=classin

AGORA_APP_ID=your-agora-app-id
AGORA_APP_CERTIFICATE=your-agora-app-certificate
AGORA_REST_CUSTOMER_ID=your-agora-rest-customer-id
AGORA_REST_CUSTOMER_SECRET=your-agora-rest-customer-secret

# Numeric Agora Cloud Recording storage-region ID for Alibaba Cloud OSS.
# This is not the OSS endpoint string such as oss-ap-southeast-1.
AGORA_RECORDING_STORAGE_REGION=10
AGORA_RECORDING_API_REGION=ap
AGORA_RECORDING_REGION_AFFINITY=2
AGORA_RECORDING_STORAGE_ENDPOINT=https://your-bucket.oss-ap-southeast-1.aliyuncs.com
AGORA_RECORDING_WEBHOOK_SECRET=use-the-secret-configured-in-agora-ncs
# Optional defaults:
AGORA_RECORDING_MAX_IDLE_SECONDS=300
AGORA_RECORDING_PREFIX=recordings

# Server-side PostgreSQL pool. Keep this deliberately small for remote or
# serverless deployments and place PgBouncer in front of PostgreSQL at scale.
DATABASE_POOL_MAX=3
DATABASE_CONNECT_TIMEOUT_MS=3000
DATABASE_IDLE_TIMEOUT_MS=300000
DATABASE_READ_RETRIES=1

# Live captions. Shengwang ASR is used for speech recognition in both modes.
AGORA_STT_ENABLED=true
AGORA_STT_REGION=cn
AGORA_API_BASE_URL=https://api.sd-rtn.com
AGORA_STT_MAX_IDLE_SECONDS=300

# Optional Wordly translation bridge. Leave these unset to use Shengwang
# translation only. This token must match the bridge service configuration.
WORDLY_API_URL=https://wordly-bridge.example.com
WORDLY_INTERNAL_TOKEN=use-the-same-value-as-bridge-internal-token

# Enables 1280x720 full-page classroom recording. If these are absent or web
# recording fails, the provider automatically falls back to RTC mix recording.
CLASSROOM_PUBLIC_BASE_URL=https://live.example.com
CLASSROOM_RECORDER_SECRET=use-a-long-random-server-only-secret
AGORA_PAGE_RECORDING_MAX_HOURS=8

# Netless Fastboard. Without these variables the classroom remains usable and
# displays a clear "whiteboard not configured" state.
WHITEBOARD_APP_IDENTIFIER=team-id/app-id
WHITEBOARD_SDK_TOKEN=your-netless-sdk-token
WHITEBOARD_REGION=sg

# Classroom lifecycle and camera preset.
COURSE_EARLY_ENTRY_MINUTES=60
COURSE_FINISHED_DELAY_MINUTES=20
NEXT_PUBLIC_CLASSROOM_VIDEO_PRESET=hd
```

Cloud recording reuses the private Alibaba Cloud OSS bucket and credentials
from the courseware section. The RAM policy must also allow read/write access
to `recordings/*`. Agora's REST customer credentials are different from the
App ID/App Certificate and are created in the Agora console. Alibaba Cloud
Singapore (`oss-ap-southeast-1`) must use Agora storage region `10`; startup
validation rejects a known mismatched numeric region before recording begins.
Configure Agora NCS to post recording events to
`/api/webhooks/agora/recording` and use the same webhook secret on both sides.

`WORDLY_INTERNAL_TOKEN` must exactly match the Wordly service's
`BRIDGE_INTERNAL_TOKEN`. `AGORA_STT_ENABLED=false` disables live captions
without blocking classroom entry. Shengwang translation accepts at most 10
target languages per class; Wordly mode still uses Shengwang ASR and sends
only final transcripts to the configured bridge.

### Cross-platform classroom clients

The browser remains the source of truth for course management and the Web
classroom. Native clients consume the same server-authoritative classroom
bootstrap and session APIs; they never generate room IDs, roles, media tokens,
or recording permissions themselves.

- [Cross-platform architecture](docs/cross-platform/architecture.md)
- [Electron desktop shell](clients/desktop/README.md) for Windows and macOS
- [Flutter mobile shell](clients/mobile/README.md) for iOS, iPadOS and Android
- [HarmonyOS NEXT ArkUI shell](clients/harmony/README.md)

The shared transport contract and design primitives live in
`contracts/classroom-v1.schema.json` and `design-tokens/classroom.tokens.json`.
Each native project has its own platform toolchain and should be built in its
own CI job; the root `npm` scripts only validate and build the Next.js Web app.

Apply the committed Prisma migration before starting the updated application:

```bash
npm run db:migrate
```

Deployment builds already run this step through `npm run build:deploy`.
Media and recording profiles are centralized in
`src/lib/classroom/config.ts`; the current defaults use a 160x120 low camera
stream, 720p focused camera stream, 1080p detail-optimized screen sharing, and
720p full-page MP4/HLS recording. Set the public video preset to `economy`,
`hd`, or `fullHd`; invalid values safely fall back to `hd`.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
