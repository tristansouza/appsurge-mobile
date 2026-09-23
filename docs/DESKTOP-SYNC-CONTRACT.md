# Desktop → Mobile Sync Contract

This document is the **instruction set for the desktop-app agent**. The
mobile app (`com.appsurge`) reads everything below straight from Firestore —
no custom API, no push channel. If the desktop writes these shapes, the
phone shows them.

## Where things go

Everything lives under the signed-in user's own subtree, which the existing
security rules already protect:

```
users/{uid}/sync/appsurge          ← whole desktop state (exists already)
users/{uid}/activity/{eventId}     ← NEW: activity feed for the Updates tab
```

Sign in with the same Firebase project **app-surge**. The mobile app logs
the user in with Firebase Auth (email/password + Google); the desktop must
use the **same project and the same user** — everything is keyed by `uid`.

## 1. Activity events (Updates tab)

Append one document per thing that happens on the desktop. Collection:
`users/{uid}/activity`. Document shape:

```ts
type ActivityEvent = {
  id: string;              // doc id: `${Date.now().toString(36)}-${rand6}`
  kind: ActivityKind;      // see list below
  platform?: string;       // 'tiktok' | 'instagram' | 'youtube' | 'threads' (optional)
  title: string;           // short headline, e.g. "Published to TikTok"
  body: string;            // one-line detail, e.g. the hook or failure reason
  source: 'desktop';       // always 'desktop' when the desktop writes
  read?: boolean;          // omit on write — mobile marks read itself
};

type ActivityKind =
  | 'post-published'       // a scheduled post went out successfully
  | 'post-failed'          // a post failed (body should say why)
  | 'post-scheduled'       // a post was queued for later
  | 'plan-generated'       // a weekly/30-day plan was generated
  | 'plan-approved'        // slots were approved on desktop
  | 'platform-connected'   // an OAuth connection succeeded
  | 'platform-disconnected'
  | 'app-registered'       // a new app profile was set up
  | 'note';                // anything else worth surfacing
```

Write with `setDoc(doc(firestore, 'users', uid, 'activity', id), event)`.
Use the desktop's Firestore SDK **serverTimestamp()** for `createdAt` if
you include it — the mobile app tolerates its absence and sorts by server
time when present.

When to write (minimum set):

| Desktop event | kind | title example |
|---|---|---|
| Autoposter published a post | `post-published` | "Published to TikTok" |
| Autoposter post failed | `post-failed` | "Post failed on Instagram" |
| Post queued for future slot | `post-scheduled` | "Scheduled for tomorrow" |
| Weekly plan generated | `plan-generated` | "New content plan ready" |
| User approved plan on desktop | `plan-approved` | "Plan approved on desktop" |
| OAuth connect finished | `platform-connected` | "TikTok connected" |
| OAuth disconnect finished | `platform-disconnected` | "TikTok disconnected" |
| Onboarding completed for an app | `app-registered` | "App registered" |

Keep `body` to one sentence. The mobile app renders the latest 60 events,
grouped by day, with unread dots until the user opens the tab.

## 2. State sync (already specced — keep filling it)

`users/{uid}/sync/appsurge` stays the source of truth for state:

```ts
{
  apps: [{ id, data: { appInfo, platforms, aiRecommendations }, createdAt, updatedAt }],
  activeAppId: string,
  autopilotPlan: { generatedAt, slots: [{ day, platform, hook, caption, hashtags, scheduledFor }] },
  weeklyPlanApprovals: { [planKey]: { appId, planGeneratedAt, approvedAt, slots } },
  lastSyncedAt: string,   // ISO — bump on every write
}
```

The mobile app already falls back to this doc when the phone has no local
record (see `src/lib/cloudStore.ts` → `loadDesktopSync`). Requirements:

1. **Write on every sign-in and on every significant change** (plan
   generated, slot approved, settings saved) — not just at boot.
2. **Never include OAuth access tokens here.** Connections stay in
   `users/{uid}/connections/{platform}` exactly as they are today.
3. **Merge, don't clobber.** Read-modify-write; another client may write
   between your read and write.
4. **Bump `lastSyncedAt`** so the mobile app can show "synced 2m ago".

## 3. Rules of engagement

- **Only write under `users/{currentUser.uid}/`.** The security rules
  reject anything else.
- **Idempotent activity ids.** If the same publish retry fires twice, reuse
  the same `id` so it doesn't double-render on the phone.
- **No secrets.** No access tokens, refresh tokens, or API keys in either
  collection. The gateway holds those.
- **Timestamps:** ISO 8601 strings for plan fields (existing behavior);
  `createdAt` on activity docs may be a Firestore server timestamp.

## 4. Verification

After wiring the desktop side:

1. Publish (or simulate) a post on desktop with the same Firebase user
   signed in on the phone.
2. Open the mobile app → **Updates** tab → the event appears within one
   refresh (pull-to-refresh works; the tab also refetches on focus).
3. Approve a plan on desktop → mobile **Queue** shows the approved slots
   (status `approved`) after reload.
4. Confirm no doc ever lands outside `users/{uid}/...`.
