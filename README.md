# Appsurge Mobile

React Native (Expo SDK 57) companion app for [Appsurge](https://app-surge.dev) — the AI social media manager for app developers. Review your weekly content plan, check analytics, and manage connected platforms from your phone.

## Features

- **Auth** — Firebase email/password (auto-creates your account on first sign-in) + native Google sign-in, with Firebase email confirmation
- **Onboarding** — first-launch story slides: what Appsurge is, who it's for, before/after results, why Appsurge
- **Setup wizard** — connect TikTok / Instagram / YouTube / Threads (real OAuth through the Appsurge gateway; secrets stay in Cloudflare Workers), register your app, get AI platform + hashtag picks, generate your first weekly plan
- **Queue** — review, edit, approve, or reject AI-generated posts
- **Analytics** — views/engagement charts with platform filters
- **Cloud sync** — per-user data in Firestore under `users/{uid}/` with demo-data fallback

## Development

```bash
npm install
cp .env.example .env   # fill in values
npm start              # Expo dev server
npm run typecheck      # tsc --noEmit
```

### Android release build (standalone APK, no Metro needed)

```bash
cd android
JAVA_HOME="C:/Program Files/Eclipse Adoptium/jdk-17.0.20.101-hotspot" ./gradlew.bat app:assembleRelease -x lint -x test
adb install -r app/build/outputs/apk/release/app-release.apk
```

### iOS build

Built and distributed with [EAS Build](https://docs.expo.dev/build/introduction/) (`eas.json` in the repo root).

## Architecture

- `src/lib/dataSource.ts` — the only data boundary screens touch (cloud-first, demo fallback)
- `src/lib/gateway.ts` — Appsurge Cloudflare Worker client (OAuth exchange, AI proxy)
- `src/lib/cloudStore.ts` — Firestore schema: `users/{uid}/apps`, `/connections`, `/plans/weekly`
- `src/lib/session.ts` — Firebase Auth helpers
- `src/theme.ts` — single source of truth for colors/spacing/typography
