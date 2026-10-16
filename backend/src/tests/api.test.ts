import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import { connectDatabase } from '../lib/database.js';
import { User } from '../models/User.js';
import { Task } from '../models/Task.js';
import type { AppConfig } from '../config/env.js';

const origin = 'http://localhost:5173';
const password = 'Testing-Only-Password!42';
let mongo: MongoMemoryServer;
let runtime: ReturnType<typeof createApp>;
let config: AppConfig;
let alice: ReturnType<typeof request.agent>;
let bob: ReturnType<typeof request.agent>;
let ownerId: string;

async function makeTask(values = {}) {
  const response = await alice
    .post('/api/tasks')
    .set('Origin', origin)
    .send({ title: 'Docker baseline', ...values });
  expect(response.status).toBe(201);
  return response.body.data;
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create({ instance: { dbName: 'taskflow_isolated_test' } });
  config = {
    NODE_ENV: 'test',
    PORT: 4000,
    MONGODB_URI: mongo.getUri(),
    SESSION_SECRET: 'test-only-session-secret-at-least-32-chars',
    COOKIE_SECURE: false,
    CLIENT_ORIGIN: origin,
    TRUST_PROXY: 0,
    LOG_LEVEL: 'silent',
  };
  await connectDatabase(config.MONGODB_URI);
  await Promise.all([User.createIndexes(), Task.createIndexes()]);
  runtime = createApp(config);
  alice = request.agent(runtime.app);
  bob = request.agent(runtime.app);
  const a = await alice
    .post('/api/auth/register')
    .set('Origin', origin)
    .send({ name: 'Alice', email: 'alice@example.com', password });
  expect(a.status).toBe(201);
  ownerId = a.body.data.id;
  const b = await bob
    .post('/api/auth/register')
    .set('Origin', origin)
    .send({ name: 'Bob', email: 'bob@example.com', password });
  expect(b.status).toBe(201);
});
beforeEach(async () => {
  await Task.deleteMany({});
});
afterAll(async () => {
  await runtime?.store.close();
  await mongoose.disconnect();
  await mongo?.stop();
});

describe('authentication and session security', () => {
  it('registers with a normalized unique email and never returns password hashes', async () => {
    const response = await request(runtime.app)
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({ name: 'New User', email: '  NEW@example.com  ', password });
    expect(response.status).toBe(201);
    expect(response.body.data.email).toBe('new@example.com');
    expect(response.body.data).not.toHaveProperty('passwordHash');
    expect(response.headers['set-cookie'][0]).toMatch(/HttpOnly/);
    expect(response.headers['set-cookie'][0]).toMatch(/SameSite=Lax/);
    const stored = await User.findOne({ email: 'new@example.com' }).select('+passwordHash');
    expect(stored?.passwordHash).not.toBe(password);
    const duplicate = await request(runtime.app)
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({ name: 'Other', email: 'new@example.com', password });
    expect(duplicate.status).toBe(409);
  });
  it('restores the current user and rejects anonymous access', async () => {
    expect((await alice.get('/api/auth/me')).body.data.name).toBe('Alice');
    expect((await request(runtime.app).get('/api/auth/me')).status).toBe(401);
    expect((await request(runtime.app).get('/api/tasks')).status).toBe(401);
    expect((await request(runtime.app).get('/api/dashboard/summary')).status).toBe(401);
  });
  it('logs in, rotates session ID, logs out and revokes the old cookie', async () => {
    const agent = request.agent(runtime.app);
    const login = await agent
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: 'alice@example.com', password });
    expect(login.status).toBe(200);
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    const login2 = await agent
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: 'alice@example.com', password });
    expect(login2.headers['set-cookie'][0].split(';')[0]).not.toBe(cookie);
    expect((await request(runtime.app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
    const currentCookie = login2.headers['set-cookie'][0].split(';')[0];
    expect((await agent.post('/api/auth/logout').set('Origin', origin).send({})).status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    expect(
      (await request(runtime.app).get('/api/auth/me').set('Cookie', currentCookie)).status,
    ).toBe(401);
  });
  it('returns the same login error for unknown emails and wrong passwords', async () => {
    const wrong = await request(runtime.app)
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: 'alice@example.com', password: 'WrongPassword123' });
    const unknown = await request(runtime.app)
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: 'missing@example.com', password });
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });
  it.each([
    { email: 'invalid', password, name: 'A' },
    { email: 'valid@example.com', password: 'short', name: 'A' },
    { email: 'valid@example.com', password, name: '   ' },
    { email: 'valid@example.com', password: 'ệ'.repeat(30), name: 'A' },
  ])('validates registration without crashing: %j', async (payload) => {
    expect(
      (await request(runtime.app).post('/api/auth/register').set('Origin', origin).send(payload))
        .status,
    ).toBe(422);
  });
  it('rejects cross-origin, missing origin, and non-JSON writes', async () => {
    expect(
      (await alice.post('/api/tasks').set('Origin', 'https://evil.example').send({ title: 'bad' }))
        .status,
    ).toBe(403);
    expect((await alice.post('/api/tasks').send({ title: 'bad' })).status).toBe(403);
    expect(
      (await alice.post('/api/tasks').set('Origin', origin).type('form').send({ title: 'bad' }))
        .status,
    ).toBe(415);
  });
  it('rate limits authentication endpoints', async () => {
    const isolated = createApp(config);
    try {
      for (let i = 0; i < 20; i++)
        expect(
          (await request(isolated.app).post('/api/auth/login').set('Origin', origin).send({}))
            .status,
        ).toBe(422);
      expect(
        (await request(isolated.app).post('/api/auth/register').set('Origin', origin).send({}))
          .status,
      ).toBe(429);
    } finally {
      await isolated.store.close();
    }
  });
});

describe('tasks and ownership', () => {
  it('creates, reads, edits, completes, reopens and deletes a task', async () => {
    const created = await makeTask();
    expect(created).toMatchObject({
      title: 'Docker baseline',
      status: 'pending',
      priority: 'medium',
      dueAt: null,
      completedAt: null,
    });
    expect(created).not.toHaveProperty('userId');
    expect((await alice.get('/api/tasks/' + created.id)).body.data.id).toBe(created.id);
    const updated = await alice
      .patch('/api/tasks/' + created.id)
      .set('Origin', origin)
      .send({
        title: '$literal title',
        description: 'new description',
        dueAt: '2026-10-25T10:00:00.000Z',
        priority: 'high',
        status: 'completed',
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.title).toBe('$literal title');
    expect(updated.body.data.dueAt).toBe('2026-10-25T10:00:00.000Z');
    expect(updated.body.data.completedAt).not.toBeNull();
    const completedAt = updated.body.data.completedAt;
    const again = await alice
      .patch('/api/tasks/' + created.id)
      .set('Origin', origin)
      .send({ status: 'completed' });
    expect(again.body.data.completedAt).toBe(completedAt);
    const reopened = await alice
      .patch('/api/tasks/' + created.id)
      .set('Origin', origin)
      .send({ status: 'pending', dueAt: null });
    expect(reopened.body.data.completedAt).toBeNull();
    expect(reopened.body.data.dueAt).toBeNull();
    expect((await alice.delete('/api/tasks/' + created.id).set('Origin', origin)).status).toBe(204);
    expect((await alice.get('/api/tasks/' + created.id)).status).toBe(404);
    expect(await Task.countDocuments({})).toBe(0);
  });
  it('blocks user B from reading, changing, or deleting user A tasks', async () => {
    const task = await makeTask();
    expect((await bob.get('/api/tasks')).body.pagination.total).toBe(0);
    expect((await bob.get('/api/tasks/' + task.id)).status).toBe(404);
    expect(
      (
        await bob
          .patch('/api/tasks/' + task.id)
          .set('Origin', origin)
          .send({ title: 'stolen' })
      ).status,
    ).toBe(404);
    expect(
      (
        await bob
          .delete('/api/tasks/' + task.id)
          .set('Origin', origin)
          .send({})
      ).status,
    ).toBe(404);
    expect((await alice.get('/api/tasks/' + task.id)).body.data.title).toBe('Docker baseline');
  });
  it('rejects injected ownership and unknown update fields', async () => {
    expect(
      (
        await alice
          .post('/api/tasks')
          .set('Origin', origin)
          .send({ title: 'invalid', userId: new mongoose.Types.ObjectId() })
      ).status,
    ).toBe(422);
    const task = await makeTask();
    expect(
      (
        await alice
          .patch('/api/tasks/' + task.id)
          .set('Origin', origin)
          .send({ userId: new mongoose.Types.ObjectId() })
      ).status,
    ).toBe(422);
  });
  it.each([
    { title: ' ' },
    { title: 'a'.repeat(121) },
    { title: 'valid', description: 'a'.repeat(2001) },
    { title: 'valid', dueAt: 'not-a-date' },
    { title: 'valid', dueAt: '2026-02-30T12:00:00Z' },
    { title: 'valid', status: 'in_progress' },
    { title: 'valid', priority: 'urgent' },
  ])('validates task input: %j', async (payload) => {
    expect((await alice.post('/api/tasks').set('Origin', origin).send(payload)).status).toBe(422);
    expect((await request(runtime.app).get('/health')).status).toBe(200);
  });
  it('rejects malformed IDs, query injection, oversized limits, and empty patches', async () => {
    expect((await alice.get('/api/tasks/not-an-id')).status).toBe(422);
    expect((await alice.get('/api/tasks?limit=101')).status).toBe(422);
    expect((await alice.get('/api/tasks?page=0')).status).toBe(422);
    expect((await alice.get('/api/tasks?status[$ne]=completed')).status).toBe(422);
    const task = await makeTask();
    expect(
      (
        await alice
          .patch('/api/tasks/' + task.id)
          .set('Origin', origin)
          .send({})
      ).status,
    ).toBe(422);
  });
  it('filters, searches literal regex characters, sorts and paginates within the owner', async () => {
    await makeTask({ title: 'Docker [test]', dueAt: '2026-10-25T10:00:00Z' });
    await makeTask({ title: 'Docker completed', status: 'completed' });
    await makeTask({ title: 'Alpha' });
    await bob.post('/api/tasks').set('Origin', origin).send({ title: 'Docker hidden' });
    expect((await alice.get('/api/tasks?status=pending')).body.pagination.total).toBe(2);
    expect((await alice.get('/api/tasks?status=completed')).body.pagination.total).toBe(1);
    expect((await alice.get('/api/tasks?search=Docker')).body.pagination.total).toBe(2);
    expect((await alice.get('/api/tasks?search=%5Btest%5D')).body.pagination.total).toBe(1);
    const page = await alice.get('/api/tasks?sort=title_asc&limit=2&page=1');
    expect(page.body.data[0].title).toBe('Alpha');
    expect(page.body.pagination).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
    expect((await alice.get('/api/tasks?limit=2&page=2')).body.data).toHaveLength(1);
  });
});

describe('dashboard and operational baseline', () => {
  it('reports real per-user counts and a zero completion rate when empty', async () => {
    const empty = await alice.get('/api/dashboard/summary');
    expect(empty.body.data).toMatchObject({
      total: 0,
      completed: 0,
      pending: 0,
      overdue: 0,
      completionRate: 0,
    });
    await makeTask({ title: 'Overdue', dueAt: '2020-01-01T00:00:00Z' });
    await makeTask({ title: 'Completed', status: 'completed', dueAt: '2020-01-01T00:00:00Z' });
    await makeTask({ title: 'No deadline' });
    const summary = await alice.get('/api/dashboard/summary');
    expect(summary.body.data).toMatchObject({
      total: 3,
      completed: 1,
      pending: 2,
      overdue: 1,
      completionRate: 33,
    });
    expect(summary.body.data.upcoming).toHaveLength(1);
    expect((await bob.get('/api/dashboard/summary')).body.data.total).toBe(0);
  });
  it('keeps tasks and login sessions across fresh application instances', async () => {
    const agent = request.agent(runtime.app);
    const logged = await agent
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: 'alice@example.com', password });
    expect(logged.status).toBe(200);
    const cookie = logged.headers['set-cookie'][0].split(';')[0];
    const task = await makeTask();
    const replacement = createApp(config);
    try {
      expect(
        (await request(replacement.app).get('/api/auth/me').set('Cookie', cookie)).body.data.id,
      ).toBe(ownerId);
      expect(
        (
          await request(replacement.app)
            .get('/api/tasks/' + task.id)
            .set('Cookie', cookie)
        ).body.data.title,
      ).toBe('Docker baseline');
    } finally {
      await replacement.store.close();
    }
  });
  it('serves health without a session and returns 503 while the DB is disconnected', async () => {
    const health = await request(runtime.app).get('/health');
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: 'ok', database: 'connected' });
    expect(health.headers['set-cookie']).toBeUndefined();
    await mongoose.disconnect();
    const degraded = await request(runtime.app).get('/health');
    expect(degraded.status).toBe(503);
    expect(degraded.body).toEqual({ status: 'degraded' });
    await connectDatabase(config.MONGODB_URI);
  });
  it('handles invalid JSON and adds safe headers + unique request IDs', async () => {
    const invalid = await alice
      .post('/api/tasks')
      .set('Origin', origin)
      .set('Content-Type', 'application/json')
      .send('{');
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('INVALID_BODY');
    const a = await request(runtime.app).get('/health');
    const b = await request(runtime.app).get('/health');
    expect(a.headers['x-content-type-options']).toBe('nosniff');
    expect(a.headers['x-request-id']).toBeTruthy();
    expect(a.headers['x-request-id']).not.toBe(b.headers['x-request-id']);
    expect(a.headers['x-powered-by']).toBeUndefined();
  });
});
