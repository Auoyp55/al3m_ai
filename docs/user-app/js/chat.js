'use strict';

(() => {
  const $ = id => document.getElementById(id);

  const form = $('chatForm');
  const prompt = $('prompt');
  const sendButton = $('sendButton');
  const messages = $('messages');
  const welcome = $('welcome');
  const typing = $('typing');
  const toast = $('toast');
  const announcementScreen = $('announcementScreen');
  const announcementList = $('announcementList');
  const announcementDot = $('announcementDot');

  let conversationId = null;
  let busy = false;
  let toastTimer;

  function notify(message) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 3500);
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    let data = {};
    try {
      data = await response.json();
    } catch (_) {}

    if (response.status === 401) {
      location.replace('/user-app/');
      throw new Error('انتهت جلسة تسجيل الدخول. سجّل الدخول مجددًا.');
    }

    if (!response.ok || data.success === false) {
      throw new Error(data.error || data.message || `فشل الطلب (${response.status})`);
    }

    return data;
  }

  function addMessage(role, text, isError = false) {
    welcome.hidden = true;
    messages.hidden = false;

    const item = document.createElement('article');
    item.className = `message ${role}` + (isError ? ' error' : '');

    const label = document.createElement('span');
    label.className = 'message-label';
    label.textContent = role === 'user' ? 'أنت' : '✦ AL3M AI';

    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = text;

    item.append(label, content);
    messages.appendChild(item);

    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: 'smooth'
    });

    return content;
  }

  function showThinking(show) {
    typing.hidden = !show;
    sendButton.disabled = show;
    prompt.disabled = show;

    if (show) {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: 'smooth'
      });
    }
  }

  async function sendMessage(rawText) {
    const message = rawText.trim();

    if (!message || busy) return;

    busy = true;
    prompt.value = '';
    prompt.style.height = 'auto';

    addMessage('user', message);
    showThinking(true);

    try {
      const data = await api('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message,
          tool: 'chat',
          ...(conversationId ? { conversationId } : {})
        })
      });

      if (data.conversationId) {
        conversationId = data.conversationId;
      }

      if (typeof data.reply !== 'string' || !data.reply.trim()) {
        throw new Error('وصل رد غير صالح من الخادم. حاول مرة أخرى.');
      }

      addMessage('assistant', data.reply);
    } catch (error) {
      if (error.message) {
        addMessage('assistant', error.message, true);
      } else {
        addMessage(
          'assistant',
          'تعذر الاتصال بالخادم. تحقق من الإنترنت وحالة الخادم، ثم حاول مجددًا.',
          true
        );
      }
    } finally {
      showThinking(false);
      busy = false;
      prompt.focus();
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    sendMessage(prompt.value);
  });

  prompt.addEventListener('input', () => {
    prompt.style.height = 'auto';
    prompt.style.height = Math.min(prompt.scrollHeight, 145) + 'px';
  });

  prompt.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  document.querySelectorAll('.suggestion[data-prompt]').forEach(button => {
    button.addEventListener('click', () => {
      prompt.value = button.dataset.prompt || '';
      prompt.focus();
      prompt.dispatchEvent(new Event('input'));
    });
  });

  $('newChatBtn').addEventListener('click', () => {
    if (busy) return;

    if (!messages.hidden && messages.children.length > 0) {
      const confirmed = window.confirm(
        'بدء محادثة جديدة؟ ستبقى المحادثة الحالية محفوظة في سجل المحادثات.'
      );
      if (!confirmed) return;
    }

    conversationId = null;
    messages.replaceChildren();
    messages.hidden = true;
    welcome.hidden = false;
    prompt.value = '';
    prompt.style.height = 'auto';
    prompt.focus();
  });

  $('announcementsBtn').addEventListener('click', openAnnouncements);

  $('closeAnnouncements').addEventListener('click', () => {
    announcementScreen.hidden = true;
  });

  announcementScreen.addEventListener('click', event => {
    if (event.target === announcementScreen) {
      announcementScreen.hidden = true;
    }
  });

  async function openAnnouncements() {
    announcementScreen.hidden = false;
    announcementList.replaceChildren();

    const loading = document.createElement('p');
    loading.className = 'empty-announcements';
    loading.textContent = 'جارٍ تحميل الإعلانات...';
    announcementList.appendChild(loading);

    try {
      const data = await api('/api/announcements');
      const items = Array.isArray(data.announcements)
        ? data.announcements
        : [];

      announcementList.replaceChildren();
      announcementDot.hidden = true;

      if (!items.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-announcements';
        empty.textContent = 'لا توجد إعلانات جديدة حاليًا.';
        announcementList.appendChild(empty);
        return;
      }

      items.forEach(item => {
        const card = document.createElement('article');
        const type = ['normal', 'important', 'warning'].includes(item.type)
          ? item.type
          : 'normal';

        card.className = `announcement-card ${type}`;

        const title = document.createElement('h3');
        title.textContent = item.title || 'إعلان جديد';

        const body = document.createElement('p');
        body.textContent = item.message || '';

        card.append(title, body);
        announcementList.appendChild(card);
      });
    } catch (error) {
      announcementList.replaceChildren();

      const failed = document.createElement('p');
      failed.className = 'empty-announcements';
      failed.textContent = error.message || 'تعذر تحميل الإعلانات.';
      announcementList.appendChild(failed);
    }
  }

  async function openHistory() {
    const screen = $('historyScreen');
    const listElement = $('historyList');

    screen.hidden = false;
    listElement.replaceChildren();

    const loading = document.createElement('p');
    loading.textContent = 'جارٍ تحميل المحادثات...';
    listElement.appendChild(loading);

    try {
      const data = await api('/api/conversations');
      const items = Array.isArray(data.conversations)
        ? data.conversations
        : [];

      listElement.replaceChildren();

      if (!items.length) {
        const empty = document.createElement('p');
        empty.textContent = 'لا توجد محادثات محفوظة حتى الآن.';
        listElement.appendChild(empty);
        return;
      }

      items.forEach(item => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'suggestion';

        const title = document.createElement('b');
        title.textContent = item.title || 'محادثة سابقة';

        const detail = document.createElement('small');
        const dateValue = item.updated_at || item.created_at;
        let dateText = 'محادثة محفوظة';

        if (dateValue) {
          const date = new Date(dateValue.replace(' ', 'T') + 'Z');
          if (!Number.isNaN(date.getTime())) {
            dateText = date.toLocaleString('ar', {
              dateStyle: 'medium',
              timeStyle: 'short'
            });
          }
        }

        const count = Number(item.message_count || 0);
        detail.textContent = `${dateText} · ${count} رسالة`;

        button.append(title, detail);

        button.addEventListener('click', async () => {
          if (busy) return;

          try {
            const result = await api(
              '/api/conversations/' + encodeURIComponent(item.id) + '/messages'
            );

            const rows = Array.isArray(result.messages) ? result.messages : [];

            messages.replaceChildren();
            welcome.hidden = true;
            messages.hidden = false;
            conversationId = item.id;

            rows.forEach(row => {
              const role = row.role === 'user' ? 'user' : 'assistant';
              const content = row.content ?? row.message ?? '';
              if (typeof content === 'string' && content.trim()) {
                addMessage(role, content);
              }
            });

            screen.hidden = true;
            window.scrollTo({
              top: document.documentElement.scrollHeight,
              behavior: 'smooth'
            });
          } catch (error) {
            notify(error.message || 'تعذر فتح المحادثة.');
          }
        });

        listElement.appendChild(button);
      });
    } catch (error) {
      listElement.replaceChildren();
      const failed = document.createElement('p');
      failed.textContent = error.message || 'تعذر تحميل سجل المحادثات.';
      listElement.appendChild(failed);
    }
  }

  $('historyBtn').addEventListener('click', openHistory);

  $('closeHistory').addEventListener('click', () => {
    $('historyScreen').hidden = true;
  });

  $('historyScreen').addEventListener('click', event => {
    if (event.target === $('historyScreen')) {
      $('historyScreen').hidden = true;
    }
  });

  async function checkSession() {
    try {
      const data = await api('/api/auth/me');

      if (data.user) {
        return;
      }

      location.replace('/user-app/');
    } catch (_) {
      // api() redirects to the login page if the session is invalid.
    }
  }

  async function loadRecentConversation() {
    try {
      const data = await api('/api/conversations');
      const list = Array.isArray(data.conversations)
        ? data.conversations
        : [];

      if (!list.length) return;

      const latest = list[0];
      if (!latest || latest.id == null) return;

      const history = await api(
        '/api/conversations/' + encodeURIComponent(latest.id) + '/messages'
      );

      const rows = Array.isArray(history.messages) ? history.messages : [];
      if (!rows.length) return;

      conversationId = latest.id;

      rows.forEach(row => {
        const role = row.role === 'user' ? 'user' : 'assistant';
        const content = row.content ?? row.message ?? '';
        if (typeof content === 'string' && content.trim()) {
          addMessage(role, content);
        }
      });
    } catch (_) {
      // A failed history request must not disable new conversations.
    }
  }

  async function initialize() {
    try {
      const data = await api('/api/announcements');
      announcementDot.hidden = !(
        Array.isArray(data.announcements) && data.announcements.length
      );
    } catch (_) {
      announcementDot.hidden = true;
    }

    await checkSession();
    await loadRecentConversation();
  }

  // Generate a lightweight star field.
  const stars = $('stars');
  if (stars) {
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < 65; i++) {
      const star = document.createElement('span');
      star.style.cssText = [
        'position:absolute',
        `left:${Math.random() * 100}%`,
        `top:${Math.random() * 100}%`,
        `width:${Math.random() > .85 ? 3 : 2}px`,
        `height:${Math.random() > .85 ? 3 : 2}px`,
        'border-radius:50%',
        'background:#fff',
        `opacity:${.2 + Math.random() * .65}`,
        `animation:moonPulse ${4 + Math.random() * 8}s ease-in-out infinite`
      ].join(';');

      fragment.appendChild(star);
    }

    stars.appendChild(fragment);
  }

  initialize();
})();
