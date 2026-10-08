import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
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
  async run() {
    const result = this.statement().run(...(this.args as never[]));
    return { success: true, results: [], meta: { changes: result.changes } };
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
};
export function reset() {
  sqlite?.close();
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const file of [
    '0000_curly_mach_iv.sql',
    '0001_lumpy_ted_forrester.sql',
    '0002_brainy_captain_flint.sql',
    '0003_secure_auth.sql',
  ])
    sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  env.DB = {
    prepare(sql: string) {
      return new Statement(sqlite, sql);
    },
    async batch(statements: Statement[]) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as D1Database;
}
