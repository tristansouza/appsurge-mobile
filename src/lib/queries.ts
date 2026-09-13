import { useQuery } from '@tanstack/react-query';
import { getAnalytics, getConnections, getReviewPosts, getScheduledPosts, getWeeklyPlan } from './dataSource';

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
