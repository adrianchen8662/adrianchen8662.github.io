// A just-enough D1 stand-in on node:sqlite, so the real SQL and migrations run in the tests.
import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { Env } from '../src/types.ts';

class Statement {
  private params: SQLInputValue[] = [];
  private db: DatabaseSync;
  private sql: string;
  constructor(db: DatabaseSync, sql: string) {
    this.db = db;
    this.sql = sql;
  }
  bind(...params: SQLInputValue[]) {
    this.params = params;
    return this;
  }
  private query() {
    const statement = this.db.prepare(this.sql);
    return /^\s*(select|with)/i.test(this.sql)
      ? { results: statement.all(...this.params) as Record<string, unknown>[], meta: { changes: 0 } }
      : { results: [], meta: { changes: Number(statement.run(...this.params).changes) } };
  }
  async run() {
    return { success: true, ...this.query() };
  }
  async all() {
    return { success: true, ...this.query() };
  }
  async first() {
    return this.query().results[0] ?? null;
  }
}

export function createDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  return {
    prepare: (sql: string) => new Statement(sqlite, sql),
    batch: async (statements: Statement[]) => Promise.all(statements.map((statement) => statement.all())),
  } as unknown as D1Database;
}

export function createEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: createDb(),
    LISTENBRAINZ_USER: 'tester',
    ALLOWED_ORIGINS: 'https://example.test, http://localhost:4321',
    ...overrides,
  };
}
