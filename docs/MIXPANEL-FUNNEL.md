# Appsurge Conversion Funnel — Mixpanel

The three numbers that matter: **signups → sign-ins → platforms connected**.
Everything below is already instrumented in the app; this doc is the map for
building charts on top.

## The funnel

```
App Opened                          ← every app launch (distinct_id is
  │                                    anonymous until sign-in)
  ▼
Onboarding Completed                ← finished the intro slides
  ▼
Account Created                     ← FIRST sign-in auto-creates the
  │   method: email|google             Firebase account
  │   auto_created: true|false
  ▼
Sign In Completed                   ← every successful auth
  │   method: email|google
  ▼
Setup Started                       ← app-setup wizard opened with no
  │                                    existing app record (new users only)
  ▼
Setup Completed                     ← app name + store link saved
  │   platform_count: n
  ▼
Connect Flow Started                ← tapped Connect on a platform
  │   platform: tiktok|instagram|youtube|threads
  ▼
Social Account Connected            ← OAuth finished, tokens saved
      platform: tiktok|instagram|youtube|threads
```

**North-star: % of `Account Created` users that reach ≥1
`Social Account Connected`.** That's the moment the product works.

## Event reference

| Event | Fires when | Key properties | Where |
|---|---|---|---|
| `App Opened` | app launch | `client: mobile`, `os` | `App.tsx` |
| `Onboarding Completed` | intro slides finished | `slides` | `OnboardingScreen` |
| `Sign In Started` | submit tapped (email or Google) | `method` | `SignInScreen` |
| `Account Created` | Firebase account first created | `method`, `auto_created` | `session.ts` |
| `Sign In Completed` | auth round-trip success | `method` | `session.ts` |
| `Setup Started` | setup wizard opened, no existing app | — | `AppSetupScreen` |
| `Setup Recommendations Generated` | AI platform/hashtag call succeeded | — | `AppSetupScreen` |
| `Setup Completed` | app profile saved | `platform_count` | `AppSetupScreen` |
| `Connect Flow Started` | Connect tapped | `platform` | `connect.ts` |
| `Connect Flow Failed` | OAuth errored/cancelled mid-flow | `platform`, `error_type` | `connect.ts` / `SettingsScreen` |
| `Connect Flow Cancelled` | user backed out of browser | `platform` | `SettingsScreen` |
| `Social Account Connected` | tokens persisted | `platform` | `connect.ts` |
| `Social Account Disconnected` | disconnect confirmed | `platform` | `SettingsScreen` |
| `Plan Generated` | weekly plan created | `duration_ms` | `QueueScreen` |
| `Plan Approved` | bulk approval done | `post_count`, `duration_ms` | `QueueScreen` |
| `Notification Permission Result` | gate answered | `granted`, `denied_first` | `NotificationGate` |
| `Tab Viewed` | tab switched | `tab` | `MainTabs` |

Super properties on every event: `client: 'mobile'`, `os: ios|android`.
Identity: `identify(uid)` fires the moment Firebase reports a session;
`reset()` on sign-out. All auth events use Firebase uid as distinct_id once
known. Errors are normalized into `error_type` buckets (`rate_limit`,
`auth_expired`, `api_down`, `user_cancelled`, `flow_expired`, `unknown`).

## Charts to build in Mixpanel

1. **Acquisition → Activation funnel** (Insights → Funnel):
   `App Opened` → `Account Created` → `Setup Completed` →
   `Social Account Connected`. Break down each step by `os`.
2. **Sign-up method split**: `Account Created` by `method` — is Google
   out-converting email? (On iOS the button only exists if the iOS OAuth
   client ID is set, so also segment by `os`.)
3. **Connect success rate**: `Connect Flow Started` →
   `Social Account Connected`, broken down by `platform`. The complement of
   this (plus `Connect Flow Failed` by `error_type`) is your OAuth health
   metric — TikTok's rate limits will show up here before users complain.
4. **Time-to-value**: median time from `Account Created` to first
   `Social Account Connected` (funnel with conversion-time view).
5. **Notification opt-in rate**: `Notification Permission Result` by
   `granted` — mandatory gate should sit near 100%; a drop means an OS
   update changed the prompt flow.
6. **Weekly retention proxy**: `App Opened` by week, cohort by
   `Account Created` week.

## Notes / caveats

- **Anonymous → known bridging:** events before sign-in carry a Mixpanel
  anonymous distinct_id; `identify(uid)` at session-start merges them
  (default ID merge). Pre-auth funnel steps attribute correctly.
- **`auto_created: true`** on `Account Created` is the majority case —
  the sign-in form auto-creates accounts, so "Sign In Started" with an
  unknown email converts straight into a new account. Use
  `Account Created` (not `Sign In Completed`) as the top of the
  activation funnel.
- **Desktop shares the project** via `client: desktop` super property —
  filter it out for mobile-only funnels.
- Demo/screenshot builds (`EXPO_PUBLIC_DEMO_BUILD=1`) never report.
