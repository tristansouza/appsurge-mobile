import { useQuery } from '@tanstack/react-query';
import { getAnalytics, getConnections, getReviewPosts } from '../lib/dataSource';

export function usePosts() {
  return useQuery({ queryKey: ['posts'], queryFn: getReviewPosts });
}

export function useConnections() {
  return useQuery({ queryKey: ['connections'], queryFn: getConnections });
}

export function useAnalytics() {
  return useQuery({ queryKey: ['analytics'], queryFn: () => getAnalytics() });
}
