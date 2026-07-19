import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import pg from "pg";

export type SqlParams = unknown[];

export type Stmt<T = Record<string, unknown>> = {
  get: (...params: SqlParams) => Promise<T | undefined>;
  all: (...params: SqlParams) => Promise<T[]>;
  run: (
    ...params: SqlParams
  ) => Promise<{ changes: number; lastInsertRowid?: number | bigint }>;
};

export type DbClient = {
  driver: "sqlite" | "postgres";
  exec: (sql: string) => Promise<void>;
  prepare: <T = Record<string, unknown>>(sql: string) => Stmt<T>;
  transaction: <T>(fn: () => Promise<T> | T) => Promise<T>;
};

let sqliteDb: Database.Database | null = null;
let pgPool: pg.Pool | null = null;
let client: DbClient | null = null;

function getSqlitePath(): string {
  const configured = process.env.SQLITE_PATH || "./data/securecrm.sqlite";
  return path.isAbsolute(configured)
    ? configured
    : path.join(/* turbopackIgnore: true */ process.cwd(), configured);
}

/** Translate SQLite-flavored SQL used in the app into Postgres. */
export function toPostgresSql(sql: string): string {
  let i = 0;
  return sql
    .replace(/datetime\('now'\)/gi, "NOW()")
    .replace(/GROUP_CONCAT\s*\(\s*([^,]+)\s*,\s*'([^']*)'\s*\)/gi, "STRING_AGG($1::text, '$2')")
    .replace(/GROUP_CONCAT\s*\(\s*([^)]+)\s*\)/gi, "STRING_AGG($1::text, ',')")
    .replace(/\?/g, () => `$${++i}`);
}

function createSqliteClient(): DbClient {
  const dbPath = getSqlitePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (!sqliteDb) {
    sqliteDb = new Database(dbPath);
    sqliteDb.pragma("journal_mode = WAL");
    sqliteDb.pragma("foreign_keys = ON");
  }
  const db = sqliteDb;
  return {
    driver: "sqlite",
    exec: async (sql) => {
      db.exec(sql);
    },
    prepare: <T = Record<string, unknown>>(sql: string) => {
      const stmt = db.prepare(sql);
      return {
        get: async (...params: SqlParams) => stmt.get(...params) as T | undefined,
        all: async (...params: SqlParams) => stmt.all(...params) as T[],
        run: async (...params: SqlParams) => {
          const info = stmt.run(...params);
          return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
        },
      };
    },
    transaction: async <T>(fn: () => Promise<T> | T) => {
      const trx = db.transaction(() => {
        throw new Error("USE_ASYNC_TRX");
      });
      // better-sqlite3 transactions must be sync; run manually with BEGIN
      db.exec("BEGIN");
      try {
        const result = await fn();
        db.exec("COMMIT");
        return result;
      } catch (e) {
        db.exec("ROLLBACK");
        // If someone used the sync trx helper incorrectly, ignore
        if (e instanceof Error && e.message === "USE_ASYNC_TRX") {
          /* unreachable */
        }
        throw e;
      } finally {
        void trx;
      }
    },
  };
}

function createPostgresClient(): DbClient {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when DB_DRIVER=postgres");
  }
  if (!pgPool) {
    pgPool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
    });
  }
  const pool = pgPool;

  return {
    driver: "postgres",
    exec: async (sql) => {
      await pool.query(sql);
    },
    prepare: <T = Record<string, unknown>>(sql: string) => {
      const text = toPostgresSql(sql);
      return {
        get: async (...params: SqlParams) => {
          const res = await pool.query(text, params);
          return res.rows[0] as T | undefined;
        },
        all: async (...params: SqlParams) => {
          const res = await pool.query(text, params);
          return res.rows as T[];
        },
        run: async (...params: SqlParams) => {
          const res = await pool.query(text, params);
          return { changes: res.rowCount ?? 0 };
        },
      };
    },
    transaction: async <T>(fn: () => Promise<T> | T) => {
      const conn = await pool.connect();
      try {
        await conn.query("BEGIN");
        // Temporarily route prepare through this connection
        const prev = client;
        const scoped: DbClient = {
          driver: "postgres",
          exec: async (sql) => {
            await conn.query(sql);
          },
          prepare: <R = Record<string, unknown>>(sql: string) => {
            const text = toPostgresSql(sql);
            return {
              get: async (...params: SqlParams) => {
                const res = await conn.query(text, params);
                return res.rows[0] as R | undefined;
              },
              all: async (...params: SqlParams) => {
                const res = await conn.query(text, params);
                return res.rows as R[];
              },
              run: async (...params: SqlParams) => {
                const res = await conn.query(text, params);
                return { changes: res.rowCount ?? 0 };
              },
            };
          },
          transaction: async <U>(inner: () => Promise<U> | U) => {
            return await inner();
          },
        };
        client = scoped;
        const result = await fn();
        await conn.query("COMMIT");
        client = prev;
        return result;
      } catch (e) {
        await conn.query("ROLLBACK");
        throw e;
      } finally {
        conn.release();
      }
    },
  };
}

export function getDbDriver(): "sqlite" | "postgres" {
  return (process.env.DB_DRIVER || "sqlite").toLowerCase() === "postgres"
    ? "postgres"
    : "sqlite";
}

/** Sync accessor — SQLite only. Prefer getDbAsync() everywhere. */
export function getDb(): DbClient {
  if (client) return client;
  if (getDbDriver() === "postgres") {
    throw new Error("Use getDbAsync() when DB_DRIVER=postgres");
  }
  client = createSqliteClient();
  return client;
}

export async function getDbAsync(): Promise<DbClient> {
  if (client) return client;
  if (getDbDriver() === "postgres") {
    client = createPostgresClient();
    return client;
  }
  return getDb();
}

export async function ensureSchema(): Promise<void> {
  const db = await getDbAsync();
  if (db.driver === "sqlite") {
    const schemaPath = path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "database",
      "schema.sql",
    );
    const schema = fs.readFileSync(schemaPath, "utf8");
    await db.exec(schema);
  } else {
    const schemaPath = path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "database",
      "postgres",
      "setup.sql",
    );
    const schema = fs.readFileSync(schemaPath, "utf8");
    await db.exec(schema);
  }

  const { runMigrations } = await import("@/lib/migrations");
  await runMigrations();
}

export type Row = Record<string, unknown>;
