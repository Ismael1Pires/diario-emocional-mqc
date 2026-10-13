import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { env, reset, sqlite } from './env';
import { hash, HttpError, randomToken, SESSION_COOKIE } from '../app/api/auth/core';
import {
  billingConfig,
  createCheckout,
  createPortal,
  getCatalog,
  getStatus,
  handleWebhook,
  type BillingEnv,
} from '../app/api/billing/core';

import { getDiaryAccess, requirePaidDiaryUser } from '../app/api/billing/diary-access';

const ACCOUNT = 'acct_fixtureOne';
const SECRET = 'whsec_fixtureOnlyNoNetwork';
const PRICES = { consulta: 'price_fixtureOne', acompanhamento: 'price_fixtureMonthly' };
let billingEnv: BillingEnv;
beforeEach(() => {
  reset();
  billingEnv = {
    ...env,
    STRIPE_SECRET_KEY: 'sk_test_fixtureOnlyNoNetwork',
    STRIPE_WEBHOOK_SECRET: SECRET,
    STRIPE_ACCOUNT_ID: ACCOUNT,
    STRIPE_MODE: 'test',
    STRIPE_OFFERS_JSON: JSON.stringify(PRICES),
    STRIPE_DIARY_OFFER_KEY: 'consulta',
  };
});

type User = { id: string; email: string; cookie: string };
async function user(name = 'Ana'): Promise<User> {
  const id = `user:${crypto.randomUUID()}`;
  const email = `${name.toLowerCase()}@example.test`;
  const token = randomToken();
  sqlite.prepare('INSERT INTO auth_users (id,email,name,created_at) VALUES (?,?,?,?)')
    .run(id, email, name, Math.floor(Date.now() / 1000));
  sqlite.prepare('INSERT INTO auth_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)')
    .run(await hash(token), id, Math.floor(Date.now() / 1000) + 3600);
  return { id, email, cookie: `${SESSION_COOKIE}=${token}` };
}
function request(path: string, person?: User, body?: unknown, headers: Record<string, string> = {}, method = 'POST') {
  return new Request(`${env.AUTH_ORIGIN}${path}`, {
    method,
    headers: {
      origin: env.AUTH_ORIGIN,
      'x-diary-request': '1',
      'content-type': 'application/json',
      cookie: person?.cookie ?? '',
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const checkoutRequest = (person: User, offerKey = 'consulta', requestId = crypto.randomUUID()) =>
  request('/api/billing/checkout', person, { offerKey, requestId });
const rejects = (action: () => Promise<unknown>, status: number) =>
  assert.rejects(action, (error: unknown) => error instanceof HttpError && error.status === status);
const json = async (response: Response) => await response.json() as Record<string, unknown>;
const count = (table: string) => Number(sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n);

type Call = { params: Record<string, unknown>; key?: string };
type Session = {
  id: string; customer: string; client_reference_id: string;
  livemode: boolean; mode: string; url: string | null;
  metadata: Record<string, string>; status: string; payment_status: string;
  amount_total: number; currency: string; subscription: string | null;
  payment_intent: string; price_id: string;
};
type Subscription = {
  id: string; customer: string; livemode: boolean; status: string;
  metadata: Record<string, string>; cancel_at_period_end: boolean;
};
function fakeStripe() {
  // Only signature generation and verification use the real SDK. Every API
  // endpoint is replaced; fixture keys are never sent to any network.
  const verifier = new Stripe('sk_test_fixtureOnlyNoNetwork');
  const prices = new Map<string, Record<string, unknown>>([
    [PRICES.consulta, {
      id: PRICES.consulta, type: 'one_time', active: true, livemode: false, billing_scheme: 'per_unit',
      unit_amount: 16700, currency: 'brl', recurring: null,
      product: { id: 'prod_fixtureOne', active: true, livemode: false, name: 'Consulta de avaliação', description: '' },
    }],
    [PRICES.acompanhamento, {
      id: PRICES.acompanhamento, type: 'recurring', active: true, livemode: false, billing_scheme: 'per_unit',
      unit_amount: 4700, currency: 'brl',
      recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' },
      product: { id: 'prod_fixtureMonthly', active: true, livemode: false, name: 'Acompanhamento', description: '' },
    }],
  ]);
  const customers = new Map<string, { id: string; livemode: boolean }>();
  const sessionKeys = new Map<string, Session>();
  const sessions = new Map<string, Session>();
  const subscriptions = new Map<string, Subscription>();
  const intents = new Map<string, Record<string, unknown>>();
  const charges = new Map<string, Record<string, unknown>>();
  const disputes = new Map<string, Record<string, unknown>[]>();
  const calls = { accounts: 0, prices: [] as string[], customers: [] as Call[], checkout: [] as Call[], retrieve: [] as string[], portal: [] as Call[], subscriptions: [] as string[] };
  const behavior = {
    account: ACCOUNT,
    customerFailures: 0,
    checkoutFailures: 0,
    intentFailures: 0,
    retrieve: undefined as undefined | ((id: string, value: Session) => Promise<Session>),
  };
  const sdk = {
    accounts: { async retrieve() { calls.accounts++; return { id: behavior.account }; } },
    prices: { async retrieve(id: string) {
      calls.prices.push(id);
      const price = prices.get(id);
      assert.ok(price, `Unexpected price: ${id}`);
      return structuredClone(price);
    } },
    customers: { async create(params: Record<string, unknown>, options: { idempotencyKey: string }) {
      const key = options.idempotencyKey;
      assert.ok(key, 'Customer creation must have an idempotency key');
      calls.customers.push({ params: structuredClone(params), key });
      if (!customers.has(key)) customers.set(key, { id: `cus_fixture${customers.size + 1}`, livemode: false });
      // Simulate a lost response after Stripe has committed the resource.
      if (behavior.customerFailures-- > 0) throw new Error('Network response lost');
      return customers.get(key)!;
    } },
    checkout: { sessions: {
      async create(params: Record<string, unknown>, options: { idempotencyKey: string }) {
        const key = options.idempotencyKey;
        assert.ok(key, 'Checkout creation must have an idempotency key');
        calls.checkout.push({ params: structuredClone(params), key });
        if (!sessionKeys.has(key)) {
          const item = (params.line_items as { price: string }[])[0];
          const price = prices.get(item.price)!;
          const value: Session = {
            id: `cs_test_fixture${sessions.size + 1}`,
            customer: params.customer as string,
            client_reference_id: params.client_reference_id as string,
            livemode: false, mode: params.mode as string,
            url: `https://checkout.stripe.com/c/pay/fixture${sessions.size + 1}`,
            metadata: params.metadata as Record<string, string>,
            status: 'open', payment_status: 'unpaid', amount_total: price.unit_amount as number,
            currency: 'brl', subscription: null,
            price_id: item.price, payment_intent: `pi_fixture${sessions.size + 1}`,
          };
          const chargeId = `ch_fixture${sessions.size + 1}`;
          charges.set(chargeId, { id: chargeId, customer: value.customer, payment_intent: value.payment_intent, livemode: false,
            currency: 'brl', amount: value.amount_total, amount_captured: value.amount_total, amount_refunded: 0, refunded: false,
            disputed: false, paid: true, captured: true });
          intents.set(value.payment_intent, { id: value.payment_intent, customer: value.customer, livemode: false,
            currency: 'brl', amount: value.amount_total, metadata: value.metadata, status: 'succeeded', latest_charge: chargeId });
          disputes.set(chargeId, []);
          sessionKeys.set(key, value);
          sessions.set(value.id, value);
        }
        if (behavior.checkoutFailures-- > 0) throw new Error('Network response lost');
        return sessionKeys.get(key)!;
      },
      async listLineItems(sessionId: string) {
        const session = sessions.get(sessionId)!;
        const price = prices.get(session.price_id)!;
        return { has_more: false, data: [{ price: { id: session.price_id }, quantity: 1, currency: session.currency, amount_subtotal: price.unit_amount }] };
      },
      async retrieve(id: string) {
        calls.retrieve.push(id);
        const value = sessions.get(id);
        assert.ok(value, `Unexpected Checkout session: ${id}`);
        return behavior.retrieve ? behavior.retrieve(id, value) : structuredClone(value);
      },
    } },
    billingPortal: { sessions: { async create(params: Record<string, unknown>) {
      calls.portal.push({ params: structuredClone(params) });
      return { url: 'https://billing.stripe.com/p/session/fixture' };
    } } },
    subscriptions: { async retrieve(id: string) {
      calls.subscriptions.push(id);
      const value = subscriptions.get(id);
      assert.ok(value, `Unexpected subscription: ${id}`);
      return structuredClone(value);
    } },
    paymentIntents: { async retrieve(intentId: string) {
      if (behavior.intentFailures-- > 0) throw new Error('Stripe temporarily unavailable');
      assert.ok(intents.has(intentId));
      return structuredClone(intents.get(intentId));
    } },
    charges: { async retrieve(chargeId: string) { assert.ok(charges.has(chargeId)); return structuredClone(charges.get(chargeId)); } },
    disputes: { async list(params: { charge: string }) { return { has_more: false, data: structuredClone(disputes.get(params.charge) ?? []) }; } },
    webhooks: verifier.webhooks,
  } as unknown as Stripe;
  return { sdk, verifier, prices, customers, sessions, subscriptions, intents, charges, disputes, calls, behavior };
}
type Fake = ReturnType<typeof fakeStripe>;
function event(type: string, object: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    id: `evt_${crypto.randomUUID().replaceAll('-', '')}`,
    object: 'event', created: Math.floor(Date.now() / 1000), livemode: false,
    type, data: { object }, ...extra,
  };
}
function signed(fake: Fake, value: ReturnType<typeof event>, options: { payload?: string; timestamp?: number; secret?: string } = {}) {
  const payload = options.payload ?? JSON.stringify(value, null, 2);
  const signature = fake.verifier.webhooks.generateTestHeaderString({
    payload, secret: options.secret ?? SECRET, timestamp: options.timestamp,
  });
  return new Request(`${env.AUTH_ORIGIN}/api/stripe/webhook`, {
    method: 'POST', headers: { 'stripe-signature': signature, 'content-type': 'application/json' }, body: payload,
  });
}
async function checkout(fake: Fake, person: User, offerKey = 'consulta') {
  await createCheckout(checkoutRequest(person, offerKey), billingEnv, fake.sdk);
  const session = [...fake.sessions.values()].at(-1)!;
  assert.ok(session);
  return session;
}
async function complete(fake: Fake, session: Session) {
  session.status = 'complete';
  session.payment_status = 'paid';
  return handleWebhook(signed(fake, event('checkout.session.completed', { id: session.id })), billingEnv, fake.sdk);
}

void test('catalog reflects validated Stripe prices and configuration fails closed', async () => {
  const fake = fakeStripe();
  const result = await json(await getCatalog(billingEnv, fake.sdk));
  assert.equal(result.testMode, true);
  assert.deepEqual(result.offers, [
    { key: 'consulta', name: 'Consulta de avaliação', description: '', amount: 16700, currency: 'brl', interval: null, intervalCount: null, mode: 'payment' },
    { key: 'acompanhamento', name: 'Acompanhamento', description: '', amount: 4700, currency: 'brl', interval: 'month', intervalCount: 1, mode: 'subscription' },
  ]);
  assert.throws(() => billingConfig({ ...billingEnv, STRIPE_MODE: 'live' }), HttpError);
  assert.throws(() => billingConfig({ ...billingEnv, STRIPE_SECRET_KEY: '' }), HttpError);
  await rejects(() => getCatalog({ ...billingEnv, STRIPE_OFFERS_JSON: '[]' }, fake.sdk), 503);
  fake.behavior.account = 'acct_someoneElse';
  await rejects(() => getCatalog(billingEnv, fake.sdk), 503);
});

void test('checkout, portal and status require a valid session; mutations enforce CSRF before Stripe calls', async () => {
  const fake = fakeStripe();
  const a = await user();
  await rejects(() => createCheckout(request('/api/billing/checkout', undefined, {}), billingEnv, fake.sdk), 401);
  await rejects(() => createPortal(request('/api/billing/portal'), billingEnv, fake.sdk), 401);
  await rejects(() => getStatus(request('/api/billing/status', undefined, undefined, {}, 'GET'), billingEnv), 401);
  const hostileHeaders: Record<string, string>[] = [
    { origin: 'https://attacker.test' },
    { 'x-diary-request': '' },
    { 'sec-fetch-site': 'cross-site' },
  ];
  for (const headers of hostileHeaders) {
    await rejects(() => createCheckout(request('/api/billing/checkout', a, {}, headers), billingEnv, fake.sdk), 403);
    await rejects(() => createPortal(request('/api/billing/portal', a, {}, headers), billingEnv, fake.sdk), 403);
  }
  sqlite.prepare('UPDATE auth_sessions SET expires_at=0').run();
  await rejects(() => createCheckout(checkoutRequest(a), billingEnv, fake.sdk), 401);
  assert.equal(fake.calls.accounts, 0);
  assert.equal(fake.calls.checkout.length, 0);
});

void test('client cannot choose a Stripe price, customer, checkout mode or return URL', async () => {
  const fake = fakeStripe();
  const a = await user();
  for (const payload of [
    { priceId: 'price_cheaper' }, { customerId: 'cus_someoneElse' },
    { mode: 'payment' }, { success_url: 'https://attacker.test' },
  ]) {
    await rejects(() => createCheckout(request('/api/billing/checkout', a, {
      offerKey: 'consulta', requestId: crypto.randomUUID(), ...payload,
    }), billingEnv, fake.sdk), 400);
  }
  await rejects(() => createCheckout(checkoutRequest(a, 'unknown'), billingEnv, fake.sdk), 400);
  await rejects(() => createPortal(request('/api/billing/portal', a, { customer: 'cus_someoneElse', return_url: 'https://attacker.test' }), billingEnv, fake.sdk), 400);
  assert.equal(fake.calls.customers.length, 0);
  assert.equal(fake.calls.checkout.length, 0);
  assert.equal(fake.calls.portal.length, 0);
});

void test('hosted Checkout uses the owned customer, approved price and fixed app return URLs', async () => {
  const fake = fakeStripe();
  const a = await user();
  const session = await checkout(fake, a, 'acompanhamento');
  const customerCall = fake.calls.customers[0].params;
  const payload = fake.calls.checkout[0].params;
  assert.equal(customerCall.email, a.email);
  assert.deepEqual(customerCall.metadata, { app_user_id: a.id });
  assert.equal(payload.customer, session.customer);
  assert.deepEqual(payload.line_items, [{ price: PRICES.acompanhamento, quantity: 1 }]);
  assert.equal(payload.mode, 'subscription');
  assert.equal(payload.ui_mode, 'hosted_page');
  assert.equal(payload.integration_identifier, 'jeniffer-diario-qmxpazrt');
  assert.equal(payload.success_url, `${env.AUTH_ORIGIN}/pagamentos?checkout=retorno`);
  assert.equal(payload.cancel_url, `${env.AUTH_ORIGIN}/pagamentos?checkout=cancelado`);
  assert.deepEqual(payload.metadata, { app_user_id: a.id, app_offer_key: 'acompanhamento' });
  assert.deepEqual(payload.subscription_data, { metadata: payload.metadata, billing_mode: { type: 'flexible' } });
  assert.equal(count('billing_orders'), 0, 'Redirect creation never marks a purchase paid');
});

void test('request IDs are reusable only for the same user and offer while Checkout remains open', async () => {
  const fake = fakeStripe();
  const a = await user();
  const b = await user('Bia');
  const id = crypto.randomUUID();
  const first = await json(await createCheckout(checkoutRequest(a, 'consulta', id), billingEnv, fake.sdk));
  const second = await json(await createCheckout(checkoutRequest(a, 'consulta', id), billingEnv, fake.sdk));
  assert.deepEqual(second, first);
  assert.equal(fake.calls.checkout.length, 1);
  await rejects(() => createCheckout(checkoutRequest(a, 'acompanhamento', id), billingEnv, fake.sdk), 409);
  await rejects(() => createCheckout(checkoutRequest(b, 'consulta', id), billingEnv, fake.sdk), 409);
  const session = [...fake.sessions.values()][0];
  session.status = 'complete';
  await rejects(() => createCheckout(checkoutRequest(a, 'consulta', id), billingEnv, fake.sdk), 409);
  assert.equal(count('billing_checkout_attempts'), 1);
  assert.equal(count('billing_orders'), 0);
});

void test('concurrent repeated checkout requests create one remote customer and one remote session', async () => {
  const fake = fakeStripe();
  const a = await user();
  const id = crypto.randomUUID();
  const responses = await Promise.all([1, 2].map(() => createCheckout(checkoutRequest(a, 'consulta', id), billingEnv, fake.sdk)));
  assert.deepEqual(await json(responses[0]), await json(responses[1]));
  assert.equal(fake.customers.size, 1);
  assert.equal(fake.sessions.size, 1);
  assert.equal(new Set(fake.calls.customers.map(call => call.key)).size, 1);
  assert.equal(new Set(fake.calls.checkout.map(call => call.key)).size, 1);
  assert.equal(count('billing_customers'), 1);
  assert.equal(count('billing_checkout_attempts'), 1);
});

void test('lost customer and checkout responses retry with durable idempotency keys', async () => {
  const fake = fakeStripe();
  const a = await user();
  const id = crypto.randomUUID();
  fake.behavior.customerFailures = 1;
  fake.behavior.checkoutFailures = 1;
  await assert.rejects(() => createCheckout(checkoutRequest(a, 'consulta', id), billingEnv, fake.sdk), /Network response lost/);
  const customerAttempt = sqlite.prepare('SELECT creation_id,customer_id FROM billing_customers').get()!;
  assert.equal(customerAttempt.customer_id, null);
  await assert.rejects(() => createCheckout(checkoutRequest(a, 'consulta', id), billingEnv, fake.sdk), /Network response lost/);
  assert.equal(sqlite.prepare('SELECT session_id FROM billing_checkout_attempts').get()!.session_id, null);
  await createCheckout(checkoutRequest(a, 'consulta', id), billingEnv, fake.sdk);
  assert.equal(sqlite.prepare('SELECT creation_id FROM billing_customers').get()!.creation_id, customerAttempt.creation_id);
  assert.equal(fake.customers.size, 1);
  assert.equal(fake.sessions.size, 1);
  assert.equal(new Set(fake.calls.customers.map(call => call.key)).size, 1);
  assert.equal(new Set(fake.calls.checkout.map(call => call.key)).size, 1);
});

void test('uncertain attempts older than the Stripe idempotency window fail without creating another resource', async () => {
  const fake = fakeStripe();
  const a = await user();
  const id = crypto.randomUUID();
  fake.behavior.customerFailures = 1;
  await assert.rejects(() => createCheckout(checkoutRequest(a, 'consulta', id), billingEnv, fake.sdk));
  sqlite.prepare('UPDATE billing_customers SET creation_started_at=0').run();
  await rejects(() => createCheckout(checkoutRequest(a, 'consulta', id), billingEnv, fake.sdk), 503);
  assert.equal(fake.calls.customers.length, 1);
  // Reconcile the known remote customer; then simulate a lost Checkout response.
  sqlite.prepare('UPDATE billing_customers SET customer_id=?').run([...fake.customers.values()][0].id);
  fake.behavior.checkoutFailures = 1;
  await assert.rejects(() => createCheckout(checkoutRequest(a, 'consulta', id), billingEnv, fake.sdk));
  sqlite.prepare('UPDATE billing_checkout_attempts SET started_at=0').run();
  await rejects(() => createCheckout(checkoutRequest(a, 'consulta', id), billingEnv, fake.sdk), 503);
  assert.equal(fake.calls.checkout.length, 1);
  assert.equal(fake.sessions.size, 1);
});

void test('inactive, wrong-mode and unsupported prices cannot start Checkout', async () => {
  const a = await user();
  for (const change of [
    { active: false }, { livemode: true }, { unit_amount: 0 },
    { product: 'prod_notExpanded' },
    { product: { id: 'prod_fixture', active: false, livemode: false, name: 'Inactive' } },
    { recurring: { interval: 'month', interval_count: 1, usage_type: 'metered' } },
  ]) {
    const fake = fakeStripe();
    Object.assign(fake.prices.get(PRICES.consulta)!, change);
    await rejects(() => createCheckout(checkoutRequest(a), billingEnv, fake.sdk), 503);
    assert.equal(fake.calls.customers.length, 0);
    assert.equal(fake.calls.checkout.length, 0);
  }
});

void test('the diary cannot charge a recurring price when configured as a one-time purchase', async () => {
  const fake = fakeStripe();
  const person = await user();
  Object.assign(fake.prices.get(PRICES.consulta)!, {
    type: 'recurring', recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' },
  });
  await rejects(() => createCheckout(checkoutRequest(person), billingEnv, fake.sdk), 503);
  assert.equal(fake.calls.customers.length, 0);
  assert.equal(fake.calls.checkout.length, 0);
  await rejects(() => getCatalog(billingEnv, fake.sdk), 503);
});

void test('portal and billing history are isolated by authenticated user, account and mode', async () => {
  const fake = fakeStripe();
  const a = await user();
  const b = await user('Bia');
  const sessionA = await checkout(fake, a);
  const sessionB = await checkout(fake, b);
  await complete(fake, sessionA);
  await complete(fake, sessionB);
  await createPortal(request('/api/billing/portal', a, {}), billingEnv, fake.sdk);
  assert.deepEqual(fake.calls.portal[0].params, { customer: sessionA.customer, return_url: `${env.AUTH_ORIGIN}/pagamentos` });
  const status = await json(await getStatus(request('/api/billing/status', a, undefined, {}, 'GET'), billingEnv));
  assert.deepEqual(status.orders, [{ id: sessionA.id, offerKey: 'consulta', status: 'paid', amount: 16700, currency: 'brl' }]);
  assert.equal(status.customer, true);
  assert.ok(!JSON.stringify(status).includes(sessionB.customer));
  assert.ok(!JSON.stringify(status).includes(sessionB.id));
  for (const otherScope of [
    { ...billingEnv, STRIPE_ACCOUNT_ID: 'acct_other' },
    { ...billingEnv, STRIPE_MODE: 'live', STRIPE_SECRET_KEY: 'sk_live_fixtureOnlyNoNetwork' },
  ]) {
    const empty = await json(await getStatus(request('/api/billing/status', a, undefined, {}, 'GET'), otherScope));
    assert.equal(empty.customer, false);
    assert.deepEqual(empty.orders, []);
    assert.deepEqual(empty.subscriptions, []);
  }
});

void test('webhook verifies the exact raw body, signature and timestamp before changing billing state', async () => {
  const fake = fakeStripe();
  const a = await user();
  const session = await checkout(fake, a);
  session.status = 'complete'; session.payment_status = 'paid';
  const value = event('checkout.session.completed', { id: session.id });
  const raw = `${JSON.stringify(value, null, 2)}\n`;
  const good = signed(fake, value, { payload: raw });
  const header = good.headers.get('stripe-signature')!;
  await rejects(() => handleWebhook(new Request(good.url, {
    method: 'POST', headers: { 'stripe-signature': header }, body: raw.replace('completed', 'expired'),
  }), billingEnv, fake.sdk), 400);
  await rejects(() => handleWebhook(signed(fake, value, { secret: 'whsec_wrongFixture' }), billingEnv, fake.sdk), 400);
  await rejects(() => handleWebhook(signed(fake, value, { timestamp: Math.floor(Date.now() / 1000) - 1000 }), billingEnv, fake.sdk), 400);
  assert.equal(count('billing_events'), 0);
  assert.equal(count('billing_orders'), 0);
  await handleWebhook(good, billingEnv, fake.sdk);
  assert.equal(count('billing_events'), 1);
  assert.equal(sqlite.prepare('SELECT status FROM billing_orders').get()!.status, 'paid');
});

void test('wrong-mode webhooks are rejected and Connect account events cannot import purchases', async () => {
  const fake = fakeStripe();
  const a = await user();
  const session = await checkout(fake, a);
  await rejects(() => handleWebhook(signed(fake, event('checkout.session.completed', { id: session.id }, { livemode: true })), billingEnv, fake.sdk), 400);
  const ignored = await json(await handleWebhook(signed(fake, event('checkout.session.completed', { id: session.id }, { account: 'acct_connected' })), billingEnv, fake.sdk));
  assert.equal(ignored.ignored, true);
  assert.equal(count('billing_events'), 0);
  assert.equal(count('billing_orders'), 0);
  fake.behavior.account = 'acct_other';
  await rejects(() => handleWebhook(signed(fake, event('checkout.session.completed', { id: session.id })), billingEnv, fake.sdk), 503);
  assert.equal(count('billing_events'), 0);
});

void test('concurrent duplicate webhook delivery commits one event and one order', async () => {
  const fake = fakeStripe();
  const a = await user();
  const session = await checkout(fake, a);
  session.status = 'complete'; session.payment_status = 'paid';
  const value = event('checkout.session.completed', { id: session.id });
  await Promise.all([1, 2].map(() => handleWebhook(signed(fake, value), billingEnv, fake.sdk)));
  await handleWebhook(signed(fake, value), billingEnv, fake.sdk);
  assert.equal(count('billing_events'), 1);
  assert.equal(count('billing_orders'), 1);
  assert.equal(sqlite.prepare('SELECT status FROM billing_orders').get()!.status, 'paid');
});

void test('failed webhook transaction remains retryable and never acknowledges an unapplied purchase', async () => {
  const fake = fakeStripe();
  const a = await user();
  const session = await checkout(fake, a);
  session.status = 'complete'; session.payment_status = 'paid';
  const value = event('checkout.session.completed', { id: session.id });
  const actual = billingEnv.DB;
  let fail = true;
  billingEnv.DB = {
    prepare: actual.prepare.bind(actual),
    batch: async (statements: D1PreparedStatement[]) => {
      if (fail) throw new Error('Transient D1 failure');
      return actual.batch(statements);
    },
  } as unknown as D1Database;
  await rejects(() => handleWebhook(signed(fake, value), billingEnv, fake.sdk), 503);
  assert.equal(count('billing_events'), 0);
  assert.equal(count('billing_orders'), 0);
  fail = false;
  await handleWebhook(signed(fake, value), billingEnv, fake.sdk);
  assert.equal(count('billing_events'), 1);
  assert.equal(count('billing_orders'), 1);
});

void test('an older webhook with a delayed stale API response cannot overwrite a newer payment state', async () => {
  const fake = fakeStripe();
  const a = await user();
  const session = await checkout(fake, a);
  let entered!: () => void;
  let release!: () => void;
  const reading = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  let first = true;
  fake.behavior.retrieve = async (_id, value) => {
    const snapshot = structuredClone(value);
    if (first) { first = false; entered(); await gate; }
    return snapshot;
  };
  const oldEvent = event('checkout.session.completed', { id: session.id }, { created: 10 });
  const oldRequest = handleWebhook(signed(fake, oldEvent), billingEnv, fake.sdk);
  await reading;
  session.status = 'complete'; session.payment_status = 'paid';
  await handleWebhook(signed(fake, event('checkout.session.async_payment_succeeded', { id: session.id }, { created: 20 })), billingEnv, fake.sdk);
  release();
  await oldRequest;
  assert.equal(count('billing_events'), 2);
  assert.equal(sqlite.prepare('SELECT status FROM billing_orders').get()!.status, 'paid');
  assert.ok(fake.calls.retrieve.length >= 3, 'A conflict must refresh the remote state');
  await handleWebhook(signed(fake, event('checkout.session.expired', { id: session.id }, { created: 1 })), billingEnv, fake.sdk);
  assert.equal(sqlite.prepare('SELECT status FROM billing_orders').get()!.status, 'paid');
});

void test('signed but unrelated or inconsistent Checkout data cannot be assigned to a user', async () => {
  const fake = fakeStripe();
  const a = await user();
  const b = await user('Bia');
  const session = await checkout(fake, a);
  session.status = 'complete'; session.payment_status = 'paid';
  session.metadata.app_user_id = b.id;
  await rejects(() => handleWebhook(signed(fake, event('checkout.session.completed', { id: session.id })), billingEnv, fake.sdk), 503);
  assert.equal(count('billing_events'), 0);
  assert.equal(count('billing_orders'), 0);
  const unrelated = { ...session, id: 'cs_test_unrelated', client_reference_id: crypto.randomUUID() };
  fake.sessions.set(unrelated.id, unrelated);
  await handleWebhook(signed(fake, event('checkout.session.completed', { id: unrelated.id })), billingEnv, fake.sdk);
  assert.equal(count('billing_orders'), 0);
  assert.equal(count('billing_subscriptions'), 0);
});

void test('subscription lifecycle is associated through owned Checkout and always reads current Stripe state', async () => {
  const fake = fakeStripe();
  const a = await user();
  const b = await user('Bia');
  const session = await checkout(fake, a, 'acompanhamento');
  const subscription: Subscription = {
    id: 'sub_fixtureOne', customer: session.customer, livemode: false,
    status: 'active', cancel_at_period_end: false, metadata: session.metadata,
  };
  fake.subscriptions.set(subscription.id, subscription);
  session.subscription = subscription.id;
  // The subscription event can arrive before Checkout's ownership association.
  const early = event('customer.subscription.created', { ...subscription });
  await rejects(() => handleWebhook(signed(fake, early), billingEnv, fake.sdk), 503);
  assert.equal(count('billing_events'), 0);
  await complete(fake, session);
  await handleWebhook(signed(fake, early), billingEnv, fake.sdk);
  // A delayed historical snapshot says canceled while Stripe says active.
  await handleWebhook(signed(fake, event('customer.subscription.deleted', { ...subscription, status: 'canceled' })), billingEnv, fake.sdk);
  assert.equal(sqlite.prepare('SELECT status FROM billing_subscriptions').get()!.status, 'active');
  subscription.status = 'past_due'; subscription.cancel_at_period_end = true;
  await handleWebhook(signed(fake, event('customer.subscription.updated', { ...subscription, status: 'active' })), billingEnv, fake.sdk);
  const own = await json(await getStatus(request('/api/billing/status', a, undefined, {}, 'GET'), billingEnv));
  assert.deepEqual(own.subscriptions, [{ id: subscription.id, offerKey: 'acompanhamento', status: 'past_due', cancelAtPeriodEnd: 1 }]);
  const other = await json(await getStatus(request('/api/billing/status', b, undefined, {}, 'GET'), billingEnv));
  assert.deepEqual(other.subscriptions, []);
  assert.deepEqual(other.orders, []);
});

const diaryScope = () => billingConfig(billingEnv);
const access = (fake: Fake, person: User) => getDiaryAccess(request('/api/billing/access', person, undefined, {}, 'GET'), billingEnv, fake.sdk, diaryScope());
void test('paid diary cannot be unlocked by login, redirect, browser visitor ID, pending or failed payment', async () => {
  const fake = fakeStripe();
  const person = await user();
  const reading = request('/api/entries?checkout=retorno', person, undefined, { 'x-visitor-id': 'any-id' }, 'GET');
  await rejects(() => requirePaidDiaryUser(reading, billingEnv, fake.sdk, diaryScope()), 402);
  assert.deepEqual(await json(await access(fake, person)), { allowed: false, testMode: true, reason: 'payment_required' });
  const session = await checkout(fake, person);
  await handleWebhook(signed(fake, event('checkout.session.completed', { id: session.id })), billingEnv, fake.sdk);
  assert.equal((await json(await access(fake, person))).allowed, false);
  await handleWebhook(signed(fake, event('checkout.session.async_payment_failed', { id: session.id })), billingEnv, fake.sdk);
  assert.equal((await json(await access(fake, person))).allowed, false);
  assert.equal(sqlite.prepare('SELECT status FROM billing_diary_grants').get()!.status, 'unpaid');
});
void test('owned signed payment grants diary access, remains isolated and prevents another checkout', async () => {
  const fake = fakeStripe();
  const person = await user();
  const other = await user('Bia');
  const session = await checkout(fake, person);
  await complete(fake, session);
  assert.equal((await json(await access(fake, person))).allowed, true);
  assert.equal((await json(await access(fake, other))).allowed, false);
  assert.equal((await requirePaidDiaryUser(request('/api/entries', person, undefined, {}, 'GET'), billingEnv, fake.sdk, diaryScope())).id, person.id);
  await rejects(() => createCheckout(checkoutRequest(person), billingEnv, fake.sdk), 409);
  assert.equal(fake.sessions.size, 1);
  for (const different of [
    { ...billingEnv, STRIPE_ACCOUNT_ID: 'acct_other' },
    { ...billingEnv, STRIPE_MODE: 'live', STRIPE_SECRET_KEY: 'sk_live_fixtureOnlyNoNetwork' },
    { ...billingEnv, STRIPE_OFFERS_JSON: JSON.stringify({ ...PRICES, consulta: 'price_otherDiary' }) },
  ]) {
    const result = await getDiaryAccess(request('/api/billing/access', person, undefined, {}, 'GET'), different, fake.sdk, billingConfig(different));
    assert.equal((await json(result)).allowed, false);
  }
});
void test('another offer, wrong price, wrong amount, and a forged webhook cannot grant diary access', async () => {
  const fake = fakeStripe();
  const person = await user();
  const otherOffer = await checkout(fake, person, 'acompanhamento');
  await complete(fake, otherOffer);
  assert.equal(count('billing_diary_grants'), 0);
  const session = await checkout(fake, person);
  session.status = 'complete'; session.payment_status = 'paid';
  const value = event('checkout.session.completed', { id: session.id });
  await rejects(() => handleWebhook(signed(fake, value, { secret: 'whsec_forged' }), billingEnv, fake.sdk), 400);
  session.amount_total = 1;
  await rejects(() => handleWebhook(signed(fake, value), billingEnv, fake.sdk), 503);
  assert.equal(count('billing_diary_grants'), 0);
  assert.equal(count('billing_orders'), 1, 'Only the other offer has a recorded order');
  session.amount_total = 16700;
  session.price_id = PRICES.acompanhamento;
  await rejects(() => handleWebhook(signed(fake, value), billingEnv, fake.sdk), 503);
  assert.equal(count('billing_diary_grants'), 0);
});
void test('full refunds revoke access and an older Checkout event cannot restore it', async () => {
  const fake = fakeStripe();
  const person = await user();
  const session = await checkout(fake, person);
  await complete(fake, session);
  const intent = fake.intents.get(session.payment_intent)!;
  const charge = fake.charges.get(intent.latest_charge as string)!;
  charge.amount_refunded = charge.amount;
  charge.refunded = true;
  await handleWebhook(signed(fake, event('charge.refunded', { id: charge.id })), billingEnv, fake.sdk);
  assert.equal(sqlite.prepare('SELECT status FROM billing_diary_grants').get()!.status, 'refunded');
  await rejects(() => requirePaidDiaryUser(request('/api/entries', person, undefined, {}, 'GET'), billingEnv, fake.sdk, diaryScope()), 402);
  await handleWebhook(signed(fake, event('checkout.session.completed', { id: session.id }, { created: 1 })), billingEnv, fake.sdk);
  assert.equal((await json(await access(fake, person))).allowed, false);
});
void test('active/lost disputes revoke access; won disputes restore only an already signed purchase', async () => {
  const fake = fakeStripe();
  const person = await user();
  const session = await checkout(fake, person);
  await complete(fake, session);
  const chargeId = fake.intents.get(session.payment_intent)!.latest_charge as string;
  const charge = fake.charges.get(chargeId)!;
  charge.disputed = true;
  const dispute = { id: 'dp_fixtureOne', charge: chargeId, livemode: false, status: 'needs_response' };
  fake.disputes.set(chargeId, [dispute]);
  await handleWebhook(signed(fake, event('charge.dispute.created', dispute)), billingEnv, fake.sdk);
  assert.equal((await json(await access(fake, person))).allowed, false);
  dispute.status = 'lost';
  await handleWebhook(signed(fake, event('charge.dispute.closed', dispute)), billingEnv, fake.sdk);
  assert.equal((await json(await access(fake, person))).allowed, false);
  dispute.status = 'won';
  await handleWebhook(signed(fake, event('charge.dispute.closed', dispute)), billingEnv, fake.sdk);
  assert.equal((await json(await access(fake, person))).allowed, true);
});
void test('stale entitlements reconcile a missed refund and fail closed during a Stripe outage', async () => {
  const fake = fakeStripe();
  const person = await user();
  const session = await checkout(fake, person);
  await complete(fake, session);
  sqlite.prepare('UPDATE billing_diary_grants SET checked_at=0').run();
  fake.behavior.intentFailures = 1;
  await assert.rejects(() => requirePaidDiaryUser(request('/api/entries', person, undefined, {}, 'GET'), billingEnv, fake.sdk, diaryScope()), /Stripe temporarily unavailable/);
  assert.equal(sqlite.prepare('SELECT checked_at FROM billing_diary_grants').get()!.checked_at, 0);
  const charge = fake.charges.get(fake.intents.get(session.payment_intent)!.latest_charge as string)!;
  charge.refunded = true;
  charge.amount_refunded = charge.amount;
  await rejects(() => requirePaidDiaryUser(request('/api/entries', person, undefined, {}, 'GET'), billingEnv, fake.sdk, diaryScope()), 402);
  assert.equal(sqlite.prepare('SELECT status FROM billing_diary_grants').get()!.status, 'refunded');
});
void test('diary access fails closed without a valid protected offer configuration', async () => {
  const fake = fakeStripe();
  const person = await user();
  for (const change of [{ STRIPE_DIARY_OFFER_KEY: '' }, { STRIPE_OFFERS_JSON: '{}' }, { STRIPE_DIARY_OFFER_KEY: 'missing' }]) {
    await rejects(() => getDiaryAccess(request('/api/billing/access', person, undefined, {}, 'GET'), { ...billingEnv, ...change }, fake.sdk, diaryScope()), 503);
  }
});
