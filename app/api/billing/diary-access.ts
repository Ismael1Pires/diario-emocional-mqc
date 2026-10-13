import type Stripe from 'stripe';
import { HttpError, requireUser, json } from '../auth/core';
import type { BillingEnv } from './core';

export type DiaryScope = { account: string; mode: 'test' | 'live'; live: boolean };
type User = { id: string; email: string; name: string };
export type DiaryAttempt = {
  user_id: string; offer_key: string; price_id: string; checkout_mode: string;
  customer_id: string; session_id?: string | null;
};
type Grant = DiaryAttempt & {
  session_id: string; payment_intent_id: string | null; charge_id: string | null;
  status: string; checked_at: number;
};
const now = () => Math.floor(Date.now() / 1000);
const unavailable = () => new HttpError(503, 'A confirmação do pagamento está temporariamente indisponível.');
const CACHE_SECONDS = 60;

export function diaryOffer(env: BillingEnv) {
  const key = env.STRIPE_DIARY_OFFER_KEY;
  let catalog: Record<string, unknown>;
  try { catalog = JSON.parse(env.STRIPE_OFFERS_JSON || ''); }
  catch { throw unavailable(); }
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(key || '') || !catalog || typeof catalog !== 'object' ||
    Array.isArray(catalog) || !Object.hasOwn(catalog, key) ||
    typeof catalog[key] !== 'string' || !/^price_[A-Za-z0-9]+$/.test(catalog[key] as string)) throw unavailable();
  return { key, priceId: catalog[key] as string };
}
const id = (value: string | { id: string } | null | undefined) => typeof value === 'string' ? value : value?.id;

async function snapshot(env: BillingEnv, stripe: Stripe, scope: DiaryScope, attempt: DiaryAttempt, session: Stripe.Checkout.Session) {
  const offer = diaryOffer(env);
  if (attempt.offer_key !== offer.key || attempt.price_id !== offer.priceId ||
    attempt.checkout_mode !== 'payment' || session.mode !== 'payment' ||
    session.livemode !== scope.live || id(session.customer) !== attempt.customer_id ||
    session.metadata?.app_user_id !== attempt.user_id || session.metadata?.app_offer_key !== offer.key) throw unavailable();
  const price = await stripe.prices.retrieve(offer.priceId);
  if (price.id !== offer.priceId || price.livemode !== scope.live || price.type !== 'one_time' || price.recurring ||
    price.billing_scheme !== 'per_unit' || !Number.isSafeInteger(price.unit_amount) || (price.unit_amount ?? 0) <= 0) throw unavailable();
  const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 2 });
  const item = items.data[0];
  if (items.has_more || items.data.length !== 1 || item.price?.id !== offer.priceId || item.quantity !== 1 ||
    item.currency !== price.currency || item.amount_subtotal !== price.unit_amount ||
    session.currency !== price.currency || (session.amount_total ?? 0) < price.unit_amount!) throw unavailable();

  const paymentIntentId = id(session.payment_intent);
  if (session.status !== 'complete' || session.payment_status !== 'paid' || !paymentIntentId)
    return { paymentIntentId: paymentIntentId ?? null, chargeId: null, status: 'unpaid' };
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
  if (intent.id !== paymentIntentId || intent.livemode !== scope.live || id(intent.customer) !== attempt.customer_id ||
    intent.currency !== price.currency || intent.amount < price.unit_amount! ||
    intent.metadata.app_user_id !== attempt.user_id || intent.metadata.app_offer_key !== offer.key) throw unavailable();
  const chargeId = id(intent.latest_charge);
  if (intent.status !== 'succeeded' || !chargeId) return { paymentIntentId, chargeId: chargeId ?? null, status: 'unpaid' };
  const charge = typeof intent.latest_charge === 'string' ? await stripe.charges.retrieve(chargeId) : intent.latest_charge;
  if (!charge || charge.id !== chargeId || charge.livemode !== scope.live || id(charge.customer) !== attempt.customer_id ||
    id(charge.payment_intent) !== paymentIntentId || charge.currency !== price.currency ||
    charge.amount < price.unit_amount!) throw unavailable();
  if (!charge.paid || !charge.captured || charge.amount_captured < price.unit_amount!)
    return { paymentIntentId, chargeId, status: 'unpaid' };
  if (charge.refunded || charge.amount_refunded >= charge.amount)
    return { paymentIntentId, chargeId, status: 'refunded' };
  // Read current disputes rather than trusting an old event or the sticky
  // charge.disputed flag. A won/closed inquiry does not permanently revoke access.
  const disputes = await stripe.disputes.list({ charge: chargeId, limit: 100 });
  if (disputes.has_more || (charge.disputed && !disputes.data.length) ||
    disputes.data.some(dispute => id(dispute.charge) !== chargeId ||
      dispute.livemode !== scope.live || !['won', 'warning_closed'].includes(dispute.status)))
    return { paymentIntentId, chargeId, status: 'disputed' };
  return { paymentIntentId, chargeId, status: 'active' };
}

export async function diarySessionStatement(env: BillingEnv, stripe: Stripe, scope: DiaryScope, attempt: DiaryAttempt, session: Stripe.Checkout.Session) {
  const offer = diaryOffer(env);
  if (attempt.offer_key !== offer.key) return null;
  const current = await snapshot(env, stripe, scope, attempt, session);
  return env.DB.prepare(
    'INSERT INTO billing_diary_grants (account_id,mode,session_id,user_id,offer_key,price_id,customer_id,payment_intent_id,charge_id,status,checked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(account_id,mode,session_id) DO UPDATE SET payment_intent_id=excluded.payment_intent_id,charge_id=excluded.charge_id,status=excluded.status,checked_at=excluded.checked_at',
  ).bind(scope.account, scope.mode, session.id, attempt.user_id, attempt.offer_key, attempt.price_id, attempt.customer_id,
    current.paymentIntentId, current.chargeId, current.status, now());
}
async function reconcileGrant(env: BillingEnv, stripe: Stripe, scope: DiaryScope, grant: Grant) {
  const session = await stripe.checkout.sessions.retrieve(grant.session_id);
  if (session.id !== grant.session_id) throw unavailable();
  const attempt = await env.DB.prepare('SELECT * FROM billing_checkout_attempts WHERE account_id=? AND mode=? AND session_id=? AND user_id=?')
    .bind(scope.account, scope.mode, grant.session_id, grant.user_id).first<DiaryAttempt & { request_id: string }>();
  if (!attempt || session.client_reference_id !== attempt.request_id || attempt.user_id !== grant.user_id ||
    attempt.customer_id !== grant.customer_id || attempt.price_id !== grant.price_id) throw unavailable();
  return diarySessionStatement(env, stripe, scope, attempt, session);
}

const REVOCATION_EVENTS = new Set([
  'charge.refunded', 'charge.updated', 'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed',
  'charge.dispute.funds_withdrawn', 'charge.dispute.funds_reinstated',
  'refund.created', 'refund.updated', 'refund.failed', 'payment_intent.succeeded', 'payment_intent.payment_failed',
]);
export async function diaryEventStatements(env: BillingEnv, stripe: Stripe, scope: DiaryScope, event: Stripe.Event) {
  if (!REVOCATION_EVENTS.has(event.type)) return [];
  const object = event.data.object as unknown as { id: string; charge?: string | { id: string }; payment_intent?: string | { id: string } };
  const chargeId = event.type.startsWith('charge.dispute.') || event.type.startsWith('refund.')
    ? id(object.charge) : event.type.startsWith('charge.') ? object.id : undefined;
  const paymentIntentId = event.type.startsWith('payment_intent.') ? object.id : id(object.payment_intent);
  if (!chargeId && !paymentIntentId) return [];
  const grants = await env.DB.prepare('SELECT * FROM billing_diary_grants WHERE account_id=? AND mode=? AND (charge_id=? OR payment_intent_id=?)')
    .bind(scope.account, scope.mode, chargeId ?? '', paymentIntentId ?? '').all<Grant>();
  const statements: D1PreparedStatement[] = [];
  for (const grant of grants.results) {
    const statement = await reconcileGrant(env, stripe, scope, grant);
    if (statement) statements.push(statement);
  }
  return statements;
}

async function readGrants(env: BillingEnv, scope: DiaryScope, user: User) {
  const offer = diaryOffer(env);
  const rows = await env.DB.prepare('SELECT * FROM billing_diary_grants WHERE account_id=? AND mode=? AND user_id=? AND offer_key=? AND price_id=? ORDER BY checked_at DESC')
    .bind(scope.account, scope.mode, user.id, offer.key, offer.priceId).all<Grant>();
  return rows.results;
}
export async function diaryAccessForUser(env: BillingEnv, stripe: Stripe, scope: DiaryScope, user: User, force = false) {
  const initial = await readGrants(env, scope, user);
  if (!initial.length) return { allowed: false, testMode: !scope.live, reason: 'payment_required' };
  if (!force && initial.every(grant => grant.checked_at <= now() && now() - grant.checked_at < CACHE_SECONDS))
    return { allowed: initial.some(grant => grant.status === 'active'), testMode: !scope.live, reason: initial.some(grant => grant.status === 'active') ? 'paid' : 'payment_required' };
  // Never create grants here. Only a signed, owned Checkout event can establish
  // an entitlement. This path refreshes known purchases and fails closed on errors.
  if ((await stripe.accounts.retrieve(null)).id !== scope.account) throw unavailable();
  await env.DB.prepare('INSERT INTO billing_versions (account_id,mode,version) VALUES (?,?,0) ON CONFLICT(account_id,mode) DO NOTHING')
    .bind(scope.account, scope.mode).run();
  for (let retry = 0; retry < 3; retry++) {
    const version = await env.DB.prepare('SELECT version FROM billing_versions WHERE account_id=? AND mode=?')
      .bind(scope.account, scope.mode).first<{ version: number }>();
    if (!version) throw unavailable();
    const grants = await readGrants(env, scope, user);
    const statements: D1PreparedStatement[] = [];
    for (const grant of grants) {
      const statement = await reconcileGrant(env, stripe, scope, grant);
      if (statement) statements.push(statement);
    }
    try {
      await env.DB.batch([
        env.DB.prepare('UPDATE billing_versions SET version=CASE WHEN version=? THEN version+1 ELSE -1 END WHERE account_id=? AND mode=?')
          .bind(version.version, scope.account, scope.mode),
        ...statements,
      ]);
      const refreshed = await readGrants(env, scope, user);
      const allowed = refreshed.some(grant => grant.status === 'active');
      return { allowed, testMode: !scope.live, reason: allowed ? 'paid' : 'payment_required' };
    } catch { /* A concurrent webhook requires new authoritative reads. */ }
  }
  throw unavailable();
}
export async function getDiaryAccess(request: Request, env: BillingEnv, stripe: Stripe, scope: DiaryScope) {
  const user = await requireUser(request, env);
  return json(await diaryAccessForUser(env, stripe, scope, user, true));
}
export async function requirePaidDiaryUser(request: Request, env: BillingEnv, stripe: Stripe, scope: DiaryScope) {
  const user = await requireUser(request, env);
  if (!(await diaryAccessForUser(env, stripe, scope, user)).allowed)
    throw new HttpError(402, 'Conclua o pagamento do Diário Emocional para acessar.');
  return user;
}
