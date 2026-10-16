import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, body } from '../lib/api';
import type { Task, TaskInput } from '../types';
export function useTaskMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: Partial<TaskInput> }) =>
      api<{ data: Task }>('/api/tasks/' + id, { method: 'PATCH', body: body(values) }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['tasks'] }),
        client.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      toast.success('Đã cập nhật công việc');
    },
    onError: (error) => toast.error(error.message),
  });
}
