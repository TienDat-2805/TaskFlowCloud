import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
export function useWorkflow() {
  const query = useQuery({
    queryKey: ['features'],
    queryFn: () => api<{ data: { workflow: boolean; requireRevision: boolean } }>('/api/features'),
    staleTime: 60_000,
    retry: 1,
  });
  return {
    enabled: query.data?.data.workflow ?? false,
    loading: query.isPending,
    error: query.error,
  };
}
