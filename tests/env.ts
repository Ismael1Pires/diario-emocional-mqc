import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
class Statement {
  constructor(
    private database: DatabaseSync,
    private sql: string,
    private args: unknown[] = [],
  ) {}
  bind(...args: unknown[]) {
    return new Statement(this.database, this.sql, args);
  }
  statement() {
    return this.database.prepare(this.sql);
  }
  async first(column?: string) {
    const row = this.statement().get(...(this.args as never[])) ?? null;
    return column && row ? row[column] : row;
  }
  async all() {
    return {
      success: true,
      results: this.statement().all(...(this.args as never[])),
      meta: {},
    };
  }
  runSync() {
    const result = this.statement().run(...(this.args as never[]));
    return { success: true, results: [], meta: { changes: result.changes } };
  }
  async run() {
    return this.runSync();
  }
  async raw() {
    const statement = this.statement();
    statement.setReturnArrays(true);
    return statement.all(...(this.args as never[]));
  }
}
export let sqlite: DatabaseSync;
export const env = {
  DB: {} as D1Database,
  AUTH_SECRET: 'test-only-secret-with-at-least-32-characters',
  AUTH_ORIGIN: 'https://diary.test',
  RESEND_API_KEY: '',
  AUTH_EMAIL_FROM: '',
  STRIPE_SECRET_KEY: 'sk_test_fixtureOnlyNoNetwork',
  STRIPE_WEBHOOK_SECRET: 'whsec_fixtureOnlyNoNetwork',
  STRIPE_ACCOUNT_ID: 'acct_securityFixture',
  STRIPE_MODE: 'test',
  STRIPE_OFFERS_JSON: JSON.stringify({ 'diario-emocional': 'price_diaryFixture' }),
  STRIPE_DIARY_OFFER_KEY: 'diario-emocional',
};
export function reset() {
  sqlite?.close();
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const file of readdirSync('drizzle')
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort())
    sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  env.DB = {
    prepare(sql: string) {
      return new Statement(sqlite, sql);
    },
    async batch(statements: Statement[]) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        // D1 batches are atomic. Do not yield between SQLite statements and
        // create impossible nested transactions during concurrency tests.
        for (const statement of statements) results.push(statement.runSync());
        sqlite.exec('COMMIT');
        return results;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as D1Database;
}
