export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}
export type TaskStatus = 'pending' | 'completed';
export type TaskPriority = 'low' | 'medium' | 'high';
export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isOverdue: boolean;
}
export interface TaskInput {
  title: string;
  description: string;
  dueAt: string | null;
  status: TaskStatus;
  priority: TaskPriority;
}
export interface TaskList {
  data: Task[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}
export interface Summary {
  total: number;
  completed: number;
  pending: number;
  overdue: number;
  completionRate: number;
  upcoming: Task[];
}
