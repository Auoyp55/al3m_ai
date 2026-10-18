(() => {
  'use strict';

  const themes = {
    purple: {
      name: 'الثيمات (Royal Purple)',
      bg: '#080710',
      surface: '#100e1b',
      surface2: '#171426',
      border: '#39304d',
      accent: '#a855f7',
      glow: '#c084fc',
      cyan: '#42e8ff',
      text: '#f7f4ff',
      muted: '#918ba8'
    },
    blue: {
      name: 'Cyber Blue',
      bg: '#060b14',
      surface: '#0c1525',
      surface2: '#122039',
      border: '#263d5b',
      accent: '#398bff',
      glow: '#67b7ff',
      cyan: '#43e8ff',
      text: '#f0f7ff',
      muted: '#93a8c2'
    },
    matrix: {
      name: 'Matrix',
      bg: '#050b08',
      surface: '#0b1510',
      surface2: '#102219',
      border: '#234633',
      accent: '#20d878',
      glow: '#65ffad',
      cyan: '#8dffcb',
      text: '#edfff4',
      muted: '#8eae9b'
    },
    crimson: {
      name: 'Crimson',
      bg: '#100609',
      surface: '#1b0d13',
      surface2: '#29111b',
      border: '#512331',
      accent: '#f04468',
      glow: '#ff7892',
      cyan: '#ff9fbd',
      text: '#fff2f5',
      muted: '#b99aa4'
    },
    arctic: {
      name: 'Arctic',
      bg: '#edf3fa',
      surface: '#ffffff',
      surface2: '#e1eaf5',
      border: '#c5d3e5',
      accent: '#4269db',
      glow: '#6287ff',
      cyan: '#168da8',
      text: '#172238',
      muted: '#64748b'
    },
    galaxy: {
      name: 'Galaxy',
      bg: '#09051a',
      surface: '#130d2b',
      surface2: '#20133b',
      border: '#493064',
      accent: '#e056fd',
      glow: '#f0abfc',
      cyan: '#55e7ff',
      text: '#fff5ff',
      muted: '#b1a0c9'
    }
  };

  const root = document.documentElement;
  const key = 'AL3M_THEME_V1';

  function applyTheme(id) {
    const theme = themes[id] || themes.purple;

    Object.entries(theme).forEach(([name, value]) => {
      if (name !== 'name') {
        root.style.setProperty('--' + name, value);
      }
    });

    // توحيد ألوان الموقع وصفحة تسجيل الدخول
    root.style.setProperty('--purple', theme.accent);
    root.style.setProperty('--green', theme.accent);
    root.style.setProperty('--panel', theme.surface);
    root.style.setProperty('--background', theme.bg);
    root.style.setProperty('--foreground', theme.text);
    root.style.setProperty('--primary', theme.accent);

    root.dataset.theme = id in themes ? id : 'purple';
    root.style.colorScheme = id === 'arctic' ? 'light' : 'dark';

    try {
      localStorage.setItem(key, root.dataset.theme);
    } catch {}

    const label = document.getElementById('themeLabel');
    if (label) label.textContent = theme.name;

    const menu = document.getElementById('themeMenu');
    if (menu) {
      menu.querySelectorAll('[data-theme-choice]').forEach(button => {
        const active = button.dataset.themeChoice === root.dataset.theme;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    }
  }

  function addThemeControl() {
    if (document.getElementById('themeControl')) return;

    const control = document.createElement('div');
    control.id = 'themeControl';
    control.innerHTML = `
      <button id="themeToggle" type="button"
        aria-expanded="false" aria-controls="themeMenu">
        <span aria-hidden="true">🎨</span>
        <span id="themeLabel">الثيمات</span>
        <span aria-hidden="true">⌄</span>
      </button>
      <div id="themeMenu" hidden>
        <div class="theme-heading">اختر مظهر منصتك</div>
        ${Object.entries(themes).map(([id, theme]) => `
          <button type="button" data-theme-choice="${id}"
            aria-pressed="false">
            <span class="theme-dot" style="--dot:${theme.accent}"></span>
            <span>${theme.name}</span>
            <span class="theme-check">✓</span>
          </button>
        `).join('')}
      </div>
    `;

    const sidebar = document.getElementById('sidebar');
    const nav = sidebar ? sidebar.querySelector('.nav-list') : null;

    if (nav) {
      const themeButton = document.createElement('button');
      themeButton.type = 'button';
      themeButton.className = 'nav-btn';
      themeButton.id = 'sidebarThemeButton';
      themeButton.innerHTML = '<span class="nav-icon">🎨</span><span class="nav-copy"><strong>الثيمات</strong><small>THEME STUDIO</small></span>';
      nav.appendChild(themeButton);
      themeButton.addEventListener('click', () => {
        menu.hidden = !menu.hidden;
        toggle.setAttribute('aria-expanded', String(!menu.hidden));
      });
      control.style.position = 'static';
      control.style.top = 'auto';
      control.style.left = 'auto';
      control.style.zIndex = '100';
      control.style.margin = '8px 0';
      control.style.padding = '0 8px';
      toggle.style.display = 'none';
      control.querySelector('#themeMenu').style.position = 'static';
      control.querySelector('#themeMenu').style.width = 'auto';
      control.querySelector('#themeMenu').style.marginTop = '6px';
      control.querySelector('#themeMenu').style.boxSizing = 'border-box';
      nav.parentElement.insertBefore(control, nav.nextSibling);
    } else {
      document.body.appendChild(control);
    }

    const toggle = document.getElementById('themeToggle');
    const menu = document.getElementById('themeMenu');

    toggle.addEventListener('click', () => {
      menu.hidden = !menu.hidden;
      toggle.setAttribute('aria-expanded', String(!menu.hidden));
    });

    menu.querySelectorAll('[data-theme-choice]').forEach(button => {
      button.addEventListener('click', () => {
        applyTheme(button.dataset.themeChoice);
        menu.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
      });
    });

    document.addEventListener('click', event => {
      if (!control.contains(event.target) &&
          !event.target.closest('#sidebarThemeButton')) {
        menu.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  let saved = 'purple';
  try {
    saved = localStorage.getItem(key) || 'purple';
  } catch {}

  applyTheme(saved);

  const install = () => {
    addThemeControl();

    const style = document.createElement('style');
    style.textContent = `
      #themeControl {
        position: fixed;
        top: max(14px, env(safe-area-inset-top));
        left: max(14px, env(safe-area-inset-left));
        z-index: 9999;
        direction: rtl;
        font-family: system-ui, sans-serif;
        color: var(--text);
      }
      #themeToggle {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 42px;
        padding: 10px 13px;
        border: 1px solid var(--border);
        border-radius: 13px;
        background: var(--surface);
        color: var(--text);
        box-shadow: 0 8px 30px #0002;
        cursor: pointer;
        backdrop-filter: blur(14px);
      }
      #themeMenu {
        position: absolute;
        left: 0;
        top: calc(100% + 9px);
        width: 220px;
        padding: 10px;
        border: 1px solid var(--border);
        border-radius: 16px;
        background: var(--surface);
        box-shadow: 0 18px 55px #0005;
        backdrop-filter: blur(18px);
      }
      #themeMenu[hidden] { display: none; }
      #themeMenu .theme-heading {
        padding: 8px;
        color: var(--muted);
        font-size: 12px;
      }
      #themeMenu [data-theme-choice] {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 11px 9px;
        border: 1px solid transparent;
        border-radius: 10px;
        background: transparent;
        color: var(--text);
        text-align: right;
        cursor: pointer;
      }
      #themeMenu [data-theme-choice].active {
        background: var(--surface2);
        border-color: var(--accent);
      }
      #themeMenu .theme-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: var(--dot);
        box-shadow: 0 0 12px var(--dot);
      }
      #themeMenu .theme-check {
        margin-right: auto;
        color: var(--accent);
        opacity: 0;
      }
      #themeMenu [data-theme-choice].active .theme-check {
        opacity: 1;
      }
      @media (max-width: 480px) {
        #themeToggle { min-height: 39px; padding: 8px 10px; }
        #themeMenu { width: 205px; }
      }
    `;
    document.head.appendChild(style);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
