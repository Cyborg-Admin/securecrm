import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const dbPath = path.resolve(process.env.SQLITE_PATH || "./data/securecrm.sqlite");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
const schema = fs.readFileSync(path.resolve("database/schema.sql"), "utf8");
db.exec(schema);
console.log(`SQLite ready at ${dbPath}`);
