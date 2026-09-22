// analytics.ts — Centralized Mixpanel analytics wrapper for the mobile app.
//
// Mirrors desktop-app/src/analytics.ts so both clients report into the SAME
// Mixpanel project with the same event vocabulary. Every event carries the
// `client: 'mobile'` super property (plus `os`), so a shared dashboard can
// split mobile vs desktop with one filter.
//
// Privacy: never send PII (emails, tokens, post content) — only IDs and
// categorical/numeric data, same rule as the desktop app.
//
// Token: EXPO_PUBLIC_MIXPANEL_TOKEN. Missing/empty token → analytics
// silently no-ops so dev builds and store-capture demo builds work fine.
//
// Init model: the native SDK must finish init() before track/identify are
// safe, but the earliest callers (App Opened, auth identify) fire during
// boot. Calls made before init resolves are buffered in JS and drained in
// order afterwards — nothing is dropped and nothing crashes.

import { AppState, Platform } from 'react-native';

const TOKEN = process.env.EXPO_PUBLIC_MIXPANEL_TOKEN;

// Demo builds exist solely for store screenshots — don't pollute analytics.
const DEMO_BUILD = String(process.env.EXPO_PUBLIC_DEMO_BUILD || '') === '1';

let instance: any = null;
let initPromise: Promise<void> | null = null;
let disabled = false;
let currentId: string | null = null;
const buffer: Array<() => void> = [];

function ensureInit(): Promise<void> | null {
  if (initPromise) return initPromise;
  if (disabled) return null;
  if (!TOKEN || DEMO_BUILD) {
    if (!TOKEN) console.warn('[analytics] EXPO_PUBLIC_MIXPANEL_TOKEN not set — tracking disabled.');
    disabled = true;
    return null;
  }
  try {
    const { Mixpanel } = require('mixpanel-react-native');
    // (token, trackAutomaticEvents=false, useNative=true): fully manual
    // events, native SDK with its offline queue and batching.
    const mp = new Mixpanel(TOKEN, false, true);
    instance = mp;
    initPromise = mp
      .init()
      .then(() => {
        mp.registerSuperProperties({ client: 'mobile', os: Platform.OS });
        // Flush queued events when the app backgrounds so the last batch
        // survives a force-quit.
        AppState.addEventListener('change', (state: string) => {
          if (state === 'background') flush();
        });
        // Drain everything that arrived while init was in flight.
        for (const fn of buffer.splice(0)) {
          try { fn(); } catch {}
        }
      })
      .catch((error: unknown) => {
        console.warn('[analytics] init failed — tracking disabled.', error);
        disabled = true;
      });
    return initPromise;
  } catch (error) {
    console.warn('[analytics] unavailable — tracking disabled.', error);
    disabled = true;
    return null;
  }
}

function whenReady(fn: () => void): void {
  const ready = ensureInit();
  if (!ready) return;
  ready.then(() => { if (instance) fn(); }).catch(() => undefined);
}

function flush(): void {
  try { instance?.flush?.(); } catch {}
}

function track(event: string, props: Record<string, unknown> = {}): void {
  whenReady(() => {
    try {
      instance.track(event, props);
    } catch (error) {
      // Analytics must never break the app.
      console.warn('[analytics] track failed:', event, error);
    }
  });
}

// ---- Identity ----------------------------------------------------------------

/** Identify after Firebase auth resolves. No-op when unchanged. */
export function identify(userId: string): void {
  if (currentId === userId) return;
  whenReady(() => {
    try {
      instance.identify(userId);
      instance.getPeople().set({ client: 'mobile', os: Platform.OS });
      currentId = userId;
    } catch (error) {
      console.warn('[analytics] identify failed:', error);
    }
  });
}

/** Clear identity on sign-out (starts a fresh anonymous id). */
export function resetIdentity(): void {
  whenReady(() => {
    try {
      instance.reset();
      currentId = null;
    } catch (error) {
      console.warn('[analytics] reset failed:', error);
    }
  });
}

// ---- Raw tracking (for call sites not covered by the helpers below) ----------

export function trackEvent(event: string, props?: Record<string, unknown>): void {
  track(event, props);
}

// ---- Lifecycle ---------------------------------------------------------------

export function trackAppOpened(): void {
  track('App Opened');
}

export function trackOnboardingCompleted(slides: number): void {
  track('Onboarding Completed', { slides });
}

export function trackNotificationPermission(granted: boolean, deniedFirst: boolean): void {
  track('Notification Permission Result', { granted, denied_first: deniedFirst });
}

// ---- Auth --------------------------------------------------------------------

export function trackSignInStarted(method: 'email' | 'google'): void {
  track('Sign In Started', { method });
}

export function trackSignInCompleted(method: 'email' | 'google'): void {
  track('Sign In Completed', { method });
}

export function trackAccountCreated(method: 'email' | 'google', autoCreated: boolean): void {
  track('Account Created', { method, auto_created: autoCreated });
}

export function trackPasswordResetRequested(): void {
  track('Password Reset Requested');
}

export function trackSignOut(): void {
  track('Sign Out');
}

// ---- Setup wizard ------------------------------------------------------------

export function trackSetupStarted(): void {
  track('Setup Started');
}

export function trackSetupRecommendations(success: boolean, props: Record<string, unknown> = {}): void {
  track(success ? 'Setup Recommendations Generated' : 'Setup Recommendations Failed', props);
}

export function trackSetupCompleted(platformCount: number): void {
  track('Setup Completed', { platform_count: platformCount });
}

// ---- Platform connections ----------------------------------------------------

export function trackConnectStarted(platform: string): void {
  track('Connect Flow Started', { platform });
}

export function trackSocialAccountConnected(platform: string): void {
  // Same event name as desktop so connections across both clients
  // aggregate in one chart.
  track('Social Account Connected', { platform });
}

export function trackConnectFailed(platform: string, message: string): void {
  track('Connect Flow Failed', { platform, error_type: normalizeErrorType(message), error_message: message.slice(0, 160) });
}

export function trackConnectCancelled(platform: string): void {
  track('Connect Flow Cancelled', { platform });
}

export function trackPlatformDisconnected(platform: string): void {
  track('Social Account Disconnected', { platform });
}

// ---- Content plan / review queue ---------------------------------------------

export function trackPlanRegenerateStarted(): void {
  track('Plan Regenerate Started');
}

export function trackPlanGenerated(durationMs: number): void {
  track('Plan Generated', { duration_ms: Math.round(durationMs) });
}

export function trackPlanGenerationFailed(message: string): void {
  track('Plan Generation Failed', { error_type: normalizeErrorType(message), error_message: message.slice(0, 160) });
}

export function trackReviewOpened(postCount: number): void {
  track('Review Opened', { post_count: postCount });
}

export function trackPlanApproved(postCount: number, durationMs: number): void {
  track('Plan Approved', { post_count: postCount, duration_ms: Math.round(durationMs) });
}

export function trackPlanApprovalFailed(message: string): void {
  track('Plan Approval Failed', { error_type: normalizeErrorType(message), error_message: message.slice(0, 160) });
}

export function trackPostEdited(created: boolean): void {
  track(created ? 'Post Created' : 'Post Edited');
}

export function trackSlidesGenerated(success: boolean, slideCount: number, durationMs: number): void {
  track('Slides Generated', { success, slide_count: slideCount, duration_ms: Math.round(durationMs) });
}

// ---- Settings ----------------------------------------------------------------

export function trackAppDetailsUpdated(): void {
  track('App Details Updated');
}

export function trackDisplayNameUpdated(): void {
  track('Display Name Updated');
}

// ---- Navigation ---------------------------------------------------------------

export function trackTabViewed(tab: string): void {
  track('Tab Viewed', { tab });
}

// ---- Internal helpers ----------------------------------------------------------

/** Normalise raw error messages into a small enum for dashboard grouping
 *  (same buckets as the desktop app). */
function normalizeErrorType(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('rate limit') || lower.includes('429') || lower.includes('too many requests')) return 'rate_limit';
  if (lower.includes('token expired') || lower.includes('auth') || lower.includes('401') || lower.includes('403') || lower.includes('unauthorized') || lower.includes('forbidden')) return 'auth_expired';
  if (lower.includes('500') || lower.includes('502') || lower.includes('503') || lower.includes('server') || lower.includes('econnrefused') || lower.includes('enotfound')) return 'api_down';
  if (lower.includes('cancelled') || lower.includes('dismiss') || lower.includes('backed out')) return 'user_cancelled';
  if (lower.includes('expired') || lower.includes('mismatch')) return 'flow_expired';
  return 'unknown';
}
