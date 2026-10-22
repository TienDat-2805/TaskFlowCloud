import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { formatDiagnostic } from './compose-diagnostics.mjs';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
const production = process.argv.includes('--production');
if (process.argv.slice(2).some((arg) => arg !== '--production'))
  throw new Error('Only --production is supported.');
const project = 'taskflow-verify-' + randomBytes(5).toString('hex');
const work = join(root, 'tmp', project);
assert.equal(
  dirname(resolve(work)),
  resolve(root, 'tmp'),
  'Temporary directory must stay inside the repository tmp folder',
);
const database = 'taskflow_verify';
const backupDatabase = database + '_restored';
const backendImage = project + '/backend:verify';
const frontendImage = project + '/frontend:verify';
const report = {
  mode: production ? 'production-artifacts-local-http' : 'development',
  checks: [],
  cloudDeployed: false,
  productionTlsTested: false,
};
let phase = 'prepare';
async function run(args) {
  const result = await execute('docker', args, {
    cwd: root,
    env: { ...process.env, ...environment },
    maxBuffer: 8 * 1024 * 1024,
  });
  return result.stdout.trim();
}
const composeArgs = [
  'compose',
  '--env-file',
  join(work, '.env'),
  '-p',
  project,
  '-f',
  join(root, production ? 'compose.prod.yml' : 'compose.dev.yml'),
  '-f',
  join(work, 'override.yml'),
];
const compose = (...args) => run([...composeArgs, ...args]);
async function check(name, action) {
  phase = name;
  console.log('Checking: ' + name);
  await action();
  report.checks.push(name);
}
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
function jsonOutput(value) {
  return JSON.parse(value.slice(value.indexOf('{'), value.lastIndexOf('}') + 1));
}
async function shellMongo(code) {
  return compose('exec', '-T', 'mongo', 'mongosh', '--quiet', '--eval', code);
}
async function fingerprint(dbName) {
  const value = await shellMongo(
    'const d=db.getSiblingDB(' +
      JSON.stringify(dbName) +
      ');print(EJSON.stringify(d.getCollectionNames().filter(n=>!n.startsWith("system.")).sort().map(n=>({name:n,docs:d.getCollection(n).find().sort({_id:1}).toArray(),indexes:d.getCollection(n).getIndexes().map(({ns,background,v,...i})=>i).sort((a,b)=>a.name.localeCompare(b.name))})),{relaxed:false}));',
  );
  return createHash('sha256').update(value).digest('hex');
}
const server = createServer();
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const port = server.address().port;
await new Promise((done) => server.close(done));
const origin = 'http://localhost:' + port;
const secret = randomBytes(48).toString('hex');
const password = 'Verify-' + randomBytes(24).toString('hex');
const environment = {
  SESSION_SECRET: secret,
  MONGODB_URI: 'mongodb://mongo:27017/' + database,
  APP_DOMAIN: 'verify.localhost',
  BACKEND_IMAGE: backendImage,
  FRONTEND_IMAGE: frontendImage,
  VERIFY_PORT: String(port),
  VERIFY_ORIGIN: origin,
  TASKFLOW_V02_ENABLED: 'false',
  REQUIRE_TASK_REVISION: 'false',
  SEED_EMAIL: '',
  SEED_PASSWORD: '',
  MONGODB_DNS_SERVERS: '',
  COMPOSE_PROFILES: '',
};
async function saveEnv() {
  await writeFile(
    join(work, '.env'),
    Object.entries(environment)
      .map(([key, value]) => key + '=' + value)
      .join('\n') + '\n',
  );
}
const override = production
  ? `
services:
  caddy:
    profiles: [edge]
  backend:
    environment:
      NODE_ENV: test
      COOKIE_SECURE: 'false'
      CLIENT_ORIGIN: \${VERIFY_ORIGIN}
      TRUST_PROXY: 1
      LOG_LEVEL: info
    networks: [app, egress, database]
    depends_on:
      mongo:
        condition: service_healthy
  frontend:
    networks: [app, edge]
    ports: ['127.0.0.1:\${VERIFY_PORT}:8080']
  mongo:
    image: mongo:8
    volumes: [verify_mongo:/data/db]
    networks: [database]
    healthcheck:
      test: ['CMD', 'mongosh', '--quiet', '--eval', 'db.adminCommand("ping").ok']
      interval: 2s
      timeout: 3s
      retries: 20
volumes:
  verify_mongo:
networks:
  database:
    internal: true
`
  : `
services:
  backend:
    image: \${BACKEND_IMAGE}
    environment:
      MONGODB_URI: mongodb://mongo:27017/taskflow_verify
      CLIENT_ORIGIN: \${VERIFY_ORIGIN}
      LOG_LEVEL: info
  frontend:
    image: \${FRONTEND_IMAGE}
    ports: !override ['127.0.0.1:\${VERIFY_PORT}:5173']
`;
const alice = { cookie: '' };
const bob = { cookie: '' };
function diagnostic(value) {
  return formatDiagnostic(value, [
    secret,
    password,
    environment.MONGODB_URI,
    alice.cookie,
    bob.cookie,
  ]);
}
async function call(account, route, method = 'GET', data) {
  const response = await fetch(origin + route, {
    method,
    signal: AbortSignal.timeout(15_000),
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      ...(account.cookie ? { Cookie: account.cookie } : {}),
    },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  const cookie = response.headers.getSetCookie()[0];
  if (cookie) account.cookie = cookie.split(';')[0];
  return response;
}
async function healthy(expected = 200) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const status = (await call(alice, '/health')).status;
      report.lastHealth = String(status);
      if (status === expected) return;
    } catch (error) {
      report.lastHealth = error.cause?.code ?? error.name;
    }
    await delay(500);
  }
  throw new Error('Health status did not reach ' + expected);
}
const migration = (...args) =>
  production
    ? compose('exec', '-T', 'backend', 'node', 'backend/dist/scripts/migrate-v02.js', ...args)
    : compose('exec', '-T', 'backend', 'npm', 'run', 'migrate:v02', '-w', 'backend', '--', ...args);
let task;
try {
  await mkdir(work, { recursive: true });
  await saveEnv();
  await writeFile(join(work, 'override.yml'), override);
  await check('isolated Compose startup', async () => {
    phase = 'pull MongoDB image';
    console.log('Pulling MongoDB image...');
    await compose('pull', 'mongo');
    phase = 'build application images';
    console.log('Building application images locally...');
    await compose('build', 'backend', 'frontend');
    phase = 'start isolated containers';
    console.log('Starting isolated containers...');
    await compose('up', '--no-build', '--pull', 'never', '-d', 'mongo', 'backend', 'frontend');
    phase = 'wait for application health';
    await healthy();
  });
  await check('sessions and flags disabled before migration', async () => {
    for (const [account, email] of [
      [alice, 'alice@verify.example'],
      [bob, 'bob@verify.example'],
    ]) {
      const response = await call(account, '/api/auth/register', 'POST', {
        name: 'Verify account',
        email,
        password,
      });
      assert.equal(response.status, 201);
    }
    assert.deepEqual((await (await call(alice, '/api/features')).json()).data, {
      workflow: false,
      requireRevision: false,
    });
    const owner = (await (await call(alice, '/api/auth/me')).json()).data.id;
    await shellMongo(
      'db.getSiblingDB("' +
        database +
        '").tasks.insertOne({userId:ObjectId(' +
        JSON.stringify(owner) +
        '),title:"Legacy migration fixture",description:"",priority:"medium",status:"pending",dueAt:ISODate("2026-12-25T08:00:00Z"),completedAt:null,createdAt:ISODate("2026-10-01T08:00:00Z"),updatedAt:ISODate("2026-10-01T08:00:00Z")});',
    );
  });
  await check('dry-run leaves data unchanged', async () => {
    const before = await fingerprint(database);
    const dry = jsonOutput(await migration('--dry-run'));
    assert.equal(dry.before.wouldModify, 1);
    assert.deepEqual(dry.before.anomalies, []);
    assert.equal(dry.modifiedCount, 0);
    assert.equal(await fingerprint(database), before);
  });
  await check('real mongodump and mongorestore round trip', async () => {
    const before = await fingerprint(database);
    await compose(
      'exec',
      '-T',
      'mongo',
      'mongodump',
      '--db',
      database,
      '--archive=/tmp/taskflow-backup.gz',
      '--gzip',
    );
    await compose(
      'exec',
      '-T',
      'mongo',
      'mongorestore',
      '--archive=/tmp/taskflow-backup.gz',
      '--gzip',
      '--nsInclude=' + database + '.*',
      '--nsFrom=' + database + '.*',
      '--nsTo=' + backupDatabase + '.*',
    );
    assert.equal(await fingerprint(backupDatabase), before);
  });
  await check('controlled migration, preservation and idempotence', async () => {
    const applyArgs = [
      '--apply',
      '--confirm-database',
      database,
      '--backup-confirmed',
      '--allow-remote',
    ];
    const first = jsonOutput(await migration(...applyArgs));
    assert.equal(first.modifiedCount, 1);
    assert.equal(first.ttlInstalled, true);
    assert.deepEqual(first.after.anomalies, []);
    const second = jsonOutput(await migration(...applyArgs));
    assert.equal(second.modifiedCount, 0);
    const taskText = await shellMongo(
      'const t=db.getSiblingDB("' +
        database +
        '").tasks.findOne({title:"Legacy migration fixture"});print(JSON.stringify({createdAt:t.createdAt,updatedAt:t.updatedAt,dueAt:t.dueAt,status:t.status,revision:t.revision,activity:t.activity}));',
    );
    assert.deepEqual(JSON.parse(taskText), {
      createdAt: '2026-10-01T08:00:00.000Z',
      updatedAt: '2026-10-01T08:00:00.000Z',
      dueAt: '2026-12-25T08:00:00.000Z',
      status: 'pending',
      revision: 0,
      activity: [],
    });
  });
  await check('enable both flags after verified backup and migration', async () => {
    environment.TASKFLOW_V02_ENABLED = 'true';
    environment.REQUIRE_TASK_REVISION = 'true';
    await saveEnv();
    await compose('up', '-d', '--force-recreate', 'backend', 'frontend');
    await healthy();
    assert.equal((await call(alice, '/api/auth/me')).status, 200);
    assert.deepEqual((await (await call(alice, '/api/features')).json()).data, {
      workflow: true,
      requireRevision: true,
    });
  });
  await check('v0.2 create/status/date-only/conflict/owner isolation', async () => {
    let response = await call(alice, '/api/tasks', 'POST', {
      title: 'Compose workflow task',
      due: { mode: 'date', date: '2026-12-25', timeZone: 'Asia/Ho_Chi_Minh' },
    });
    assert.equal(response.status, 201);
    task = (await response.json()).data;
    assert.equal(task.dueAt, '2026-12-25T16:59:59.999Z');
    response = await call(alice, '/api/tasks/' + task.id, 'PATCH', {
      status: 'in_progress',
      expectedRevision: 0,
    });
    assert.equal(response.status, 200);
    task = (await response.json()).data;
    assert.ok(task.startedAt);
    assert.equal(
      (
        await call(alice, '/api/tasks/' + task.id, 'PATCH', {
          priority: 'low',
          expectedRevision: 0,
        })
      ).status,
      409,
    );
    for (const suffix of ['', '/activity'])
      assert.equal((await call(bob, '/api/tasks/' + task.id + suffix)).status, 404);
    assert.equal(
      (await call(bob, '/api/tasks/' + task.id, 'DELETE', { expectedRevision: 1 })).status,
      404,
    );
  });
  await check('Compose restart preserves task and login session', async () => {
    await compose('stop', 'frontend', 'backend', 'mongo');
    await compose('start', 'mongo', 'backend', 'frontend');
    await healthy();
    assert.equal((await call(alice, '/api/auth/me')).status, 200);
    const stored = (await (await call(alice, '/api/tasks/' + task.id)).json()).data;
    assert.equal(stored.startedAt, task.startedAt);
    assert.equal(stored.revision, 1);
  });
  await check('trash/restore/history/permanent delete', async () => {
    assert.equal(
      (await call(alice, '/api/tasks/' + task.id, 'DELETE', { expectedRevision: 1 })).status,
      204,
    );
    assert.equal((await call(alice, '/api/tasks/' + task.id)).status, 404);
    assert.equal(
      (await call(bob, '/api/tasks/' + task.id + '/restore', 'POST', { expectedRevision: 2 }))
        .status,
      404,
    );
    const trash = (await (await call(alice, '/api/tasks/trash')).json()).data;
    assert.ok(trash.some((item) => item.id === task.id));
    const restored = (
      await (
        await call(alice, '/api/tasks/' + task.id + '/restore', 'POST', { expectedRevision: 2 })
      ).json()
    ).data;
    assert.equal(restored.startedAt, task.startedAt);
    assert.equal(restored.status, 'in_progress');
    const events = (await (await call(alice, '/api/tasks/' + task.id + '/activity')).json()).data;
    assert.equal(events[0].type, 'restored');
    assert.equal(
      (await call(alice, '/api/tasks/' + task.id, 'DELETE', { expectedRevision: 3 })).status,
      204,
    );
    assert.equal(
      (await call(alice, '/api/tasks/' + task.id + '/permanent', 'DELETE', { expectedRevision: 4 }))
        .status,
      204,
    );
  });
  await check('health degrades and recovers with MongoDB', async () => {
    await compose('stop', 'mongo');
    await healthy(503);
    await compose('start', 'mongo');
    await healthy();
  });
  await check('request logs exclude private credentials and cookies', async () => {
    const logs = await compose('logs', '--no-color', 'backend');
    for (const value of [secret, password, alice.cookie, bob.cookie])
      if (value) assert.ok(!logs.includes(value), 'Sensitive value found in logs');
    assert.ok(logs.includes('Request completed'));
  });
  report.passed = true;
  console.log('All isolated Compose checks passed.');
} catch (error) {
  report.failureCode = error.code ?? error.name;
  console.error('Verification error category: ' + report.failureCode);
  report.diagnostic = diagnostic(
    [error.message, error.stdout, error.stderr].filter(Boolean).join('\n'),
  );
  console.error(report.diagnostic);
  for (const args of [
    ['ps', '--all'],
    ['logs', '--no-color', '--tail', '40', 'mongo', 'backend', 'frontend'],
  ]) {
    try {
      console.error(diagnostic(await compose(...args)));
    } catch {
      console.error('Additional Compose diagnostics unavailable.');
    }
  }
  report.passed = false;
  report.failedAt = phase;
  console.error(
    'Compose verification failed at: ' +
      phase +
      '. No database credentials or backup contents are printed.',
  );
  process.exitCode = 1;
} finally {
  phase = 'cleanup';
  try {
    await compose('down', '-v', '--remove-orphans');
    await run(['image', 'rm', backendImage, frontendImage]).catch(() => undefined);
    await rm(work, { recursive: true, force: true });
    report.cleanedUp = true;
  } catch {
    report.cleanedUp = false;
    console.error('Cleanup needs attention for isolated project: ' + project);
    process.exitCode = 1;
  }
  await mkdir(join(root, 'test-results'), { recursive: true });
  await writeFile(
    join(root, 'test-results', production ? 'compose-production.json' : 'compose-development.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
}
