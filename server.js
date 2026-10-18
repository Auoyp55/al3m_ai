require('dotenv').config();

const express = require('express');
const path = require('path');
const db = require('./server/database');
const auth = require('./server/auth');

// AETHER_USER_ID_COLUMN
const conversationColumns = db.pragma('table_info(conversations)').rows;
if (!conversationColumns.some(c => c.name === 'user_id')) {
  db.exec('ALTER TABLE conversations ADD COLUMN user_id INTEGER');
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

app.disable('x-powered-by');

// AETHER_SECURITY_HEADERS
app.use((req, res, next) => {
res.setHeader('X-Content-Type-Options', 'nosniff');
res.setHeader('X-Frame-Options', 'SAMEORIGIN');
res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
next();
});
app.use(express.json({ limit: '32kb' }));

// AETHER_API_NO_STORE
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// AETHER_REAL_MAINTENANCE_GATE
app.use((req, res, next) => {
  // إبقاء تسجيل الدخول والإدارة متاحين لإيقاف الصيانة.
  const allowed =
    req.path === '/api/auth' ||
    req.path.startsWith('/api/auth/') ||
    req.path === '/api/admin' ||
    req.path.startsWith('/api/admin/') ||
    req.path === '/api/health';

  if (allowed) return next();

  try {
    const row = db.prepare(
      "SELECT value FROM site_settings WHERE key = 'maintenance_enabled'"
    ).get();

    if (row?.value !== 'true') return next();

    if (req.path.startsWith('/api/')) {
      return res.status(503).json({
        success: false,
        maintenance: true,
        error: 'الموقع تحت الصيانة حاليًا. يرجى المحاولة لاحقًا.'
      });
    }

    res.status(503).type('html').send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#080710">
<title>صيانة مؤقتة | AL3M AI</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;
background:radial-gradient(ellipse at top,#291448,#080710 65%);
color:#f7f4ff;font-family:system-ui,sans-serif;padding:24px;text-align:center}
.card{max-width:480px;width:100%;padding:36px 24px;border:1px solid #39304d;
border-radius:24px;background:#100e1b;box-shadow:0 20px 80px #0008}
.icon{font-size:55px;margin-bottom:15px}
h1{font-size:27px;margin:10px 0;color:#c084fc}
p{color:#aaa2bd;line-height:1.9}
.badge{display:inline-block;padding:8px 14px;border-radius:30px;
background:#a855f71c;color:#d8b4fe;border:1px solid #a855f74d;font-size:13px}
</style>
</head>
<body><main class="card">
<div class="icon">🛠️</div>
<div class="badge">AL3M AI STUDIO</div>
<h1>نعود إليكم قريبًا</h1>
<p>الموقع تحت الصيانة حاليًا لتحسين الأداء وتطوير الخدمات.</p>
<p>يرجى العودة بعد قليل.</p>
</main></body></html>`);
  } catch (error) {
    console.error('Maintenance check error:', error.message);
    return res.status(503).json({
      success: false,
      error: 'تعذر التحقق من حالة الموقع. يرجى المحاولة لاحقًا.'
    });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

const tools = {
  chat: 'You are AL3M AI, a helpful assistant. Answer accurately in the user language.',
  code: 'You are an expert software engineer. Write practical, secure code and explain important decisions.',
  writer: 'You are a professional writing assistant. Produce polished content following the user instructions.',
  translate: 'You are a professional translator. Preserve meaning, tone, and formatting. Ask for the target language if unspecified.',
  analyze: 'Analyze text carefully. Distinguish facts from assumptions and explain uncertainty.'
};

const createConversation = db.prepare(`
  INSERT INTO conversations (user_id, title) VALUES (?, ?)
`);

const getConversation = db.prepare(`
  SELECT id FROM conversations WHERE id = ? AND user_id = ?
`);

const saveMessage = db.prepare(`
  INSERT INTO messages (conversation_id, role, content)
  VALUES (?, ?, ?)
`);

const getHistory = db.prepare(`
  SELECT role, content
  FROM messages
  WHERE conversation_id = ?
  ORDER BY id DESC
  LIMIT 20
`);

const updateConversation = db.prepare(`
  UPDATE conversations
  SET updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const listConversations = db.prepare(`
  SELECT
    c.id,
    c.title,
    c.created_at,
    c.updated_at,
    (SELECT COUNT(*) FROM messages m
     WHERE m.conversation_id = c.id) AS message_count
  FROM conversations c
  WHERE c.user_id = ?
  ORDER BY c.updated_at DESC
  LIMIT 100
`);

const listMessages = db.prepare(`
  SELECT id, role, content, created_at
  FROM messages
  WHERE conversation_id = ?
  ORDER BY id ASC
  LIMIT 500
`);

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    name: 'AL3M AI STUDIO',
    status: 'online',
    aiConfigured: Boolean(process.env.GEMINI_API_KEY),
    database: 'connected',
    model: getAISettings().model,
    aiEnabled: getAISettings().enabled
  });
});

app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    features: {
      chat: true,
      code: true,
      writer: true,
      translate: true,
      analyze: true,
      image: false,
      voice: false,
      conversationHistory: true
    }
  });
});

const requests = new Map();

// تنظيف سجلات تحديد الطلبات القديمة تلقائياً
const requestCleanupTimer = setInterval(() => {
  const now = Date.now();

  for (const [ip, record] of requests) {
    if (!record || now - record.start >= 60000) {
      requests.delete(ip);
    }
  }
}, 60000);

requestCleanupTimer.unref?.();


function rateLimit(req, res, next) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  let record = requests.get(ip);

  if (!record || now - record.start >= 60000) {
    record = { start: now, count: 0 };
  }

  record.count++;
  requests.set(ip, record);

  if (record.count > 15) {
    return res.status(429).json({
      success: false,
      error: 'طلبات كثيرة. انتظر دقيقة ثم حاول مجدداً.'
    });
  }

  next();
}

// AETHER_AUTH_ROUTES
function readSessionToken(req) {
  const cookie = String(req.headers.cookie || '');
  const match = cookie.match(/(?:^|;\s*)aether_session=([A-Za-z0-9_-]{20,100})(?:;|$)/);
  return match ? match[1] : null;
}

function setSessionCookie(req, res, token, maxAge) {
  const parts = [
    'aether_session=' + token,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    'Max-Age=' + maxAge
  ];
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  if (process.env.NODE_ENV === 'production' || req.secure || forwardedProto === 'https') {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function requireAuth(req, res, next) {
  const token = readSessionToken(req);
  const user = token ? auth.getSession(token) : null;
  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'سجّل الدخول أولاً.'
    });
  }
  req.user = user;
  next();
}

app.post('/api/auth/signup', rateLimit, async (req, res) => {
  try {
    const user = await auth.createUser({
      username: req.body?.username,
      email: req.body?.email,
      password: req.body?.password
    });
    const session = auth.createSession(user.id);
    setSessionCookie(req, res, session.token, auth.SESSION_DAYS * 86400);
    res.status(201).json({ success: true, user });
  } catch (error) {
    const known = /اسم المستخدم|البريد الإلكتروني|كلمة المرور|أدخل بريداً|أدخل بريد|بالفعل/.test(error.message || '');
    res.status(known ? 400 : 500).json({
      success: false,
      error: known ? error.message : 'تعذر إنشاء الحساب حالياً.'
    });
  }
});

app.post('/api/auth/login', rateLimit, async (req, res) => {
  try {
    const user = await auth.verifyUser({
      email: req.body?.email,
      password: req.body?.password
    });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'
      });
    }
    const session = auth.createSession(user.id);
    setSessionCookie(req, res, session.token, auth.SESSION_DAYS * 86400);
    res.json({ success: true, user });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({
      success: false,
      error: 'تعذر تسجيل الدخول حالياً.'
    });
  }
});

app.get('/api/auth/me', (req, res) => {
  const token = readSessionToken(req);
  const user = token ? auth.getSession(token) : null;
  if (!user) {
    return res.status(401).json({ success: false, error: 'غير مسجل الدخول.' });
  }
  res.json({ success: true, user });
});

app.post('/api/auth/logout', (req, res) => {
  const token = readSessionToken(req);
  if (token) auth.revokeSession(token);
  setSessionCookie(req, res, '', 0);
  res.json({ success: true });
});


// AETHER_ADMIN_MIDDLEWARE
function requireAdmin(req, res, next) {
  try {
    const admin = db.prepare(`
      SELECT role FROM admin_roles
      WHERE user_id = ?
    `).get(req.user.id);

    if (!admin || !['admin', 'owner'].includes(admin.role)) {
      return res.status(403).json({
        success: false,
        error: 'ليس لديك صلاحية المدير.'
      });
    }

    next();
  } catch (error) {
    console.error('Admin authorization error:', error.message);
    res.status(500).json({
      success: false,
      error: 'تعذر التحقق من صلاحيات المدير.'
    });
  }
}

app.use('/api/admin', requireAuth, requireAdmin);


// AL3M_AI_GOD_MODE
const AI_DEFAULTS = {
  ai_enabled: 'true',
  ai_model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  ai_temperature: '0.7',
  ai_max_output_tokens: '1536'
};

const AI_ALLOWED_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash'
];

function getAISettings() {
  const result = { ...AI_DEFAULTS };
  const rows = db.prepare(`
    SELECT key, value FROM site_settings
    WHERE key IN (
      'ai_enabled',
      'ai_model',
      'ai_temperature',
      'ai_max_output_tokens'
    )
  `).all();

  for (const row of rows) {
    result[row.key] = row.value;
  }

  if (!AI_ALLOWED_MODELS.includes(result.ai_model)) {
    result.ai_model = AI_DEFAULTS.ai_model;
  }

  return {
    enabled: result.ai_enabled === 'true',
    model: result.ai_model,
    temperature: Number(result.ai_temperature),
    maxOutputTokens: Number(result.ai_max_output_tokens)
  };
}

app.get('/api/admin/ai-settings', (req, res) => {
  try {
    const settings = getAISettings();

    res.json({
      success: true,
      settings: {
        ...settings,
        apiKeyConfigured: Boolean(
          process.env.GEMINI_API_KEY &&
          process.env.GEMINI_API_KEY.trim()
        ),
        allowedModels: AI_ALLOWED_MODELS
      }
    });
  } catch (error) {
    console.error('AI settings read error:', error.message);
    res.status(500).json({
      success: false,
      error: 'تعذر تحميل إعدادات الذكاء الاصطناعي.'
    });
  }
});

app.put('/api/admin/ai-settings', (req, res) => {
  const body = req.body || {};

  if (typeof body.enabled !== 'boolean') {
    return res.status(400).json({
      success: false,
      error: 'حالة التشغيل مطلوبة ويجب أن تكون true أو false.'
    });
  }

  if (
    typeof body.model !== 'string' ||
    !AI_ALLOWED_MODELS.includes(body.model)
  ) {
    return res.status(400).json({
      success: false,
      error: 'النموذج المحدد غير موجود في قائمة النماذج المسموحة.',
      allowedModels: AI_ALLOWED_MODELS
    });
  }

  const temperature = Number(body.temperature);
  const maxOutputTokens = Number(body.maxOutputTokens);

  if (
    !Number.isFinite(temperature) ||
    temperature < 0 ||
    temperature > 2
  ) {
    return res.status(400).json({
      success: false,
      error: 'درجة الإبداع يجب أن تكون بين 0 و2.'
    });
  }

  if (
    !Number.isInteger(maxOutputTokens) ||
    maxOutputTokens < 128 ||
    maxOutputTokens > 8192
  ) {
    return res.status(400).json({
      success: false,
      error: 'حد الرد يجب أن يكون عددًا صحيحًا بين 128 و8192.'
    });
  }

  try {
    const values = [
      ['ai_enabled', body.enabled ? 'true' : 'false'],
      ['ai_model', body.model],
      ['ai_temperature', String(temperature)],
      ['ai_max_output_tokens', String(maxOutputTokens)]
    ];

    const statements = values.map(([key, value]) => ({
      sql: `INSERT INTO site_settings (key, value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET
              value = excluded.value,
              updated_at = CURRENT_TIMESTAMP`,
      params: [key, value]
    }));

    statements.push({
      sql: `INSERT INTO admin_audit_logs
            (actor_id, action, details)
            VALUES (?, 'ai_settings_changed', ?)`,
      params: [
        req.user.id,
        JSON.stringify({
          enabled: body.enabled,
          model: body.model,
          temperature,
          maxOutputTokens
        })
      ]
    });

    db.transaction(statements);

    res.json({
      success: true,
      message: 'تم حفظ إعدادات الذكاء الاصطناعي وتطبيقها.',
      settings: getAISettings()
    });
  } catch (error) {
    console.error('AI settings update error:', error.message);
    res.status(500).json({
      success: false,
      error: 'تعذر حفظ إعدادات الذكاء الاصطناعي.'
    });
  }
});




// AETHER_ADMIN_USERS
app.get('/api/admin/users', (req, res) => {
  try {
    const search = String(req.query.search || '').trim().slice(0, 80);

    let users;

    if (search) {
      const pattern = '%' + search.replace(/[\\%_]/g, '\\$&') + '%';

      users = db.prepare(`
        SELECT u.id, u.username, u.email, u.created_at,
          (SELECT COUNT(*) FROM conversations c
           WHERE c.user_id = u.id) AS conversations,
          (SELECT COUNT(*) FROM sessions s
           WHERE s.user_id = u.id AND s.expires_at > ?) AS active_sessions
        FROM users u
        WHERE u.username LIKE ? ESCAPE '\\'
           OR u.email LIKE ? ESCAPE '\\'
        ORDER BY u.id DESC
        LIMIT 100
      `).all(Date.now(), pattern, pattern);
    } else {
      users = db.prepare(`
        SELECT u.id, u.username, u.email, u.created_at,
          (SELECT COUNT(*) FROM conversations c
           WHERE c.user_id = u.id) AS conversations,
          (SELECT COUNT(*) FROM sessions s
           WHERE s.user_id = u.id AND s.expires_at > ?) AS active_sessions
        FROM users u
        ORDER BY u.id DESC
        LIMIT 100
      `).all(Date.now());
    }

    res.json({ success: true, users });
  } catch (error) {
    console.error('Admin users error:', error.message);
    res.status(500).json({
      success: false,
      error: 'تعذر تحميل قائمة المستخدمين.'
    });
  }
});



// AETHER_ADMIN_DELETE_USER
app.delete('/api/admin/users/:id', (req, res) => {
  const targetId = Number(req.params.id);

  if (!Number.isSafeInteger(targetId) || targetId < 1) {
    return res.status(400).json({
      success: false,
      error: 'رقم المستخدم غير صالح.'
    });
  }

  if (targetId === req.user.id) {
    return res.status(400).json({
      success: false,
      error: 'لا يمكنك حذف حسابك الحالي.'
    });
  }

  try {
    const target = db.prepare(
      'SELECT id, username FROM users WHERE id = ?'
    ).get(targetId);

    if (!target) {
      return res.status(404).json({
        success: false,
        error: 'المستخدم غير موجود.'
      });
    }

    const targetAdmin = db.prepare(
      'SELECT user_id FROM admin_roles WHERE user_id = ?'
    ).get(targetId);

    if (targetAdmin) {
      return res.status(403).json({
        success: false,
        error: 'لا يمكن حذف حساب لديه صلاحيات إدارية.'
      });
    }

    db.transaction([
      {
        sql: `DELETE FROM messages
              WHERE conversation_id IN (
                SELECT id FROM conversations WHERE user_id = ?
              )`,
        params: [targetId]
      },
      {
        sql: 'DELETE FROM conversations WHERE user_id = ?',
        params: [targetId]
      },
      {
        sql: 'DELETE FROM sessions WHERE user_id = ?',
        params: [targetId]
      },
      {
        sql: `INSERT INTO admin_audit_logs
              (actor_id, action, target_id, details)
              VALUES (?, 'user_deleted', ?, ?)`,
        params: [req.user.id, targetId, 'Deleted username: ' + target.username]
      },
      {
        sql: 'DELETE FROM users WHERE id = ?',
        params: [targetId]
      }
    ]);

    res.json({
      success: true,
      message: 'تم حذف المستخدم ومحادثاته وجلساته.'
    });
  } catch (error) {
    console.error('Admin delete user error:', error.message);
    res.status(500).json({
      success: false,
      error: 'فشل حذف المستخدم؛ تم التراجع عن المعاملة.'
    });
  }
});



// AETHER_ADMIN_AUDIT_LOGS
app.get('/api/admin/audit-logs', (req, res) => {
  try {
    const rawLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(rawLimit)
      ? Math.max(1, Math.min(rawLimit, 100))
      : 50;

    const logs = db.prepare(`
      SELECT
        a.id,
        a.actor_id,
        u.username AS actor_username,
        a.action,
        a.target_id,
        a.details,
        a.created_at
      FROM admin_audit_logs a
      LEFT JOIN users u ON u.id = a.actor_id
      ORDER BY a.id DESC
      LIMIT ?
    `).all(limit);

    res.json({
      success: true,
      logs
    });
  } catch (error) {
    console.error('Admin audit logs error:', error.message);
    res.status(500).json({
      success: false,
      error: 'تعذر تحميل سجل العمليات.'
    });
  }
});

// AETHER_ADMIN_MAINTENANCE
app.post('/api/admin/maintenance', (req, res) => {
  const enabled = req.body?.enabled;

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({
      success: false,
      error: 'أرسل enabled بقيمة true أو false.'
    });
  }

  try {
    const value = enabled ? 'true' : 'false';

    db.transaction([
      {
        sql: `INSERT INTO site_settings (key, value, updated_at)
              VALUES ('maintenance_enabled', ?, CURRENT_TIMESTAMP)
              ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = CURRENT_TIMESTAMP`,
        params: [value]
      },
      {
        sql: `INSERT INTO admin_audit_logs
              (actor_id, action, details)
              VALUES (?, 'maintenance_changed', ?)`,
        params: [req.user.id, value]
      }
    ]);

    res.json({
      success: true,
      maintenance: enabled,
      message: enabled
        ? 'تم تفعيل وضع الصيانة.'
        : 'تم إيقاف وضع الصيانة.'
    });
  } catch (error) {
    console.error('Maintenance update error:', error.message);
    res.status(500).json({
      success: false,
      error: 'تعذر تغيير وضع الصيانة.'
    });
  }
});



// AETHER_ADMIN_SETTINGS
app.get('/api/admin/settings', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT key, value, updated_at
      FROM site_settings
      ORDER BY key
    `).all();

    res.json({
      success: true,
      settings: rows
    });
  } catch (error) {
    console.error('Admin settings error:', error.message);
    res.status(500).json({
      success: false,
      error: 'تعذر تحميل إعدادات الموقع.'
    });
  }
});


// AETHER_ADMIN_OVERVIEW
app.get('/api/admin/overview', (req, res) => {
  try {
    const users = db.prepare(
      'SELECT COUNT(*) AS total FROM users'
    ).get().total;

    const conversations = db.prepare(
      'SELECT COUNT(*) AS total FROM conversations'
    ).get().total;

    const messages = db.prepare(
      'SELECT COUNT(*) AS total FROM messages'
    ).get().total;

    const sessions = db.prepare(
      'SELECT COUNT(*) AS total FROM sessions WHERE expires_at > ?'
    ).get(Date.now()).total;

    const setting = db.prepare(
      "SELECT value FROM site_settings WHERE key = 'maintenance_enabled'"
    ).get();

    res.json({
      success: true,
      overview: {
        users,
        conversations,
        messages,
        activeSessions: sessions,
        maintenance: setting?.value === 'true'
      }
    });
  } catch (error) {
    console.error('Admin overview error:', error.message);
    res.status(500).json({
      success: false,
      error: 'تعذر تحميل إحصائيات لوحة الإدارة.'
    });
  }
});


app.use(['/api/conversations', '/api/chat'], requireAuth);

app.get('/api/conversations', (req, res) => {
  res.json({
    success: true,
    conversations: listConversations.all(req.user.id)
  });
});

app.get('/api/conversations/:id/messages', (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({
      success: false,
      error: 'معرّف المحادثة غير صالح.'
    });
  }

  if (!getConversation.get(id, req.user.id)) {
    return res.status(404).json({
      success: false,
      error: 'المحادثة غير موجودة.'
    });
  }

  res.json({
    success: true,
    conversationId: id,
    messages: listMessages.all(id)
  });
});


app.delete('/api/conversations/:id', (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({
      success: false,
      error: 'معرّف المحادثة غير صالح.'
    });
  }

  try {
    if (!getConversation.get(id, req.user.id)) {
      return res.status(404).json({
        success: false,
        error: 'المحادثة غير موجودة.'
      });
    }

    db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(id);
    db.prepare('DELETE FROM conversations WHERE id = ?').run(id);

    res.json({ success: true, deletedId: id });
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({
      success: false,
      error: 'تعذر حذف المحادثة.'
    });
  }
});

app.post('/api/chat', rateLimit, async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const message = typeof req.body?.message === 'string'
      ? req.body.message.trim()
      : '';
    const tool = typeof req.body?.tool === 'string'
      ? req.body.tool
      : 'chat';

    const aiSettings = getAISettings();

    if (!aiSettings.enabled) {
      return res.status(503).json({
        success: false,
        error: 'الذكاء الاصطناعي متوقف مؤقتًا من لوحة الإدارة.'
      });
    }

    if (!apiKey || !apiKey.trim()) {
      return res.status(503).json({
        success: false,
        error: 'مفتاح Gemini غير مضبوط في ملف .env.'
      });
    }

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'اكتب رسالة أولاً.'
      });
    }

    if (message.length > 12000) {
      return res.status(413).json({
        success: false,
        error: 'الرسالة طويلة جداً. الحد الأقصى 12000 حرف.'
      });
    }

    if (!tools[tool]) {
      return res.status(400).json({
        success: false,
        error: 'الأداة غير مدعومة حالياً.'
      });
    }

    let conversationId = req.body?.conversationId;
    let isNew = conversationId === undefined ||
                conversationId === null ||
                conversationId === '';

    if (isNew) {
      const title = message.replace(/\s+/g, ' ').slice(0, 70)
        || 'محادثة جديدة';

      const result = createConversation.run(req.user.id, title);
      conversationId = Number(result.lastInsertRowid);
    } else {
      conversationId = Number(conversationId);

      if (!Number.isSafeInteger(conversationId) ||
          conversationId < 1 ||
          !getConversation.get(conversationId, req.user.id)) {
        return res.status(404).json({
          success: false,
          error: 'المحادثة غير موجودة.'
        });
      }
    }

    // احفظ رسالة المستخدم أولاً.
    saveMessage.run(conversationId, 'user', message);
    updateConversation.run(conversationId);

    // استرجع السياق السابق، مع الحفاظ على ترتيب الرسائل.
    const history = getHistory.all(conversationId)
      .reverse()
      .map(item => ({
        role: item.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: item.content }]
      }));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${aiSettings.model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey.trim()
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: tools[tool] }]
          },
          contents: history,
          generationConfig: {
            temperature: aiSettings.temperature,
            maxOutputTokens: aiSettings.maxOutputTokens
          }
        }),
        signal: AbortSignal.timeout(60000)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(
        'Gemini API error:',
        response.status,
        JSON.stringify(data.error || {})
      );

      const status = response.status === 429 ? 429 : 502;

      return res.status(status).json({
        success: false,
        conversationId,
        error: response.status === 429
          ? 'تم بلوغ حد الاستخدام لدى Gemini. تحقق من حصتك وحاول لاحقاً.'
          : 'فشل طلب Gemini. تحقق من إعدادات النموذج والمفتاح.'
      });
    }

    const candidate = data.candidates?.[0];
    const reply = (candidate?.content?.parts || [])
      .map(part => part.text || '')
      .join('\n')
      .trim();

    if (!reply) {
      return res.status(502).json({
        success: false,
        conversationId,
        error: 'لم يُرجع Gemini رداً نصياً.'
      });
    }

    // احفظ رد الذكاء الاصطناعي.
    saveMessage.run(conversationId, 'assistant', reply);
    updateConversation.run(conversationId);

    res.json({
      success: true,
      conversationId,
      tool,
      model: aiSettings.model,
      reply
    });
  } catch (error) {
    console.error('Chat error:', error.message);
    if (error.stderr) console.error('Python STDERR:', error.stderr.toString());
    if (error.stdout) console.error('Python STDOUT:', error.stdout.toString());
    console.error(error.stack || error);

    res.status(500).json({
      success: false,
      error: 'تعذر تنفيذ الطلب. تحقق من الخادم والاتصال.'
    });
  }
});


/* AL3M_ANNOUNCEMENTS_API */

function al3mAuditAnnouncement(req, action, id, details) {
  db.prepare(`
    INSERT INTO admin_audit_logs (actor_id, action, target_id, details)
    VALUES (?, ?, ?, ?)
  `).run(req.user.id, action, id || null, JSON.stringify(details || {}));
}

app.get('/api/announcements', (req, res) => {
  try {
    const announcements = db.prepare(`
      SELECT id, title, message, type, starts_at, ends_at, created_at
      FROM announcements
      WHERE is_active = 1
        AND (starts_at IS NULL OR starts_at = '' OR starts_at <= datetime('now'))
        AND (ends_at IS NULL OR ends_at = '' OR ends_at > datetime('now'))
      ORDER BY id DESC LIMIT 20
    `).all();
    res.json({ success: true, announcements });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: 'تعذر تحميل الإعلانات.' });
  }
});

app.get('/api/admin/announcements', (req, res) => {
  try {
    const announcements = db.prepare(
      'SELECT * FROM announcements ORDER BY id DESC LIMIT 200'
    ).all();
    res.json({ success: true, announcements });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: 'تعذر تحميل الإعلانات.' });
  }
});

app.post('/api/admin/announcements', (req, res) => {
  try {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const type = req.body?.type || 'normal';
    const active = [true, 1, '1', 'true'].includes(req.body?.is_active) ? 1 : 0;
    const startsAt = req.body?.starts_at || null;
    const endsAt = req.body?.ends_at || null;

    if (!title || title.length > 120 || !message || message.length > 3000)
      return res.status(400).json({ success: false, error: 'تحقق من العنوان والنص.' });

    if (!['normal', 'important', 'warning'].includes(type))
      return res.status(400).json({ success: false, error: 'نوع الإعلان غير صالح.' });

    for (const date of [startsAt, endsAt]) {
      if (date && (typeof date !== 'string' || date.length > 40 || Number.isNaN(Date.parse(date))))
        return res.status(400).json({ success: false, error: 'التاريخ غير صالح.' });
    }

    if (startsAt && endsAt && Date.parse(startsAt) >= Date.parse(endsAt))
      return res.status(400).json({ success: false, error: 'تاريخ الانتهاء يجب أن يأتي بعد البداية.' });

    const result = db.prepare(`
      INSERT INTO announcements
      (title, message, type, is_active, starts_at, ends_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(title, message, type, active, startsAt, endsAt, req.user.id);

    const announcement = db.prepare(
      'SELECT * FROM announcements WHERE id = ?'
    ).get(result.lastInsertRowid);

    al3mAuditAnnouncement(req, 'announcement_create', announcement.id, { title, is_active: active });
    res.status(201).json({ success: true, announcement });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: 'تعذر إنشاء الإعلان.' });
  }
});

app.put('/api/admin/announcements/:id', (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isSafeInteger(id) || id < 1)
      return res.status(400).json({ success: false, error: 'المعرّف غير صالح.' });

    const old = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
    if (!old) return res.status(404).json({ success: false, error: 'الإعلان غير موجود.' });

    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : old.title;
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : old.message;
    const type = req.body?.type ?? old.type;
    const active = req.body?.is_active === undefined
      ? old.is_active
      : ([true, 1, '1', 'true'].includes(req.body.is_active) ? 1 : 0);
    const startsAt = req.body?.starts_at === undefined ? old.starts_at : (req.body.starts_at || null);
    const endsAt = req.body?.ends_at === undefined ? old.ends_at : (req.body.ends_at || null);

    if (!title || title.length > 120 || !message || message.length > 3000)
      return res.status(400).json({ success: false, error: 'تحقق من العنوان والنص.' });

    if (!['normal', 'important', 'warning'].includes(type))
      return res.status(400).json({ success: false, error: 'نوع الإعلان غير صالح.' });

    for (const date of [startsAt, endsAt]) {
      if (date && (typeof date !== 'string' || date.length > 40 || Number.isNaN(Date.parse(date))))
        return res.status(400).json({ success: false, error: 'التاريخ غير صالح.' });
    }

    if (startsAt && endsAt && Date.parse(startsAt) >= Date.parse(endsAt))
      return res.status(400).json({ success: false, error: 'تاريخ الانتهاء يجب أن يأتي بعد البداية.' });

    db.prepare(`
      UPDATE announcements
      SET title = ?, message = ?, type = ?, is_active = ?,
          starts_at = ?, ends_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(title, message, type, active, startsAt, endsAt, id);

    al3mAuditAnnouncement(req, 'announcement_update', id, { title, is_active: active });
    res.json({ success: true, announcement: db.prepare(
      'SELECT * FROM announcements WHERE id = ?'
    ).get(id) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: 'تعذر تعديل الإعلان.' });
  }
});

app.delete('/api/admin/announcements/:id', (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isSafeInteger(id) || id < 1)
      return res.status(400).json({ success: false, error: 'المعرّف غير صالح.' });

    const old = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
    if (!old) return res.status(404).json({ success: false, error: 'الإعلان غير موجود.' });

    db.prepare('DELETE FROM announcements WHERE id = ?').run(id);
    al3mAuditAnnouncement(req, 'announcement_delete', id, { title: old.title });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: 'تعذر حذف الإعلان.' });
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'مسار API غير موجود.'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('================================');
  console.log('     AL3M AI STUDIO');
  console.log('================================');
  console.log(`Port: ${PORT}`);
  console.log(`Model: ${MODEL}`);
  console.log(`API key configured: ${Boolean(process.env.GEMINI_API_KEY)}`);
  console.log('Database: connected');
});
