import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import type { User } from '../types';
export const authKey = ['auth'] as const;
export function useUser() {
  return useQuery({
    queryKey: authKey,
    queryFn: async () => {
      try {
        return (await api<{ data: User }>('/api/auth/me')).data;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
    retry: 1,
  });
}
