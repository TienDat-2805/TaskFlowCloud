import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import { connectDatabase } from '../lib/database.js';
import { User } from '../models/User.js';
import { Task } from '../models/Task.js';
import { migrateV02 } from '../modules/tasks/migration.js';

const origin = 'http://localhost:5173';
let mongo: MongoMemoryServer;
let runtime: ReturnType<typeof createApp>;
let alice: ReturnType<typeof request.agent>;
let bob: ReturnType<typeof request.agent>;
let ownerId: string;

async function create(values = {}) {
  const result = await alice
    .post('/api/tasks')
    .set('Origin', origin)
    .send({ title: 'Workflow task', ...values });
  expect(result.status).toBe(201);
  return result.body.data;
}
const patch = (id: string, expectedRevision: number, values: object) =>
  alice
    .patch('/api/tasks/' + id)
    .set('Origin', origin)
    .send({ ...values, expectedRevision });
const remove = (id: string, revision: number) =>
  alice
    .delete('/api/tasks/' + id)
    .set('Origin', origin)
    .set('If-Match', '"v' + revision + '"');
const restore = (id: string, revision: number) =>
  alice
    .post('/api/tasks/' + id + '/restore')
    .set('Origin', origin)
    .send({ expectedRevision: revision });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create({
    instance: {
      dbName: 'taskflow_workflow_test',
      args: ['--setParameter', 'ttlMonitorSleepSecs=1'],
    },
  });
  await connectDatabase(mongo.getUri());
  await Promise.all([User.createIndexes(), Task.createIndexes()]);
  runtime = createApp({
    NODE_ENV: 'test',
    PORT: 4000,
    MONGODB_URI: mongo.getUri(),
    SESSION_SECRET: 'test-only-session-secret-at-least-32-chars',
    COOKIE_SECURE: false,
    CLIENT_ORIGIN: origin,
    TRUST_PROXY: 0,
    LOG_LEVEL: 'silent',
    TASKFLOW_V02_ENABLED: true,
    REQUIRE_TASK_REVISION: true,
  });
  alice = request.agent(runtime.app);
  bob = request.agent(runtime.app);
  for (const [agent, name] of [
    [alice, 'Alice'],
    [bob, 'Bob'],
  ] as const) {
    const result = await agent
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({ name, email: name + '@example.com', password: 'Isolated-Workflow-Test!42' });
    expect(result.status).toBe(201);
    if (name === 'Alice') ownerId = result.body.data.id;
  }
});
beforeEach(async () => {
  await Task.deleteMany({});
});
afterEach(() => {
  vi.useRealTimers();
});
afterAll(async () => {
  await runtime?.store.close();
  await mongoose.disconnect();
  await mongo?.stop();
});

describe('workflow mutations', () => {
  it('preserves the first start, clears completion on reopen, and leaves repeated status untouched', async () => {
    const task = await create();
    expect(task).toMatchObject({
      status: 'pending',
      startedAt: null,
      completedAt: null,
      revision: 0,
    });
    const start = await patch(task.id, 0, { status: 'in_progress' });
    expect(start.status).toBe(200);
    expect(start.headers.etag).toBe('"v1"');
    expect(start.body.data.startedAt).toBeTruthy();
    const repeat = await patch(task.id, 1, { status: 'in_progress' });
    expect(repeat.body.data).toMatchObject({ revision: 1, updatedAt: start.body.data.updatedAt });
    const done = await patch(task.id, 1, { status: 'completed' });
    expect(done.body.data.completedAt).toBeTruthy();
    const reopen = await patch(task.id, 2, { status: 'pending' });
    expect(reopen.body.data).toMatchObject({
      completedAt: null,
      startedAt: start.body.data.startedAt,
      revision: 3,
    });
    const restart = await patch(task.id, 3, { status: 'in_progress' });
    expect(restart.body.data.startedAt).toBe(start.body.data.startedAt);
    const history = await alice.get('/api/tasks/' + task.id + '/activity');
    expect(history.body.data.map((event: { type: string }) => event.type)).toEqual([
      'status_changed',
      'status_changed',
      'status_changed',
      'started',
      'created',
    ]);
    const direct = await create({ status: 'completed' });
    expect(direct.startedAt).toBeNull();
    expect(direct.completedAt).toBeTruthy();
  });

  it('accepts one concurrent mutation and reports a stale revision without losing its activity', async () => {
    const task = await create();
    const results = await Promise.all([
      patch(task.id, 0, { title: 'First change' }),
      patch(task.id, 0, { title: 'Second change' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)?.body.error.code).toBe('TASK_CONFLICT');
    const stored = await Task.findById(task.id).lean();
    expect(stored?.revision).toBe(1);
    expect(stored?.activity).toHaveLength(2);
    expect(stored?.activity?.[1]).toMatchObject({
      type: 'title_changed',
      to: stored?.title,
      revision: 1,
    });
  });

  it('requires revisions, rejects conflicting headers and prevents mass assignment', async () => {
    const task = await create();
    expect(
      (
        await alice
          .patch('/api/tasks/' + task.id)
          .set('Origin', origin)
          .send({ title: 'Missing revision' })
      ).status,
    ).toBe(422);
    expect(
      (
        await alice
          .patch('/api/tasks/' + task.id)
          .set('Origin', origin)
          .set('If-Match', '"v1"')
          .send({ title: 'Mismatch', expectedRevision: 0 })
      ).status,
    ).toBe(422);
    for (const values of [
      { revision: 12 },
      { userId: ownerId },
      { activity: [] },
      { deletedAt: new Date() },
      { status: 'unknown' },
    ]) {
      expect((await patch(task.id, 0, { title: 'No change', ...values })).status).toBe(422);
    }
    const result = await alice
      .patch('/api/tasks/' + task.id)
      .set('Origin', origin)
      .set('If-Match', '"v0"')
      .send({ priority: 'high' });
    expect(result.status).toBe(200);
    expect((await patch(task.id, 0, { priority: 'low' })).status).toBe(409);
  });

  it('updates deadline metadata atomically and rejects mixed legacy/new payloads', async () => {
    const task = await create({
      due: { mode: 'date', date: '2026-10-25', timeZone: 'Asia/Ho_Chi_Minh' },
    });
    expect(task).toMatchObject({
      dueMode: 'date',
      dueDate: '2026-10-25',
      dueAt: '2026-10-25T16:59:59.999Z',
    });
    const same = await patch(task.id, 0, {
      due: { mode: 'date', date: '2026-10-25', timeZone: 'Asia/Ho_Chi_Minh' },
    });
    expect(same.body.data.revision).toBe(0);
    expect((await patch(task.id, 0, { due: { mode: 'none' }, dueAt: null })).status).toBe(422);
    const changed = await patch(task.id, 0, { dueAt: '2026-10-25T08:00:00.000Z' });
    expect(changed.body.data).toMatchObject({
      dueMode: 'datetime',
      dueDate: null,
      dueTimeZone: null,
      revision: 1,
    });
    const cleared = await patch(task.id, 1, { due: { mode: 'none' } });
    expect(cleared.body.data).toMatchObject({ dueMode: 'none', dueAt: null, revision: 2 });
  });

  it('bounds history to 100 newest events and never copies the description into events', async () => {
    const task = await create({ description: 'PRIVATE_DESCRIPTION_CONTENT' });
    const events = Array.from({ length: 100 }, (_, index) => ({
      eventId: String(index),
      at: new Date(),
      type: 'title_changed',
      from: 'a',
      to: 'b',
      revision: 0,
    }));
    await Task.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(task.id) },
      { $set: { activity: events } },
    );
    expect(
      (
        await patch(task.id, 0, {
          title: 'New title',
          priority: 'high',
          description: 'SECOND_PRIVATE_DESCRIPTION',
        })
      ).status,
    ).toBe(200);
    const history = await alice.get('/api/tasks/' + task.id + '/activity?limit=100');
    expect(history.body.data).toHaveLength(100);
    expect(history.body.data.slice(0, 2).map((e: { revision: number }) => e.revision)).toEqual([
      1, 1,
    ]);
    expect(history.body.data[99].eventId).toBe('2');
    expect(JSON.stringify(history.body)).not.toContain('PRIVATE_DESCRIPTION');
    expect((await alice.get('/api/tasks/' + task.id + '/activity?limit=101')).status).toBe(422);
  });
});

describe('trash and owner isolation', () => {
  it('hides deleted tasks and restores their data and history with no purge timestamp', async () => {
    const task = await create({ status: 'in_progress', dueAt: '2026-10-25T08:00:00.000Z' });
    expect((await remove(task.id, 0)).status).toBe(204);
    expect((await alice.get('/api/tasks/' + task.id)).status).toBe(404);
    expect((await alice.get('/api/tasks/' + task.id + '/activity')).status).toBe(404);
    expect((await patch(task.id, 1, { title: 'Forbidden' })).status).toBe(404);
    expect((await alice.get('/api/tasks')).body.pagination.total).toBe(0);
    expect((await alice.get('/api/dashboard/summary')).body.data.total).toBe(0);
    const trash = await alice.get('/api/tasks/trash');
    expect(trash.body.data).toHaveLength(1);
    expect(trash.body.data[0].revision).toBe(1);
    const stored = await Task.findById(task.id).lean();
    expect(stored!.purgeAt!.getTime() - stored!.deletedAt!.getTime()).toBe(30 * 86_400_000);
    expect((await restore(task.id, 0)).status).toBe(409);
    const restored = await restore(task.id, 1);
    expect(restored.status).toBe(200);
    expect(restored.body.data).toMatchObject({
      status: 'in_progress',
      startedAt: task.startedAt,
      dueAt: task.dueAt,
      revision: 2,
    });
    expect(await Task.collection.findOne({ _id: stored!._id })).not.toHaveProperty('purgeAt');
    const detail = await alice.get('/api/tasks/' + task.id);
    expect(detail.body.data.activity.map((event: { type: string }) => event.type)).toEqual([
      'restored',
      'deleted',
      'created',
    ]);
  });

  it('rejects other owners across active detail, history, trash, restore and purge', async () => {
    const task = await create();
    for (const suffix of ['', '/activity'])
      expect((await bob.get('/api/tasks/' + task.id + suffix)).status).toBe(404);
    expect(
      (
        await bob
          .patch('/api/tasks/' + task.id)
          .set('Origin', origin)
          .send({ title: 'Other owner', expectedRevision: 0 })
      ).status,
    ).toBe(404);
    expect(
      (
        await bob
          .delete('/api/tasks/' + task.id)
          .set('Origin', origin)
          .send({ expectedRevision: 0 })
      ).status,
    ).toBe(404);
    await remove(task.id, 0);
    expect((await bob.get('/api/tasks/trash')).body.pagination.total).toBe(0);
    expect((await bob.get('/api/tasks/trash/' + task.id)).status).toBe(404);
    expect(
      (
        await bob
          .post('/api/tasks/' + task.id + '/restore')
          .set('Origin', origin)
          .send({ expectedRevision: 1 })
      ).status,
    ).toBe(404);
    expect(
      (
        await bob
          .delete('/api/tasks/' + task.id + '/permanent')
          .set('Origin', origin)
          .send({ expectedRevision: 1 })
      ).status,
    ).toBe(404);
  });

  it('blocks expired restores and permanently deletes only a trashed task at its current revision', async () => {
    const task = await create();
    const purge = (revision: number) =>
      alice
        .delete('/api/tasks/' + task.id + '/permanent')
        .set('Origin', origin)
        .send({ expectedRevision: revision });
    expect((await purge(0)).status).toBe(404);
    await remove(task.id, 0);
    await Task.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(task.id) },
      { $set: { purgeAt: new Date(Date.now() - 1000) } },
    );
    expect((await restore(task.id, 1)).status).toBe(404);
    expect((await purge(0)).status).toBe(409);
    expect((await purge(1)).status).toBe(204);
    expect(await Task.countDocuments({})).toBe(0);
  });
});

describe('frozen-time list and dashboard agreement', () => {
  it('keeps bucket boundaries, AND filters, ranking, pagination and dashboard counts consistent', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T05:00:00Z'));
    const fixtures = [
      { title: 'Old overdue', dueAt: '2026-10-24T04:00:00Z', priority: 'low' },
      {
        title: 'New overdue',
        dueAt: '2026-10-25T04:59:59.999Z',
        priority: 'high',
        status: 'in_progress',
      },
      { title: 'Today now', dueAt: '2026-10-25T05:00:00Z' },
      { title: 'Today end', dueAt: '2026-10-25T16:59:59.999Z' },
      { title: 'Upcoming start', dueAt: '2026-10-25T17:00:00Z' },
      { title: 'Upcoming end', dueAt: '2026-11-01T16:59:59.999Z' },
      { title: 'Later', dueAt: '2026-11-01T17:00:00Z' },
      { title: 'No due progress', status: 'in_progress', priority: 'high' },
      { title: 'No due pending' },
      { title: 'Done old', status: 'completed', dueAt: '2020-01-01T00:00:00Z' },
    ];
    for (const values of fixtures) await create(values);
    const deleted = await create({ title: 'Deleted' });
    await remove(deleted.id, 0);
    const zone = '&timeZone=Asia%2FHo_Chi_Minh';
    for (const due of ['overdue', 'today', 'upcoming', 'no_due']) {
      const list = await alice.get('/api/tasks?due=' + due + zone);
      expect(list.body.pagination.total).toBe(2);
      expect(list.body.data.every((task: { dueBucket: string }) => task.dueBucket === due)).toBe(
        true,
      );
    }
    expect(
      (await alice.get('/api/tasks?status=completed&due=overdue' + zone)).body.pagination.total,
    ).toBe(0);
    expect(
      (await alice.get('/api/tasks?status=active&priority=high&due=overdue' + zone)).body.pagination
        .total,
    ).toBe(1);
    const ranked = await alice.get('/api/tasks?status=active&sort=attention&limit=4' + zone);
    expect(ranked.body.data.map((task: { title: string }) => task.title)).toEqual([
      'Old overdue',
      'New overdue',
      'Today now',
      'Today end',
    ]);
    const next = await alice.get('/api/tasks?status=active&sort=attention&limit=4&page=2' + zone);
    expect(next.body.data[0].title).toBe('No due progress');
    const summary = (await alice.get('/api/dashboard/summary?timeZone=Asia%2FHo_Chi_Minh')).body
      .data;
    expect(summary).toMatchObject({
      total: 10,
      pending: 7,
      inProgress: 2,
      completed: 1,
      remaining: 9,
      overdue: 2,
      dueToday: 2,
      upcomingCount: 2,
      withoutDeadline: 2,
      completionRate: 10,
    });
    expect(summary.upcoming.map((task: { title: string }) => task.title)).toEqual([
      'Upcoming start',
      'Upcoming end',
    ]);
    expect(summary.attention.map((task: { id: string }) => task.id)).toEqual(
      [...ranked.body.data, next.body.data[0]].map((task: { id: string }) => task.id),
    );
    expect((await alice.get('/api/tasks?timeZone=Invalid%2FZone')).status).toBe(422);
  });
});

describe('legacy migration on isolated MongoDB', () => {
  const legacy = () => ({
    _id: new mongoose.Types.ObjectId(),
    userId: new mongoose.Types.ObjectId(ownerId),
    title: 'Legacy task',
    description: '',
    status: 'completed',
    priority: 'medium',
    dueAt: new Date('2026-10-25T08:00:00Z'),
    completedAt: new Date('2026-10-20T08:00:00Z'),
    createdAt: new Date('2026-10-01T08:00:00Z'),
    updatedAt: new Date('2026-10-20T08:00:00Z'),
  });

  it('dry-runs without writes, backfills idempotently and preserves timestamps and empty history', async () => {
    const task = legacy();
    await Task.collection.insertOne(task);
    const read = await alice.get('/api/tasks/' + task._id);
    expect(read.body.data).toMatchObject({ revision: 0, dueMode: 'datetime', activity: [] });
    expect(await Task.collection.findOne({ _id: task._id })).toEqual(task);
    const dry = await migrateV02();
    expect(dry).toMatchObject({
      mode: 'dry-run',
      modifiedCount: 0,
      ttlInstalled: false,
      before: { tasks: 1, wouldModify: 1, anomalies: [] },
    });
    expect(await Task.collection.findOne({ _id: task._id })).toEqual(task);
    expect(
      (await Task.collection.indexes()).some((index) => index.expireAfterSeconds !== undefined),
    ).toBe(false);
    const applied = await migrateV02({ apply: true, installTtl: false });
    expect(applied.modifiedCount).toBe(1);
    const stored = await Task.collection.findOne({ _id: task._id });
    expect(stored).toMatchObject({
      ...task,
      revision: 0,
      dueMode: 'datetime',
      activity: [],
      startedAt: null,
      deletedAt: null,
      purgeAt: null,
    });
    expect((await migrateV02({ apply: true, installTtl: false })).modifiedCount).toBe(0);
    expect(await Task.collection.findOne({ _id: task._id })).toEqual(stored);
    // A logical backup/restore round trip on the isolated collection preserves the migrated record.
    await Task.collection.deleteMany({});
    await Task.collection.insertOne(stored!);
    expect(await Task.collection.findOne({ _id: task._id })).toEqual(stored);
  });

  it('reports inconsistent data and refuses to install TTL or partially backfill it', async () => {
    const invalid = { ...legacy(), status: 'pending' };
    await Task.collection.insertOne(invalid);
    expect((await migrateV02()).before.anomalies[0].reasons).toContain(
      'completedAt_status_mismatch',
    );
    await expect(migrateV02({ apply: true })).rejects.toThrow('Migration blocked');
    expect(await Task.collection.findOne({ _id: invalid._id })).toEqual(invalid);
    expect(
      (await Task.collection.indexes()).some((index) => index.expireAfterSeconds !== undefined),
    ).toBe(false);
  });

  it('creates a TTL index restricted to deleted records only after validation', async () => {
    await Task.collection.insertOne(legacy());
    const result = await migrateV02({ apply: true });
    expect(result.ttlInstalled).toBe(true);
    const ttl = (await Task.collection.indexes()).find(
      (index) => index.name === 'tasks_purge_ttl_v02',
    );
    expect(ttl).toMatchObject({
      key: { purgeAt: 1 },
      expireAfterSeconds: 0,
      partialFilterExpression: { deletedAt: { $type: 'date' } },
    });
    const active = await create({ title: 'Active must survive TTL' });
    const trashed = await create({ title: 'Expired trash must be removed' });
    await remove(trashed.id, 0);
    // Even corrupt active data with a past purgeAt must never match this TTL index.
    const ids = [active.id, trashed.id].map((id) => new mongoose.Types.ObjectId(id));
    await Task.collection.updateMany(
      { _id: { $in: ids } },
      { $set: { purgeAt: new Date(Date.now() - 60_000) } },
    );
    await vi.waitFor(
      async () => {
        expect(await Task.collection.countDocuments({ _id: ids[1] })).toBe(0);
      },
      { timeout: 10_000, interval: 100 },
    );
    expect(await Task.collection.countDocuments({ _id: ids[0] })).toBe(1);
    await Task.collection.dropIndex('tasks_purge_ttl_v02');
  });
});
