import { randomUUID } from 'node:crypto';
import { readConfig } from '../src/config/env.js';

const config = readConfig();
const base = process.env.SMOKE_BASE_URL ?? config.CLIENT_ORIGIN;
let cookie = '';
let createdId: string | undefined;
let revision = 0;
let workflow = false;
let trashed = false;
async function call(path: string, method = 'GET', data?: unknown) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Origin: config.CLIENT_ORIGIN,
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  const nextCookie = response.headers.getSetCookie()[0];
  if (nextCookie) cookie = nextCookie.split(';')[0];
  return response;
}
try {
  if (!process.env.SEED_EMAIL || !process.env.SEED_PASSWORD)
    throw new Error('Seed credentials missing');
  const health = await call('/health');
  if (health.status !== 200) throw new Error('Health check failed');
  const login = await call('/api/auth/login', 'POST', {
    email: process.env.SEED_EMAIL,
    password: process.env.SEED_PASSWORD,
  });
  if (login.status !== 200 || !cookie) throw new Error('Demo login failed; run seed first');
  const me = await call('/api/auth/me');
  if (me.status !== 200) throw new Error('Session restore failed');
  const features = await call('/api/features');
  if (features.status !== 200) throw new Error('Feature contract failed');
  workflow = (await features.json()).data.workflow;
  const created = await call('/api/tasks', 'POST', {
    title: 'Smoke check ' + randomUUID(),
    priority: 'high',
  });
  if (created.status !== 201) throw new Error('Create failed');
  createdId = (await created.json()).data.id;
  const updated = await call('/api/tasks/' + createdId, 'PATCH', {
    status: 'completed',
    description: 'Temporary smoke task; deleted by this script.',
    expectedRevision: revision,
  });
  if (updated.status !== 200) throw new Error('Update failed');
  const updatedTask = (await updated.json()).data;
  if (!updatedTask.completedAt) throw new Error('Completion timestamp missing');
  revision = updatedTask.revision;
  const detail = await call('/api/tasks/' + createdId);
  if (detail.status !== 200 || (await detail.json()).data.status !== 'completed')
    throw new Error('Read-after-write failed');
  const invalid = await call('/api/tasks', 'POST', { title: ' ' });
  if (invalid.status !== 422) throw new Error('Validation failed');
  const summary = await call('/api/dashboard/summary');
  if (summary.status !== 200) throw new Error('Dashboard failed');
  const deleted = await call('/api/tasks/' + createdId, 'DELETE', { expectedRevision: revision });
  if (deleted.status !== 204) throw new Error('Delete failed');
  revision++;
  trashed = workflow;
  if (workflow) {
    const restore = await call('/api/tasks/' + createdId + '/restore', 'POST', {
      expectedRevision: revision,
    });
    if (restore.status !== 200) throw new Error('Restore failed');
    revision = (await restore.json()).data.revision;
    trashed = false;
    if (
      (await call('/api/tasks/' + createdId, 'DELETE', { expectedRevision: revision })).status !==
      204
    )
      throw new Error('Second soft delete failed');
    revision++;
    trashed = true;
    if (
      (
        await call('/api/tasks/' + createdId + '/permanent', 'DELETE', {
          expectedRevision: revision,
        })
      ).status !== 204
    )
      throw new Error('Permanent cleanup failed');
  }
  createdId = undefined;
  if ((await call('/api/auth/logout', 'POST', {})).status !== 204) throw new Error('Logout failed');
  if ((await call('/api/auth/me')).status !== 401) throw new Error('Session revocation failed');
  console.log(
    'Live smoke passed: health, login, session, create/read/update/delete, validation, dashboard, logout.',
  );
} catch (error) {
  console.error('Live smoke failed: ' + (error instanceof Error ? error.message : 'unknown error'));
  process.exitCode = 1;
} finally {
  // Only remove the one temporary task created by this run, never pre-existing data.
  if (createdId) {
    const cleanup = await call(
      '/api/tasks/' + createdId + (trashed ? '/permanent' : ''),
      'DELETE',
      { expectedRevision: revision },
    ).catch(() => undefined);
    if (cleanup?.status === 204 && workflow && !trashed) {
      await call('/api/tasks/' + createdId + '/permanent', 'DELETE', {
        expectedRevision: revision + 1,
      }).catch(() => undefined);
    }
    if (cleanup?.status !== 204)
      console.error('Temporary task cleanup could not finish; inspect demo account.');
  }
}
