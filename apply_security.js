const fs = require('fs');

const file = 'server.js';
let s = fs.readFileSync(file, 'utf8');

function replaceOnce(oldText, newText, label) {
  const first = s.indexOf(oldText);
  if (first < 0 || s.indexOf(oldText, first + oldText.length) >= 0) {
    console.error('تعذر تعديل: ' + label);
    process.exit(1);
  }
  s = s.slice(0, first) + newText + s.slice(first + oldText.length);
}

if (s.includes('AETHER_AUTH_ROUTES')) {
  console.log('الحماية مضافة مسبقاً.');
  process.exit(0);
}

replaceOnce(
  'const createConversation = db.prepare(`\n  INSERT INTO conversations (title) VALUES (?)\n`);',
  'const createConversation = db.prepare(`\n  INSERT INTO conversations (user_id, title) VALUES (?, ?)\n`);',
  'إنشاء المحادثة'
);

replaceOnce(
  'SELECT id FROM conversations WHERE id = ?',
  'SELECT id FROM conversations WHERE id = ? AND user_id = ?',
  'ملكية المحادثة'
);

replaceOnce(
  '  FROM conversations c\n  ORDER BY c.updated_at DESC',
  '  FROM conversations c\n  WHERE c.user_id = ?\n  ORDER BY c.updated_at DESC',
  'قائمة المحادثات'
);

replaceOnce(
  "app.get('/api/conversations', (req, res) => {",
  `// AETHER_AUTH_ROUTES
function readSessionToken(req) {
  const cookie = String(req.headers.cookie || '');
  const match = cookie.match(/(?:^|;\\s*)aether_session=([A-Za-z0-9_-]{20,100})(?:;|$)/);
  return match ? match[1] : null;
}

function setSessionCookie(res, token, maxAge) {
  const parts = [
    'aether_session=' + token,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    'Max-Age=' + maxAge
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
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
    setSessionCookie(res, session.token, auth.SESSION_DAYS * 86400);
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
    setSessionCookie(res, session.token, auth.SESSION_DAYS * 86400);
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
  setSessionCookie(res, '', 0);
  res.json({ success: true });
});

app.use(['/api/conversations', '/api/chat'], requireAuth);

app.get('/api/conversations', (req, res) => {`,
  'مسارات المصادقة والحماية'
);

s = s.replaceAll('listConversations.all()', 'listConversations.all(req.user.id)');
s = s.replaceAll('getConversation.get(id)', 'getConversation.get(id, req.user.id)');
s = s.replaceAll('getConversation.get(conversationId)', 'getConversation.get(conversationId, req.user.id)');
s = s.replaceAll('createConversation.run(title)', 'createConversation.run(req.user.id, title)');

const backup = 'backups/server_before_auth_routes_' + Date.now() + '.js';
fs.copyFileSync(file, backup);
fs.writeFileSync(file, s);

console.log('تم تعديل server.js.');
console.log('النسخة الاحتياطية: ' + backup);
