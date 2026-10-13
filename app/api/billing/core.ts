import Stripe from 'stripe';
import { diaryAccessForUser, diaryOffer, diarySessionStatement, diaryEventStatements } from './diary-access';
import {
  configured,
  HttpError,
  json,
  limit,
  readJson,
  requireUser,
  text,
  type AuthEnv,
} from '../auth/core';

export interface BillingEnv extends AuthEnv {
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_ACCOUNT_ID: string;
  STRIPE_MODE: string;
  STRIPE_OFFERS_JSON: string;
  STRIPE_DIARY_OFFER_KEY: string;
}
type Mode = 'test' | 'live';
type Scope = { account: string; mode: Mode; live: boolean };
type User = { id: string; email: string; name: string };
const seconds = () => Math.floor(Date.now() / 1000);
// Stripe can prune idempotency keys after 24h. Uncertain older attempts require
// operator reconciliation; never create a second remote resource automatically.
const RETRY_SECONDS = 23 * 3600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unavailable = () => new HttpError(503, 'Pagamentos temporariamente indisponíveis.');

export function billingConfig(env: BillingEnv): Scope {
  configured(env);
  if (
    !['test', 'live'].includes(env.STRIPE_MODE) ||
    !new RegExp(`^(sk|rk)_${env.STRIPE_MODE}_[A-Za-z0-9]+$`).test(env.STRIPE_SECRET_KEY || '') ||
    !/^acct_[A-Za-z0-9]+$/.test(env.STRIPE_ACCOUNT_ID || '') ||
    !/^whsec_[A-Za-z0-9]+$/.test(env.STRIPE_WEBHOOK_SECRET || '')
  ) throw unavailable();
  return { account: env.STRIPE_ACCOUNT_ID, mode: env.STRIPE_MODE as Mode, live: env.STRIPE_MODE === 'live' };
}
export async function verifyStripeAccount(env: BillingEnv, stripe: Stripe) {
  const scope = billingConfig(env);
  const account = await stripe.accounts.retrieve(null);
  if (account.id !== scope.account) throw unavailable();
  return scope;
}
function offers(env: BillingEnv): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(env.STRIPE_OFFERS_JSON || '');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    const entries = Object.entries(parsed);
    if (!entries.length || entries.length > 20 || entries.some(([key, value]) =>
      !/^[a-z][a-z0-9_-]{0,63}$/.test(key) || typeof value !== 'string' || !/^price_[A-Za-z0-9]+$/.test(value)
    )) throw new Error();
    return Object.fromEntries(entries) as Record<string, string>;
  } catch { throw unavailable(); }
}
export async function retrieveOffer(env: BillingEnv, stripe: Stripe, key: string) {
  const scope = billingConfig(env);
  const catalog = offers(env);
  if (!Object.hasOwn(catalog, key)) throw new HttpError(400, 'Oferta indisponível.');
  const priceId = catalog[key];
  const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
  const product = price.product;
  if (
    price.id !== priceId || !price.active || price.livemode !== scope.live ||
    price.billing_scheme !== 'per_unit' || !Number.isSafeInteger(price.unit_amount) || (price.unit_amount ?? 0) <= 0 ||
    typeof product === 'string' || product.deleted || !product.active || product.livemode !== scope.live ||
    (price.recurring && price.recurring.usage_type !== 'licensed')
  ) throw unavailable();
  if (key === diaryOffer(env).key && (price.type !== 'one_time' || price.recurring)) throw unavailable();
  return {
    key,
    name: product.name,
    description: product.description || '',
    amount: price.unit_amount!,
    currency: price.currency,
    interval: price.recurring?.interval ?? null,
    intervalCount: price.recurring?.interval_count ?? null,
    mode: price.recurring ? 'subscription' as const : 'payment' as const,
    priceId,
  };
}
export async function getCatalog(env: BillingEnv, stripe: Stripe) {
  const scope = await verifyStripeAccount(env, stripe);
  const catalog = await Promise.all(Object.keys(offers(env)).map(key => retrieveOffer(env, stripe, key)));
  return json({ offers: catalog.map(({ priceId: _priceId, ...offer }) => offer), testMode: !scope.live });
}

type CustomerRow = {
  user_id: string; customer_id: string | null; creation_id: string;
  creation_started_at: number; email: string; name: string;
};
export async function ensureCustomer(env: BillingEnv, stripe: Stripe, user: User, scope = billingConfig(env)) {
  await env.DB.prepare(
    'INSERT INTO billing_customers (user_id,account_id,mode,creation_id,creation_started_at,email,name) VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id,account_id,mode) DO NOTHING',
  ).bind(user.id, scope.account, scope.mode, crypto.randomUUID(), seconds(), user.email, user.name).run();
  const read = () => env.DB.prepare('SELECT * FROM billing_customers WHERE user_id=? AND account_id=? AND mode=?')
    .bind(user.id, scope.account, scope.mode).first<CustomerRow>();
  const row = await read();
  if (!row) throw unavailable();
  if (row.customer_id) return row.customer_id;
  if (seconds() - row.creation_started_at >= RETRY_SECONDS) throw unavailable();
  const customer = await stripe.customers.create({
    email: row.email, name: row.name, metadata: { app_user_id: user.id },
  }, { idempotencyKey: `mqc-customer:${scope.account}:${scope.mode}:${row.creation_id}` });
  if (customer.livemode !== scope.live) throw unavailable();
  await env.DB.prepare(
    'UPDATE billing_customers SET customer_id=? WHERE user_id=? AND account_id=? AND mode=? AND creation_id=? AND (customer_id IS NULL OR customer_id=?)',
  ).bind(customer.id, user.id, scope.account, scope.mode, row.creation_id, customer.id).run();
  if ((await read())?.customer_id !== customer.id) throw unavailable();
  return customer.id;
}
type Attempt = {
  user_id: string; offer_key: string; price_id: string; checkout_mode: 'payment' | 'subscription';
  request_id: string; customer_id: string; started_at: number; return_origin: string;
  session_id: string | null; url: string | null;
};
function stripeUrl(value: string | null, hostname: string) {
  if (!value) throw unavailable();
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== hostname || url.username || url.password) throw unavailable();
  return value;
}
export async function createCheckout(request: Request, env: BillingEnv, stripe: Stripe) {
  const user = await requireUser(request, env);
  const scope = billingConfig(env);
  await limit(env, 'billing-checkout', user.id, 10, 3600);
  const body = await readJson(request);
  if (Object.keys(body).some(key => !['offerKey', 'requestId'].includes(key))) throw new HttpError(400, 'Dados inválidos.');
  const offerKey = text(body.offerKey, 64);
  const requestId = text(body.requestId, 36).toLowerCase();
  if (!UUID.test(requestId)) throw new HttpError(400, 'Identificador da tentativa inválido.');
  await verifyStripeAccount(env, stripe);
  const read = () => env.DB.prepare('SELECT * FROM billing_checkout_attempts WHERE account_id=? AND mode=? AND request_id=?')
    .bind(scope.account, scope.mode, requestId).first<Attempt>();
  if (offerKey === diaryOffer(env).key && (await diaryAccessForUser(env, stripe, scope, user, true)).allowed)
    throw new HttpError(409, 'Seu acesso ao Diário Emocional já está liberado. Volte ao diário.');
  const previous = await read();
  if (previous && (previous.user_id !== user.id || previous.offer_key !== offerKey)) throw new HttpError(409, 'Tentativa já utilizada. Inicie uma nova tentativa.');
  const offer = await retrieveOffer(env, stripe, offerKey);
  const customerId = await ensureCustomer(env, stripe, user, scope);
  await env.DB.prepare(
    'INSERT INTO billing_checkout_attempts (account_id,mode,request_id,user_id,offer_key,price_id,checkout_mode,customer_id,started_at,return_origin) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(account_id,mode,request_id) DO NOTHING',
  ).bind(scope.account, scope.mode, requestId, user.id, offerKey, offer.priceId, offer.mode, customerId, seconds(), env.AUTH_ORIGIN).run();
  const attempt = await read();
  if (!attempt || attempt.user_id !== user.id || attempt.offer_key !== offerKey || attempt.price_id !== offer.priceId || attempt.customer_id !== customerId) throw new HttpError(409, 'Tentativa já utilizada. Inicie uma nova tentativa.');
  if (attempt.session_id) {
    const current = await stripe.checkout.sessions.retrieve(attempt.session_id);
    if (current.customer !== customerId || current.livemode !== scope.live) throw unavailable();
    if (current.status !== 'open') throw new HttpError(409, 'Esta tentativa foi concluída ou expirou. Confira o histórico antes de iniciar outra.');
    return json({ url: stripeUrl(current.url, 'checkout.stripe.com') });
  }
  if (seconds() - attempt.started_at >= RETRY_SECONDS) throw unavailable();
  const metadata = { app_user_id: user.id, app_offer_key: offerKey };
  const session = await stripe.checkout.sessions.create({
    mode: attempt.checkout_mode,
    ui_mode: 'hosted_page',
    customer: customerId,
    client_reference_id: requestId,
    line_items: [{ price: attempt.price_id, quantity: 1 }],
    metadata,
    integration_identifier: 'jeniffer-diario-qmxpazrt',
    success_url: `${attempt.return_origin}/pagamentos?checkout=retorno`,
    cancel_url: `${attempt.return_origin}/pagamentos?checkout=cancelado`,
    ...(attempt.checkout_mode === 'subscription'
      ? { subscription_data: { metadata, billing_mode: { type: 'flexible' as const } } }
      : { payment_intent_data: { metadata } }),
  }, { idempotencyKey: `mqc-checkout:${scope.account}:${scope.mode}:${requestId}` });
  if (session.livemode !== scope.live || session.customer !== customerId || session.client_reference_id !== requestId) throw unavailable();
  const url = stripeUrl(session.url, 'checkout.stripe.com');
  await env.DB.prepare(
    'UPDATE billing_checkout_attempts SET session_id=?,url=? WHERE account_id=? AND mode=? AND request_id=? AND user_id=? AND (session_id IS NULL OR session_id=?)',
  ).bind(session.id, url, scope.account, scope.mode, requestId, user.id, session.id).run();
  if ((await read())?.session_id !== session.id) throw unavailable();
  return json({ url });
}
export async function createPortal(request: Request, env: BillingEnv, stripe: Stripe) {
  const user = await requireUser(request, env);
  const scope = billingConfig(env);
  await limit(env, 'billing-portal', user.id, 10, 3600);
  // Accept no client parameters, including customer IDs and redirect URLs.
  if (request.body) {
    const body = await readJson(request);
    if (Object.keys(body).length) throw new HttpError(400, 'Dados inválidos.');
  }
  await verifyStripeAccount(env, stripe);
  const customer = await env.DB.prepare('SELECT customer_id FROM billing_customers WHERE user_id=? AND account_id=? AND mode=?')
    .bind(user.id, scope.account, scope.mode).first<{ customer_id: string | null }>();
  if (!customer?.customer_id) throw new HttpError(404, 'Nenhuma conta de cobrança encontrada.');
  const session = await stripe.billingPortal.sessions.create({ customer: customer.customer_id, return_url: `${env.AUTH_ORIGIN}/pagamentos` });
  return json({ url: stripeUrl(session.url, 'billing.stripe.com') });
}
export async function getStatus(request: Request, env: BillingEnv) {
  const user = await requireUser(request, env);
  const scope = billingConfig(env);
  const customer = await env.DB.prepare('SELECT customer_id FROM billing_customers WHERE user_id=? AND account_id=? AND mode=?')
    .bind(user.id, scope.account, scope.mode).first<{ customer_id: string | null }>();
  const orders = await env.DB.prepare('SELECT session_id AS id,offer_key AS offerKey,status,amount,currency FROM billing_orders WHERE user_id=? AND account_id=? AND mode=? ORDER BY updated_at DESC LIMIT 50')
    .bind(user.id, scope.account, scope.mode).all();
  const subscriptions = await env.DB.prepare('SELECT subscription_id AS id,offer_key AS offerKey,status,cancel_at_period_end AS cancelAtPeriodEnd FROM billing_subscriptions WHERE user_id=? AND account_id=? AND mode=? ORDER BY updated_at DESC LIMIT 50')
    .bind(user.id, scope.account, scope.mode).all();
  return json({ customer: !!customer?.customer_id, orders: orders.results, subscriptions: subscriptions.results, testMode: !scope.live });
}

async function rawBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Evento inválido.');
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1000000) { await reader.cancel(); throw new HttpError(413, 'Evento muito extenso.'); }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new HttpError(400, 'Evento inválido.'); }
}
const objectId = (value: string | { id: string } | null) => typeof value === 'string' ? value : value?.id;
const SESSION_EVENTS = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired']);
type SubscriptionRow = { user_id: string; offer_key: string; customer_id: string; subscription_id: string };

function subscriptionStatement(env: BillingEnv, scope: Scope, row: SubscriptionRow, subscription: Stripe.Subscription) {
  if (subscription.id !== row.subscription_id || objectId(subscription.customer) !== row.customer_id || subscription.livemode !== scope.live) throw unavailable();
  return env.DB.prepare(
    'INSERT INTO billing_subscriptions (account_id,mode,subscription_id,user_id,offer_key,customer_id,status,cancel_at_period_end,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(account_id,mode,subscription_id) DO UPDATE SET status=excluded.status,cancel_at_period_end=excluded.cancel_at_period_end,updated_at=excluded.updated_at',
  ).bind(scope.account, scope.mode, subscription.id, row.user_id, row.offer_key, row.customer_id, subscription.status, subscription.cancel_at_period_end ? 1 : 0, seconds());
}
async function eventEffects(env: BillingEnv, stripe: Stripe, scope: Scope, event: Stripe.Event) {
  const effects: D1PreparedStatement[] = [];
  if (SESSION_EVENTS.has(event.type)) {
    const eventSession = event.data.object as Stripe.Checkout.Session;
    if (!/^cs_[A-Za-z0-9_]+$/.test(eventSession.id)) throw new HttpError(400, 'Evento inválido.');
    const session = await stripe.checkout.sessions.retrieve(eventSession.id);
    if (session.livemode !== scope.live || session.id !== eventSession.id) throw new HttpError(400, 'Ambiente inválido.');
    const attempt = await env.DB.prepare('SELECT * FROM billing_checkout_attempts WHERE account_id=? AND mode=? AND session_id=?')
      .bind(scope.account, scope.mode, session.id).first<Attempt>();
    if (!attempt) {
      // A webhook can beat the durable write after Checkout creation. Retry only
      // for our pending attempt; do not import unrelated Dashboard payments.
      const pending = session.client_reference_id && await env.DB.prepare('SELECT request_id FROM billing_checkout_attempts WHERE account_id=? AND mode=? AND request_id=? AND session_id IS NULL')
        .bind(scope.account, scope.mode, session.client_reference_id).first();
      if (pending) throw unavailable();
      return effects;
    }
    const customer = await env.DB.prepare('SELECT user_id FROM billing_customers WHERE account_id=? AND mode=? AND customer_id=?')
      .bind(scope.account, scope.mode, objectId(session.customer) || '').first<{ user_id: string }>();
    if (!customer || customer.user_id !== attempt.user_id || objectId(session.customer) !== attempt.customer_id || session.client_reference_id !== attempt.request_id || session.mode !== attempt.checkout_mode || session.metadata?.app_user_id !== attempt.user_id || session.metadata?.app_offer_key !== attempt.offer_key) throw unavailable();
    const status = session.payment_status === 'paid' || session.payment_status === 'no_payment_required' ? 'paid'
      : session.status === 'expired' ? 'expired'
      : event.type === 'checkout.session.async_payment_failed' ? 'failed' : 'pending';
    effects.push(env.DB.prepare(
      // Session has no asynchronous-failure field. An older completed event must
      // not replace a recorded failure with pending; a fresh paid state can win.
      'INSERT INTO billing_orders (account_id,mode,session_id,user_id,offer_key,customer_id,status,amount,currency,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(account_id,mode,session_id) DO UPDATE SET status=CASE WHEN billing_orders.status=\'paid\' THEN \'paid\' WHEN billing_orders.status=\'failed\' AND excluded.status=\'pending\' THEN \'failed\' ELSE excluded.status END,amount=excluded.amount,currency=excluded.currency,updated_at=excluded.updated_at',
    ).bind(scope.account, scope.mode, session.id, attempt.user_id, attempt.offer_key, attempt.customer_id, status, session.amount_total, session.currency, seconds()));
    const diaryGrant = await diarySessionStatement(env, stripe, scope, attempt, session);
    if (diaryGrant) effects.push(diaryGrant);
    const subscriptionId = objectId(session.subscription);
    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      effects.push(subscriptionStatement(env, scope, { user_id: attempt.user_id, offer_key: attempt.offer_key, customer_id: attempt.customer_id, subscription_id: subscriptionId }, subscription));
    }
  } else if (event.type.startsWith('customer.subscription.')) {
    const eventSubscription = event.data.object as Stripe.Subscription;
    if (!/^sub_[A-Za-z0-9]+$/.test(eventSubscription.id)) throw new HttpError(400, 'Evento inválido.');
    const known = await env.DB.prepare('SELECT * FROM billing_subscriptions WHERE account_id=? AND mode=? AND subscription_id=?')
      .bind(scope.account, scope.mode, eventSubscription.id).first<SubscriptionRow>();
    if (!known) {
      // Checkout's signed, owned session is the only source of new associations.
      const userId = eventSubscription.metadata?.app_user_id;
      const offerKey = eventSubscription.metadata?.app_offer_key;
      const pending = userId && offerKey && await env.DB.prepare('SELECT request_id FROM billing_checkout_attempts WHERE account_id=? AND mode=? AND user_id=? AND offer_key=? AND checkout_mode=? AND customer_id=? LIMIT 1')
        .bind(scope.account, scope.mode, userId, offerKey, 'subscription', objectId(eventSubscription.customer) || '').first();
      if (pending) throw unavailable();
      return effects;
    }
    const subscription = await stripe.subscriptions.retrieve(known.subscription_id);
    effects.push(subscriptionStatement(env, scope, known, subscription));
  }
  effects.push(...await diaryEventStatements(env, stripe, scope, event));
  return effects;
}
export async function handleWebhook(request: Request, env: BillingEnv, stripe: Stripe) {
  const scope = billingConfig(env);
  const signature = request.headers.get('stripe-signature') || '';
  const payload = await rawBody(request);
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, signature, env.STRIPE_WEBHOOK_SECRET, 300, Stripe.createSubtleCryptoProvider());
  } catch { throw new HttpError(400, 'Assinatura do evento inválida.'); }
  if (event.livemode !== scope.live) throw new HttpError(400, 'Ambiente inválido.');
  // Connect is intentionally excluded. The signing secret must belong to an
  // own-account snapshot endpoint. Also validate the API key's configured account.
  if (event.account) return json({ received: true, ignored: true });
  if (!/^evt_[A-Za-z0-9]+$/.test(event.id)) throw new HttpError(400, 'Evento inválido.');
  await verifyStripeAccount(env, stripe);
  const seen = () => env.DB.prepare('SELECT event_id FROM billing_events WHERE account_id=? AND mode=? AND event_id=?')
    .bind(scope.account, scope.mode, event.id).first();
  if (await seen()) return json({ received: true });
  await env.DB.prepare('INSERT INTO billing_versions (account_id,mode,version) VALUES (?,?,0) ON CONFLICT(account_id,mode) DO NOTHING')
    .bind(scope.account, scope.mode).run();
  for (let retry = 0; retry < 3; retry++) {
    // Read BEFORE retrieving remote current state. A competing commit causes the
    // CHECK constraint below to abort the whole batch and repeat the fresh reads.
    const version = await env.DB.prepare('SELECT version FROM billing_versions WHERE account_id=? AND mode=?')
      .bind(scope.account, scope.mode).first<{ version: number }>();
    if (!version) throw unavailable();
    const effects = await eventEffects(env, stripe, scope, event);
    try {
      await env.DB.batch([
        env.DB.prepare('UPDATE billing_versions SET version=CASE WHEN version=? THEN version+1 ELSE -1 END WHERE account_id=? AND mode=?')
          .bind(version.version, scope.account, scope.mode),
        env.DB.prepare('INSERT INTO billing_events (account_id,mode,event_id,event_type,processed_at) VALUES (?,?,?,?,?)')
          .bind(scope.account, scope.mode, event.id, event.type, seconds()),
        ...effects,
      ]);
      return json({ received: true });
    } catch {
      if (await seen()) return json({ received: true });
      // Includes transient D1 failures. No event is acknowledged without its
      // effects in the same committed transaction; Stripe can retry a 503.
    }
  }
  throw unavailable();
}
