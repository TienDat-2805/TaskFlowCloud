import type { RequestHandler } from 'express';
import { ApiError } from '../lib/errors.js';

declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.session.userId)
    throw new ApiError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập để tiếp tục.');
  next();
};
