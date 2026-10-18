const fs = require('fs');

const file = 'server.js';
let source = fs.readFileSync(file, 'utf8');

if (source.includes('AL3M_ANNOUNCEMENTS_API')) {
  console.log('واجهات الإعلانات موجودة بالفعل.');
  process.exit(0);
}

const marker = "app.use('/api', (req, res) => {";

if (!source.includes(marker)) {
  console.error('لم يتم العثور على مكان الإضافة.');
  process.exit(1);
}

const routes = `
/* AL3M_ANNOUNCEMENTS_API */

function al3mAuditAnnouncement(req, action, id, details) {
  db.prepare(\`
    INSERT INTO admin_audit_logs (actor_id, action, target_id, details)
    VALUES (?, ?, ?, ?)
  \`).run(req.user.id, action, id || null, JSON.stringify(details || {}));
}

app.get('/api/announcements', (req, res) => {
  try {
    const announcements = db.prepare(\`
      SELECT id, title, message, type, starts_at, ends_at, created_at
      FROM announcements
      WHERE is_active = 1
        AND (starts_at IS NULL OR starts_at = '' OR starts_at <= datetime('now'))
        AND (ends_at IS NULL OR ends_at = '' OR ends_at > datetime('now'))
      ORDER BY id DESC LIMIT 20
    \`).all();
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

    const result = db.prepare(\`
      INSERT INTO announcements
      (title, message, type, is_active, starts_at, ends_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    \`).run(title, message, type, active, startsAt, endsAt, req.user.id);

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

    db.prepare(\`
      UPDATE announcements
      SET title = ?, message = ?, type = ?, is_active = ?,
          starts_at = ?, ends_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    \`).run(title, message, type, active, startsAt, endsAt, id);

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

`;

source = source.replace(marker, routes + marker);
fs.writeFileSync(file, source);
console.log('تمت إضافة واجهات API الإعلانات.');
