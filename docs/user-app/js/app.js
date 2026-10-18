(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const sky = $('sky');
  const stars = $('stars');
  const form = $('loginForm');
  const message = $('message');
  const password = $('password');

  // نجوم متحركة
  if (stars) {
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < 65; i++) {
      const star = document.createElement('i');

      star.style.cssText = `
        position:absolute;
        left:${Math.random() * 100}%;
        top:${Math.random() * 75}%;
        width:${Math.random() > .8 ? 3 : 2}px;
        height:${Math.random() > .8 ? 3 : 2}px;
        border-radius:50%;
        background:#fff;
        opacity:.7;
        box-shadow:0 0 6px #d7d0ff;
        animation:al3mStar ${2 + Math.random() * 5}s ease-in-out infinite alternate;
      `;

      fragment.appendChild(star);
    }

    stars.appendChild(fragment);

    const style = document.createElement('style');
    style.textContent = `
      @keyframes al3mStar {
        from { opacity:.2; transform:scale(.7); }
        to { opacity:1; transform:scale(1.4); }
      }
    `;
    document.head.appendChild(style);
  }

  // تغيير السماء حسب الوقت المحلي
  function updateSky() {
    const hour = new Date().getHours();
    let colors;

    if (hour >= 5 && hour < 8) {
      colors = ['#30244f', '#a05f89', '#f0a77e'];
    } else if (hour >= 8 && hour < 16) {
      colors = ['#2473ad', '#63a9d0', '#d5b7e9'];
    } else if (hour >= 16 && hour < 19) {
      colors = ['#321b52', '#a04f78', '#ee936e'];
    } else {
      colors = ['#050716', '#151b43', '#403967'];
    }

    document.documentElement.style.setProperty('--sky-top', colors[0]);
    document.documentElement.style.setProperty('--sky-mid', colors[1]);
    document.documentElement.style.setProperty('--sky-bottom', colors[2]);

    if (sky) {
      sky.dataset.time =
        hour >= 5 && hour < 8 ? 'sunrise' :
        hour >= 8 && hour < 16 ? 'day' :
        hour >= 16 && hour < 19 ? 'sunset' : 'night';
    }
  }

  updateSky();
  setInterval(updateSky, 60000);

  // إظهار وإخفاء كلمة المرور
  $('showPassword')?.addEventListener('click', () => {
    if (!password) return;

    const show = password.type === 'password';
    password.type = show ? 'text' : 'password';

    $('showPassword').textContent = show ? '◎' : '◉';
    $('showPassword').setAttribute(
      'aria-label',
      show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'
    );
  });

  function showMessage(text, error = true) {
    if (!message) return;

    message.textContent = text;
    message.style.color = error ? '#ffc6d5' : '#a7ffd6';
    message.classList.add('visible');
  }

  // تذكّر البريد فقط، وليس كلمة المرور
  const rememberedEmail = localStorage.getItem('al3m_remembered_email');

  if (rememberedEmail && $('email')) {
    $('email').value = rememberedEmail;
    if ($('remember')) $('remember').checked = true;
  }

  // التحقق من الجلسة الحالية
  async function checkSession() {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'same-origin'
      });

      if (response.ok) {
        location.replace('/user-app/chat.html');
      }
    } catch {
      // يمكن للمستخدم المحاولة مجددًا عند إرسال النموذج
    }
  }

  // تسجيل الدخول الحقيقي عبر الخادم
  if (form) {
    form.addEventListener('submit', async event => {
      event.preventDefault();

      const email = $('email')?.value.trim();
      const passwordValue = password?.value;
      const remember = $('remember')?.checked ?? false;
      const button = form.querySelector('.login-button');

      if (!email || !passwordValue) {
        showMessage('أدخل البريد الإلكتروني وكلمة المرور.');
        return;
      }

      if (button) {
        button.disabled = true;
        button.style.opacity = '.65';
      }

      showMessage('جارٍ التحقق من بيانات حسابك...', false);

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email,
            password: passwordValue
          })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'فشل تسجيل الدخول.');
        }

        if (remember) {
          localStorage.setItem('al3m_remembered_email', email);
        } else {
          localStorage.removeItem('al3m_remembered_email');
        }

        showMessage('تم تسجيل الدخول بنجاح. جارٍ فتح AL3M AI...', false);

        setTimeout(() => {
          location.replace('/user-app/chat.html');
        }, 500);

      } catch (error) {
        showMessage(
          error.message || 'تعذر الاتصال بالخادم. تحقق من الإنترنت.'
        );
      } finally {
        if (button) {
          button.disabled = false;
          button.style.opacity = '1';
        }
      }
    });
  }

  // الانتقال إلى صفحة المصادقة الحقيقية في الموقع
  $('createAccount')?.addEventListener('click', () => {
    location.href = '/auth.html';
  });

  $('forgotPassword')?.addEventListener('click', () => {
    showMessage(
      'استعادة كلمة المرور غير مفعّلة حاليًا. استخدم صفحة الدعم عند توفرها.'
    );
  });

  checkSession();
})();
