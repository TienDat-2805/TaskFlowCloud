import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import helmet from 'helmet';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from './config/env.js';
import { databaseReady } from './lib/database.js';
import { ApiError, errorHandler } from './lib/errors.js';
import { authRoutes } from './modules/auth/routes.js';
import { taskRoutes } from './modules/tasks/routes.js';
import { dashboardRoutes } from './modules/dashboard/routes.js';

export function createApp(config: AppConfig) {
  const app = express();
  const logger = pino({ level: config.LOG_LEVEL, base: undefined });
  const store = MongoStore.create({
    mongoUrl: config.MONGODB_URI,
    ttl: 7 * 24 * 60 * 60,
    autoRemove: 'native',
    mongoOptions: { serverSelectionTimeoutMS: 5000 },
  });
  store.on('error', () =>
    logger.error({ code: 'SESSION_STORE_ERROR' }, 'Session store unavailable'),
  );
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);
  app.use(helmet());
  app.use((req, res, next) => {
    const requestId = randomUUID();
    const requestPath = req.path;
    const started = performance.now();
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('Cache-Control', 'no-store');
    res.on('finish', () => {
      const fields = {
        requestId,
        method: req.method,
        path: requestPath,
        statusCode: res.statusCode,
        durationMs: Math.round(performance.now() - started),
      };
      if (res.statusCode >= 500) logger.error(fields, 'Request failed');
      else logger.info(fields, 'Request completed');
    });
    next();
  });
  app.get('/health', async (_req, res) => {
    const ready = await databaseReady();
    res
      .status(ready ? 200 : 503)
      .json(ready ? { status: 'ok', database: 'connected' } : { status: 'degraded' });
  });
  app.use('/api', (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      let origin = req.get('Origin');
      if (!origin && req.get('Referer')) {
        try {
          origin = new URL(req.get('Referer')!).origin;
        } catch {
          /* Invalid referer is rejected below. */
        }
      }
      if (origin !== config.CLIENT_ORIGIN)
        throw new ApiError(403, 'INVALID_ORIGIN', 'Nguồn yêu cầu không hợp lệ.');
      if (req.method !== 'DELETE' && !req.is('application/json'))
        throw new ApiError(415, 'JSON_REQUIRED', 'Yêu cầu phải có Content-Type application/json.');
    }
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.use(
    session({
      store,
      name: 'tf.sid',
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: config.COOKIE_SECURE,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      },
    }),
  );
  app.use('/api/auth', authRoutes(config));
  app.use('/api/tasks', taskRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use((_req, _res) => {
    throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy đường dẫn.');
  });
  app.use(errorHandler);
  return { app, store, logger };
}
