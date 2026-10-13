import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { env, reset, sqlite } from './env';
import {
  requestCode,
  verifyCode,
  requireUser,
  logout,
  hash,
  HttpError,
  SESSION_COOKIE,
  LOGIN_COOKIE,
  limit,
  readJson,
  protectMutation,
} from '../app/api/auth/core';
import * as entries from '../app/api/entries/route';
import * as reflections from '../app/api/reflections/route';
import * as settings from '../app/api/settings/route';
import * as leads from '../app/api/leads/route';
import type { NextRequest } from 'next/server';
beforeEach(reset);
function req(
  path: string,
  method = 'GET',
  body?: unknown,
  cookies = '',
  extra: Record<string, string> = {},
) {
  const request = new Request(`https://diary.test${path}`, {
    method,
    headers: {
      origin: env.AUTH_ORIGIN,
      'x-diary-request': '1',
      'content-type': 'application/json',
      cookie: cookies,
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  Object.defineProperty(request, 'nextUrl', { value: new URL(request.url) });
  return request as NextRequest;
}
type ApiBody = {
  entry: { id: string; userId: string };
  entries: unknown[];
  reflections: unknown[];
  settings: null | { name: string };
};
const bodyOf = async (response: Response) => (await response.json()) as ApiBody;
const cookieValue = (response: Response, name: string) =>
  response.headers
    .getSetCookie()
    .find((v) => v.startsWith(`${name}=`))!
    .split(';')[0];
async function challenge(email = 'a@example.com', ip = '1') {
  let code = '';
  const response = await requestCode(
    req('/api/auth/request', 'POST', { email, name: 'Ana' }, '', {
      'cf-connecting-ip': ip,
    }),
    env,
    async (_email, value) => {
      code = value;
    },
  );
  return {
    code,
    challengeId: ((await response.clone().json()) as { challengeId: string })
      .challengeId,
    cookies: cookieValue(response, LOGIN_COOKIE),
    response,
  };
}
async function login(email = 'a@example.com', ip = '1', paid = true) {
  const c = await challenge(email, ip);
  const response = await verifyCode(
    req('/api/auth/verify', 'POST', c, c.cookies, { 'cf-connecting-ip': ip }),
    env,
  );
  const cookies = cookieValue(response, SESSION_COOKIE);
  const user = await requireUser(req('/api/auth/session', 'GET', undefined, cookies), env);
  if (paid) paidFixture(user);
  return { cookies, response, user };
}
function paidFixture(user: { id: string; email: string; name: string }) {
  // These rows are fixtures for existing data-isolation tests. Production grants
  // are written exclusively by the signed Stripe webhook after ownership checks.
  if (sqlite.prepare('SELECT user_id FROM billing_customers WHERE user_id=? AND account_id=? AND mode=?').get(user.id, env.STRIPE_ACCOUNT_ID, 'test')) return;
  const requestId = crypto.randomUUID();
  const customerId = `cus_fixture${crypto.randomUUID().replaceAll('-', '')}`;
  const sessionId = `cs_test_fixture${crypto.randomUUID().replaceAll('-', '')}`;
  const timestamp = Math.floor(Date.now() / 1000);
  sqlite.prepare('INSERT INTO billing_customers (user_id,account_id,mode,customer_id,creation_id,creation_started_at,email,name) VALUES (?,?,?,?,?,?,?,?)')
    .run(user.id, env.STRIPE_ACCOUNT_ID, 'test', customerId, requestId, timestamp, user.email, user.name);
  sqlite.prepare('INSERT INTO billing_checkout_attempts (account_id,mode,request_id,user_id,offer_key,price_id,checkout_mode,customer_id,started_at,return_origin,session_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(env.STRIPE_ACCOUNT_ID, 'test', requestId, user.id, 'diario-emocional', 'price_diaryFixture', 'payment', customerId, timestamp, env.AUTH_ORIGIN, sessionId);
  sqlite.prepare('INSERT INTO billing_orders (account_id,mode,session_id,user_id,offer_key,customer_id,status,amount,currency,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(env.STRIPE_ACCOUNT_ID, 'test', sessionId, user.id, 'diario-emocional', customerId, 'paid', 4790, 'brl', timestamp);
  sqlite.prepare('INSERT INTO billing_diary_grants (account_id,mode,session_id,user_id,offer_key,price_id,customer_id,status,checked_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(env.STRIPE_ACCOUNT_ID, 'test', sessionId, user.id, 'diario-emocional', 'price_diaryFixture', customerId, 'active', timestamp);
}
const rejects = (action: () => Promise<unknown>, status: number) =>
  assert.rejects(
    action,
    (e: unknown) => e instanceof HttpError && e.status === status,
  );
void test('OTP, browser binding, cookies, hash storage and authenticated identity', async () => {
  const c = await challenge();
  assert.match(c.code, /^\d{8}$/);
  assert.ok(!(await c.response.clone().text()).includes(c.code));
  await rejects(() => verifyCode(req('/api/auth/verify', 'POST', c), env), 400);
  const response = await verifyCode(
    req('/api/auth/verify', 'POST', c, c.cookies),
    env,
  );
  const cookies = cookieValue(response, SESSION_COOKIE);
  const user = await requireUser(
    req('/api/auth/session', 'GET', undefined, cookies),
    env,
  );
  assert.equal(user.email, 'a@example.com');
  assert.match(user.id, /^user:/);
  assert.match(
    response.headers.get('set-cookie')!,
    /HttpOnly; Secure; SameSite=Strict; Max-Age=604800/,
  );
  assert.equal(
    sqlite.prepare('SELECT token_hash FROM auth_sessions').get()!.token_hash,
    await hash(cookies.split('=')[1]),
  );
  await rejects(
    () => verifyCode(req('/api/auth/verify', 'POST', c, c.cookies), env),
    400,
  );
});
void test('OTP locks after five invalid codes and expires after ten minutes', async () => {
  const c = await challenge();
  const wrong = c.code === '00000000' ? '11111111' : '00000000';
  for (let i = 0; i < 5; i++)
    await rejects(
      () =>
        verifyCode(
          req('/api/auth/verify', 'POST', { ...c, code: wrong }, c.cookies),
          env,
        ),
      400,
    );
  await rejects(
    () => verifyCode(req('/api/auth/verify', 'POST', c, c.cookies), env),
    400,
  );
  sqlite.prepare('UPDATE auth_challenges SET attempts=0, expires_at=0').run();
  await rejects(
    () => verifyCode(req('/api/auth/verify', 'POST', c, c.cookies), env),
    400,
  );
});
void test('concurrent verification creates only one session', async () => {
  const c = await challenge();
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      verifyCode(req('/api/auth/verify', 'POST', c, c.cookies), env),
    ),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    sqlite.prepare('SELECT count(*) n FROM auth_sessions').get()!.n,
    1,
  );
});
void test('expired, forged and logged-out sessions fail', async () => {
  const a = await login();
  await logout(req('/api/auth/logout', 'POST', undefined, a.cookies), env);
  await rejects(
    () => requireUser(req('/api/entries', 'GET', undefined, a.cookies), env),
    401,
  );
  await rejects(
    () =>
      requireUser(
        req(
          '/api/entries',
          'GET',
          undefined,
          `${SESSION_COOKIE}=${'a'.repeat(64)}`,
        ),
        env,
      ),
    401,
  );
  sqlite
    .prepare('INSERT INTO auth_sessions VALUES(?,?,0)')
    .run(await hash('b'.repeat(64)), a.user.id);
  await rejects(
    () =>
      requireUser(
        req(
          '/api/entries',
          'GET',
          undefined,
          `${SESSION_COOKIE}=${'b'.repeat(64)}`,
        ),
        env,
      ),
    401,
  );
});
void test('two devices with the same verified email resolve to the same user', async () => {
  const a = await login();
  sqlite.prepare('DELETE FROM auth_limits').run();
  const b = await login();
  assert.equal(a.user.id, b.user.id);
  assert.notEqual(a.cookies, b.cookies);
});
void test('rate limiting is persistent, atomic, and hashes identifiers', async () => {
  await limit(env, 'test', 'sensitive@example.com', 2, 3600);
  await limit(env, 'test', 'sensitive@example.com', 2, 3600);
  await rejects(
    () => limit(env, 'test', 'sensitive@example.com', 2, 3600),
    429,
  );
  assert.ok(
    !JSON.stringify(sqlite.prepare('SELECT * FROM auth_limits').all()).includes(
      'sensitive',
    ),
  );
});
void test('email resend is rate limited and delivery failure cannot log in', async () => {
  await challenge();
  await rejects(() => challenge(), 429);
  await rejects(
    () =>
      requestCode(
        req('/api/auth/request', 'POST', { email: 'b@example.com' }),
        env,
        async () => {
          throw new Error('private provider error');
        },
      ),
    503,
  );
  assert.equal(
    sqlite
      .prepare(
        "SELECT count(*) n FROM auth_challenges WHERE email='b@example.com'",
      )
      .get()!.n,
    0,
  );
});
void test('CSRF rejects cross-site, missing Origin and missing custom header', async () => {
  for (const headers of [
    { origin: 'https://evil.test' },
    { origin: '' },
    { 'x-diary-request': '' },
    { 'sec-fetch-site': 'cross-site' },
  ] as Record<string, string>[])
    assert.throws(
      () =>
        protectMutation(req('/api/auth/request', 'POST', {}, '', headers), env),
      HttpError,
    );
});
void test('all private routes reject X-Visitor-ID and unauthenticated writes', async () => {
  const requests = [
    entries.GET(
      req('/api/entries', 'GET', undefined, '', {
        'x-visitor-id': crypto.randomUUID(),
      }),
    ),
    entries.POST(req('/api/entries', 'POST', {})),
    entries.DELETE(req('/api/entries?id=abc', 'DELETE')),
    reflections.GET(req('/api/reflections')),
    reflections.POST(req('/api/reflections', 'POST', {})),
    settings.GET(req('/api/settings')),
    settings.PUT(req('/api/settings', 'PUT', {})),
    leads.POST(req('/api/leads', 'POST', {})),
  ];
  for (const response of await Promise.all(requests))
    assert.equal(response.status, 401);
});
void test('entries, reflections and settings are isolated from other users and legacy data', async () => {
  const a = await login();
  const b = await login('b@example.com', '2');
  const saved = await entries.POST(
    req(
      '/api/entries',
      'POST',
      {
        emotion: 'calma',
        intensity: 5,
        userId: b.user.id,
        visitorId: b.user.id,
      },
      a.cookies,
    ),
  );
  assert.equal(saved.status, 201);
  const entry = (await bodyOf(saved)).entry;
  assert.equal(entry.userId, a.user.id);
  assert.equal(
    (
      await bodyOf(
        await entries.GET(req('/api/entries', 'GET', undefined, b.cookies)),
      )
    ).entries.length,
    0,
  );
  assert.equal(
    (
      await entries.DELETE(
        req(`/api/entries?id=${entry.id}`, 'DELETE', undefined, b.cookies),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await bodyOf(
        await entries.GET(req('/api/entries', 'GET', undefined, a.cookies)),
      )
    ).entries.length,
    1,
  );
  assert.equal(
    (
      await reflections.POST(
        req(
          '/api/reflections',
          'POST',
          { title: 'Private', category: 'Reflexão livre', content: 'secret' },
          a.cookies,
        ),
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await bodyOf(
        await reflections.GET(
          req('/api/reflections', 'GET', undefined, b.cookies),
        ),
      )
    ).reflections.length,
    0,
  );
  assert.equal(
    (
      await settings.PUT(
        req('/api/settings', 'PUT', { times: ['09:00'], name: 'A' }, a.cookies),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await bodyOf(
        await settings.GET(req('/api/settings', 'GET', undefined, b.cookies)),
      )
    ).settings,
    null,
  );
  await settings.PUT(
    req(
      '/api/settings',
      'PUT',
      { times: ['12:30'], name: 'B', userId: a.user.id },
      b.cookies,
    ),
  );
  assert.equal(
    (
      await bodyOf(
        await settings.GET(req('/api/settings', 'GET', undefined, a.cookies)),
      )
    ).settings!.name,
    'A',
  );
  sqlite.prepare('UPDATE emotional_entries SET user_id=NULL').run();
  sqlite.prepare('UPDATE reflections SET user_id=NULL').run();
  sqlite.prepare('UPDATE reminder_settings SET user_id=NULL').run();
  assert.equal(
    (
      await bodyOf(
        await entries.GET(req('/api/entries', 'GET', undefined, a.cookies)),
      )
    ).entries.length,
    0,
  );
  assert.equal(
    (
      await bodyOf(
        await reflections.GET(
          req('/api/reflections', 'GET', undefined, a.cookies),
        ),
      )
    ).reflections.length,
    0,
  );
  assert.equal(
    (
      await bodyOf(
        await settings.GET(req('/api/settings', 'GET', undefined, a.cookies)),
      )
    ).settings,
    null,
  );
  assert.equal(
    sqlite.prepare('SELECT count(*) n FROM emotional_entries').get()!.n,
    1,
  );
});
void test('migrated settings update without replacing their historical ID', async () => {
  const a = await login();
  sqlite
    .prepare(
      "INSERT INTO reminder_settings(id,name,updated_at,user_id) VALUES('old-id','Old',1,?)",
    )
    .run(a.user.id);
  const response = await settings.PUT(
    req(
      '/api/settings',
      'PUT',
      { name: 'Updated', times: ['20:30'] },
      a.cookies,
    ),
  );
  assert.equal(response.status, 200);
  assert.equal(
    sqlite.prepare('SELECT id,name FROM reminder_settings').get()!.id,
    'old-id',
  );
});
void test('input validation rejects malformed JSON, arrays, oversize and invalid dates/times', async () => {
  await rejects(
    () =>
      readJson(
        new Request('https://diary.test', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{',
        }),
      ),
    400,
  );
  await rejects(() => readJson(req('/api/auth/request', 'POST', [])), 400);
  await rejects(
    () =>
      readJson(req('/api/auth/request', 'POST', { text: 'x'.repeat(100001) })),
    413,
  );
  const a = await login();
  for (const body of [
    { emotion: 'invalid', intensity: 5 },
    { emotion: 'calma', intensity: '5' },
    { emotion: 'calma', intensity: 5, occurredAt: 'bad' },
    { emotion: 'calma', intensity: 5, event: {} },
  ])
    assert.equal(
      (await entries.POST(req('/api/entries', 'POST', body, a.cookies))).status,
      400,
    );
  assert.equal(
    (
      await settings.PUT(
        req('/api/settings', 'PUT', { times: ['25:00'] }, a.cookies),
      )
    ).status,
    400,
  );
});

void test('operator approvals bind explicit legacy records, are atomic, and cannot steal owned records', async () => {
  const a = await login();
  const b = await login('b@example.com', '2');
  sqlite
    .prepare(
      "INSERT INTO reflections(id,visitor_id,created_at,title,category,content) VALUES ('legacy','known-uuid',1,'Old','Reflexão livre','Preserved')",
    )
    .run();
  const approve = sqlite.prepare(
    'INSERT INTO legacy_migration_audit VALUES(?,?,?,?,?,?,?)',
  );
  assert.throws(() =>
    approve.run('bad', a.user.id, 'reflections', 'legacy', 'uuid', 'op', 1),
  );
  assert.equal(
    sqlite.prepare("SELECT user_id FROM reflections WHERE id='legacy'").get()!
      .user_id,
    null,
  );
  approve.run(
    'approved',
    a.user.id,
    'reflections',
    'legacy',
    'case-verified-001',
    'operator-one',
    1,
  );
  assert.equal(
    (
      await bodyOf(
        await reflections.GET(
          req('/api/reflections', 'GET', undefined, a.cookies),
        ),
      )
    ).reflections.length,
    1,
  );
  assert.equal(
    (
      await bodyOf(
        await reflections.GET(
          req('/api/reflections', 'GET', undefined, b.cookies),
        ),
      )
    ).reflections.length,
    0,
  );
  assert.throws(() =>
    approve.run(
      'steal',
      b.user.id,
      'reflections',
      'legacy',
      'case-verified-002',
      'operator-two',
      2,
    ),
  );
  assert.throws(() =>
    sqlite
      .prepare("DELETE FROM legacy_migration_audit WHERE id='approved'")
      .run(),
  );
  assert.equal(
    sqlite.prepare("SELECT content FROM reflections WHERE id='legacy'").get()!
      .content,
    'Preserved',
  );
});
void test('rollout migration preserves every historical field and performs no ownership assignment', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { readFileSync } = await import('node:fs');
  const db = new DatabaseSync(':memory:');
  for (const file of [
    '0000_curly_mach_iv.sql',
    '0001_lumpy_ted_forrester.sql',
    '0002_brainy_captain_flint.sql',
  ])
    db.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  db.exec(
    "INSERT INTO emotional_entries(id,occurred_at,created_at,emotion,intensity) VALUES('old-entry',1,1,'calma',5); INSERT INTO reflections(id,visitor_id,created_at,category,content) VALUES('old-memory','old-visitor',1,'Reflexão livre','Intact'); INSERT INTO reminder_settings(id,name,updated_at) VALUES('old-settings','Old',1); INSERT INTO leads(id,created_at,name,whatsapp) VALUES('old-lead',1,'Old','5551999999999');",
  );
  const tables = [
    'emotional_entries',
    'reflections',
    'reminder_settings',
    'leads',
  ];
  const before = tables.map((t) => db.prepare(`SELECT * FROM ${t}`).all());
  const sql = readFileSync('drizzle/0003_secure_auth.sql', 'utf8');
  assert.doesNotMatch(
    sql,
    /\bDROP\s|\bDELETE\s+FROM\s+(emotional_entries|reflections|reminder_settings|leads)/i,
  );
  db.exec(sql);
  for (const [i, table] of tables.entries()) {
    const rows = db
      .prepare(`SELECT * FROM ${table}`)
      .all()
      .map((row) => {
        const { user_id, ...original } = row;
        if (table !== 'leads') assert.equal(user_id, null);
        return original;
      });
    assert.deepEqual(
      rows,
      before[i].map((row) => ({ ...row })),
    );
  }
  db.close();
});

void test('every private diary endpoint requires a paid authenticated user', async () => {
  const unpaid = await login('unpaid@example.com', '91', false);
  for (const response of [
    await entries.GET(req('/api/entries?checkout=retorno', 'GET', undefined, unpaid.cookies, { 'x-visitor-id': 'paid-owner' })),
    await entries.POST(req('/api/entries', 'POST', { emotion: 'calma', intensity: 5 }, unpaid.cookies)),
    await entries.DELETE(req('/api/entries?id=00000000-0000-0000-0000-000000000000', 'DELETE', undefined, unpaid.cookies)),
    await reflections.GET(req('/api/reflections', 'GET', undefined, unpaid.cookies)),
    await reflections.POST(req('/api/reflections', 'POST', { title: '', content: 'Private', category: 'Reflexão livre' }, unpaid.cookies)),
    await settings.GET(req('/api/settings', 'GET', undefined, unpaid.cookies)),
    await settings.PUT(req('/api/settings', 'PUT', { times: ['20:00'] }, unpaid.cookies)),
    await leads.POST(req('/api/leads', 'POST', { name: 'Ana', whatsapp: '11999999999', consent: true }, unpaid.cookies)),
  ]) assert.equal(response.status, 402);
  assert.equal((await requireUser(req('/api/auth/session', 'GET', undefined, unpaid.cookies), env)).id, unpaid.user.id);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM emotional_entries').get()!.n, 0);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM reflections').get()!.n, 0);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM reminder_settings').get()!.n, 0);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM leads').get()!.n, 0);
});
