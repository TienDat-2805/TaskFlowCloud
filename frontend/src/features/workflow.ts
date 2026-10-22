import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
export function useWorkflow(requested = true) {
  const query = useQuery({
    queryKey: ['features'],
    queryFn: () => api<{ data: { workflow: boolean; requireRevision: boolean } }>('/api/features'),
    enabled: requested,
    staleTime: 60_000,
    retry: 1,
  });
  return {
    enabled: query.data?.data.workflow,
    known: query.data !== undefined,
    ready: query.data !== undefined && !query.isError,
    loading: query.isPending,
    error: query.error,
    retry: query.refetch,
  };
}
