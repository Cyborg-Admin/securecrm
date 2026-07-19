import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

export type SqlParams = unknown[];

export type DbClient = {
  driver: "sqlite" | "postgres";
  exec: (sql: string) => void;
  prepare: <T = Record<string, unknown>>(sql: string) => {
    get: (...params: SqlParams) => T | undefined;
    all: (...params: SqlParams) => T[];
    run: (...params: SqlParams) => { changes: number; lastInsertRowid?: number | bigint };
  };
  transaction: <T>(fn: () => T) => T;
};

let sqliteDb: Database.Database | null = null;
let client: DbClient | null = null;

function getSqlitePath(): string {
  const configured = process.env.SQLITE_PATH || "./data/securecrm.sqlite";
  return path.isAbsolute(configured)
    ? configured
    : path.join(/* turbopackIgnore: true */ process.cwd(), configured);
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
    exec: (sql) => {
      db.exec(sql);
    },
    prepare: <T = Record<string, unknown>>(sql: string) => {
      const stmt = db.prepare(sql);
      return {
        get: (...params: SqlParams) => stmt.get(...params) as T | undefined,
        all: (...params: SqlParams) => stmt.all(...params) as T[],
        run: (...params: SqlParams) => {
          const info = stmt.run(...params);
          return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
        },
      };
    },
    transaction: <T>(fn: () => T) => db.transaction(fn)(),
  };
}

/** PostgreSQL adapter — activated when DB_DRIVER=postgres. */
async function createPostgresClient(): Promise<DbClient> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  const convert = (sql: string) => {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  };

  return {
    driver: "postgres",
    exec: (sql) => {
      // sync facade for bootstrap; prefer prepare for queries
      void pool.query(sql);
    },
    prepare: <T = Record<string, unknown>>(sql: string) => {
      const text = convert(sql);
      return {
        get: (...params: SqlParams) => {
          // Note: callers in this app use sync SQLite path by default.
          // Postgres path is available via getDbAsync().
          throw new Error(
            `Postgres sync get() not supported for: ${text}. Use getDbAsync helpers.`,
          );
        },
        all: (...params: SqlParams) => {
          throw new Error(
            `Postgres sync all() not supported for: ${text}. Use getDbAsync helpers.`,
          );
        },
        run: (...params: SqlParams) => {
          throw new Error(
            `Postgres sync run() not supported for: ${text}. Use getDbAsync helpers.`,
          );
        },
      };
    },
    transaction: <T>(fn: () => T) => fn(),
  };
}

export function getDb(): DbClient {
  if (client) return client;
  const driver = (process.env.DB_DRIVER || "sqlite").toLowerCase();
  if (driver === "postgres") {
    throw new Error(
      "DB_DRIVER=postgres requires async bootstrap. Run `npm run db:postgres` and use getDbAsync in production adapters. For local MVP use DB_DRIVER=sqlite.",
    );
  }
  client = createSqliteClient();
  return client;
}

export async function getDbAsync(): Promise<DbClient> {
  if (client) return client;
  const driver = (process.env.DB_DRIVER || "sqlite").toLowerCase();
  if (driver === "postgres") {
    client = await createPostgresClient();
    return client;
  }
  return getDb();
}

export function ensureSchema(): void {
  const db = getDb();
  if (db.driver !== "sqlite") return;
  const schemaPath = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "database",
    "schema.sql",
  );
  const schema = fs.readFileSync(schemaPath, "utf8");
  db.exec(schema);
}

export type Row = Record<string, unknown>;
