import { sql } from 'drizzle-orm';
import {
  check,
  uniqueIndex,
  index,
  integer,
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
