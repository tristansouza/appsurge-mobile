import { AnalyticsPoint, Connection, Post } from '../types';

export const posts: Post[] = [
  { id: '1', platform: 'Instagram', status: 'Needs review', title: 'The 3-second hook', caption: 'Your audience decides in 3 seconds. Here are 3 ways to make them stay. Save this for your next post ✨', date: 'Tue, Oct 15', time: '9:00 AM', mediaColor: '#F4C7B6', mediaLabel: 'Creator at work' },
  { id: '2', platform: 'TikTok', status: 'Needs review', title: 'Behind the scenes', caption: 'A little look at what goes into building a brand people remember.', date: 'Wed, Oct 16', time: '12:30 PM', mediaColor: '#BCD9D2', mediaLabel: 'Studio desk' },
  { id: '3', platform: 'YouTube', status: 'Scheduled', title: 'Build your content system', caption: 'The repeatable content system we use to turn ideas into momentum.', date: 'Thu, Oct 17', time: '10:00 AM', mediaColor: '#C9C0E5', mediaLabel: 'Content planning' },
  { id: '4', platform: 'Instagram', status: 'Scheduled', title: 'Small wins compound', caption: 'The quiet consistency behind every big result.', date: 'Fri, Oct 18', time: '8:00 AM', mediaColor: '#EED8A8', mediaLabel: 'Morning light' },
  { id: '5', platform: 'X', status: 'Published', title: 'A better content week', caption: 'Less scrambling. More signal. A simple weekly plan changes everything.', date: 'Mon, Oct 14', time: '11:30 AM', mediaColor: '#D8D0C6', mediaLabel: 'Workspace' },
];

export const connections: Connection[] = [
  { platform: 'Instagram', handle: '@appsurge', connected: true, color: '#E76982' },
  { platform: 'TikTok', handle: '@appsurge', connected: true, color: '#262626' },
  { platform: 'YouTube', handle: 'Appsurge', connected: true, color: '#EA4335' },
  { platform: 'X', handle: '@appsurge', connected: false, color: '#262626' },
  { platform: 'Threads', handle: '@appsurge', connected: false, color: '#262626' },
];

export const analytics: AnalyticsPoint[] = [
  { label: 'Oct 8', views: 6200, engagement: 3.1 },
  { label: 'Oct 9', views: 8600, engagement: 4.2 },
  { label: 'Oct 10', views: 7400, engagement: 3.8 },
  { label: 'Oct 11', views: 11800, engagement: 5.1 },
  { label: 'Oct 12', views: 10400, engagement: 4.7 },
  { label: 'Oct 13', views: 14200, engagement: 6.2 },
  { label: 'Oct 14', views: 17600, engagement: 7.3 },
];
