'use strict';

const titles = {
  chat: ['AL3M AI STUDIO', 'المحادثة الذكية', 'جاهز لمساعدتك في أي وقت'],
  code: ['AI CODE LAB', 'مساعد البرمجة', 'اكتب أو اشرح أو صحح الأكواد'],
  writer: ['AI WRITER', 'استوديو الكتابة', 'حوّل أفكارك إلى محتوى احترافي'],
  translate: ['AI TRANSLATE', 'الترجمة الذكية', 'ترجم النصوص بين اللغات'],
  analyze: ['AI ANALYZER', 'تحليل المحتوى', 'حلّل النصوص والأفكار'],
  image: ['AI IMAGE STUDIO', 'أفكار الصور', 'اكتب وصفًا احترافيًا للصورة']
};

const $ = id => document.getElementById(id);

let activeTool = 'chat';
let conversationId = null;

let toastTimer = null;

let historyItems = [];
const HISTORY_PINS_KEY = 'AL3M_SIDEBAR_PINNED_V1';

function getPinnedHistoryIds() {
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_PINS_KEY) || '[]');
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch {
    return new Set();
  }
}

function savePinnedHistoryIds(ids) {
  try {
    localStorage.setItem(HISTORY_PINS_KEY, JSON.stringify([...ids]));
  } catch (error) {
    console.warn('Could not save pinned conversations:', error.message);
  }
}

function renderConversationHistory() {
  const list = $('historyList');
  if (!list) return;

  const search = ($('historySearch')?.value || '').trim().toLocaleLowerCase();
  const pinned = getPinnedHistoryIds();

  const filtered = historyItems.filter(item =>
    String(item.title || `محادثة ${item.id}`).toLocaleLowerCase().includes(search)
  );

  list.replaceChildren();

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'history-no-results';
    empty.textContent = search
      ? 'لا توجد محادثات تطابق بحثك'
      : 'ستظهر محادثاتك هنا';
    list.appendChild(empty);
    return;
  }

  const pinnedItems = filtered.filter(item => pinned.has(String(item.id)));
  const recentItems = filtered.filter(item => !pinned.has(String(item.id)));

  function addGroup(label, items) {
    if (!items.length) return;

    const heading = document.createElement('div');
    heading.className = 'history-group-label';
    heading.textContent = label;
    list.appendChild(heading);

    items.forEach(item => {
      const id = String(item.id);
      const title = item.title || `محادثة ${id}`;
      const row = document.createElement('div');
      row.className = 'history-row';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'history-item';
      button.dataset.id = id;
      button.textContent = title;
      button.title = title;
      button.setAttribute('aria-label', `فتح ${title}`);

      if (Number(id) === Number(conversationId)) {
        button.classList.add('active');
      }

      button.addEventListener('click', () => openConversation(item.id));

      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'history-pin' + (pinned.has(id) ? ' is-pinned' : '');
      pin.textContent = pinned.has(id) ? '📌' : '♧';
      pin.title = pinned.has(id) ? 'إلغاء التثبيت' : 'تثبيت المحادثة';
      pin.setAttribute('aria-label', pin.title);

      pin.addEventListener('click', event => {
        event.stopPropagation();
        const updated = getPinnedHistoryIds();

        if (updated.has(id)) updated.delete(id);
        else updated.add(id);

        savePinnedHistoryIds(updated);
        renderConversationHistory();
      });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'history-delete';
      remove.textContent = '×';
      remove.title = 'حذف المحادثة';
      remove.setAttribute('aria-label', 'حذف المحادثة');

      remove.addEventListener('click', event => {
        event.stopPropagation();
        deleteConversation(item.id, title);
      });

      row.append(button, pin, remove);
      list.appendChild(row);
    });
  }

  addGroup('📌 المحادثات المثبتة', pinnedItems);
  addGroup('◷ المحادثات', recentItems);
}

const STORAGE_KEY = 'AL3M_LOCAL_CHAT_V1';

function saveLocalChat() {
  try {
    const messages = [...$('messages').querySelectorAll('.message')].map(el => ({
      role: el.classList.contains('user-message') ? 'user' : 'assistant',
      text: el.cloneNode(true).textContent.trim()
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      tool: activeTool,
      conversationId,
      messages
    }));
  } catch (error) {
    console.warn('Local chat save failed:', error.message);
  }
}

function restoreLocalChat() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || !Array.isArray(saved.messages)) return;

    if (titles[saved.tool]) selectTool(saved.tool);
    conversationId = saved.conversationId ?? null;

    saved.messages.forEach(item => {
      if (typeof item.text === 'string' && item.text) {
        addMessage(item.text, item.role === 'user' ? 'user' : 'ai');
      }
    });

    if (saved.messages.length) $('hero').style.display = 'none';
  } catch (error) {
    console.warn('Local chat restore failed:', error.message);
  }
}



async function loadConversationHistory() {
  const list = $('historyList');
  if (!list) return;

  try {
    const response = await fetch('/api/conversations', {
      credentials: 'same-origin'
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'تعذر تحميل السجل');
    }

    historyItems = Array.isArray(data.conversations) ? data.conversations : [];
    renderConversationHistory();
  } catch (error) {
    list.replaceChildren();
    const message = document.createElement('div');
    message.className = 'history-empty';
    message.textContent = 'تعذر تحميل سجل المحادثات';
    list.appendChild(message);
    console.warn('History load failed:', error);
  }
}

async function deleteConversation(id, title) {
  if (!confirm(`هل تريد حذف "${title}" نهائيًا؟`)) return;

  try {
    const response = await fetch(
      `/api/conversations/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'تعذر حذف المحادثة');
    }

    if (Number(conversationId) === Number(id)) {
      newChat();
    } else {
      loadConversationHistory();
    }

    toast('تم حذف المحادثة');
  } catch (error) {
    toast(error.message || 'تعذر حذف المحادثة');
  }
}

async function openConversation(id) {
  try {
    const response = await fetch(`/api/conversations/${encodeURIComponent(id)}/messages`);
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'تعذر فتح المحادثة');
    }

    conversationId = data.conversationId;
    clearMessages();
    $('hero').style.display = 'none';

    (data.messages || []).forEach(item => {
      addMessage(item.content, item.role === 'user' ? 'user' : 'ai');
    });

    saveLocalChat();
    loadConversationHistory();
    closeMenu();
    toast('تم فتح المحادثة');
  } catch (error) {
    toast(error.message || 'تعذر فتح المحادثة');
  }
}

function toast(message) {
  const element = $('toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 2300);
}

function closeMenu() {
  document.body.classList.remove('menu-open');
  $('menuButton').setAttribute('aria-expanded', 'false');
}

function selectTool(tool) {
  if (!titles[tool]) return;

  activeTool = tool;

  document.querySelectorAll('[data-tool]').forEach(button => {
    button.classList.toggle('active', button.dataset.tool === tool);
  });

  $('pageTitle').textContent = titles[tool][0];
  $('chatTitle').textContent = titles[tool][1];
  $('toolHint').textContent = titles[tool][2];

  const placeholders = {
    chat: 'اكتب رسالتك هنا... كيف يمكنني مساعدتك؟',
    code: 'اكتب طلبك البرمجي أو ألصق الكود هنا...',
    writer: 'ما النص الذي تريد كتابته أو تحسينه؟',
    translate: 'ألصق النص وحدد اللغة المطلوبة...',
    analyze: 'ألصق النص أو اكتب ما تريد تحليله...',
    image: 'صف الصورة التي تريد صياغة وصف لها...'
  };

  $('prompt').placeholder = placeholders[tool];
  closeMenu();
  $('prompt').focus({ preventScroll: true });
}

function clearMessages() {
  $('messages').replaceChildren();

  const empty = document.createElement('div');
  empty.className = 'empty';

  const symbol = document.createElement('div');
  symbol.className = 'empty-symbol';
  symbol.textContent = '✧';

  const title = document.createElement('strong');
  title.textContent = 'مساحتك، أفكارك، وإبداعك';

  const description = document.createElement('span');
  description.textContent = 'اكتب رسالتك في الأسفل للبدء.';

  empty.append(symbol, title, description);
  $('messages').appendChild(empty);
}

function newChat() {
  conversationId = null;
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  clearMessages();
  $('prompt').value = '';
  $('hero').style.display = '';
  loadConversationHistory();
  toast('بدأت محادثة جديدة');
  closeMenu();
  $('prompt').focus({ preventScroll: true });
}

function addMessage(text, type) {
  const empty = $('messages').querySelector('.empty');
  if (empty) empty.remove();

  const message = document.createElement('div');
  message.className = `message ${type === 'user' ? 'user-message' : 'ai-message'}`;
  message.textContent = text;

  if (type === 'ai') {
    const tools = document.createElement('div');
    tools.className = 'message-tools';

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'نسخ الرد';
    copy.classList.add('copy-reply-button');
    copy.setAttribute('aria-label', 'نسخ الرد');

    copy.addEventListener('click', async () => {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
        } else {
          const area = document.createElement('textarea');
          area.value = text;
          area.style.position = 'fixed';
          area.style.opacity = '0';
          document.body.appendChild(area);
          area.select();
          const copied = document.execCommand('copy');
          area.remove();
          if (!copied) throw new Error('Copy failed');
        }

        copy.textContent = 'تم النسخ ✓';
        copy.classList.add('copied');
        toast('تم نسخ الرد بنجاح');

        setTimeout(() => {
          copy.textContent = 'نسخ الرد';
          copy.classList.remove('copied');
        }, 1800);
      } catch {
        toast('تعذر النسخ؛ حاول مرة أخرى');
      }
    });

    tools.appendChild(copy);
    message.appendChild(tools);
  }

  $('messages').appendChild(message);
  $('messages').scrollTop = $('messages').scrollHeight;
  saveLocalChat();

  return message;
}

function animateAIText(element, text, speed = 12) {
  element.replaceChildren();
  const output = document.createElement("div");
  output.className = "ai-typing-text";
  element.appendChild(output);
  const content = String(text ?? "");
  let index = 0;
  return new Promise(resolve => {
    if (!content || content.length < 45 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      output.textContent = content || "لم يرجع المحرك نصًا.";
      resolve();
      return;
    }
    const timer = setInterval(() => {
      const remaining = content.length - index;
      const chunk = remaining > 700 ? 5 : remaining > 300 ? 4 : remaining > 100 ? 3 : 2;
      output.append(document.createTextNode(content.slice(index, index + chunk)));
      index += chunk;
      const messages = document.getElementById("messages");
      if (messages) messages.scrollTop = messages.scrollHeight;
      if (index >= content.length) { clearInterval(timer); resolve(); }
    }, speed);
  });
}

function showThinking(element) {
  element.replaceChildren();
  const wrap = document.createElement("div");
  wrap.className = "ai-thinking";
  wrap.innerHTML = '<span class="thinking-icon">✦</span><span>أفكر في أفضل إجابة</span><span class="thinking-dots"><i></i><i></i><i></i></span>';
  element.appendChild(wrap);
}
async function checkServer() {
  const status = $('serverStatus');

  try {
    const response = await fetch('/api/health');
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error('Server unavailable');
    }

    status.replaceChildren();

    const dot = document.createElement('span');
    dot.className = 'status-dot';

    status.append(dot, document.createTextNode('الخادم متصل'));
    status.style.color = '#43e6a1';
  } catch {
    status.textContent = '● الخادم غير متاح';
    status.style.color = '#ff7185';
  }
}

document.querySelectorAll('[data-tool]').forEach(button => {
  button.addEventListener('click', () => selectTool(button.dataset.tool));
});

document.querySelectorAll('[data-quick]').forEach(button => {
  button.addEventListener('click', () => {
    selectTool(button.dataset.quick);
    $('chat').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
});

$('menuButton').addEventListener('click', () => {
  const open = document.body.classList.toggle('menu-open');
  $('menuButton').setAttribute('aria-expanded', String(open));
});

$('mobileOverlay').addEventListener('click', closeMenu);
$('newChat').addEventListener('click', newChat);
$('resetChat').addEventListener('click', newChat);

$('clearChat').addEventListener('click', () => {
  newChat();
  closeMenu();
});

function toggleFocus() {
  document.body.classList.toggle('focus-mode');

  const focused = document.body.classList.contains('focus-mode');
  $('hero').style.display = focused ? 'none' : '';
  document.querySelector('.quick-heading').style.display = focused ? 'none' : '';
  document.querySelector('.quick-tools').style.display = focused ? 'none' : '';
  toast(focused ? 'تم تفعيل وضع التركيز' : 'تم إلغاء وضع التركيز');
  closeMenu();
}

$('focusButton').addEventListener('click', toggleFocus);
$('focusSide').addEventListener('click', toggleFocus);

$('copyChat').addEventListener('click', async () => {
  const text = [...$('messages').querySelectorAll('.message')]
    .map(message => {
      const clone = message.cloneNode(true);
      clone.querySelectorAll('.message-tools').forEach(element => element.remove());
      return (message.classList.contains('user-message') ? 'أنت: ' : 'AL3M AI: ')
        + clone.textContent.trim();
    })
    .join('\n\n');

  if (!text) {
    toast('لا توجد رسائل لنسخها');
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    toast('تم نسخ المحادثة');
  } catch {
    toast('تعذر النسخ من المتصفح');
  }
});

$('chatForm').addEventListener('submit', async event => {
  event.preventDefault();

  const input = $('prompt');
  const button = $('sendButton');
  const prompt = input.value.trim();

  if (!prompt || button.disabled) return;

  if (activeTool === 'image') {
    toast('هذه الأداة تصيغ وصف الصورة فقط؛ توليد الصور يحتاج إلى محرك صور.');
  }

  $('hero').style.display = 'none';

  addMessage(prompt, 'user');
  input.value = '';
  input.style.height = 'auto';

  const reply = addMessage('', 'ai');
  showThinking(reply);
  const replyTools = reply.querySelector('.message-tools');
  if (replyTools) replyTools.remove();

  button.disabled = true;
  button.querySelector('span:first-child').textContent = 'انتظر';

  try {
    const payload = {
      message: prompt,
      tool: activeTool
    };

    if (conversationId !== null) {
      payload.conversationId = conversationId;
    }

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (data.conversationId) {
      conversationId = data.conversationId;
    }

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'تعذر تنفيذ الطلب');
    }

    const aiReplyText = data.reply || data.result || 'لم يرجع المحرك نصًا.';
    await animateAIText(reply, aiReplyText);
    saveLocalChat();
    loadConversationHistory();

    const tools = document.createElement('div');
    tools.className = 'message-tools';

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'نسخ الرد';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(data.reply || data.result || '');
        toast('تم نسخ الرد');
      } catch {
        toast('تعذر النسخ من المتصفح');
      }
    });

    tools.appendChild(copy);
    reply.appendChild(tools);

  } catch (error) {
    reply.textContent = 'تعذر تنفيذ الطلب: ' + error.message;
  } finally {
    button.disabled = false;
    button.querySelector('span:first-child').textContent = 'إرسال';
    $('messages').scrollTop = $('messages').scrollHeight;
    input.focus({ preventScroll: true });
  }
});

$('prompt').addEventListener('input', event => {
  const input = event.target;
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 180) + 'px';
});

$('prompt').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    $('chatForm').requestSubmit();
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeMenu();

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    $('prompt').focus();
  }
});


async function initializeAuthenticatedApp() {
  try {
    const response = await fetch('/api/auth/me', {
      credentials: 'same-origin',
      cache: 'no-store'
    });

    if (response.status === 401) {
      location.replace('/auth.html');
      return;
    }

    const data = await response.json();

    if (!response.ok || !data.success || !data.user) {
      throw new Error('تعذر التحقق من جلسة المستخدم.');
    }

    const user = data.user;

    // لا نعرض محادثات محلية قد تخص حسابًا آخر على الجهاز نفسه.
    localStorage.removeItem(STORAGE_KEY);

    const sidebar = $('sidebar');
    if (sidebar && !$('aetherAccountBox')) {
      const box = document.createElement('section');
      box.id = 'aetherAccountBox';
      box.style.cssText =
        'margin-top:auto;padding:14px;border-top:1px solid rgba(185,133,255,.18);';

      const label = document.createElement('div');
      label.textContent = 'الحساب الحالي';
      label.style.cssText = 'font-size:11px;color:#a49bb8;margin-bottom:8px;';

      const username = document.createElement('div');
      username.textContent = '@' + user.username;
      username.style.cssText =
        'font-size:14px;font-weight:700;color:#f5f0ff;overflow-wrap:anywhere;margin-bottom:12px;';

      const logout = document.createElement('button');
      logout.type = 'button';
      logout.textContent = 'تسجيل الخروج';
      logout.style.cssText =
        'width:100%;padding:10px;border:1px solid rgba(185,133,255,.25);' +
        'border-radius:10px;background:#a855f715;color:#f5f0ff;cursor:pointer;';

      logout.addEventListener('click', async () => {
        logout.disabled = true;
        logout.textContent = 'جارٍ تسجيل الخروج...';

        try {
          await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'same-origin'
          });
        } finally {
          localStorage.removeItem(STORAGE_KEY);
          location.replace('/auth.html');
        }
      });

      box.append(label, username, logout);
      sidebar.appendChild(box);
    }

    await loadConversationHistory();
    checkServer();
    setInterval(checkServer, 45000);
  } catch (error) {
    console.error('AETHER authentication error:', error);
    document.body.innerHTML =
      '<main style="font-family:system-ui;background:#080610;color:white;' +
      'min-height:100vh;display:grid;place-content:center;text-align:center;padding:24px">' +
      '<h2>تعذر التحقق من الحساب</h2>' +
      '<p>تأكد أن الخادم يعمل ثم أعد تحميل الصفحة.</p>' +
      '<button onclick="location.reload()" style="padding:12px;border-radius:10px">إعادة المحاولة</button>' +
      '</main>';
  }
}

$('refreshHistory')?.addEventListener('click', loadConversationHistory);

$('historySearch')?.addEventListener('input', renderConversationHistory);

document.addEventListener('keydown', event => {
  if (event.key === '/' &&
      !event.ctrlKey && !event.metaKey && !event.altKey &&
      !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) &&
      !document.activeElement?.isContentEditable) {
    event.preventDefault();
    $('historySearch')?.focus();
  }

  if (event.key === 'Escape' &&
      document.activeElement?.id === 'historySearch') {
    const input = $('historySearch');
    input.value = '';
    renderConversationHistory();
    input.blur();
  }
});

initializeAuthenticatedApp();
