// Firestore cloud store for the mobile app.
//
// The desktop app is local-first (localStorage), so the mobile app defines
// the cloud schema here. Everything lives under the signed-in user's own
// subtree, which the existing security rules already protect:
//
//   users/{uid}/apps/{appId}             → the user's app + AI recommendations
//   users/{uid}/connections/{platform}   → OAuth connection per platform
//   users/{uid}/plans/weekly             → the generated weekly content plan
//
// Access tokens are stored in the connection docs — they are minted per
// user by the gateway and each doc is only readable/writable by that
// user's own Firebase credentials (see firestore.rules /users/{uid}/**).

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  getFirestore,
} from 'firebase/firestore';
import { auth } from './firebase';
import { generateWeeklyPlan } from './aiPlanner';
import type { PlatformId } from '../types';

const db = getFirestore(auth.app);

function requireUser(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('You need to be signed in first.');
  return uid;
}

// ---- Types ----------------------------------------------------------------

export type AppRecord = {
  id: string;
  name: string;
  /** Google Play Store URL. */
  storeUrl: string;
  /** Apple App Store URL (optional — not every app ships on iOS). */
  appleStoreUrl?: string;
  /** Legacy/optional context fields — no longer asked in mobile setup. */
  category?: string;
  audience?: string;
  platforms: PlatformId[];
  hashtags: string[];
  aiRationale: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type ConnectionRecord = {
  platform: string;
  connected: boolean;
  handle: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  openId?: string;
  connectedAt?: unknown;
};

export type PlanSlotRecord = {
  platform: PlatformId;
  day: number;
  hook: string;
  caption: string;
  hashtags: string[];
  status: 'pending' | 'approved' | 'rejected' | 'posted';
  scheduledAt?: string;
};

export type WeeklyPlanRecord = {
  slots: PlanSlotRecord[];
  generatedAt: string;
  status: 'ready' | 'approved' | 'empty';
};

// ---- Desktop sync bridge ---------------------------------------------------
// The desktop (Electron) app pushes its entire non-OAuth state to
// users/{uid}/sync/appsurge on every sign-in and on every significant
// change (see desktop-app/src/firestoreSync.ts): app profiles + settings,
// the 30-day plan, weekly approvals, slot overrides, the scheduled-post
// queue, and posting times. The loaders below fall back to that document
// so anything created on desktop shows up on mobile without redoing setup.

type DesktopAppInfo = {
  name?: string;
  socialName?: string;
  description?: string;
  category?: string;
  url?: string;
};

type DesktopOnboardingData = {
  platforms?: string[];
  appInfo?: DesktopAppInfo;
  aiRecommendations?: { platforms?: string[]; hashtags?: string[]; captionHints?: string[] } | null;
};

type DesktopStoredApp = {
  id: string;
  data?: DesktopOnboardingData;
  createdAt?: string;
  updatedAt?: string;
};

type DesktopPlanSlot = {
  day?: number;
  platform?: string;
  hook?: string;
  caption?: string;
  hashtags?: string[];
  scheduledFor?: string;
};

type DesktopSyncDoc = {
  apps?: DesktopStoredApp[];
  activeAppId?: string;
  autopilotPlan?: { generatedAt?: string; slots?: DesktopPlanSlot[] } | null;
  weeklyPlanApprovals?: Record<string, {
    appId?: string;
    planGeneratedAt?: string;
    approvedAt?: string;
    slots?: DesktopPlanSlot[];
  }>;
  lastSyncedAt?: string;
};

const DESKTOP_PLATFORM_IDS: PlatformId[] = ['tiktok', 'instagram', 'youtube', 'threads', 'x'];

export async function loadDesktopSync(): Promise<DesktopSyncDoc | null> {
  try {
    const uid = requireUser();
    const snapshot = await getDoc(doc(db, 'users', uid, 'sync', 'appsurge'));
    if (!snapshot.exists()) return null;
    return snapshot.data() as DesktopSyncDoc;
  } catch {
    return null; // Offline / not signed in / no desktop sync yet.
  }
}

function desktopAppToRecord(app: DesktopStoredApp, activeAppId?: string): AppRecord {
  const data = app.data ?? {};
  const info = data.appInfo ?? {};
  const rec = data.aiRecommendations;
  const platforms = (data.platforms ?? rec?.platforms ?? []).filter(
    (p): p is PlatformId => DESKTOP_PLATFORM_IDS.includes(p as PlatformId),
  );
  return {
    id: app.id,
    name: info.name ?? info.socialName ?? 'My app',
    storeUrl: info.url ?? '',
    category: info.category ?? '',
    audience: info.description ?? '',
    platforms,
    hashtags: rec?.hashtags ?? [],
    aiRationale: (rec?.captionHints ?? []).join(' '),
  };
}

function desktopSlotToRecord(slot: DesktopPlanSlot, index: number, status: PlanSlotRecord['status']): PlanSlotRecord {
  return {
    platform: ((slot.platform && DESKTOP_PLATFORM_IDS.includes(slot.platform as PlatformId)) ? slot.platform : 'instagram') as PlatformId,
    day: typeof slot.day === 'number' ? slot.day : index + 1,
    hook: slot.hook ?? '',
    caption: slot.caption ?? '',
    hashtags: slot.hashtags ?? [],
    status,
    scheduledAt: slot.scheduledFor,
  };
}

function weeklyPlanFromDesktopSync(syncDoc: DesktopSyncDoc): WeeklyPlanRecord | null {
  // 1) Approved weekly slots — the desktop's real review decisions — win.
  const approvals = syncDoc.weeklyPlanApprovals ?? {};
  const activeId = syncDoc.activeAppId;
  const approvalKey = (activeId && Object.keys(approvals).find((key) => key.endsWith(`_${activeId}`)))
    ?? Object.keys(approvals)[0];
  const approval = approvalKey ? approvals[approvalKey] : null;
  if (approval?.slots?.length) {
    return {
      generatedAt: approval.planGeneratedAt ?? approval.approvedAt ?? new Date().toISOString(),
      status: 'approved',
      slots: approval.slots.map((slot, index) => desktopSlotToRecord(slot, index, 'approved')),
    };
  }

  // 2) Otherwise surface the desktop's generated plan as pending review.
  //    The desktop plan spans 30 days — the mobile queue is weekly, so the
  //    first 7 days are shown.
  const plan = syncDoc.autopilotPlan;
  if (plan?.slots?.length) {
    const firstWeek = plan.slots.filter((slot) => typeof slot.day === 'number' && slot.day <= 7);
    const slots = (firstWeek.length ? firstWeek : plan.slots.slice(0, 7));
    if (slots.length) {
      return {
        generatedAt: plan.generatedAt ?? new Date().toISOString(),
        status: 'ready',
        slots: slots.map((slot, index) => desktopSlotToRecord(slot, index, 'pending')),
      };
    }
  }
  return null;
}

// ---- App profile -----------------------------------------------------------

export async function loadAppRecord(): Promise<AppRecord | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  // 1) Mobile-native record (newest first).
  try {
    const ref = query(collection(db, 'users', uid, 'apps'), orderBy('createdAt', 'desc'), limit(1));
    const snapshot = await getDocs(ref);
    if (!snapshot.empty) {
      const data = snapshot.docs[0].data() as AppRecord;
      return { ...data, id: snapshot.docs[0].id };
    }
  } catch {
    // Query can fail (offline blip, index, rules) — the desktop fallback
    // below must still run instead of aborting the whole lookup. A returning
    // desktop user must never be treated as brand-new because one read
    // hiccuped.
  }

  // 2) Desktop sync doc — single getDoc, no query semantics to fail. The
  //    desktop (Electron) app pushes its app profile + settings here on
  //    every sign-in and change (users/{uid}/sync/appsurge).
  try {
    const syncDoc = await loadDesktopSync();
    const apps = syncDoc?.apps ?? [];
    if (!apps.length) return null;
    const active = apps.find((app) => app.id && app.id === syncDoc?.activeAppId) ?? apps[0];
    return desktopAppToRecord(active, syncDoc?.activeAppId);
  } catch {
    return null;
  }
}

// Editable from Settings: updates the user's app details in place. Writes
// to the newest mobile-native doc when one exists; otherwise creates a
// complete mobile-native record (merged with the current desktop-synced
// profile) so the edit survives and wins on future loads.
export async function updateAppDetails(input: {
  name: string;
  storeUrl: string;
  appleStoreUrl?: string;
  description: string;
}): Promise<AppRecord> {
  const current = await loadAppRecord();

  const record: AppRecord = {
    id: current?.id ?? '',
    name: input.name.trim() || current?.name || 'My app',
    storeUrl: input.storeUrl.trim(),
    appleStoreUrl: input.appleStoreUrl?.trim() || undefined,
    audience: input.description.trim(),
    platforms: current?.platforms ?? [],
    hashtags: current?.hashtags ?? [],
    aiRationale: current?.aiRationale ?? '',
  };

  const uid = requireUser();

  // Is the current record a mobile-native Firestore doc (vs a desktop-sync
  // fallback with no local doc)? Probe the newest apps doc directly.
  let existingId: string | null = null;
  try {
    const snapshot = await getDocs(query(collection(db, 'users', uid, 'apps'), orderBy('createdAt', 'desc'), limit(1)));
    existingId = snapshot.empty ? null : snapshot.docs[0].id;
  } catch {
    existingId = null;
  }

  const ref = existingId ? doc(db, 'users', uid, 'apps', existingId) : doc(collection(db, 'users', uid, 'apps'));
  const payload: Record<string, unknown> = stripUndefined({
    name: record.name,
    storeUrl: record.storeUrl,
    appleStoreUrl: record.appleStoreUrl,
    audience: record.audience,
    platforms: record.platforms,
    hashtags: record.hashtags,
    aiRationale: record.aiRationale,
    updatedAt: serverTimestamp(),
  });
  if (!existingId) payload.createdAt = serverTimestamp();
  await setDoc(ref, payload, { merge: true });

  return { ...record, id: ref.id };
}

// Firestore throws on undefined fields. Strip them shallowly before any
// user-shaped payload goes over the wire (serverTimestamp() sentinels are
// FieldValues, not undefined, so they survive this).
function stripUndefined<T extends Record<string, unknown>>(input: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

export async function saveAppRecord(input: Omit<AppRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<AppRecord> {
  const uid = requireUser();
  const ref = doc(collection(db, 'users', uid, 'apps'));
  const payload = { ...stripUndefined(input), createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  await setDoc(ref, payload);
  return { ...input, id: ref.id };
}

// ---- Connections -----------------------------------------------------------

export async function loadConnections(): Promise<ConnectionRecord[]> {
  try {
    const uid = requireUser();
    const snapshot = await getDocs(collection(db, 'users', uid, 'connections'));
    return snapshot.docs.map((entry) => ({ ...(entry.data() as ConnectionRecord) }));
  } catch {
    return [];
  }
}

export async function saveConnection(input: {
  platform: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  openId?: string;
}): Promise<ConnectionRecord> {
  const uid = requireUser();
  const ref = doc(db, 'users', uid, 'connections', input.platform);
  // Firestore rejects ANY field whose value is undefined — and several
  // platforms legitimately omit parts of the token response (Instagram's
  // short-lived flow returns no refresh_token, Threads omits openId, etc).
  // Build the payload conditionally so absent optional fields are simply
  // not written instead of crashing the save with
  // "setDoc() called with invalid data. Unsupported field value: undefined".
  const payload: ConnectionRecord = {
    platform: input.platform,
    connected: true,
    handle: input.openId ? `@${input.openId}` : 'Connected account',
    accessToken: input.accessToken,
    connectedAt: serverTimestamp(),
  };
  if (input.refreshToken !== undefined) payload.refreshToken = input.refreshToken;
  if (input.expiresAt !== undefined) payload.expiresAt = input.expiresAt;
  if (input.scope !== undefined) payload.scope = input.scope;
  if (input.openId !== undefined) payload.openId = input.openId;
  await setDoc(ref, payload, { merge: true });
  return payload;
}

export async function disconnectPlatform(platform: string): Promise<void> {
  try {
    const uid = requireUser();
    await deleteDoc(doc(db, 'users', uid, 'connections', platform));
  } catch {
    // Best-effort — the local cache already shows the disconnect.
  }
}

// ---- Weekly plan -------------------------------------------------------------

export async function loadWeeklyPlan(): Promise<WeeklyPlanRecord | null> {
  // Mobile-generated plan first. A failed read must not skip the desktop
  // fallback below — same hardening as loadAppRecord.
  try {
    const uid = requireUser();
    const snapshot = await getDoc(doc(db, 'users', uid, 'plans', 'weekly'));
    if (snapshot.exists()) return snapshot.data() as WeeklyPlanRecord;
  } catch {
    // Fall through to the desktop sync doc.
  }

  // Mobile hasn't generated its own plan — surface the desktop's synced
  // one: approved slots first, else the generated plan's first week.
  try {
    const syncDoc = await loadDesktopSync();
    if (!syncDoc) return null;
    return weeklyPlanFromDesktopSync(syncDoc);
  } catch {
    return null;
  }
}

// Bulk approval from the Queue's bottom bar: flips every pending slot in
// the weekly plan to approved in one write. Returns the approved count.
export async function approveAllPlanSlots(): Promise<number> {
  const plan = await loadWeeklyPlan();
  if (!plan) return 0;
  const slots = plan.slots.map((slot) => (slot.status === 'pending' ? { ...slot, status: 'approved' as const } : slot));
  await saveWeeklyPlan({ ...plan, slots, status: 'approved' });
  return slots.filter((slot) => slot.status === 'approved').length;
}

export async function saveWeeklyPlan(plan: WeeklyPlanRecord): Promise<void> {
  const uid = requireUser();
  await setDoc(doc(db, 'users', uid, 'plans', 'weekly'), plan, { merge: true });
}

export async function setSlotStatus(day: number, status: PlanSlotRecord['status']): Promise<void> {
  try {
    const plan = await loadWeeklyPlan();
    if (!plan) return;
    const slots = plan.slots.map((slot) => (slot.day === day ? { ...slot, status } : slot));
    await saveWeeklyPlan({ ...plan, slots });
  } catch {
    // Best-effort — the screen already updated its local cache.
  }
}

// ---- Generation ---------------------------------------------------------------

export async function buildWeeklyPlan(): Promise<WeeklyPlanRecord> {
  const appRecord = await loadAppRecord();
  if (!appRecord) throw new Error('Set up your app first.');
  const connections = await loadConnections();
  const connectedPlatforms = connections
    .filter((connection) => connection.connected)
    .map((connection) => connection.platform as PlatformId);
  const platforms = connectedPlatforms.length
    ? connectedPlatforms
    : appRecord.platforms.length
      ? appRecord.platforms
      : (['tiktok', 'instagram'] as PlatformId[]);

  const slots = await generateWeeklyPlan({
    appName: appRecord.name,
    storeUrl: appRecord.storeUrl,
    appleStoreUrl: appRecord.appleStoreUrl,
    appCategory: appRecord.category ?? 'mobile app',
    targetAudience: appRecord.audience ?? '',
    platforms,
    hashtags: appRecord.hashtags,
  });

  const now = new Date();
  const withSchedule = slots.map((slot) => ({
    ...slot,
    scheduledAt: new Date(now.getTime() + slot.day * 24 * 60 * 60 * 1000).toISOString(),
    status: 'pending' as const,
  }));

  const plan: WeeklyPlanRecord = { slots: withSchedule, generatedAt: now.toISOString(), status: 'ready' };
  await saveWeeklyPlan(plan);
  return plan;
}
