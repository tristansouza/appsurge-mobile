import { useQuery } from '@tanstack/react-query';
import { getAnalytics, getConnections, getReviewPosts, getScheduledPosts, getWeeklyPlan } from './dataSource';
import { loadActivity } from './cloudStore';
import type { ActivityEvent } from '../types';

export function useActivityFeed() {
  return useQuery({
    queryKey: ['activity'],
    queryFn: () => loadActivity(),
    // Desktop events land while the app is closed — refresh on every focus.
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
}

export type { ActivityEvent };

export function useReviewPosts() {
  return useQuery({ queryKey: ['review-posts'], queryFn: getReviewPosts });
}

export function useWeeklyPlan() {
  return useQuery({ queryKey: ['weekly-plan'], queryFn: getWeeklyPlan });
}

export function useScheduledPosts() {
  return useQuery({ queryKey: ['scheduled-posts'], queryFn: getScheduledPosts });
}

export function useConnectionsData() {
  return useQuery({ queryKey: ['connections'], queryFn: getConnections });
}

export function useAnalyticsData(platform: string, range: '7D' | '30D') {
  return useQuery({ queryKey: ['analytics', platform, range], queryFn: () => getAnalytics(platform, range) });
}
