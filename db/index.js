import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import { readFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.DB_PATH || resolve(__dirname, '../data/portal.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = readFileSync(resolve(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Add name columns to existing DBs that predate this field
const existingCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
if (!existingCols.includes('first_name')) {
  db.exec("ALTER TABLE users ADD COLUMN first_name TEXT NOT NULL DEFAULT ''");
}
if (!existingCols.includes('last_name')) {
  db.exec("ALTER TABLE users ADD COLUMN last_name TEXT NOT NULL DEFAULT ''");
}

export function bootstrapAdmin() {
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!username || !password) return;

  const adminCount = db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1').get().c;
  if (adminCount > 0) return;

  const hash = bcrypt.hashSync(password, 12);
  db.prepare('INSERT OR IGNORE INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)').run(username, hash);
  const row = db.prepare('SELECT id, is_admin FROM users WHERE username = ?').get(username);
  if (row && !row.is_admin) {
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(row.id);
  }
  console.log(`Bootstrap admin ensured: ${username}`);
}
