import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const reflections = sqliteTable('reflections', {
  id: text('id').primaryKey(),
  visitorId: text('visitor_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  title: text('title').notNull().default(''),
  category: text('category').notNull(),
  content: text('content').notNull(),
}, (table) => [index('idx_reflections_visitor_created').on(table.visitorId, table.createdAt)]);

export const emotionalEntries = sqliteTable(
  'emotional_entries',
  {
    id: text('id').primaryKey(),
    visitorId: text('visitor_id').notNull().default('legacy-owner'),
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
    index('idx_emotional_entries_visitor_occurred_at').on(table.visitorId, table.occurredAt),
  ],
);

export const reminderSettings = sqliteTable('reminder_settings', {
  id: text('id').primaryKey(),
  name: text('name').notNull().default(''),
  email: text('email').notNull().default(''),
  phone: text('phone').notNull().default(''),
  times: text('times').notNull().default('[]'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

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
