export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: { field: string; message: string }[] = [],
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Không thể kết nối máy chủ. Hãy kiểm tra kết nối và thử lại.',
    );
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const error = new ApiError(
      response.status,
      data?.error?.code ?? 'SERVER_ERROR',
      data?.error?.message ?? 'Máy chủ chưa sẵn sàng. Vui lòng thử lại.',
      data?.error?.details,
    );
    if (response.status === 401 && !path.startsWith('/api/auth/'))
      window.dispatchEvent(new Event('taskflow:session-expired'));
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export const body = (value: unknown) => JSON.stringify(value);
