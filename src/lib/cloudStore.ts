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
  storeUrl: string;
  category: string;
  audience: string;
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

// ---- App profile -----------------------------------------------------------

export async function loadAppRecord(): Promise<AppRecord | null> {
  try {
    const uid = requireUser();
    const ref = query(collection(db, 'users', uid, 'apps'), orderBy('createdAt', 'desc'), limit(1));
    const snapshot = await getDocs(ref);
    if (snapshot.empty) return null;
    const data = snapshot.docs[0].data() as AppRecord;
    return { ...data, id: snapshot.docs[0].id };
  } catch {
    return null; // Offline / Firestore unreachable / not signed in yet.
  }
}

export async function saveAppRecord(input: Omit<AppRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<AppRecord> {
  const uid = requireUser();
  const ref = doc(collection(db, 'users', uid, 'apps'));
  const payload = { ...input, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
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
  const payload: ConnectionRecord = {
    platform: input.platform,
    connected: true,
    handle: input.openId ? `@${input.openId}` : 'Connected account',
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    expiresAt: input.expiresAt,
    scope: input.scope,
    openId: input.openId,
    connectedAt: serverTimestamp(),
  };
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
  try {
    const uid = requireUser();
    const snapshot = await getDoc(doc(db, 'users', uid, 'plans', 'weekly'));
    if (!snapshot.exists()) return null;
    return snapshot.data() as WeeklyPlanRecord;
  } catch {
    return null;
  }
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
    appCategory: appRecord.category,
    targetAudience: appRecord.audience,
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
