import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError, body } from '../lib/api';
import { taskDue } from '../lib/workflow';
import type { Task, TaskInput } from '../types';
export async function refreshTasks(client: QueryClient) {
  await Promise.all([
    client.invalidateQueries({ queryKey: ['tasks'] }),
    client.invalidateQueries({ queryKey: ['dashboard'] }),
  ]);
}
export function useTaskMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ task, values }: { task: Task; values: Partial<TaskInput> }) =>
      api<{ data: Task }>('/api/tasks/' + task.id, {
        method: 'PATCH',
        body: body({ ...values, expectedRevision: task.revision ?? 0 }),
      }),
    onSuccess: async (result, { task, values }) => {
      await refreshTasks(client);
      if (result.data.revision === task.revision) return;
      const undo: Partial<TaskInput> = {};
      if (values.status !== undefined) undo.status = task.status;
      if (values.priority !== undefined) undo.priority = task.priority;
      if (values.due !== undefined) undo.due = taskDue(task);
      if (values.title !== undefined) undo.title = task.title;
      if (values.description !== undefined) undo.description = task.description;
      const expires = Date.now() + 7000;
      toast.success('Đã cập nhật công việc', {
        duration: 7000,
        description: 'Có 7 giây để hoàn tác',
        action: {
          label: 'Hoàn tác',
          onClick: () => {
            if (Date.now() > expires) return;
            void api('/api/tasks/' + task.id, {
              method: 'PATCH',
              body: body({ ...undo, expectedRevision: result.data.revision }),
            })
              .then(() => {
                toast.success('Đã hoàn tác');
                return refreshTasks(client);
              })
              .catch((error: Error) => {
                toast.error(
                  error instanceof ApiError && error.status === 409
                    ? 'Công việc đã thay đổi. Hãy tải lại trước khi chỉnh sửa.'
                    : error.message,
                );
                void refreshTasks(client);
              });
          },
        },
      });
    },
    onError: (error) =>
      toast.error(error.message, {
        action:
          error instanceof ApiError && error.status === 409
            ? {
                label: 'Tải lại',
                onClick: () => {
                  void refreshTasks(client);
                },
              }
            : undefined,
      }),
  });
}
