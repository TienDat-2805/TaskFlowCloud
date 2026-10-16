import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Vui lòng kiểm tra thông tin đã nhập.',
        details: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
    res.status(409).json({ error: { code: 'EMAIL_EXISTS', message: 'Email đã được sử dụng.' } });
    return;
  }
  if (typeof error === 'object' && error !== null && 'type' in error) {
    if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') {
      res
        .status(error.type === 'entity.too.large' ? 413 : 400)
        .json({ error: { code: 'INVALID_BODY', message: 'Nội dung yêu cầu không hợp lệ.' } });
      return;
    }
  }
  // Request logger records status + request ID without logging secrets from raw driver errors.
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Không thể xử lý yêu cầu. Vui lòng thử lại.' },
  });
};
