const path = require('path');
const { execFileSync } = require('child_process');

const dbPath = path.join(__dirname, '..', 'data', 'studio.db');
const bridge = path.join(__dirname, 'sqlite_bridge.py');

function call(action, sql = '', params = [], statements = []) {
  const output = execFileSync('python', [bridge], {
    input: JSON.stringify({ dbPath, action, sql, params, statements }),
    encoding: 'utf8'
  });

  const result = JSON.parse(output);

  if (result && result.error) {
    throw new Error(result.error);
  }

  return result;
}

const db = {
  exec(sql) {
    return call('exec', sql);
  },

  pragma(sql) {
    return call('pragma', sql);
  },

  transaction(statements) {
    return call('transaction', '', [], statements);
  },

  prepare(sql) {
    return {
      run(...params) {
        return call('run', sql, params);
      },
      get(...params) {
        return call('get', sql, params);
      },
      all(...params) {
        return call('all', sql, params);
      }
    };
  }
};

module.exports = db;


// AETHER ADMIN TABLES
const adminTables = `
  CREATE TABLE IF NOT EXISTS admin_roles (
    user_id INTEGER PRIMARY KEY,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    target_id INTEGER,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  INSERT OR IGNORE INTO site_settings (key, value)
  VALUES ('maintenance_enabled', 'false');

  INSERT OR IGNORE INTO site_settings (key, value)
  VALUES ('maintenance_message', 'الموقع تحت الصيانة، يرجى العودة لاحقاً.');
`;

db.exec(adminTables);
