// Data boundary for every screen. Screens read through these functions so
// the underlying source (Firestore cloud data vs. demo data) can change
// without touching any UI.
//
// Priority: real cloud data from the user's Firestore subtree (written by
// the setup wizard and the platform connect flow). When the cloud has
// nothing for a section — new device, offline, or gateway hiccup — the
// demo dataset keeps the app fully explorable.

import { analytics as demoAnalytics, connections as demoConnections, posts as demoPosts } from '../data/mock';
import {
  loadAppRecord,
  loadConnections as loadCloudConnections,
  loadWeeklyPlan,
} from './cloudStore';
import { AnalyticsPoint, AnalyticsSummary, AutopostPlan, Connection, Platform, PlatformId, Post, ScheduledVideo } from '../types';

const PLATFORM_BY_ID: Record<string, Platform> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  threads: 'Threads',
  x: 'X',
};

function platformLabel(id: string): Platform {
  return PLATFORM_BY_ID[id] ?? 'Instagram';
}

export async function getAppSetup(): Promise<boolean> {
  const record = await loadAppRecord();
  return Boolean(record);
}

export async function getScheduledPosts(): Promise<ScheduledVideo[]> {
  const plan = await loadWeeklyPlan();
  if (plan?.slots?.length) {
    return plan.slots.map((slot, index) => ({
      id: `plan-${slot.day}-${index}`,
      platform: slot.platform as PlatformId,
      scheduledAt: slot.scheduledAt ?? new Date().toISOString(),
      status: slot.status === 'posted' ? 'posted' : slot.status === 'rejected' ? 'failed' : slot.status === 'approved' ? 'scheduled' : 'review',
      caption: slot.caption,
      hashtags: slot.hashtags ?? [],
      hook: slot.hook,
      format: 'portrait',
    }));
  }
  return demoPosts
    .filter((post) => post.status !== 'Needs review')
    .map((post) => ({
      id: post.id,
      platform: post.platform.toLowerCase() as PlatformId,
      scheduledAt: `${post.date} ${post.time}`,
      status: post.status === 'Published' ? 'posted' : post.status === 'Failed' ? 'failed' : 'scheduled',
      caption: post.caption,
      hashtags: [],
      hook: post.title,
      format: 'portrait',
    }));
}

export async function getWeeklyPlan(): Promise<AutopostPlan> {
  const plan = await loadWeeklyPlan();
  if (plan?.slots?.length) {
    return {
      generatedAt: plan.generatedAt,
      slots: plan.slots.map((slot) => ({
        platform: slot.platform as PlatformId,
        day: slot.day,
        hook: slot.hook,
        caption: slot.caption,
        status: slot.status,
        scheduledAt: slot.scheduledAt,
      })),
    };
  }
  return {
    generatedAt: new Date().toISOString(),
    slots: demoPosts
      .filter((post) => post.status === 'Needs review')
      .map((post, index) => ({
        platform: post.platform.toLowerCase() as PlatformId,
        day: index + 1,
        hook: post.title,
        caption: post.caption,
        status: 'pending' as const,
        scheduledAt: `${post.date} ${post.time}`,
      })),
  };
}

export async function getReviewPosts(): Promise<Post[]> {
  const plan = await loadWeeklyPlan();
  if (plan?.slots?.length) {
    return plan.slots.map((slot, index) => ({
      id: `plan-${slot.day}-${index}`,
      platform: platformLabel(slot.platform),
      status: slot.status === 'approved' ? 'Scheduled' : slot.status === 'rejected' ? 'Failed' : slot.status === 'posted' ? 'Published' : 'Needs review',
      title: slot.hook,
      caption: slot.caption,
      date: slot.scheduledAt ? new Date(slot.scheduledAt).toDateString().slice(0, 10) : `Day ${slot.day}`,
      time: slot.scheduledAt ? new Date(slot.scheduledAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '',
      mediaColor: '#EDF4FB',
      mediaLabel: platformLabel(slot.platform),
    }));
  }
  return demoPosts;
}

export async function getAnalytics(platform: string = 'all', dateRange: '7D' | '30D' = '7D'): Promise<AnalyticsSummary> {
  const points = dateRange === '7D' ? demoAnalytics.slice(-7) : demoAnalytics;
  const multiplier = platform === 'all' ? 1 : 0.45;
  const totalViews = Math.round(points.reduce((sum, point) => sum + point.views, 0) * multiplier);
  return { totalViews, engagementRate: 6.8 * multiplier, followerGrowth: 3.4 * multiplier, delta: 24, points };
}

export async function getConnections(): Promise<Connection[]> {
  const cloud = await loadCloudConnections().catch(() => []);
  if (cloud.length) {
    return cloud.map((record) => ({
      platform: platformLabel(record.platform),
      handle: record.handle || 'Connected account',
      connected: Boolean(record.connected),
      color: '#262626',
    }));
  }
  return demoConnections;
}
