'use strict';

const crypto = require('crypto');
const { promisify } = require('util');
const { query } = require('./postgres');

const scrypt = promisify(crypto.scrypt);
const SESSION_DAYS = 7;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function publicUser(user) {
  return {
    id: Number(user.id),
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

  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('أدخل بريداً إلكترونياً صحيحاً.');
  }

  if (typeof password !== 'string' || password.length < 10 || password.length > 128) {
    throw new Error('كلمة المرور يجب أن تكون بين 10 و128 حرفاً.');
  }

  const existing = await query(
    'SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2) LIMIT 1',
    [username, email]
  );

  if (existing.rowCount) {
    throw new Error('اسم المستخدم أو البريد الإلكتروني مستخدم بالفعل.');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);

  try {
    const result = await query(
      `INSERT INTO users (username, email, password_hash, password_salt)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, email`,
      [username, email, derived.toString('hex'), salt]
    );

    return publicUser(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
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

  const result = await query(
    `SELECT id, username, email, password_hash, password_salt
     FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email]
  );

  const user = result.rows[0];
  if (!user) return null;

  const actual = await scrypt(password, user.password_salt, 64);
  const expected = Buffer.from(user.password_hash, 'hex');

  if (actual.length !== expected.length ||
      !crypto.timingSafeEqual(actual, expected)) {
    return null;
  }

  return publicUser(user);
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);

  await query(
    `DELETE FROM sessions WHERE expires_at <= NOW()`
  );

  const result = await query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 day'))
     RETURNING expires_at`,
    [userId, tokenHash, SESSION_DAYS]
  );

  return {
    token,
    expiresAt: new Date(result.rows[0].expires_at).getTime()
  };
}

async function getSession(token) {
  if (typeof token !== 'string' || token.length > 100) return null;

  const result = await query(
    `SELECT u.id, u.username, u.email
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()
     LIMIT 1`,
    [hashToken(token)]
  );

  return result.rows[0] ? publicUser(result.rows[0]) : null;
}

async function revokeSession(token) {
  if (typeof token !== 'string' || token.length > 100) return;

  await query(
    'DELETE FROM sessions WHERE token_hash = $1',
    [hashToken(token)]
  );
}

module.exports = {
  createUser,
  verifyUser,
  createSession,
  getSession,
  revokeSession,
  SESSION_DAYS
};
