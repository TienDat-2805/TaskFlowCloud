import { config } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../.env')], quiet: true });

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\//),
    SESSION_SECRET: z.string().min(32),
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    CLIENT_ORIGIN: z.url().transform((v) => new URL(v).origin),
    TRUST_PROXY: z.coerce.number().int().min(0).max(2).default(0),
    LOG_LEVEL: z.enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug']).default('info'),
  })
  .superRefine((env, ctx) => {
    if (
      env.NODE_ENV === 'production' &&
      (!env.COOKIE_SECURE || !env.CLIENT_ORIGIN.startsWith('https://'))
    ) {
      ctx.addIssue({ code: 'custom', message: 'Production requires HTTPS and secure cookies.' });
    }
    if (env.NODE_ENV === 'production' && env.SESSION_SECRET.startsWith('replace-')) {
      ctx.addIssue({ code: 'custom', message: 'Replace the example session secret.' });
    }
  });

export type AppConfig = z.infer<typeof schema>;

export function readConfig(): AppConfig {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Never print input values: a validation error may contain credentials.
    throw new Error(
      `Invalid environment configuration: ${parsed.error.issues.map((i) => i.path.join('.') || 'production security').join(', ')}`,
    );
  }
  return parsed.data;
}
