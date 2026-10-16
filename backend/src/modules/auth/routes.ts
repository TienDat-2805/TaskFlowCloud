import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import type { AppConfig } from '../../config/env.js';
import { ApiError } from '../../lib/errors.js';
import { User, publicUser } from '../../models/User.js';
import { requireAuth } from '../../middleware/auth.js';

const password = z
  .string()
  .min(8, 'Mật khẩu cần ít nhất 8 ký tự.')
  .max(72)
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Mật khẩu tối đa 72 byte UTF-8.');
const credentials = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email('Email không hợp lệ.').max(254)),
    password,
  })
  .strict();
const register = credentials.extend({
  name: z.string().trim().min(1, 'Vui lòng nhập họ tên.').max(80),
});
// Fixed hash prevents early-return timing differences when an email is unknown.
const dummyHash = bcrypt.hashSync('not-a-real-user-password', 12);

export function authRoutes(config: AppConfig) {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: { code: 'RATE_LIMITED', message: 'Quá nhiều lần thử. Vui lòng thử lại sau 15 phút.' },
    },
  });

  router.post('/register', limiter, async (req, res) => {
    const data = register.parse(req.body);
    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await User.create({ name: data.name, email: data.email, passwordHash });
    // Registration establishes a session, just like login.
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((e) => (e ? reject(e) : resolve())),
    );
    req.session.userId = String(user._id);
    await new Promise<void>((resolve, reject) =>
      req.session.save((e) => (e ? reject(e) : resolve())),
    );
    res.status(201).json({ data: publicUser(user) });
  });

  router.post('/login', limiter, async (req, res) => {
    const data = credentials.parse(req.body);
    const user = await User.findOne({ email: data.email }).select('+passwordHash');
    const valid = await bcrypt.compare(data.password, user?.passwordHash ?? dummyHash);
    if (!user || !valid)
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.');
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((e) => (e ? reject(e) : resolve())),
    );
    req.session.userId = String(user._id);
    await new Promise<void>((resolve, reject) =>
      req.session.save((e) => (e ? reject(e) : resolve())),
    );
    res.json({ data: publicUser(user) });
  });

  router.get('/me', requireAuth, async (req, res) => {
    const user = await User.findById(req.session.userId);
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Phiên đăng nhập không còn hợp lệ.');
    res.json({ data: publicUser(user) });
  });

  router.post('/logout', requireAuth, async (req, res) => {
    await new Promise<void>((resolve, reject) =>
      req.session.destroy((e) => (e ? reject(e) : resolve())),
    );
    res.clearCookie('tf.sid', {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.COOKIE_SECURE,
      path: '/',
    });
    res.status(204).end();
  });
  return router;
}
