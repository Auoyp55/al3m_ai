'use strict';

const crypto = require('crypto');
const { promisify } = require('util');
const db = require('./database');

const scrypt = promisify(crypto.scrypt);
const SESSION_DAYS = 7;

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_token
  ON sessions(token_hash);

  CREATE INDEX IF NOT EXISTS idx_sessions_expiry
  ON sessions(expires_at);
`);

const findByEmail = db.prepare(
  'SELECT id, username, email, password_hash, password_salt FROM users WHERE email = ?'
);

const findByUsername = db.prepare(
  'SELECT id FROM users WHERE username = ?'
);

const insertUser = db.prepare(`
  INSERT INTO users (username, email, password_hash, password_salt)
  VALUES (?, ?, ?, ?)
`);

const insertSession = db.prepare(`
  INSERT INTO sessions (user_id, token_hash, expires_at)
  VALUES (?, ?, ?)
`);

const findSession = db.prepare(`
  SELECT u.id, u.username, u.email
  FROM sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.token_hash = ? AND s.expires_at > ?
`);

const deleteSession = db.prepare(
  'DELETE FROM sessions WHERE token_hash = ?'
);

const hashToken = token =>
  crypto.createHash('sha256').update(token).digest('hex');

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email
  };
}

async function createUser({ username, email, password }) {
  username = typeof username === 'string' ? username.trim() : '';
  email = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
    throw new Error('اسم المستخدم يجب أن يكون من 3 إلى 24 حرفاً إنجليزياً أو رقماً أو _.');
  }

  if (email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('أدخل بريداً إلكترونياً صحيحاً.');
  }

  if (typeof password !== 'string' ||
      password.length < 10 ||
      password.length > 128) {
    throw new Error('كلمة المرور يجب أن تكون بين 10 و128 حرفاً.');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);

  try {
    const result = insertUser.run(
      username,
      email,
      derived.toString('hex'),
      salt
    );

    return {
      id: Number(result.lastInsertRowid),
      username,
      email
    };
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(error.message)) {
      throw new Error('اسم المستخدم أو البريد الإلكتروني مستخدم بالفعل.');
    }
    throw error;
  }
}

async function verifyUser({ email, password }) {
  email = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (typeof password !== 'string' || password.length > 128) {
    return null;
  }

  const user = findByEmail.get(email);
  if (!user) return null;

  const actual = await scrypt(password, user.password_salt, 64);
  const expected = Buffer.from(user.password_hash, 'hex');

  if (actual.length !== expected.length ||
      !crypto.timingSafeEqual(actual, expected)) {
    return null;
  }

  return publicUser(user);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;

  insertSession.run(userId, hashToken(token), expiresAt);

  db.prepare('DELETE FROM sessions WHERE expires_at <= ?')
    .run(Date.now());

  return { token, expiresAt };
}

function getSession(token) {
  if (typeof token !== 'string' || token.length > 100) return null;

  const user = findSession.get(hashToken(token), Date.now());
  return user ? publicUser(user) : null;
}

function revokeSession(token) {
  if (typeof token !== 'string' || token.length > 100) return;
  deleteSession.run(hashToken(token));
}

module.exports = {
  createUser,
  verifyUser,
  createSession,
  getSession,
  revokeSession,
  SESSION_DAYS
};
