import { sql } from 'drizzle-orm';
import {
  check,
  uniqueIndex,
  index,
  integer,
  primaryKey,
  foreignKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

export const reflections = sqliteTable(
  'reflections',
  {
    id: text('id').primaryKey(),
    visitorId: text('visitor_id').notNull(),
    userId: text('user_id').references(() => authUsers.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    title: text('title').notNull().default(''),
    category: text('category').notNull(),
    content: text('content').notNull(),
  },
  (table) => [
    index('idx_reflections_visitor_created').on(
      table.visitorId,
      table.createdAt,
    ),
    index('reflections_user_created').on(table.userId, table.createdAt),
  ],
);

export const emotionalEntries = sqliteTable(
  'emotional_entries',
  {
    id: text('id').primaryKey(),
    visitorId: text('visitor_id').notNull().default('legacy-owner'),
    userId: text('user_id').references(() => authUsers.id),
    occurredAt: integer('occurred_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    emotion: text('emotion').notNull(),
    intensity: integer('intensity').notNull(),
    trigger: text('trigger').notNull().default(''),
    event: text('event').notNull().default(''),
    thought: text('thought').notNull().default(''),
    bodySensation: text('body_sensation').notNull().default(''),
    reaction: text('reaction').notNull().default(''),
    pattern: text('pattern').notNull().default(''),
    need: text('need').notNull().default(''),
  },
  (table) => [
    index('idx_emotional_entries_occurred_at').on(table.occurredAt),
    index('entries_user_occurred').on(table.userId, table.occurredAt),
    index('idx_emotional_entries_visitor_occurred_at').on(
      table.visitorId,
      table.occurredAt,
    ),
  ],
);

export const reminderSettings = sqliteTable(
  'reminder_settings',
  {
    userId: text('user_id').references(() => authUsers.id),
    id: text('id').primaryKey(),
    name: text('name').notNull().default(''),
    email: text('email').notNull().default(''),
    phone: text('phone').notNull().default(''),
    times: text('times').notNull().default('[]'),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [uniqueIndex('settings_user').on(t.userId)],
);

export const leads = sqliteTable(
  'leads',
  {
    id: text('id').primaryKey(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    name: text('name').notNull(),
    whatsapp: text('whatsapp').notNull(),
    email: text('email').notNull().default(''),
    consent: integer('consent', { mode: 'boolean' }).notNull().default(false),
    source: text('source').notNull().default('meu-diario-emocional'),
  },
  (table) => [index('idx_leads_created_at').on(table.createdAt)],
);

export const authUsers = sqliteTable('auth_users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
});
export const authSessions = sqliteTable(
  'auth_sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [index('auth_sessions_expiry').on(t.expiresAt)],
);
export const authChallenges = sqliteTable(
  'auth_challenges',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    codeHash: text('code_hash').notNull(),
    browserHash: text('browser_hash').notNull(),
    expiresAt: integer('expires_at').notNull(),
    attempts: integer('attempts').notNull().default(0),
    consumed: integer('consumed').notNull().default(0),
  },
  (t) => [index('auth_challenges_expiry').on(t.expiresAt)],
);
export const authLimits = sqliteTable('auth_limits', {
  key: text('key').primaryKey(),
  window: integer('window').notNull(),
  count: integer('count').notNull(),
});
export const legacyMigrationAudit = sqliteTable(
  'legacy_migration_audit',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id').notNull(),
    evidenceReference: text('evidence_reference').notNull(),
    approvedBy: text('approved_by').notNull(),
    approvedAt: integer('approved_at').notNull(),
  },
  (t) => [
    uniqueIndex('legacy_migration_resource').on(t.resourceType, t.resourceId),
    check(
      'legacy_migration_kind',
      sql`${t.resourceType} IN ('entries','reflections','settings')`,
    ),
  ],
);

export const billingCustomers = sqliteTable('billing_customers', {
  userId: text('user_id').notNull().references(() => authUsers.id),
  accountId: text('account_id').notNull(),
  mode: text('mode').notNull(),
  customerId: text('customer_id'),
  creationId: text('creation_id').notNull(),
  creationStartedAt: integer('creation_started_at').notNull(),
  email: text('email').notNull(),
  name: text('name').notNull(),
}, t => [
  primaryKey({ columns: [t.userId, t.accountId, t.mode] }),
  uniqueIndex('billing_customers_remote').on(t.accountId, t.mode, t.customerId),
  check('billing_customers_mode', sql`${t.mode} IN ('test','live')`),
]);
export const billingCheckoutAttempts = sqliteTable('billing_checkout_attempts', {
  accountId: text('account_id').notNull(),
  mode: text('mode').notNull(),
  requestId: text('request_id').notNull(),
  userId: text('user_id').notNull().references(() => authUsers.id),
  offerKey: text('offer_key').notNull(),
  priceId: text('price_id').notNull(),
  checkoutMode: text('checkout_mode').notNull(),
  customerId: text('customer_id').notNull(),
  startedAt: integer('started_at').notNull(),
  returnOrigin: text('return_origin').notNull(),
  sessionId: text('session_id'),
  url: text('url'),
}, t => [
  primaryKey({ columns: [t.accountId, t.mode, t.requestId] }),
  uniqueIndex('billing_attempts_session').on(t.accountId, t.mode, t.sessionId),
  index('billing_attempts_user').on(t.userId, t.accountId, t.mode),
  foreignKey({ columns: [t.accountId, t.mode, t.customerId], foreignColumns: [billingCustomers.accountId, billingCustomers.mode, billingCustomers.customerId] }),
  check('billing_attempts_mode', sql`${t.mode} IN ('test','live')`),
  check('billing_attempts_checkout_mode', sql`${t.checkoutMode} IN ('payment','subscription')`),
]);
export const billingOrders = sqliteTable('billing_orders', {
  accountId: text('account_id').notNull(),
  mode: text('mode').notNull(),
  sessionId: text('session_id').notNull(),
  userId: text('user_id').notNull().references(() => authUsers.id),
  offerKey: text('offer_key').notNull(),
  customerId: text('customer_id').notNull(),
  status: text('status').notNull(),
  amount: integer('amount'),
  currency: text('currency'),
  updatedAt: integer('updated_at').notNull(),
}, t => [
  primaryKey({ columns: [t.accountId, t.mode, t.sessionId] }),
  index('billing_orders_user').on(t.userId, t.accountId, t.mode, t.updatedAt),
  foreignKey({ columns: [t.accountId, t.mode, t.sessionId], foreignColumns: [billingCheckoutAttempts.accountId, billingCheckoutAttempts.mode, billingCheckoutAttempts.sessionId] }),
  check('billing_orders_mode', sql`${t.mode} IN ('test','live')`),
  check('billing_orders_status', sql`${t.status} IN ('paid','pending','failed','expired')`),
]);
export const billingSubscriptions = sqliteTable('billing_subscriptions', {
  accountId: text('account_id').notNull(),
  mode: text('mode').notNull(),
  subscriptionId: text('subscription_id').notNull(),
  userId: text('user_id').notNull().references(() => authUsers.id),
  offerKey: text('offer_key').notNull(),
  customerId: text('customer_id').notNull(),
  status: text('status').notNull(),
  cancelAtPeriodEnd: integer('cancel_at_period_end').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
}, t => [
  primaryKey({ columns: [t.accountId, t.mode, t.subscriptionId] }),
  index('billing_subscriptions_user').on(t.userId, t.accountId, t.mode, t.updatedAt),
  foreignKey({ columns: [t.accountId, t.mode, t.customerId], foreignColumns: [billingCustomers.accountId, billingCustomers.mode, billingCustomers.customerId] }),
  check('billing_subscriptions_mode', sql`${t.mode} IN ('test','live')`),
]);
export const billingEvents = sqliteTable('billing_events', {
  accountId: text('account_id').notNull(),
  mode: text('mode').notNull(),
  eventId: text('event_id').notNull(),
  eventType: text('event_type').notNull(),
  processedAt: integer('processed_at').notNull(),
}, t => [
  primaryKey({ columns: [t.accountId, t.mode, t.eventId] }),
  check('billing_events_mode', sql`${t.mode} IN ('test','live')`),
]);
export const billingVersions = sqliteTable('billing_versions', {
  accountId: text('account_id').notNull(),
  mode: text('mode').notNull(),
  version: integer('version').notNull().default(0),
}, t => [
  primaryKey({ columns: [t.accountId, t.mode] }),
  check('billing_versions_nonnegative', sql`${t.version} >= 0`),
  check('billing_versions_mode', sql`${t.mode} IN ('test','live')`),
]);

export const billingDiaryGrants = sqliteTable('billing_diary_grants', {
  accountId: text('account_id').notNull(),
  mode: text('mode').notNull(),
  sessionId: text('session_id').notNull(),
  userId: text('user_id').notNull().references(() => authUsers.id),
  offerKey: text('offer_key').notNull(),
  priceId: text('price_id').notNull(),
  customerId: text('customer_id').notNull(),
  paymentIntentId: text('payment_intent_id'),
  chargeId: text('charge_id'),
  status: text('status').notNull(),
  checkedAt: integer('checked_at').notNull(),
}, t => [
  primaryKey({ columns: [t.accountId, t.mode, t.sessionId] }),
  index('billing_diary_grants_user').on(t.userId, t.accountId, t.mode, t.offerKey, t.priceId),
  index('billing_diary_grants_charge').on(t.accountId, t.mode, t.chargeId),
  index('billing_diary_grants_intent').on(t.accountId, t.mode, t.paymentIntentId),
  foreignKey({ columns: [t.accountId, t.mode, t.sessionId], foreignColumns: [billingOrders.accountId, billingOrders.mode, billingOrders.sessionId] }),
  check('billing_diary_grants_mode', sql`${t.mode} IN ('test','live')`),
  check('billing_diary_grants_status', sql`${t.status} IN ('active','unpaid','refunded','disputed')`),
]);
