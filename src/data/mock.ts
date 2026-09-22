import { AnalyticsPoint, Connection, Post } from '../types';

// Demo dates are relative to "today" so the app (and store captures) never
// show stale content — e.g. "Sun, Sep 13".
const dayLabel = (offset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

export const posts: Post[] = [
  { id: '1', platform: 'Instagram', status: 'Needs review', title: 'The 3-second hook', caption: 'Your audience decides in 3 seconds. Here are 3 ways to make them stay. Save this for your next post ✨', date: dayLabel(0), time: '9:00 AM', mediaColor: '#F4C7B6', mediaLabel: 'Creator at work' },
  { id: '2', platform: 'TikTok', status: 'Needs review', title: 'Behind the scenes', caption: 'A little look at what goes into building a brand people remember.', date: dayLabel(1), time: '12:30 PM', mediaColor: '#BCD9D2', mediaLabel: 'Studio desk' },
  { id: '3', platform: 'YouTube', status: 'Scheduled', title: 'Build your content system', caption: 'The repeatable content system we use to turn ideas into momentum.', date: dayLabel(2), time: '10:00 AM', mediaColor: '#C9C0E5', mediaLabel: 'Content planning' },
  { id: '4', platform: 'Instagram', status: 'Scheduled', title: 'Small wins compound', caption: 'The quiet consistency behind every big result.', date: dayLabel(3), time: '8:00 AM', mediaColor: '#EED8A8', mediaLabel: 'Morning light' },
];

export const connections: Connection[] = [
  { platform: 'Instagram', handle: '@appsurge', connected: true, color: '#E76982' },
  { platform: 'TikTok', handle: '@appsurge', connected: true, color: '#262626' },
  { platform: 'YouTube', handle: 'Appsurge', connected: true, color: '#EA4335' },
  { platform: 'Threads', handle: '@appsurge', connected: false, color: '#262626' },
];

export const analytics: AnalyticsPoint[] = Array.from({ length: 7 }, (_, i) => {
  const views = [6200, 8600, 7400, 11800, 10400, 14200, 17600][i];
  const engagement = [3.1, 4.2, 3.8, 5.1, 4.7, 6.2, 7.3][i];
  return { label: dayLabel(i - 6), views, engagement };
});
