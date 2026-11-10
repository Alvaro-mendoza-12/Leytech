import { PGlite } from "@electric-sql/pglite";
import { Pool, type PoolClient } from "pg";
import path from "node:path";
import fs from "node:fs";

export interface Queryable {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}
export interface Database extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<unknown>;
  close(): Promise<void>;
}
const globalDb = globalThis as unknown as { leytechDb?: Database };
export function getDb(): Database {
  if (globalDb.leytechDb) return globalDb.leytechDb;
  if (process.env.DATABASE_URL) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Math.max(1,Math.min(Number(process.env.DATABASE_POOL_MAX)||(process.env.VERCEL?1:5),10)),
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 15000,
      allowExitOnIdle: true,
      ssl:
        process.env.DATABASE_SSL === "false"
          ? false
          : { rejectUnauthorized: true, ...(process.env.DATABASE_CA_CERT_BASE64 ? {ca: Buffer.from(process.env.DATABASE_CA_CERT_BASE64,'base64').toString('utf8')} : {}) },
    });
    globalDb.leytechDb = {
      query: async <T>(sql: string, params?: unknown[]) => ({
        rows: (await pool.query(sql, params)).rows as T[],
      }),
      exec: (sql) => pool.query(sql),
      close: () => pool.end(),
      transaction: async <T>(fn: (tx: Queryable) => Promise<T>) => {
        const client: PoolClient = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await fn({
            query: async <R>(sql: string, params?: unknown[]) => ({
              rows: (await client.query(sql, params)).rows as R[],
            }),
          });
          await client.query("COMMIT");
          return result;
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
        }
      },
    };
  } else {
    if (process.env.NODE_ENV === "production")
      throw new Error("Producción requiere DATABASE_URL de PostgreSQL.");
    const directory = path.resolve(
      /* turbopackIgnore: true */ process.env.PGLITE_PATH || ".data/leytech",
    );
    if (process.env.PGLITE_PATH !== ":memory:")
      fs.mkdirSync(path.dirname(directory), { recursive: true });
    const local = new PGlite(
      process.env.PGLITE_PATH === ":memory:" ? undefined : directory,
    );
    globalDb.leytechDb = {
      query: async <T>(sql: string, params?: unknown[]) => ({
        rows: (await local.query(sql, params)).rows as T[],
      }),
      exec: (sql) => local.exec(sql),
      close: () => local.close(),
      transaction: async <T>(fn: (tx: Queryable) => Promise<T>) =>
        local.transaction(async (tx) =>
          fn({
            query: async <R>(sql: string, params?: unknown[]) => ({
              rows: (await tx.query(sql, params)).rows as R[],
            }),
          }),
        ),
    };
  }
  return globalDb.leytechDb;
}
export const db: Database = {
  query: (s, p) => getDb().query(s, p),
  transaction: (fn) => getDb().transaction(fn),
  exec: (s) => getDb().exec(s),
  close: () => getDb().close(),
};
