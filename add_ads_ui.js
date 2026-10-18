const fs = require('fs');

const file = 'public/index.html';
let html = fs.readFileSync(file, 'utf8');

if (html.includes('AL3M_ANNOUNCEMENT_BANNER')) {
  console.log('شريط الإعلانات موجود بالفعل.');
  process.exit(0);
}

if (!html.includes('<body>') || !html.includes('</style>')) {
  console.error('تعذر تحديد مكان إضافة الشريط.');
  process.exit(1);
}

const css = `
/* AL3M_ANNOUNCEMENT_BANNER */
#al3mAnnouncementArea {
  position:relative;
  z-index:1000;
  width:100%;
  padding:12px 16px 0;
}
.al3m-announcement {
  display:flex;
  align-items:center;
  gap:12px;
  max-width:1100px;
  margin:0 auto;
  padding:14px 16px;
  border:1px solid rgba(168,85,247,.5);
  border-radius:16px;
  background:linear-gradient(115deg,rgba(168,85,247,.2),rgba(66,232,255,.08),#100e1b);
  box-shadow:0 10px 35px rgba(0,0,0,.22);
  animation:al3mBannerIn .4s ease both;
}
.al3m-announcement[data-type="important"] {
  border-color:rgba(66,232,255,.65);
}
.al3m-announcement[data-type="warning"] {
  border-color:rgba(255,180,70,.7);
}
.al3m-announcement-icon {
  flex:0 0 38px;
  height:38px;
  display:grid;
  place-items:center;
  border-radius:12px;
  background:rgba(168,85,247,.2);
  color:#42e8ff;
  font-size:21px;
}
.al3m-announcement-content { min-width:0; flex:1; }
.al3m-announcement-title {
  margin:0 0 4px;
  color:#f7f4ff;
  font-size:14px;
  font-weight:800;
}
.al3m-announcement-message {
  margin:0;
  color:#d2cce4;
  font-size:13px;
  line-height:1.8;
  white-space:pre-wrap;
  overflow-wrap:anywhere;
}
.al3m-announcement-close {
  width:34px;
  height:34px;
  flex:0 0 34px;
  border:1px solid #29243b;
  border-radius:10px;
  color:#918ba8;
  background:#100e1b;
  font-size:20px;
}
@keyframes al3mBannerIn {
  from {opacity:0;transform:translateY(-8px)}
  to {opacity:1;transform:translateY(0)}
}
@media(max-width:600px) {
  #al3mAnnouncementArea {padding:9px 10px 0}
  .al3m-announcement {padding:11px;gap:9px}
}
@media(prefers-reduced-motion:reduce) {
  .al3m-announcement {animation:none}
}
`;

const stylePos = html.lastIndexOf('</style>');
html = html.slice(0, stylePos) + css + '\n' + html.slice(stylePos);

html = html.replace(
  '<body>',
  '<body>\n<div id="al3mAnnouncementArea" aria-live="polite" aria-label="إعلانات الموقع" hidden></div>'
);

const js = `
<script>
/* AL3M_ANNOUNCEMENT_BANNER */
(() => {
  const area = document.getElementById('al3mAnnouncementArea');
  if (!area) return;

  const dismissed = new Set();

  async function loadAnnouncements() {
    try {
      const response = await fetch('/api/announcements', {cache:'no-store'});
      if (!response.ok) return;

      const data = await response.json();
      if (!data.success || !Array.isArray(data.announcements)) return;

      const incoming = data.announcements
        .filter(item => item && item.id != null
          && typeof item.title === 'string'
          && typeof item.message === 'string');

      const ids = new Set(incoming.map(item => String(item.id)));

      [...area.children].forEach(card => {
        if (!ids.has(card.dataset.id)) card.remove();
      });

      const current = new Set(
        [...area.children].map(card => card.dataset.id)
      );

      incoming.slice().reverse().forEach(item => {
        const id = String(item.id);
        if (current.has(id) || dismissed.has(id)) return;

        const card = document.createElement('article');
        card.className = 'al3m-announcement';
        card.dataset.id = id;
        card.dataset.type = ['normal','important','warning'].includes(item.type)
          ? item.type : 'normal';

        const icon = document.createElement('div');
        icon.className = 'al3m-announcement-icon';
        icon.textContent = item.type === 'warning' ? '⚠'
          : item.type === 'important' ? '✦' : '◈';

        const content = document.createElement('div');
        content.className = 'al3m-announcement-content';

        const title = document.createElement('h2');
        title.className = 'al3m-announcement-title';
        title.textContent = item.title;

        const message = document.createElement('p');
        message.className = 'al3m-announcement-message';
        message.textContent = item.message;

        const close = document.createElement('button');
        close.className = 'al3m-announcement-close';
        close.type = 'button';
        close.textContent = '×';
        close.setAttribute('aria-label','إغلاق الإعلان');
        close.addEventListener('click', () => {
          dismissed.add(id);
          card.remove();
          area.hidden = area.children.length === 0;
        });

        content.append(title, message);
        card.append(icon, content, close);
        area.append(card);
        current.add(id);
      });

      area.hidden = area.children.length === 0;
    } catch (_) {}
  }

  loadAnnouncements();
  setInterval(loadAnnouncements, 60000);
})();
</script>
`;

const scriptTag = '<script src="/js/app.js" defer></script>';
if (!html.includes(scriptTag)) {
  console.error('لم يتم العثور على ملف app.js في الصفحة.');
  process.exit(1);
}

html = html.replace(scriptTag, js + '\n' + scriptTag);
fs.writeFileSync(file, html, 'utf8');

console.log('✅ تمت إضافة شريط الإعلانات إلى الموقع.');
