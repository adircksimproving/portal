import bcrypt from 'bcrypt';
import { db } from './index.js';

const BCRYPT_COST = 12;

export function findUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username);
}

export function findUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function listUsers() {
  return db.prepare('SELECT id, username, is_admin, created_at, last_login_at FROM users ORDER BY username COLLATE NOCASE').all();
}

export function createUser({ username, password, isAdmin = false }) {
  const hash = bcrypt.hashSync(password, BCRYPT_COST);
  const result = db.prepare(
    'INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)'
  ).run(username, hash, isAdmin ? 1 : 0);
  return findUserById(result.lastInsertRowid);
}

export function verifyPassword(user, password) {
  return bcrypt.compareSync(password, user.password_hash);
}

export function updateLastLogin(userId) {
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(userId);
}

export function updateUsername(userId, username) {
  db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, userId);
}

export function updatePassword(userId, password) {
  const hash = bcrypt.hashSync(password, BCRYPT_COST);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
}

export function setAdmin(userId, isAdmin) {
  db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin ? 1 : 0, userId);
}

export function deleteUser(userId) {
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
}

export function countAdmins() {
  return db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1').get().c;
}
