export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}
export type TaskStatus = 'pending' | 'in_progress' | 'completed';
export type TaskPriority = 'low' | 'medium' | 'high';
export type DueInput =
  | { mode: 'none' }
  | { mode: 'date'; date: string; timeZone: string }
  | { mode: 'datetime'; at: string; timeZone?: string };
export interface TaskActivity {
  eventId: string;
  at: string;
  type:
    | 'created'
    | 'started'
    | 'status_changed'
    | 'deadline_changed'
    | 'priority_changed'
    | 'title_changed'
    | 'deleted'
    | 'restored';
  from: string | null;
  to: string | null;
  revision: number;
}
export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  completedAt: string | null;
  startedAt: string | null;
  dueMode: 'none' | 'date' | 'datetime';
  dueDate: string | null;
  dueTimeZone: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  isOverdue: boolean;
  dueBucket: 'overdue' | 'today' | 'upcoming' | 'no_due' | 'later' | 'completed';
  deletedAt?: string;
  purgeAt?: string | null;
  activity?: TaskActivity[];
}
export interface TaskInput {
  title: string;
  description: string;
  due: DueInput;
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
  inProgress: number;
  remaining: number;
  overdue: number;
  dueToday: number;
  upcomingCount: number;
  withoutDeadline: number;
  completionRate: number;
  upcoming: Task[];
  attention: Task[];
  today: Task[];
  overdueTasks: Task[];
}
