export type Platform = 'Instagram' | 'TikTok' | 'YouTube' | 'X' | 'Threads';
export type PlatformId = 'tiktok' | 'instagram' | 'youtube' | 'threads' | 'x';
export type PostStatus = 'Needs review' | 'Scheduled' | 'Published' | 'Failed';
export type ScheduledStatus = 'scheduled' | 'posted' | 'failed' | 'review';
export type PlanSlotStatus = 'pending' | 'approved' | 'rejected' | 'posted';

export type User = {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  emailVerified: boolean;
};

export type Post = {
  id: string;
  platform: Platform;
  status: PostStatus;
  title: string;
  caption: string;
  date: string;
  time: string;
  mediaColor: string;
  mediaLabel: string;
  /** Generated slideshow images (base64 data URLs from Workers AI FLUX). */
  slides?: string[];
  views?: string;
  engagement?: string;
};

export type ScheduledVideo = {
  id: string;
  platform: PlatformId;
  scheduledAt: string;
  status: ScheduledStatus;
  caption: string;
  mediaUrl?: string;
  hashtags: string[];
  hook?: string;
  format?: 'portrait' | 'landscape' | 'square';
};

export type AutopostSlot = {
  platform: PlatformId;
  day: number;
  hook: string;
  caption: string;
  status: PlanSlotStatus;
  scheduledAt?: string;
};

export type AutopostPlan = {
  slots: AutopostSlot[];
  generatedAt: string;
};

export type Connection = {
  platform: Platform;
  handle: string;
  connected: boolean;
  color: string;
};

export type AnalyticsPoint = {
  label: string;
  views: number;
  engagement: number;
};

export type AnalyticsSummary = {
  totalViews: number;
  engagementRate: number;
  followerGrowth: number;
  delta: number;
  points: AnalyticsPoint[];
};

/** What happened — drives the icon/text on the Updates tab. */
export type ActivityKind =
  | 'post-published'
  | 'post-failed'
  | 'post-scheduled'
  | 'plan-generated'
  | 'plan-approved'
  | 'platform-connected'
  | 'platform-disconnected'
  | 'app-registered'
  | 'note';

/** Where the event came from — the Updates tab tags each row. */
export type ActivitySource = 'desktop' | 'mobile' | 'system';

/**
 * One row on the Updates tab. Written to `users/{uid}/activity/{eventId}` by
 * BOTH clients (see docs/DESKTOP-SYNC-CONTRACT.md for the desktop side).
 */
export type ActivityEvent = {
  id: string;
  kind: ActivityKind;
  /** Platform id (tiktok/instagram/youtube/threads) when relevant. */
  platform?: string;
  /** Short headline, e.g. "Published to TikTok". */
  title: string;
  /** One-line detail, e.g. the post hook or failure reason. */
  body: string;
  /** Firestore timestamp — set by the writer. */
  createdAt?: unknown;
  /** Unread rows show a dot; cleared by markActivityRead. */
  read?: boolean;
  source: ActivitySource;
};
