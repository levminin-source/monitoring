// app.js — Compliance Monitor (Firebase Auth + Firestore)

// ============================================================
// FIREBASE CONFIG — вставьте свои значения из Firebase Console
// ============================================================
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDD_IwbIN87V6VXWqpTKkEV3aEfh8ZQw8k",
  authDomain:        "marshall-compliance-monitor.firebaseapp.com",
  projectId:         "marshall-compliance-monitor",
  storageBucket:     "marshall-compliance-monitor.firebasestorage.app",
  messagingSenderId: "417137979657",
  appId:             "1:417137979657:web:936c1706379c270c5c23d8"
};

// ============================================================
// STATE
// ============================================================
let currentView  = 'dashboard';
let currentUser  = '';
let currentName  = '';
let currentEmail = '';
let activeDept   = 'all';
let activeCrit   = 'all';
let activeAck    = 'all';   // all | unread | read
let activeDate   = 'all';   // all | 30 | 90 | 180 (дней от сегодня в обе стороны)
let searchQuery  = '';
const searchComments = true; // поиск по комментариям включён всегда

let store = { comments: {}, acknowledgements: {}, extraChanges: [], proposals: [] };
let db    = null;
let auth  = null;

const CONFIGURED = !FIREBASE_CONFIG.apiKey.startsWith('PLACEHOLDER') && FIREBASE_CONFIG.apiKey.length > 10;

// Экранирование пользовательского ввода перед вставкой в innerHTML (защита от stored-XSS).
// Применяется ко ВСЕМ значениям, введённым пользователями (комментарии, ответы, предложения,
// поля карточек НПА). Объявлено как function — поднимается, доступно из всех рендер-функций.
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// Экранирование + сохранение переносов строк как <br> (для многострочных полей).
function escMultiline(value) {
  return esc(value).replace(/\n/g, '<br>');
}

// ============================================================
// MARSHALL BRAND ASSETS (SVG)
// ============================================================
// LOGO_ICON_B64 и LOGO_FULL_B64 вынесены в assets.js (подключается в index.html ПЕРЕД app.js).
// Это убрало ~36 КБ base64 из основного файла. Сами константы доступны как глобальные.
// Для обратной совместимости
const LOGO_ICON_SVG = `<img src="${LOGO_ICON_B64}" style="width:38px;height:38px;border-radius:4px;display:block">`;
const LOGO_FULL_SVG = `<img src="${LOGO_FULL_B64}" style="height:48px;width:auto;display:block">`;



// ============================================================
// ПОЛЬЗОВАТЕЛИ — email → имя, департамент, роль
// Добавляйте новых сотрудников сюда
// ============================================================
const USERS = {
  // ── Администраторы (юристы) ──
  'lev.minin@marshall.parts':              { name: 'Лев Минин',              dept: 'Юрист',       role: 'admin' },
  'dinara.gumbatova@marshall.parts':       { name: 'Динара Гумбатова',       dept: 'Юрист',       role: 'admin' },
  'margarita.kaplina@marshall.parts':      { name: 'Маргарита Каплина',      dept: 'Юрист',       role: 'admin' },

  // ── Руководство (видят все НПА, без привязки к департаменту) ──
  'zoya.li@marshall.parts':               { name: 'Зоя Ли',                 dept: 'Руководство', role: 'user' },
  'shulga@marshall.parts':                { name: 'Роман Шульга',            dept: 'Руководство', role: 'user' },
  'napolov@marshall.parts':               { name: 'Константин Наполов',      dept: 'Руководство', role: 'user' },

  // ── Сотрудники — добавляйте по образцу ──
  'bogdanova@marshall.parts':             { name: 'Светлана Богданова',      dept: 'ФЭД',         role: 'user' },
  'anna.mikhaleva@marshall.parts':        { name: 'Анна Михалева',           dept: 'ДМ',          role: 'user' },
  'yurij.kolpakov@marshall.parts':        { name: 'Юрий Колпаков',           dept: 'ДЦТ',         role: 'user' },
  'dmitriy.shudrenko@marshall.parts':     { name: 'Дмитрий Шудренко',        dept: 'КД',          role: 'user' },
  'nikita.slepushkin@marshall.parts':     { name: 'Никита Слепушкин',        dept: 'КД',          role: 'user' },
  'mostovykh@marshall.parts':             { name: 'Алексей Мостовых',        dept: 'КД',          role: 'user' },
  'vlad.kharushin@marshall.parts':        { name: 'Владислав Харюшин',       dept: 'КД',          role: 'user' },
  'yuriy.khalatov@marshall.parts':        { name: 'Юрий Халатов',            dept: 'ОД',          role: 'user' },
  'anastasia.tarasova@marshall.parts':    { name: 'Анастасия Тарасова',      dept: 'ОД',          role: 'user' },
  'ekaterina.ishenko@marshall.parts':     { name: 'Екатерина Ищенко',         dept: 'ДУП',         role: 'user' },
};

// Доступные департаменты
const DEPARTMENTS = ['ФЭД', 'ДМ', 'ОД', 'КД', 'ДЦТ', 'ДУП'];

const ADMIN_EMAILS = Object.entries(USERS)
  .filter(([, u]) => u.role === 'admin')
  .map(([email]) => email);

function isAdmin() {
  return ADMIN_EMAILS.includes(currentEmail);
}

function getUserInfo(email) {
  return USERS[email] || { name: email, dept: '—', role: 'user' };
}

// ============================================================
// FIREBASE INIT
// ============================================================
function initFirebase() {
  firebase.initializeApp(FIREBASE_CONFIG);
  db   = firebase.firestore();
  auth = firebase.auth();

  // Следим за состоянием авторизации
  auth.onAuthStateChanged(user => {
    if (user) {
      currentEmail = user.email;
      const info   = getUserInfo(user.email);
      currentUser  = info.dept;
      currentName  = info.name;
      showApp();
      startFirestoreListener();
    } else {
      // Не авторизован — показываем экран входа
      showLoginScreen();
      stopFirestoreListener();
    }
  });
}

let firestoreUnsub = null;

function startFirestoreListener() {
  if (firestoreUnsub) return;
  setLoading(true);
  firestoreUnsub = db.collection('compliance').doc('store')
    .onSnapshot(snap => {
      if (snap.exists) {
        const data = snap.data();
        store.comments         = data.comments         || {};
        store.acknowledgements = data.acknowledgements || {};
        store.extraChanges     = data.extraChanges     || [];
        store.proposals        = data.proposals        || [];
      }
      refreshUI();
      setLoading(false);
    }, err => {
      console.warn('Firestore error:', err);
      showToast('Ошибка соединения с базой данных', 'error');
      setLoading(false);
    });
}

function stopFirestoreListener() {
  if (firestoreUnsub) { firestoreUnsub(); firestoreUnsub = null; }
}

async function saveToCloud() {
  if (!CONFIGURED || !db) { saveLocalFallback(store); return; }
  try {
    await db.collection('compliance').doc('store').set({
      comments:         store.comments,
      acknowledgements: store.acknowledgements,
      extraChanges:     store.extraChanges,
      proposals:        store.proposals,
      updatedAt:        firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch(e) {
    console.warn('Firestore save error:', e);
    saveLocalFallback(store);
    showToast('Ошибка сохранения — данные записаны локально', 'error');
  }
}

// ============================================================
// LOGIN / LOGOUT
// ============================================================
async function submitLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn      = document.getElementById('login-btn');
  const errEl    = document.getElementById('login-error');

  errEl.classList.remove('visible');

  if (!email || !password) {
    showLoginError('Введите email и пароль.');
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Вход…';

  if (!CONFIGURED) {
    // Демо-режим
    const info   = getUserInfo(email);
    currentEmail = email;
    currentUser  = info.dept;
    currentName  = info.name;
    store = loadLocalFallback();
    showApp();
    refreshUI();
    btn.disabled    = false;
    btn.textContent = 'Войти';
    showToast('Демо-режим: Firebase не настроен', 'error');
    return;
  }

  try {
    await auth.signInWithEmailAndPassword(email, password);
    // onAuthStateChanged сам вызовет showApp()
  } catch(e) {
    btn.disabled    = false;
    btn.textContent = 'Войти';
    const msgs = {
      'auth/user-not-found':     'Пользователь с таким email не найден.',
      'auth/wrong-password':     'Неверный пароль.',
      'auth/invalid-email':      'Некорректный формат email.',
      'auth/too-many-requests':  'Слишком много попыток. Попробуйте позже.',
      'auth/invalid-credential': 'Неверный email или пароль.'
    };
    showLoginError(msgs[e.code] || 'Ошибка входа. Проверьте данные.');
  }
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg;
  el.classList.add('visible');
  // shake на поле пароля
  const pwField = document.getElementById('login-password');
  if (pwField) {
    pwField.classList.remove('login-shake');
    void pwField.offsetWidth;
    pwField.classList.add('login-shake');
    pwField.addEventListener('animationend', () => pwField.classList.remove('login-shake'), { once: true });
  }
}

async function logout() {
  if (CONFIGURED && auth) {
    await auth.signOut();
  } else {
    showLoginScreen();
  }
  sessionStorage.removeItem('compliance_role');
  currentUser  = '';
  currentEmail = '';
}

function showLoginScreen() {
  document.getElementById('login-screen').classList.add('visible');
  document.getElementById('app').style.display = 'none';
  // Сбрасываем форму
  const btn = document.getElementById('login-btn');
  if (btn) { btn.disabled = false; btn.textContent = 'Войти'; }
  const err = document.getElementById('login-error');
  if (err) err.classList.remove('visible');
}

function showApp() {
  document.getElementById('login-screen').classList.remove('visible');
  document.getElementById('app').style.display = window.innerWidth <= 900 ? 'block' : 'flex';
  // На мобильном сайдбар скрыт по умолчанию
  if (window.innerWidth <= 900) {
    document.getElementById('sidebar').classList.add('hidden');
  }

  // Заполняем chip пользователя в шапке
  const displayName = currentName || currentEmail || 'Пользователь';
  const initials    = displayName.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
  document.getElementById('user-chip-avatar').textContent = initials;
  document.getElementById('user-chip-name').textContent   = displayName;
  document.getElementById('user-chip-role').textContent   = currentUser || '—';

  // Инициализируем форму (если ещё не было)
  const typeSelect = document.querySelector('[name="type"]');
  if (typeSelect && !typeSelect._initDone) {
    typeSelect.addEventListener('change', function() {
      document.getElementById('draft-fields').style.display =
        this.value === 'draft' ? 'block' : 'none';
    });
    typeSelect._initDone = true;
  }

  // Показываем/скрываем элементы только для администратора
  const adminNav    = document.getElementById('nav-admin');
  const adminBtn    = document.getElementById('btn-add-change');
  const proposeBtn  = document.getElementById('btn-propose');
  if (adminNav)   adminNav.style.display   = isAdmin() ? 'flex'  : 'none';
  if (adminBtn)   adminBtn.style.display   = isAdmin() ? 'block' : 'none';
  if (proposeBtn) proposeBtn.style.display = isAdmin() ? 'none'  : 'block';

  // Обновляем динамические метки периода
  const qBadge = document.getElementById('quarter-badge');
  if (qBadge) qBadge.textContent = QUARTER;
  const digestTitle = document.getElementById('digest-title');
  if (digestTitle) digestTitle.textContent = `Compliance-дайджест · ${QUARTER}`;

  // Показываем баннер обязательного ознакомления
  setTimeout(showAckBanner, 800);
  // Инициализируем кнопку тура
  setTimeout(initTourButton, 500);
  // Запускаем напоминания о дедлайнах
  initRemindersAfterLogin();
  // Загружаем уведомления из Firestore
  loadNotificationsFromFirestore();
  // Инициализируем EmailJS
  initEmailJS();
}

function showAckBanner() {
  if (!currentUser || isAdmin()) return;
  const unread = [...PUBLISHED_CHANGES, ...store.extraChanges.filter(c=>c.type==='published')]
    .filter(c => (c.criticality === 'Высокая' || c.criticality === 'Средняя') &&
                  !isAcknowledgedByUser(c.id, currentUser));
  const banner = document.getElementById('ack-banner');
  if (!banner) return;
  if (unread.length > 0) {
    banner.innerHTML = `<span class="ack-banner-icon">⚠</span>
      <span>У вас <strong>${unread.length}</strong> важных изменений, требующих ознакомления</span>
      <button onclick="filterAck('unread');setView('published');closeBanner()" class="ack-banner-btn">
        Перейти к списку
      </button>
      <button onclick="closeBanner()" class="ack-banner-close">×</button>`;
    banner.classList.add('visible');
  }
}

function closeBanner() {
  const b = document.getElementById('ack-banner');
  if (b) b.classList.remove('visible');
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme(); // применяем сохранённую тему

  // Закрытие открытой модалки по Escape (закрывает одну верхнюю за нажатие).
  // Порядок — от самых «верхних» слоёв к нижним.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const isOpen = id => {
      const el = document.getElementById(id);
      return el && el.classList.contains('open');
    };
    if (isOpen('ai-panel-overlay'))       { closeAiPanel();       return; }
    if (isOpen('welcome-modal-overlay'))  { closeWelcomeModal();   return; }
    if (isOpen('promote-modal-overlay'))  { closePromoteModal();   return; }
    if (isOpen('edit-modal-overlay'))     { closeEditModal();      return; }
    if (isOpen('export-modal-overlay'))   { closeExportModal();    return; }
    if (isOpen('proposal-modal-overlay')) { closeProposalModal();  return; }
    if (isOpen('admin-overlay'))          { closeAdmin();          return; }
    if (isOpen('modal-overlay'))          { closeModal();          return; }
  });

  if (CONFIGURED) {
    initFirebase();
    // onAuthStateChanged управляет показом экранов
  } else {
    // Без Firebase — показываем логин в демо-режиме
    showLoginScreen();
  }
});

// ============================================================
// UI HELPERS
// ============================================================
function refreshUI() {
  buildDeptFilters();
  renderDashboard();
  renderPublished();
  renderDraft();
  updateBadges();
  if (currentView === 'comments') renderAllComments();
}

function setLoading(on) {
  const el = document.getElementById('loading-bar');
  if (el) el.style.display = on ? 'block' : 'none';
}

function loadLocalFallback() {
  try {
    const raw = localStorage.getItem('compliance_monitor_data');
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return { comments: {}, acknowledgements: {}, extraChanges: [], proposals: [] };
}
function saveLocalFallback(data) {
  try { localStorage.setItem('compliance_monitor_data', JSON.stringify(data)); } catch(e) {}
}

// ============================================================
// NAVIGATION
// ============================================================
function setView(view) {
  // Закрываем сайдбар на мобильном при переходе
  if (window.innerWidth <= 900) {
    document.getElementById('sidebar').classList.add('hidden');
    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) overlay.classList.remove('visible');
  }
  // Проверка доступа к редактору
  if (view === 'admin-editor' && !isAdmin()) {
    showToast('Доступ запрещён', 'error');
    return;
  }
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.view === view);
  });
  const titles = {
    dashboard:    'Обзор',
    published:    'Опубликованные НПА',
    draft:        'Проектные НПА',
    comments:     'Комментарии',
    calendar:     'Compliance-календарь',
    'admin-editor': '⚙ Редактор НПА'
  };
  const subtitles = {
    dashboard:    'сводка актуальных изменений',
    published:    'законы и акты, вступившие или вступающие в силу',
    draft:        'законопроекты и акты на стадии разработки',
    comments:     'обсуждения и вопросы по изменениям',
    calendar:     'события по датам вступления в силу',
    'admin-editor': 'управление записями'
  };
  document.getElementById('page-title').textContent = titles[view] || '';
  const subEl = document.getElementById('page-subtitle');
  if (subEl) subEl.textContent = subtitles[view] || '';
  if (view === 'comments')      renderAllComments();
  if (view === 'admin-editor')  setAdminTab('editor');
  if (view === 'calendar')      renderCalendar();
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const isHidden = sidebar.classList.toggle('hidden');
  if (overlay) overlay.classList.toggle('visible', !isHidden);
}

// ============================================================
// FILTERS
// ============================================================
function buildDeptFilters() {
  // Фиксированный список департаментов + те что есть в данных
  const fromData = getAllChanges().flatMap(c => c.departments);
  const allDepts = [...new Set([...DEPARTMENTS, ...fromData])].filter(d => d !== 'Все' && d !== 'Руководство').sort();
  const container = document.getElementById('dept-filters');
  if (!container) return;
  container.innerHTML = `<button class="dept-btn active" data-dept="all" onclick="filterDept('all')">Все</button>`;
  allDepts.forEach(d => {
    container.innerHTML += `<button class="dept-btn" data-dept="${d}" onclick="filterDept('${d}')">${d}</button>`;
  });
}

function filterDept(dept) {
  activeDept = dept;
  document.querySelectorAll('.dept-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.dept === dept);
  });
  renderPublished(); renderDraft(); renderDashboard();
  if (currentView === 'calendar') renderCalendar();
  updateResetBtn();
}

function filterCrit(crit) {
  activeCrit = crit;
  document.querySelectorAll('.crit-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.crit === crit);
  });
  renderPublished(); renderDraft(); renderDashboard();
  if (currentView === 'calendar') renderCalendar();
  updateResetBtn();
}

function filterSearch(q) {
  searchQuery = q.toLowerCase();
  // Показываем/скрываем крестик
  ['desktop','mobile'].forEach(id => {
    const btn = document.getElementById('search-clear-' + id);
    if (btn) btn.style.display = q ? 'block' : 'none';
  });
  if (q.length >= 2) {
    renderSearchDropdown(q);
  } else {
    hideSearchDropdown();
  }
  // Фильтруем списки в фоне (без переключения раздела)
  renderPublished(); renderDraft();
  if (searchComments) renderAllComments();
}

function renderSearchDropdown(q) {
  const ql = q.toLowerCase();
  const all = getAllChanges();

  const match = c =>
    (c.title||'').toLowerCase().includes(ql) ||
    (c.summary||'').toLowerCase().includes(ql) ||
    (c.category||'').toLowerCase().includes(ql) ||
    (c.normAct||'').toLowerCase().includes(ql);

  const highlight = text => {
    if (!text) return '—';
    const idx = text.toLowerCase().indexOf(ql);
    if (idx < 0) return text.substring(0, 60);
    const start = Math.max(0, idx - 20);
    const pre = (start > 0 ? '…' : '') + text.substring(start, idx);
    const hit = text.substring(idx, idx + ql.length);
    const post = text.substring(idx + ql.length, idx + ql.length + 40) + (text.length > idx + ql.length + 40 ? '…' : '');
    return `${pre}<mark>${hit}</mark>${post}`;
  };

  const pub   = all.filter(c => !isDraftRecord(c) && match(c));
  const draft = all.filter(c => isDraftRecord(c)  && match(c));

  // Поиск по комментариям — собираем совпадения с привязкой к НПА
  const cmtMatches = [];
  Object.entries(store.comments).forEach(([id, cmts]) => {
    const c = all.find(x => x.id === id);
    if (!c) return;
    cmts.forEach(cm => {
      if (cm.type === 'ack') return; // ознакомления не показываем в поиске
      const inText   = (cm.text||'').toLowerCase().includes(ql);
      const inAuthor = (cm.author||'').toLowerCase().includes(ql);
      if (inText || inAuthor) {
        cmtMatches.push({ change: c, comment: cm, inText });
      }
    });
  });

  const total = pub.length + draft.length + cmtMatches.length;

  if (!total) {
    const html = `<div class="sd-empty">Ничего не найдено по запросу «${q}»</div>`;
    setDropdownContent(html);
    return;
  }

  const LIMIT = 4;
  let html = '';

  if (pub.length) {
    html += `<div class="sd-section-label">Опубликованные · ${pub.length}</div>`;
    pub.slice(0, LIMIT).forEach(c => {
      const cc = critClass(c.criticality || '');
      const dept = (c.departments||[]).filter(d=>d!=='Все').slice(0,2).join(', ');
      html += `<div class="sd-item" onclick="selectSearchResult('${c.id}','published')">
        <span class="sd-dot sd-dot-${cc}"></span>
        <div class="sd-body">
          <div class="sd-title">${highlight(c.title)}</div>
          <div class="sd-meta">${c.category}${dept ? ' · ' + dept : ''}${c.effectiveDate && c.effectiveDate !== '—' ? ' · ' + formatDate(c.effectiveDate) : ''}</div>
        </div>
        <span class="sd-badge sd-badge-pub">Опубл.</span>
      </div>`;
    });
    if (pub.length > LIMIT) {
      html += `<div class="sd-more" onclick="selectSearchAll('published')">Ещё ${pub.length - LIMIT} в Опубликованных →</div>`;
    }
  }

  if (draft.length) {
    html += `<div class="sd-section-label">Проектные · ${draft.length}</div>`;
    draft.slice(0, LIMIT).forEach(c => {
      html += `<div class="sd-item" onclick="selectSearchResult('${c.id}','draft')">
        <span class="sd-dot sd-dot-draft"></span>
        <div class="sd-body">
          <div class="sd-title">${highlight(c.title)}</div>
          <div class="sd-meta">${c.category}</div>
        </div>
        <span class="sd-badge sd-badge-draft">Проект</span>
      </div>`;
    });
    if (draft.length > LIMIT) {
      html += `<div class="sd-more" onclick="selectSearchAll('draft')">Ещё ${draft.length - LIMIT} в Проектных →</div>`;
    }
  }

  if (cmtMatches.length) {
    html += `<div class="sd-section-label">Комментарии · ${cmtMatches.length}</div>`;
    cmtMatches.slice(0, LIMIT).forEach(({change, comment, inText}) => {
      const typeIcon = comment.type === 'issue' ? '⚠' : '💬';
      html += `<div class="sd-item" onclick="selectSearchResult('${change.id}','${change.type === 'draft' ? 'draft' : 'published'}')">
        <span class="sd-dot sd-dot-comment">${typeIcon}</span>
        <div class="sd-body">
          <div class="sd-title">${inText ? highlight(comment.text) : highlight(comment.author)}</div>
          <div class="sd-meta">→ ${change.title.substring(0,40)}${change.title.length>40?'…':''}</div>
        </div>
      </div>`;
    });
    if (cmtMatches.length > LIMIT) {
      html += `<div class="sd-more" onclick="selectSearchAll('comments')">Ещё ${cmtMatches.length - LIMIT} в Комментариях →</div>`;
    }
  }

  if (total > 0) {
    html += `<div class="sd-footer" onclick="selectSearchAll(null)">Показать все ${total} результата →</div>`;
  }

  setDropdownContent(html);
}

function setDropdownContent(html) {
  ['desktop','mobile'].forEach(id => {
    const el = document.getElementById('search-dropdown-' + id);
    if (el) { el.innerHTML = html; el.classList.add('open'); }
  });
}

function hideSearchDropdown() {
  ['desktop','mobile'].forEach(id => {
    const el = document.getElementById('search-dropdown-' + id);
    if (el) el.classList.remove('open');
  });
}

function showSearchDropdown() {
  const q = searchQuery;
  if (q && q.length >= 2) renderSearchDropdown(q);
}

function selectSearchResult(id, view) {
  hideSearchDropdown();
  setView(view);
  setTimeout(() => openChange(id), 50);
}

function selectSearchAll(view) {
  hideSearchDropdown();
  if (view) setView(view);
  else {
    // показываем в том разделе где больше результатов
    const all = getAllChanges();
    const ql = searchQuery;
    const pubCount   = all.filter(c => !isDraftRecord(c) && ((c.title||'').toLowerCase().includes(ql) || (c.summary||'').toLowerCase().includes(ql))).length;
    const draftCount = all.filter(c => isDraftRecord(c)  && ((c.title||'').toLowerCase().includes(ql) || (c.summary||'').toLowerCase().includes(ql))).length;
    setView(pubCount >= draftCount ? 'published' : 'draft');
  }
}

function clearSearch() {
  searchQuery = '';
  ['search-input','search-input-mobile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['search-clear-desktop','search-clear-mobile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  hideSearchDropdown();
  renderPublished(); renderDraft();
}

function searchKeydown(e) {
  if (e.key === 'Escape') clearSearch();
}

// Закрываем dropdown при клике вне
document.addEventListener('click', e => {
  if (!e.target.closest('#search-wrapper-desktop') && !e.target.closest('#search-wrapper-mobile')) {
    hideSearchDropdown();
  }
});

function filterAck(val) {
  activeAck = val;
  document.querySelectorAll('.ack-filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.ack === val);
  });
  renderPublished();
  renderDraft();
  updateResetBtn();
}

function filterDate(days) {
  activeDate = days;
  document.querySelectorAll('.date-btn').forEach(b =>
    b.classList.toggle('active', String(b.dataset.date) === String(days)));
  renderPublished(); renderDraft(); renderDashboard();
  if (currentView === 'calendar') renderCalendar();
  updateResetBtn();
}

function resetAllFilters() {
  filterDept('all');
  filterCrit('all');
  filterAck('all');
  filterDate('all');
}

function updateResetBtn() {
  const wrap = document.getElementById('filter-reset-wrap');
  if (!wrap) return;
  const active = activeDept !== 'all' || activeCrit !== 'all' || activeAck !== 'all' || activeDate !== 'all';
  wrap.style.display = active ? '' : 'none';
}

function applyFilters(changes) {
  return changes.filter(c => {
    const deptOk = activeDept === 'all' || c.departments.some(d => d === activeDept || d === 'Все') || currentUser === 'Руководство';
    const critOk = activeCrit === 'all' || c.criticality === activeCrit;

    // Фильтр по ознакомлению
    let ackOk = true;
    if (activeAck === 'unread') ackOk = !currentUser || !isAcknowledgedByUser(c.id, currentUser);
    if (activeAck === 'read')   ackOk = currentUser  &&  isAcknowledgedByUser(c.id, currentUser);

    // Поиск — по НПА и опционально по комментариям
    let searchOk = !searchQuery;
    if (searchQuery) {
      searchOk = c.title.toLowerCase().includes(searchQuery) ||
                 c.summary.toLowerCase().includes(searchQuery) ||
                 c.category.toLowerCase().includes(searchQuery) ||
                 (c.normAct||'').toLowerCase().includes(searchQuery);
      if (!searchOk && searchComments) {
        const cmts = getComments(c.id);
        searchOk = cmts.some(cm =>
          (cm.text||'').toLowerCase().includes(searchQuery) ||
          (cm.author||'').toLowerCase().includes(searchQuery)
        );
      }
    }

    // Фильтр по дате вступления в силу
    let dateOk = true;
    if (activeDate !== 'all') {
      const days = parseInt(activeDate);
      const now = new Date();
      const from = new Date(now); from.setDate(from.getDate() - days);
      const to   = new Date(now); to.setDate(to.getDate() + days);
      const d = parseFlexDate(c.effectiveDate) || parseFlexDate(c.plannedDate);
      dateOk = d ? (d >= from && d <= to) : false;
    }

    return deptOk && critOk && ackOk && searchOk && dateOk;
  });
}

// ============================================================
// HELPERS
// ============================================================
function getAllChanges() {
  // Применяем патчи к базовым записям из data.js
  const patches = {};
  store.extraChanges.forEach(x => { if (x._patchFor) patches[x._patchFor] = x; });

  // Исключаем базовые черновики, которые уже переведены в опубликованные
  const promotedIds = new Set(
    store.extraChanges.filter(x => x._promoted).map(x => x._patchFor || x.id)
  );

  const base = [...PUBLISHED_CHANGES, ...DRAFT_CHANGES]
    .filter(c => !promotedIds.has(c.id))
    .map(c => patches[c.id] ? { ...c, ...patches[c.id] } : c);

  const extras = store.extraChanges.filter(x => !x._patchFor && !x._promoted);
  return [...base, ...extras];
}

// Канонический способ определить "это проектный НПА?". ВАЖНО: базовые записи
// DRAFT_CHANGES из data.js не имеют поля type вообще (только extraChanges/
// AI-импорт его выставляют) — поэтому проверка двойная: принадлежность
// к DRAFT_CHANGES ИЛИ явный c.type === 'draft'. Раньше это выражение было
// продублировано по файлу 11 раз; используйте эту функцию для новой логики,
// чтобы не повторить баг "записи data.js без type попадают в Опубликованные".
function isDraftRecord(c) {
  return DRAFT_CHANGES.some(x => x.id === c.id) || c.type === 'draft';
}
function critClass(crit) {
  return { 'Высокая':'high','Средняя':'medium','Низкая':'low','Отсутствует':'none' }[crit] || 'low';
}
function formatDate(dateStr) {
  if (!dateStr || dateStr === '—' || dateStr === '-') return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('ru-RU', { day:'2-digit', month:'short', year:'numeric' });
}
function getComments(id)   { return store.comments[id] || []; }
function getAck(id)        { return store.acknowledgements[id] || {}; }
function commentCount(id)  { return getComments(id).length; }
function isAcknowledgedByUser(id, user) { return !!getAck(id)[user]; }

function deptAckPct(dept) {
  const relevant = getAllChanges().filter(c =>
    c.departments.some(d => d === dept || d === 'Все')
  );
  if (!relevant.length) return 0;
  const acked = relevant.filter(c => getAck(c.id)[dept]);
  return Math.round((acked.length / relevant.length) * 100);
}

// ============================================================
// DASHBOARD
// ============================================================
function animateStatNumber(el, value) {
  if (!el) return;
  const prev = el.textContent;
  el.textContent = value;
  if (String(prev) !== String(value)) {
    el.classList.remove('pop-in');
    void el.offsetWidth; // reflow для перезапуска анимации
    el.classList.add('pop-in');
    el.addEventListener('animationend', () => el.classList.remove('pop-in'), { once: true });
  }
}

function renderDashboard() {
  animateStatNumber(document.getElementById('stat-total'),  getAllChanges().length);
  animateStatNumber(document.getElementById('stat-high'),   PUBLISHED_CHANGES.filter(c => c.criticality === 'Высокая').length);
  animateStatNumber(document.getElementById('stat-medium'), PUBLISHED_CHANGES.filter(c => c.criticality === 'Средняя').length);

  const depts = ['ДУП','ФЭД','КД','ОД'];
  let pending = 0;
  if (!isAdmin()) {
    PUBLISHED_CHANGES.forEach(c => {
      c.departments.forEach(d => { if (d !== 'Все' && !getAck(c.id)[d]) pending++; });
    });
  }
  animateStatNumber(document.getElementById('stat-pending'), isAdmin() ? '—' : pending);
  document.getElementById('badge-comments').textContent = Object.values(store.comments).flat().length;

  // ── Актуальные к исполнению ──
  // Все опубликованные (базовые + добавленные), фильтр: Высокая/Средняя,
  // окно: не старше 30 дней после вступления и все будущие
  const allPub = getAllChanges().filter(c => !isDraftRecord(c));
  const now = new Date();
  const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 30);

  const actualItems = allPub
    .filter(c => {
      if (!c.effectiveDate || c.effectiveDate === '—') return false;
      const d = new Date(c.effectiveDate);
      if (isNaN(d)) return false;
      if (d < cutoff) return false; // старше 30 дней — скрываем
      const crit = c.criticality;
      return crit === 'Высокая' || crit === 'Средняя';
    })
    .sort((a, b) => new Date(a.effectiveDate) - new Date(b.effectiveDate));

  document.getElementById('urgent-list').innerHTML = actualItems.length
    ? actualItems.map(c => {
        const d = new Date(c.effectiveDate);
        const daysLeft = Math.ceil((d - now) / 86400000);
        const isPast = daysLeft < 0;
        const cc = critClass(c.criticality);
        const deptList = (c.departments||[]).filter(x => x !== 'Все').slice(0,2)
          .map(dep => `<span class="badge badge-dept">${esc(dep)}</span>`).join('');
        const daysBadge = isPast
          ? `<span class="deadline-badge deadline-past">истёк ${Math.abs(daysLeft)} дн. назад</span>`
          : daysLeft <= 30
            ? `<span class="deadline-badge deadline-urgent">⚡ ${daysLeft} дн.</span>`
            : `<span class="deadline-badge deadline-soon">⏱ ${daysLeft} дн.</span>`;
        return `<div class="urgent-item urgent-item-rich" onclick="openChange('${c.id}')">
          <div class="urgent-item-left">
            <span class="urgent-date">${formatDate(c.effectiveDate)}</span>
            ${daysBadge}
          </div>
          <div class="urgent-item-body">
            <span class="urgent-text">${esc(c.title)}</span>
            <div class="urgent-meta">${deptList}<span class="badge badge-${cc}">${esc(c.criticality)}</span></div>
          </div>
        </div>`;
      }).join('')
    : '<div class="empty-state"><p>Нет актуальных изменений</p></div>';

  // ── Статус ознакомления — убран из Обзора, живёт в Аналитике ──
  const ackCard = document.getElementById('ack-summary-card');
  if (ackCard) ackCard.style.display = 'none';

  // ── Дайджест — Высокая и Средняя критичность, по 5 последних ──
  const allChanges = getAllChanges();
  const DIGEST_LIMIT = 5;
  const digestHtml = ['Высокая','Средняя'].map(crit => {
    const group = allChanges.filter(c => c.criticality === crit);
    if (!group.length) return '';
    const cc = critClass(crit);
    const shown = group.slice(-DIGEST_LIMIT).reverse(); // последние добавленные
    const extra = group.length - DIGEST_LIMIT;
    return `<div class="digest-group">
      <div class="digest-group-label badge badge-${cc}">${crit}</div>
      ${shown.map(c => {
        const isDraft = isDraftRecord(c);
        return `<div class="digest-card" onclick="openChange('${c.id}')">
          <div class="digest-cat">${isDraft ? '◎ Проектный · ' : ''}${esc(c.category)}</div>
          <div class="digest-title">${esc(c.title)}</div>
          <div class="digest-meta">
            ${!isDraft && c.effectiveDate && c.effectiveDate !== '—'
              ? `<span class="badge badge-dept">${formatDate(c.effectiveDate)}</span>` : ''}
            ${isDraft && c.probability
              ? `<span class="badge badge-prob">${esc(c.probability)}</span>` : ''}
            ${(c.departments||[]).filter(x=>x!=='Все').slice(0,2)
              .map(d=>`<span class="badge badge-dept">${esc(d)}</span>`).join('')}
          </div>
        </div>`;
      }).join('')}
      ${extra > 0 ? `<div class="digest-more" onclick="filterCrit('${crit}');setView('published')">
        + ещё ${extra} в разделе «Опубликованные» →
      </div>` : ''}
    </div>`;
  }).join('');

  document.getElementById('digest-grid').innerHTML = digestHtml
    || '<div class="empty-state"><p>Нет данных</p></div>';

  // ── Последние комментарии ──
  const dcContainer = document.getElementById('dashboard-comments');
  if (dcContainer) {
    const allCmts = [];
    Object.entries(store.comments).forEach(([id, cmts]) => {
      const c = getAllChanges().find(x => x.id === id);
      if (!c) return;
      cmts.forEach(cm => {
        if (cm.type === 'ack') return; // ознакомления не показываем
        allCmts.push({ ...cm, changeId: id, changeTitle: c.title });
      });
    });
    // Сортируем по времени — последние сверху, берём 8
    const recent = allCmts.reverse().slice(0, 8);
    dcContainer.innerHTML = recent.length
      ? recent.map(cm => {
          const typeLabel = cm.type === 'issue' ? '⚠ Вопрос' : '💬';
          return `<div class="dc-item" onclick="openChange('${cm.changeId}')">
            <div class="dc-meta">
              <span class="dc-author">${esc(cm.author || '—')}</span>
              <span class="dc-time">${esc(cm.time || '')}</span>
              <span class="dc-type ${cm.type}">${typeLabel}</span>
            </div>
            <div class="dc-npa">→ ${esc(cm.changeTitle)}</div>
            ${cm.text ? `<div class="dc-text">${esc(cm.text)}</div>` : ''}
          </div>`;
        }).join('')
      : '<div class="empty-state"><p>Комментариев пока нет</p></div>';
  }
}

// ============================================================
// LISTS
// ============================================================
// Текущий выбор сортировки для каждого раздела (хранится в памяти сессии)
let sortOrderPublished = 'date';
let sortOrderDraft     = 'new';

function setSortOrder(view, value) {
  if (view === 'published') sortOrderPublished = value;
  if (view === 'draft')     sortOrderDraft     = value;
  if (view === 'published') renderPublished();
  if (view === 'draft')     renderDraft();
}

// Извлекает timestamp добавления из id (используется как «дата добавления»
// для записей без явного поля даты — проектные НПА из формы или data.js)
function tsFromId(c) {
  const m = /-extra-(\d+)$/.exec(c.id || '') || /^promoted-.*-(\d+)$/.exec(c.id || '');
  return m ? parseInt(m[1], 10) : 0;
}

const CRIT_ORDER = { 'Высокая': 0, 'Средняя': 1, 'Низкая': 2, 'Отсутствует': 3 };

function renderPublished() {
  let changes = applyFilters([...PUBLISHED_CHANGES, ...store.extraChanges.filter(c => c.type === 'published')]);
  changes = changes.slice();

  if (sortOrderPublished === 'crit') {
    changes.sort((a, b) => (CRIT_ORDER[a.criticality] ?? 9) - (CRIT_ORDER[b.criticality] ?? 9));
  } else if (sortOrderPublished === 'unread') {
    changes.sort((a, b) => {
      const ua = currentUser && !isAcknowledgedByUser(a.id, currentUser) ? 0 : 1;
      const ub = currentUser && !isAcknowledgedByUser(b.id, currentUser) ? 0 : 1;
      return ua - ub;
    });
  } else {
    // date (по умолчанию) — по дате вступления в силу, ближайшие/недавние сверху.
    // НПА без даты или с нераспознанной датой — в конец списка.
    changes.sort((a, b) => {
      const da = parseFlexDate(a.effectiveDate);
      const db = parseFlexDate(b.effectiveDate);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da - db;
    });
  }

  document.getElementById('badge-published').textContent = changes.length;
  document.getElementById('list-published').innerHTML = changes.length
    ? changes.map(c => changeCard(c, false)).join('')
    : `<div class="empty-state"><div class="icon">◈</div><p>Нет изменений по выбранным фильтрам</p><span class="empty-hint">Попробуйте сбросить фильтры</span><button class="empty-action" onclick="resetAllFilters()">Сбросить фильтры</button></div>`;
}

function renderDraft() {
  // Скрываем проектные НПА которые уже переведены в опубликованные
  const promotedIds = new Set(store.extraChanges.filter(x => x._promoted).map(x => x._patchFor));
  const extraDrafts = store.extraChanges.filter(c => c.type === 'draft' && !c._promoted && !c._patchFor);
  const baseDrafts  = DRAFT_CHANGES.filter(c => !promotedIds.has(c.id));
  let changes = applyFilters([...baseDrafts, ...extraDrafts]);
  changes = changes.slice();

  if (sortOrderDraft === 'prob') {
    // Вероятность хранится как текст ("60–70%") — берём первое число для сравнения
    const probOf = c => parseInt((c.probability||'').match(/\d+/)?.[0] || '0', 10);
    changes.sort((a, b) => probOf(b) - probOf(a));
  } else if (sortOrderDraft === 'crit') {
    changes.sort((a, b) => (CRIT_ORDER[a.criticality] ?? 9) - (CRIT_ORDER[b.criticality] ?? 9));
  } else {
    // new (по умолчанию) — недавно добавленные сверху
    changes.sort((a, b) => tsFromId(b) - tsFromId(a));
  }

  document.getElementById('badge-draft').textContent = changes.length;
  document.getElementById('list-draft').innerHTML = changes.length
    ? changes.map(c => changeCard(c, true)).join('')
    : `<div class="empty-state"><div class="icon">◎</div><p>Нет проектных изменений</p><span class="empty-hint">Здесь появятся законопроекты на стадии разработки</span></div>`;
}

function deadlineIndicator(effectiveDate) {
  if (!effectiveDate || effectiveDate === '—') return '';
  const d = new Date(effectiveDate);
  if (isNaN(d)) return '';
  const days = Math.ceil((d - new Date()) / 86400000);
  if (days < 0)   return '<span class="deadline-badge deadline-past">истёк</span>';
  if (days <= 30)  return `<span class="deadline-badge deadline-urgent">⚡ ${days} дн.</span>`;
  if (days <= 90)  return `<span class="deadline-badge deadline-soon">⏱ ${days} дн.</span>`;
  return `<span class="deadline-badge deadline-ok">✓ ${days} дн.</span>`;
}

function changeCard(c, isDraft) {
  const cc    = critClass(c.criticality || '');
  const acked = currentUser && isAcknowledgedByUser(c.id, currentUser);
  const cnt   = commentCount(c.id);
  // ДЛ → ОД: нормализация для записей, созданных до переименования (Firestore-данные не мигрировались)
  const depts = (c.departments || []).map(d => { const nd = d === 'ДЛ' ? 'ОД' : d; const cls = ['ДУП','ФЭД','КД','ОД','ДЦТ'].includes(nd) ? `badge-dept-${nd}` : 'badge-dept'; return `<span class="badge ${cls}">${esc(nd)}</span>`; }).join('');
  const urgent = c.urgent ? '<span class="badge-urgent">🔴 СРОЧНО</span>' : '';
  const ddl   = !isDraft ? deadlineIndicator(c.effectiveDate) : '';

  const critCardClass = { 'Высокая': ' high-card', 'Средняя': ' med-card', 'Низкая': ' low-card' }[c.criticality] || '';
  const unreadClass = !isAdmin() && !isChangeSeen(c.id) ? ' unread' : '';
  return `<div class="change-card${acked ? ' acknowledged' : ''}${c.urgent ? ' urgent-card' : ''}${critCardClass}${unreadClass}" onclick="openChange('${c.id}')">
    <div class="change-top">
      
      <div class="change-title-group">
        <div class="change-category">${esc(c.category)}</div>
        <div class="change-title">${urgent}${esc(c.title)}</div>
      </div>
      <div class="change-badges">
        ${c.criticality ? `<span class="badge badge-${cc}">${esc(c.criticality)}</span>` : ''}
        ${c.probability ? `<span class="badge badge-prob">${esc(c.probability)}</span>`  : ''}
        ${c.status      ? `<span class="badge badge-status">${esc(c.status)}</span>`     : ''}
        ${acked         ? `<span class="badge badge-ack">✓ Ознакомлен</span>`       : ''}
      </div>
    </div>
    <div class="change-summary">${escMultiline(c.summary)}</div>
    <div class="change-bottom">
      ${depts}
      ${!isDraft && c.effectiveDate ? `<span class="change-date">Вступает: ${formatDate(c.effectiveDate)}</span>` : ''}
      ${isDraft && c.plannedDate ? `<span class="change-date">Планируется: ${esc(c.plannedDate)}</span>` : ''}
      ${ddl}
      ${cnt > 0 ? `<span class="change-comments-count">💬 ${cnt}</span>` : ''}
    </div>
  </div>`;
}

// ============================================================
// MODAL
// ============================================================
function getSeenChanges() {
  try { return JSON.parse(localStorage.getItem('seen_changes') || '{}'); } catch { return {}; }
}
function markChangeSeen(id) {
  const seen = getSeenChanges();
  seen[id] = 1;
  try { localStorage.setItem('seen_changes', JSON.stringify(seen)); } catch {}
}
function isChangeSeen(id) { return !!getSeenChanges()[id]; }

function openChange(id) {
  markChangeSeen(id);
  const c = getAllChanges().find(x => x.id === id);
  if (!c) return;
  const isDraft = isDraftRecord(c);
  const cc      = critClass(c.criticality || '');
  const acked   = currentUser && isAcknowledgedByUser(c.id, currentUser);

  let html = `
    <div class="modal-header">
      <div class="modal-cat">${isDraft ? '⬡ Проектный НПА' : '◉ Опубликованный НПА'} · ${esc(c.category)}</div>
      <div class="modal-title">${esc(c.title)}</div>
      <div class="modal-badges">
        ${c.criticality ? `<span class="badge badge-${cc}">${esc(c.criticality)}</span>`             : ''}
        ${c.probability ? `<span class="badge badge-prob">Вероятность: ${esc(c.probability)}</span>` : ''}
        ${c.status      ? `<span class="badge badge-status">${esc(c.status)}</span>`                 : ''}
        ${acked         ? `<span class="badge badge-ack">✓ Ознакомлен</span>`                   : ''}
        ${(c.departments||[]).map(d=>`<span class="badge badge-dept">${esc(d)}</span>`).join('')}
      </div>
    </div>
    <div class="modal-section">
      <div class="modal-section-label">Суть изменения</div>
      <div class="modal-section-text">${escMultiline(c.summary)}</div>
    </div>
    <div class="modal-grid">
      <div class="modal-field">
        <label>Нормативный акт</label>
        <span>${esc(c.normAct) || '—'}${c.sourceUrl ? ` <a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener" class="npa-source-link" onclick="event.stopPropagation()">↗ источник</a>` : ''}</span>
      </div>
      <div class="modal-field">
        <label>${isDraft ? 'Плановая дата' : 'Дата вступления в силу'}</label>
        <span>${isDraft ? esc(c.plannedDate||'—') : formatDate(c.effectiveDate)}</span>
      </div>
      ${isDraft ? `<div class="modal-field"><label>Стадия</label><span>${esc(c.discussionDate||'—')}</span></div>` : ''}
      ${c.deadline ? `<div class="modal-field"><label>Срок адаптации</label><span>${esc(c.deadline)}</span></div>` : ''}
    </div>`;

  if (!isDraft && c.sanctions) html += `
    <div class="modal-section">
      <div class="modal-section-label">Штрафные санкции</div>
      <div class="modal-section-text">${escMultiline(c.sanctions)}</div>
    </div>`;
  if (c.impact) html += `
    <div class="modal-section">
      <div class="modal-section-label">Влияние на компанию</div>
      <div class="modal-section-text">${escMultiline(c.impact)}</div>
    </div>`;
  if (c.mitigation || c.practicalValue) html += `
    <div class="modal-section">
      <div class="modal-section-label">${isDraft ? 'Практическое значение' : 'Митигация риска'}</div>
      <div class="modal-section-text">${escMultiline(c.mitigation||c.practicalValue)}</div>
    </div>`;

  html += `<div class="modal-divider"></div>${renderCommentsSection(id)}`;
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.add('closing');
  overlay.classList.remove('open');
  overlay.addEventListener('animationend', () => {
    overlay.classList.remove('closing');
  }, { once: true });
}

// ============================================================
// COMMENTS
// ============================================================
function renderCommentsSection(id) {
  const comments = getComments(id);

  function oneComment(cm, idx) {
    const isOwn  = cm.email?.toLowerCase() === currentEmail?.toLowerCase();
    const isAdm  = isAdmin();
    const canEdit = isOwn && cm.type !== 'ack';
    const canDel  = isOwn || isAdm;
    const typeLabel = cm.type === 'ack' ? '✓ Ознакомлен' : cm.type === 'issue' ? '⚠ Вопрос' : '💬 Комментарий';
    const replies = cm.replies || [];

    if (cm._editing) {
      return `<div class="comment-item type-${cm.type}" style="background:var(--bg-4)">
        <textarea class="comment-textarea" id="cedit-${id}-${idx}" style="width:100%;min-height:60px">${esc(cm.text)}</textarea>
        <div style="display:flex;gap:8px;margin-top:6px">
          <button class="comment-submit" style="padding:6px 14px;font-size:11px" onclick="saveEditComment('${id}',${idx})">Сохранить</button>
          <button class="btn-secondary" style="padding:6px 12px;font-size:11px" onclick="cancelEditComment('${id}',${idx})">Отмена</button>
        </div>
      </div>`;
    }

    const repliesHtml = replies.map((r, ri) => `
      <div class="reply-item">
        <div class="comment-meta">
          <span class="comment-author">${esc(r.author)}</span>
          <span class="comment-time">${esc(r.time)}</span>
          ${isOwn || isAdm ? `<button class="cmt-action-btn cmt-delete" style="margin-left:auto" onclick="deleteReply('${id}',${idx},${ri})">✕</button>` : ''}
        </div>
        ${r.text ? `<div class="comment-text">${esc(r.text)}</div>` : ''}
      </div>`).join('');

    const likes = cm.likes || [];
    const likedByMe = currentEmail && likes.map(e=>e.toLowerCase()).includes(currentEmail.toLowerCase());
    const likeNames = likes.map(e => getUserInfo(e).name || e).join(', ');
    const likeTitle = likes.length ? `Нравится: ${likeNames}` : 'Нравится';

    return `<div class="comment-item type-${cm.type}">
      <div class="comment-meta">
        <span class="comment-author">${esc(cm.author)}</span>
        <span class="comment-time">${esc(cm.time)}</span>
        <span class="comment-type-badge ${cm.type}">${typeLabel}</span>
        <div class="comment-actions">
          ${cm.type !== 'ack' ? `<span class="cmt-like-wrap">
            <button class="cmt-action-btn cmt-like-btn${likedByMe?' liked':''}" onclick="toggleCommentLike('${id}',${idx})">
              <span class="cmt-like-icon">${likedByMe ? '👍' : '👍🏻'}</span>${likes.length ? `<span class="cmt-like-count">${likes.length}</span>` : ''}
            </button>
            ${likes.length ? `<span class="cmt-like-tooltip">${esc(likeNames)}</span>` : ''}
          </span>` : ''}
          <button class="cmt-action-btn" onclick="toggleReplyForm('${id}',${idx})">↩ Ответить</button>
          ${canEdit ? `<button class="cmt-action-btn" onclick="startEditComment('${id}',${idx})">✎</button>` : ''}
          ${canDel  ? `<button class="cmt-action-btn cmt-delete" onclick="deleteComment('${id}',${idx})">✕</button>` : ''}
        </div>
      </div>
      ${cm.dept || cm.email ? `<div class="comment-dept">${esc([cm.dept, cm.email].filter(Boolean).join(' · '))}</div>` : ''}
      ${cm.text ? `<div class="comment-text${cm.edited?' comment-text-edited':''}">${esc(cm.text)}</div>` : ''}
      ${replies.length ? `<div class="comment-replies">${repliesHtml}</div>` : ''}
      <div class="reply-form" id="reply-form-${id}-${idx}" style="display:none">
        <textarea class="comment-textarea" id="reply-text-${id}-${idx}"
          placeholder="Ответить ${esc(cm.author)}…" style="min-height:52px"></textarea>
        <div style="display:flex;gap:8px;margin-top:6px">
          <button class="comment-submit" style="padding:6px 14px;font-size:11px" onclick="submitReply('${id}',${idx})">Отправить</button>
          <button class="btn-secondary" style="padding:6px 12px;font-size:11px" onclick="toggleReplyForm('${id}',${idx})">Отмена</button>
        </div>
      </div>
    </div>`;
  }

  const commentsHtml = comments.length
    ? comments.map((cm, idx) => oneComment(cm, idx)).join('')
    : '<div style="color:var(--text-3);font-size:13px;padding:8px 0">Комментариев пока нет</div>';

  return `<div class="comments-section">
    <h4>Комментарии и ознакомления (${comments.length})</h4>
    ${commentsHtml}
    <div class="comment-form" style="margin-top:16px">
      <div class="comment-form-row">
        <select class="comment-type-select" id="ctype-${id}">
          <option value="ack">✓ Ознакомлен(а)</option>
          <option value="comment">💬 Комментарий</option>
          <option value="issue">⚠ Вопрос / Риск</option>
        </select>
      </div>
      <textarea class="comment-textarea" id="ctext-${id}"
        placeholder="Текст комментария (необязательно для «Ознакомлен»)…"></textarea>
      <div style="margin-top:8px">
        <button class="comment-submit" id="submit-btn-${id}" onclick="submitComment('${id}')">Отправить</button>
      </div>
    </div>
  </div>`;
}

async function submitComment(id) {
  if (!currentUser) {
    showToast('Роль не определена — войдите заново', 'error');
    return;
  }
  const type = document.getElementById('ctype-' + id).value;
  const text = document.getElementById('ctext-' + id).value.trim();

  const btn = document.getElementById('submit-btn-' + id);
  if (btn) { btn.disabled = true; btn.textContent = 'Сохранение…'; }

  if (!store.comments[id]) store.comments[id] = [];
  const now     = new Date();
  const timeStr = now.toLocaleDateString('ru-RU') + ' ' +
                  now.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' });

  store.comments[id].push({
    author: currentName || currentUser || currentEmail,
    dept:   currentUser,
    email:  currentEmail,
    type, text, time: timeStr
  });

  if (type === 'ack') {
    if (!store.acknowledgements[id]) store.acknowledgements[id] = {};
    store.acknowledgements[id][currentUser] = true;
  }

  await saveToCloud();
  showToast(type === 'ack' ? '✓ Ознакомление зафиксировано' : '✓ Комментарий добавлен', 'success');

  // Bell-уведомление + сохранение в Firestore
  if (type !== 'ack') {
    const c = getAllChanges().find(x => x.id === id);
    const author = currentName || currentUser || currentEmail;
    const typeLabel = type === 'issue' ? '⚠ Вопрос' : '💬 Комментарий';
    const notifText = text ? (text.length > 60 ? text.substring(0, 60) + '…' : text) : '';
    const notif = {
      id:       'cm_' + Date.now(),
      title:    c ? c.title : id,
      text:     `${typeLabel} от ${author}${notifText ? ': ' + notifText : ''}`,
      changeId: id,
      urgent:   type === 'issue',
      kind:     'comment',
      time:     new Date().toLocaleTimeString('ru-RU', {hour:'2-digit',minute:'2-digit'}),
      read:     false
    };
    const recipients = getNotifRecipients(id, currentEmail);
    recipients.forEach(email => saveNotificationToFirestore(email, { ...notif }));
  }

  // onSnapshot обновит модал автоматически если Firebase подключён
  if (!CONFIGURED) { openChange(id); updateBadges(); renderDashboard(); renderPublished(); renderDraft(); }
}


// ============================================================
// COMMENT ACTIONS — delete, edit, reply
// ============================================================

let _deleteUndoTimer = null;

async function toggleCommentLike(changeId, idx) {
  const cm = (store.comments[changeId] || [])[idx];
  if (!cm || !currentEmail || cm.type === 'ack') return;
  if (!cm.likes) cm.likes = [];

  const emailLower = currentEmail.toLowerCase();
  const pos = cm.likes.findIndex(e => e.toLowerCase() === emailLower);
  if (pos >= 0) {
    cm.likes.splice(pos, 1); // убрать лайк
  } else {
    cm.likes.push(currentEmail); // поставить лайк
  }

  // Обновляем UI сразу, не дожидаясь сети — saveToCloud летит в фоне.
  // Если Firestore позже подтянет тот же стейт через onSnapshot — это не страшно,
  // openChange просто перерисует модал ещё раз с тем же содержимым.
  openChange(changeId);
  await saveToCloud();
}

function deleteComment(changeId, idx) {
  if (!store.comments[changeId]) return;
  const saved = store.comments[changeId].splice(idx, 1)[0]; // извлекаем, не сохраняем
  if (!store.comments[changeId].length) delete store.comments[changeId];

  // Перерисовываем UI сразу
  if (CONFIGURED) openChange(changeId);
  else { openChange(changeId); updateBadges(); renderDashboard(); }

  // Показываем toast с кнопкой отмены
  showToastUndo('Комментарий удалён', () => {
    // Восстанавливаем
    if (!store.comments[changeId]) store.comments[changeId] = [];
    store.comments[changeId].splice(idx, 0, saved);
    openChange(changeId); updateBadges(); renderDashboard();
  }, async () => {
    // Подтверждаем удаление — сохраняем в облако
    await saveToCloud();
    updateBadges(); renderDashboard();
  });
}

function deleteReply(changeId, cmtIdx, replyIdx) {
  const cm = (store.comments[changeId] || [])[cmtIdx];
  if (!cm || !cm.replies) return;
  const saved = cm.replies.splice(replyIdx, 1)[0];

  if (CONFIGURED) openChange(changeId);
  else { openChange(changeId); updateBadges(); }

  showToastUndo('Ответ удалён', () => {
    cm.replies.splice(replyIdx, 0, saved);
    openChange(changeId);
  }, async () => {
    await saveToCloud();
  });
}

function startEditComment(changeId, idx) {
  const cm = (store.comments[changeId] || [])[idx];
  if (!cm) return;
  cm._editing = true;
  openChange(changeId);
}

async function saveEditComment(changeId, idx) {
  const cm = (store.comments[changeId] || [])[idx];
  if (!cm) return;
  const textarea = document.getElementById('cedit-' + changeId + '-' + idx);
  if (!textarea) return;
  cm.text = textarea.value.trim();
  cm.edited = true;
  delete cm._editing;
  await saveToCloud();
  showToast('Комментарий изменён', 'success');
  if (CONFIGURED) return;
  openChange(changeId);
}

function cancelEditComment(changeId, idx) {
  const cm = (store.comments[changeId] || [])[idx];
  if (!cm) return;
  delete cm._editing;
  openChange(changeId);
}

function toggleReplyForm(changeId, idx) {
  const form = document.getElementById('reply-form-' + changeId + '-' + idx);
  if (!form) return;
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
  if (form.style.display === 'block') {
    const ta = document.getElementById('reply-text-' + changeId + '-' + idx);
    if (ta) ta.focus();
  }
}

async function submitReply(changeId, idx) {
  const ta = document.getElementById('reply-text-' + changeId + '-' + idx);
  if (!ta) return;
  const text = ta.value.trim();
  if (!text) return;
  const cm = (store.comments[changeId] || [])[idx];
  if (!cm) return;
  if (!cm.replies) cm.replies = [];
  const now = new Date();
  cm.replies.push({
    author: currentName || currentUser || currentEmail,
    time: now.toLocaleDateString('ru-RU') + ' ' +
          now.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' }),
    text
  });
  await saveToCloud();
  showToast('Ответ добавлен', 'success');

  // Bell-уведомление об ответе + сохранение в Firestore
  const c2 = getAllChanges().find(x => x.id === changeId);
  const author2 = currentName || currentUser || currentEmail;
  const replyNotif = {
    id:       'reply_' + Date.now(),
    title:    c2 ? c2.title : changeId,
    text:     `↩ Ответ от ${author2}${text ? ': ' + (text.length > 50 ? text.substring(0,50)+'…' : text) : ''}`,
    changeId,
    urgent:   false,
    kind:     'comment',
    time:     new Date().toLocaleTimeString('ru-RU', {hour:'2-digit',minute:'2-digit'}),
    read:     false
  };
  const replyRecipients = getNotifRecipients(changeId, currentEmail);
  replyRecipients.forEach(email => saveNotificationToFirestore(email, { ...replyNotif }));

  if (CONFIGURED) return;
  openChange(changeId);
}

// ============================================================
// ALL COMMENTS VIEW
// ============================================================
let activeCommentsTab = 'comments';

function setCommentsTab(tab) {
  activeCommentsTab = tab;
  document.querySelectorAll('.comments-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));
  renderAllComments();
}

function renderAllComments() {
  const container = document.getElementById('all-comments-list');
  const all = [];
  Object.entries(store.comments).forEach(([id, cmts]) => {
    const c = getAllChanges().find(x => x.id === id);
    cmts.forEach(cm => all.push({ ...cm, id, changeTitle: c ? c.title : id }));
  });

  // Обновляем счётчики вкладок
  const cntComments = all.filter(cm => cm.type !== 'ack').length;
  const cntAcks     = all.filter(cm => cm.type === 'ack').length;
  const elC = document.getElementById('tab-count-comments');
  const elA = document.getElementById('tab-count-acks');
  if (elC) elC.textContent = cntComments;
  if (elA) elA.textContent = cntAcks;

  if (activeCommentsTab === 'comments') {
    // ── Вкладка Комментарии ──
    let items = all.filter(cm => cm.type !== 'ack');

    if (searchQuery && searchComments)
      items = items.filter(cm =>
        (cm.text||'').toLowerCase().includes(searchQuery) ||
        (cm.author||'').toLowerCase().includes(searchQuery) ||
        (cm.changeTitle||'').toLowerCase().includes(searchQuery));

    items = [...items].reverse();

    if (!items.length) {
      container.innerHTML = `<div class="empty-state"><div class="icon">◷</div><p>Комментариев пока нет</p></div>`;
      return;
    }

    container.innerHTML = items.map(cm => {
      const typeLabel = cm.type === 'issue' ? '⚠ Вопрос' : '💬 Комментарий';
      const repliesHtml = (cm.replies||[]).map(r => `
        <div class="reply-item" style="margin-top:6px">
          <div class="comment-meta">
            <span class="comment-author">${esc(r.author)}</span>
            <span class="comment-time">${esc(r.time)}</span>
          </div>
          ${r.text ? `<div class="comment-text">${esc(r.text)}</div>` : ''}
        </div>`).join('');
      return `<div class="all-comment-item type-${cm.type}" onclick="openChange('${cm.id}')">
        <div class="all-comment-link">→ ${esc(cm.changeTitle)}</div>
        <div class="comment-meta">
          <span class="comment-author">${esc(cm.author)}</span>
          <span class="comment-time">${esc(cm.time)}</span>
          <span class="comment-type-badge ${cm.type}">${typeLabel}</span>
          ${cm.likes && cm.likes.length ? `<span class="all-comment-likes-wrap">
            <span class="all-comment-likes">👍 ${cm.likes.length}</span>
            <span class="cmt-like-tooltip">${esc(cm.likes.map(e=>getUserInfo(e).name||e).join(', '))}</span>
          </span>` : ''}
        </div>
        ${cm.text ? `<div class="comment-text${cm.edited?' comment-text-edited':''}">${esc(cm.text)}</div>` : ''}
        ${repliesHtml}
      </div>`;
    }).join('');

  } else {
    // ── Вкладка Ознакомления ──
    const acks = all.filter(cm => cm.type === 'ack');

    if (!acks.length) {
      container.innerHTML = `<div class="empty-state"><div class="icon">✓</div><p>Ознакомлений пока нет</p></div>`;
      return;
    }

    // Парсим дату "ДД.ММ.ГГГГ ЧЧ:ММ" в число для корректной сортировки
    function parseAckTime(str) {
      if (!str) return 0;
      const m = str.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
      if (!m) return 0;
      return new Date(+m[3], +m[2]-1, +m[1], +m[4], +m[5]).getTime();
    }

    // Группируем по НПА
    const groups = {};
    acks.forEach(cm => {
      const c = getAllChanges().find(x => x.id === cm.id);
      if (!groups[cm.id]) groups[cm.id] = {
        title: (c && c.title) ? c.title : cm.changeTitle,
        items: [],
        change: c,
        lastTs: 0
      };
      groups[cm.id].items.push(cm);
      // Сравниваем через parseAckTime чтобы не зависеть от формата строки
      const ts = parseAckTime(cm.time);
      if (ts > groups[cm.id].lastTs) groups[cm.id].lastTs = ts;
    });

    // Считаем сколько должно ознакомиться (сотрудники департаментов НПА)
    const nonAdminUsers = Object.entries(USERS).filter(([,u]) => u.role !== 'admin');

    // Сортируем группы — последнее ознакомление сверху
    const sortedGroups = Object.entries(groups)
      .sort((a, b) => b[1].lastTs - a[1].lastTs);

    container.innerHTML = sortedGroups.map(([id, g]) => {
      const depts = (g.change?.departments || []).filter(d => d !== 'Все');
      const expected = depts.length
        ? nonAdminUsers.filter(([,u]) => depts.includes(u.dept) || u.dept === 'Руководство')
        : nonAdminUsers;
      const total = expected.length;
      const done  = g.items.length;

      const pct = total > 0 ? Math.round(done / total * 100) : 0;

      const rows = [...g.items]
        .sort((a, b) => parseAckTime(b.time) - parseAckTime(a.time))
        .map(cm => {
        const initials = (cm.author||'?').split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();
        return `<div class="ack-row">
          <div class="ack-avatar">${initials}</div>
          <span class="ack-name">${esc(cm.author)}</span>
          ${cm.dept ? `<span class="ack-dept-badge">${esc(cm.dept)}</span>` : ''}
          <span class="ack-time">${esc(cm.time)}</span>
          <i class="ti ti-check ack-check" aria-hidden="true"></i>
        </div>`;
      }).join('');

      return `<div class="ack-group" onclick="openChange('${id}')">
        <div class="ack-group-header">
          <span class="ack-group-title">→ ${esc(g.title)}</span>
          <span class="ack-group-stat">${done} из ${total} · ${pct}%</span>
        </div>
        <div class="ack-progress-bar"><div class="ack-progress-fill" style="width:${pct}%"></div></div>
        <div class="ack-rows">${rows}</div>
      </div>`;
    }).join('');
  }
}

function updateBadges() {
  const total = Object.values(store.comments).flat().length;
  document.getElementById('badge-comments').textContent = total;
  if (total > 0) document.getElementById('badge-comments').classList.add('pending');
}

// ============================================================
// ADMIN PANEL
// ============================================================
function openAdminPanel() { document.getElementById('admin-overlay').classList.add('open'); }
function closeAdmin()     { document.getElementById('admin-overlay').classList.remove('open'); }

async function submitNewChange(e) {
  e.preventDefault();
  const fd   = new FormData(e.target);
  const type = fd.get('type');
  const id   = type + '-extra-' + Date.now();

  const sendNotify = fd.get('send_notify') === 'on';
  const newEntry = {
    id, num: getAllChanges().length + 1, type,
    category:      fd.get('category'),
    title:         fd.get('title') || (fd.get('category').split('/')[0].trim() + ': ' + fd.get('summary').substring(0,60) + '…'),
    summary:       fd.get('summary'),
    normAct:       fd.get('norm_act'),
    sourceUrl:     fd.get('source_url') || null,
    effectiveDate: fd.get('effective_date'),
    sanctions:     fd.get('sanctions'),
    criticality:   fd.get('criticality'),
    impact:        fd.get('impact'),
    mitigation:    fd.get('mitigation'),
    deadline:      fd.get('deadline'),
    departments:   fd.getAll('dept[]').filter(Boolean),
    status:        fd.get('status'),
    probability:   fd.get('probability') || null,
    plannedDate:   fd.get('effective_date') || null,
    urgent:        fd.get('urgent') === 'on'
  };

  store.extraChanges.push(newEntry);
  await saveToCloud();

  if (sendNotify) sendEmailNotification(newEntry);

  closeAdmin();
  e.target.reset();
  if (!CONFIGURED) { buildDeptFilters(); renderPublished(); renderDraft(); renderDashboard(); }
  showToast(sendNotify ? '✓ Изменение добавлено, уведомления отправлены' : '✓ Изменение добавлено', 'success');
}

// ============================================================
// EXPORT
// ============================================================
function openExportModal() {
  document.getElementById('export-modal-overlay').classList.add('open');
}
function closeExportModal() {
  document.getElementById('export-modal-overlay').classList.remove('open');
}

// ── Excel ──
function exportExcel() {
  // Используем SheetJS (xlsx) через CDN
  if (typeof XLSX === 'undefined') {
    showToast('Загрузка библиотеки…', '');
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => { closeExportModal(); _doExportExcel(); };
    document.head.appendChild(s);
  } else {
    closeExportModal();
    _doExportExcel();
  }
}


// Вспомогательная функция — получить настройки экспорта
function getExportSettings() {
  const dept     = document.getElementById('export-dept')?.value || 'all';
  const incPub   = document.getElementById('export-inc-pub')?.checked !== false;
  const incDraft = document.getElementById('export-inc-draft')?.checked !== false;
  const incComm  = document.getElementById('export-inc-comments')?.checked !== false;

  const all = getAllChanges();
  const filterByDept = c => dept === 'all' ||
    (c.departments||[]).some(d => d === dept || d === 'Все');

  return {
    dept, incPub, incDraft, incComm,
    pub:   incPub   ? all.filter(c => !isDraftRecord(c) && filterByDept(c)) : [],
    draft: incDraft ? all.filter(c => isDraftRecord(c)  && filterByDept(c)) : [],
    deptLabel: dept === 'all' ? 'Все департаменты' : dept
  };
}

function _doExportExcel() {
  const { pub, draft, incComm, dept, deptLabel } = getExportSettings();
  const wb = XLSX.utils.book_new();
  const deptSuffix = dept === 'all' ? '' : ` · ${dept}`;
  const dateStr = new Date().toLocaleDateString('ru-RU');

  // Цвета критичности для ячеек
  const critFill = {
    'Высокая':    'FFFFE8E8',
    'Средняя':    'FFFFF3E0',
    'Низкая':     'FFE8F5E9',
    'Отсутствует':'FFE3F2FD'
  };
  const critFont = {
    'Высокая':    'FFC8102E',
    'Средняя':    'FF8D5B00',
    'Низкая':     'FF2E7D32',
    'Отсутствует':'FF1565C0'
  };

  function styleSheet(ws, rows, critColIdx) {
    // Стилизуем заголовок
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({r:0, c:C});
      if (!ws[addr]) continue;
      ws[addr].s = {
        font: { bold: true, color: { rgb: 'FFFFFFFF' } },
        fill: { fgColor: { rgb: 'FF0D1E34' } },
        alignment: { wrapText: true, vertical: 'center' }
      };
    }
    // Стилизуем строки данных
    for (let R = 1; R <= range.e.r; R++) {
      const critCell = ws[XLSX.utils.encode_cell({r:R, c:critColIdx})];
      const crit = critCell ? critCell.v : '';
      const fill = critFill[crit] || 'FFFAFAFA';
      const fcolor = critFont[crit] || 'FF0D1E34';
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({r:R, c:C});
        if (!ws[addr]) continue;
        ws[addr].s = {
          fill: { fgColor: { rgb: fill } },
          alignment: { wrapText: true, vertical: 'top' },
          font: C === critColIdx ? { bold: true, color: { rgb: fcolor } } : {}
        };
      }
    }
  }

  // Лист 0 — Сводка
  const summaryRows = [
    ['MARSHALL COMPLIANCE MONITOR'],
    [`Отчёт сформирован: ${dateStr}   |   Департамент: ${deptLabel}`],
    [''],
    ['СВОДКА', ''],
    ['Всего НПА в системе', getAllChanges().length],
    ['Опубликованных в отчёте', pub.length],
    ['Проектных в отчёте', draft.length],
    [''],
    ['КРИТИЧНОСТЬ', 'Опубликованные', 'Проектные'],
    ...['Высокая','Средняя','Низкая','Отсутствует'].map(crit => [
      crit,
      pub.filter(c => c.criticality === crit).length,
      draft.filter(c => c.criticality === crit).length
    ]),
    [''],
    ['САМЫЕ СРОЧНЫЕ (ближайшие 90 дней)', ''],
  ];
  const now = new Date();
  pub
    .filter(c => {
      const d = new Date(c.effectiveDate);
      return !isNaN(d) && d >= now && (d - now) / 86400000 <= 90;
    })
    .sort((a,b) => new Date(a.effectiveDate) - new Date(b.effectiveDate))
    .slice(0, 5)
    .forEach(c => summaryRows.push([
      c.title, formatDate(c.effectiveDate), c.criticality||'—'
    ]));

  const ws0 = XLSX.utils.aoa_to_sheet(summaryRows);
  ws0['!cols'] = [40, 20, 14].map(w => ({wch: w}));
  ws0['A1'] && (ws0['A1'].s = { font: { bold: true, sz: 16, color: { rgb: 'FFC8102E' } } });
  XLSX.utils.book_append_sheet(wb, ws0, 'Сводка');

  // Лист 1 — Опубликованные
  if (pub.length > 0) {
    const pubRows = [
      ['Заголовок','Категория','Критичность','Нормативный акт','Дата вступления',
       'Срок адаптации','Суть изменения','Влияние на компанию','Митигация риска',
       'Штрафные санкции','Департаменты','Статус','Источник']
    ];
    pub.forEach(c => pubRows.push([
      c.title||'—', c.category||'—', c.criticality||'—', c.normAct||'—',
      formatDate(c.effectiveDate), c.deadline||'—',
      c.summary||'—', c.impact||'—', c.mitigation||'—',
      c.sanctions||'—', (c.departments||[]).join(', '), c.status||'—',
      c.sourceUrl||'—'
    ]));
    const ws1 = XLSX.utils.aoa_to_sheet(pubRows);
    ws1['!cols'] = [32,14,12,26,14,14,40,35,35,20,14,14,30].map(w=>({wch:w}));
    styleSheet(ws1, pubRows, 2); // критичность в колонке 2
    XLSX.utils.book_append_sheet(wb, ws1, `Опубликованные${deptSuffix}`);
  }

  // Лист 2 — Проектные
  if (draft.length > 0) {
    const dftRows = [
      ['Заголовок','Категория','Критичность','Нормативный акт',
       'Вероятность','Плановая дата','Суть изменения','Влияние / Что сделать','Департаменты']
    ];
    draft.forEach(c => dftRows.push([
      c.title||'—', c.category||'—', c.criticality||'—', c.normAct||'—',
      c.probability||'—', c.plannedDate||'—', c.summary||'—',
      c.mitigation||c.practicalValue||'—',
      (c.departments||[]).join(', ')
    ]));
    const ws2 = XLSX.utils.aoa_to_sheet(dftRows);
    ws2['!cols'] = [32,14,12,26,12,14,40,40,14].map(w=>({wch:w}));
    styleSheet(ws2, dftRows, 2);
    XLSX.utils.book_append_sheet(wb, ws2, `Проектные${deptSuffix}`);
  }

  // Листы по департаментам (если выбраны Все)
  if (dept === 'all' && pub.length > 0) {
    const depts = [...new Set(pub.flatMap(c => c.departments||[]).filter(d => d !== 'Все'))];
    depts.forEach(d => {
      const dPub = pub.filter(c => (c.departments||[]).some(x => x === d || x === 'Все'));
      if (!dPub.length) return;
      const rows = [['Заголовок','Критичность','Дата вступления','Суть изменения','Статус']];
      dPub.forEach(c => rows.push([
        c.title||'—', c.criticality||'—',
        formatDate(c.effectiveDate), c.summary||'—', c.status||'—'
      ]));
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [32,12,14,50,14].map(w=>({wch:w}));
      styleSheet(ws, rows, 1);
      XLSX.utils.book_append_sheet(wb, ws, d.substring(0,31));
    });
  }

  // Лист Комментарии
  if (incComm) {
    const cmtRows = [['НПА','Автор','Тип','Комментарий','Дата']];
    const filterIds = new Set([...pub, ...draft].map(c => c.id));
    Object.entries(store.comments).forEach(([id, cmts]) => {
      if (dept !== 'all' && !filterIds.has(id)) return;
      const c = getAllChanges().find(x=>x.id===id);
      cmts.forEach(cm => cmtRows.push([
        c ? c.title : id, cm.author||'—',
        cm.type==='ack'?'✓ Ознакомлен':cm.type==='issue'?'⚠ Вопрос':'💬 Комментарий',
        cm.text||'', cm.time||'—'
      ]));
    });
    if (cmtRows.length > 1) {
      const ws3 = XLSX.utils.aoa_to_sheet(cmtRows);
      ws3['!cols'] = [40,16,14,50,18].map(w=>({wch:w}));
      for (let R = 0; R <= cmtRows.length-1; R++) {
        const addr0 = XLSX.utils.encode_cell({r:R, c:0});
        if (ws3[addr0]) ws3[addr0].s = R===0
          ? { font:{bold:true,color:{rgb:'FFFFFFFF'}}, fill:{fgColor:{rgb:'FF0D1E34'}} }
          : { alignment:{wrapText:true,vertical:'top'} };
      }
      XLSX.utils.book_append_sheet(wb, ws3, 'Комментарии');
    }
  }

  if (!wb.SheetNames.length) {
    showToast('Нет данных для экспорта', 'error');
    return;
  }

  const fname = `Marshall_Compliance_${dept === 'all' ? 'Все' : dept}_${dateStr.replace(/[./]/g,'-')}.xlsx`;
  XLSX.writeFile(wb, fname);
  showToast(`Excel скачан (${deptLabel})`, 'success');
}

// ── Word (HTML→.doc trick) ──
function exportWord() {
  closeExportModal();
  const { pub, draft: dft, deptLabel, incComm } = getExportSettings();
  const date = new Date().toLocaleDateString('ru-RU');

  const critStyle = {
    'Высокая':    'color:#C8102E;font-weight:bold',
    'Средняя':    'color:#B36800;font-weight:bold',
    'Низкая':     'color:#1A8A4A;font-weight:bold',
    'Отсутствует':'color:#2E6A9A;font-weight:bold'
  };
  const critBg = {
    'Высокая':    'background:#FFE8E8',
    'Средняя':    'background:#FFF3E0',
    'Низкая':     'background:#E8F5EE',
    'Отсутствует':'background:#E8F0F8'
  };

  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:w="urn:schemas-microsoft-com:office:word"
    xmlns="http://www.w3.org/TR/REC-html40">
  <head><meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; font-size: 10pt; color: #0D1E34; margin: 0; }
    h1 { font-size: 18pt; color: #C8102E; text-align: center; margin: 0 0 4pt; }
    h2 { font-size: 13pt; color: #fff; background: #0D1E34; padding: 5pt 8pt;
         margin: 16pt 0 8pt; border-left: 4pt solid #C8102E; }
    h3 { font-size: 11pt; color: #0D1E34; margin: 10pt 0 3pt;
         border-left: 3pt solid #C8102E; padding-left: 6pt; }
    .cover { text-align:center; border-bottom: 2pt solid #C8102E;
             padding-bottom: 10pt; margin-bottom: 12pt; }
    .subtitle { text-align: center; font-size: 11pt; color: #3D5A78; margin: 2pt 0; }
    .dept-tag { display:inline-block; background:#0D1E34; color:#fff;
                font-size:8pt; padding:1pt 6pt; border-radius:2pt; margin:1pt; }
    .meta { background:#F0F4F8; border-left:3pt solid #C8102E;
            padding:5pt 8pt; margin:5pt 0 8pt; font-size:9pt; }
    .field { margin: 3pt 0 3pt 10pt; font-size: 9pt; line-height: 1.5; }
    .field b { color: #C8102E; }
    .sep { border: none; border-top: 1pt solid #C8D8E8; margin: 12pt 0; }
    .source-link { font-size:8pt; color:#C8102E; }
    .cmt-block { background:#F8F4F0; border-left:2pt solid #C8D8E8;
                 padding:4pt 8pt; margin:3pt 0 3pt 10pt; font-size:8.5pt; }
    .cmt-author { font-weight:bold; color:#0D1E34; }
    /* Сводная таблица */
    .summary-table { width:100%; border-collapse:collapse; font-size:9pt; margin:8pt 0; }
    .summary-table th { background:#0D1E34; color:#fff; padding:4pt 6pt;
                        text-align:left; border:1pt solid #C8D8E8; }
    .summary-table td { padding:3pt 6pt; border:1pt solid #C8D8E8; vertical-align:top; }
    .summary-table tr:nth-child(even) td { background:#F8FAFB; }
  </style></head><body>`;

  // Обложка
  html += `<div class="cover">
    <h1>MARSHALL COMPLIANCE MONITOR</h1>
    <p class="subtitle"><b>Мониторинг изменений законодательства</b></p>
    <p class="subtitle">Департамент: <b>${deptLabel}</b> &nbsp;·&nbsp; Дата формирования: <b>${date}</b></p>
  </div>`;

  // Сводная таблица
  const critList = ['Высокая','Средняя','Низкая','Отсутствует'];
  html += `<h2>Сводка</h2>
  <table class="summary-table">
    <tr><th>Показатель</th><th>Опубликованные</th><th>Проектные</th><th>Итого</th></tr>
    <tr><td><b>Всего НПА</b></td><td>${pub.length}</td><td>${dft.length}</td><td>${pub.length+dft.length}</td></tr>
    ${critList.map(crit => {
      const p = pub.filter(c=>c.criticality===crit).length;
      const d = dft.filter(c=>c.criticality===crit).length;
      return `<tr><td style="${critStyle[crit]||''}">${crit} критичность</td><td>${p}</td><td>${d}</td><td>${p+d}</td></tr>`;
    }).join('')}
  </table>`;

  // Ближайшие НПА (90 дней)
  const now = new Date();
  const urgent90 = pub.filter(c => {
    const d = new Date(c.effectiveDate);
    return !isNaN(d) && d >= now && (d-now)/86400000 <= 90;
  }).sort((a,b)=>new Date(a.effectiveDate)-new Date(b.effectiveDate));

  if (urgent90.length) {
    html += `<h2>Ближайшие (следующие 90 дней)</h2>
    <table class="summary-table">
      <tr><th>Заголовок</th><th>Дата вступления</th><th>Критичность</th><th>Департаменты</th></tr>
      ${urgent90.map(c=>`<tr>
        <td>${c.title}</td>
        <td>${formatDate(c.effectiveDate)}</td>
        <td style="${critStyle[c.criticality]||''}">${c.criticality||'—'}</td>
        <td>${(c.departments||[]).join(', ')}</td>
      </tr>`).join('')}
    </table>`;
  }

  // I. Опубликованные
  if (pub.length) {
    html += `<h2>I. Опубликованные нормативно-правовые акты</h2>`;
    pub.forEach((c,i) => {
      const cs = critStyle[c.criticality] || '';
      const cb = critBg[c.criticality] || '';
      const depts = (c.departments||[]).map(d=>`<span class="dept-tag">${d}</span>`).join(' ');
      html += `<h3>${i+1}. ${c.title}</h3>
      <div class="meta">
        <b>Категория:</b> ${c.category||'—'} &nbsp;|&nbsp;
        <b>Критичность:</b> <span style="${cs}">${c.criticality||'—'}</span> &nbsp;|&nbsp;
        <b>Статус:</b> ${c.status||'—'}
        <br>${depts}
      </div>
      <div class="field"><b>Нормативный акт:</b> ${c.normAct||'—'}${c.sourceUrl ? ` &nbsp;<a href="${c.sourceUrl}" class="source-link">↗ источник</a>` : ''}</div>
      <div class="field"><b>Дата вступления в силу:</b> ${formatDate(c.effectiveDate)}</div>
      <div class="field"><b>Срок адаптации:</b> ${c.deadline||'—'}</div>
      <div class="field"><b>Суть изменения:</b><br>${(c.summary||'—').replace(/\n/g,'<br>')}</div>
      ${c.impact ? `<div class="field"><b>Влияние на компанию:</b><br>${c.impact.replace(/\n/g,'<br>')}</div>` : ''}
      ${c.mitigation ? `<div class="field"><b>Что нужно сделать:</b><br>${c.mitigation.replace(/\n/g,'<br>')}</div>` : ''}
      ${c.sanctions ? `<div class="field"><b>Штрафные санкции:</b> ${c.sanctions}</div>` : ''}`;
      if (incComm) {
        const cmts = getComments(c.id).filter(cm => cm.type !== 'ack');
        if (cmts.length) {
          html += `<div class="field"><b>Комментарии и вопросы (${cmts.length}):</b></div>`;
          cmts.forEach(cm => html += `<div class="cmt-block">
            <span class="cmt-author">${cm.author||'—'}</span> &nbsp;·&nbsp; ${cm.time||''}
            ${cm.type==='issue' ? ' &nbsp;⚠ <i>Вопрос</i>' : ''}
            ${cm.text ? `<br>${cm.text}` : ''}
          </div>`);
        }
      }
      html += `<div class="sep"></div>`;
    });
  }

  // II. Проектные
  if (dft.length) {
    html += `<h2>II. Проектные нормативно-правовые акты</h2>`;
    dft.forEach((c,i) => {
      const cs = critStyle[c.criticality] || '';
      const depts = (c.departments||[]).map(d=>`<span class="dept-tag">${d}</span>`).join(' ');
      html += `<h3>${i+1}. ${c.title}</h3>
      <div class="meta">
        <b>Категория:</b> ${c.category||'—'} &nbsp;|&nbsp;
        <b>Критичность:</b> <span style="${cs}">${c.criticality||'—'}</span> &nbsp;|&nbsp;
        <b>Вероятность принятия:</b> ${c.probability||'—'}
        <br>${depts}
      </div>
      <div class="field"><b>Нормативный акт:</b> ${c.normAct||'—'}${c.sourceUrl ? ` &nbsp;<a href="${c.sourceUrl}" class="source-link">↗ источник</a>` : ''}</div>
      <div class="field"><b>Плановая дата:</b> ${c.plannedDate||'—'}</div>
      <div class="field"><b>Суть изменения:</b><br>${(c.summary||'—').replace(/\n/g,'<br>')}</div>
      ${c.mitigation||c.practicalValue ? `<div class="field"><b>Что нужно сделать:</b><br>${(c.mitigation||c.practicalValue||'').replace(/\n/g,'<br>')}</div>` : ''}
      <div class="sep"></div>`;
    });
  }

  html += `</body></html>`;
  const blob = new Blob([html], {type:'application/msword'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `Marshall_Compliance_${deptLabel.replace(' ','_')}_${date.replace(/\./g,'-')}.doc`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Word-документ скачан', 'success');
}

// ── PDF ──
function exportPDF() {
  closeExportModal();
  const { pub, draft: dft, deptLabel, incComm } = getExportSettings();
  const printWin = window.open('', '_blank', 'width=900,height=700');

  const date = new Date().toLocaleDateString('ru-RU');

  const crit_style = {
    'Высокая':'background:#FFE8E8;color:#C8102E',
    'Средняя':'background:#FFF5E0;color:#B36800',
    'Низкая':'background:#E8F5EE;color:#1A8A4A',
    'Отсутствует':'background:#E8F0F8;color:#2E6A9A'
  };

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    @page { margin: 20mm 18mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 9pt; color: #0D1E34; }
    .cover { text-align: center; padding: 60pt 0 40pt; border-bottom: 3pt solid #C8102E; margin-bottom: 30pt; }
    .cover-logo { font-size: 28pt; font-weight: 900; color: #C8102E; letter-spacing: 4pt; }
    .cover-title { font-size: 15pt; font-weight: bold; color: #0D1E34; margin: 10pt 0 6pt; }
    .cover-sub { font-size: 11pt; color: #3D5A78; }
    .section-header {
      background: #0D1E34; color: white; font-size: 11pt; font-weight: bold;
      padding: 8pt 12pt; margin: 20pt 0 10pt; letter-spacing: 1pt;
    }
    .card { border: 1pt solid #C8D8E8; border-left: 3pt solid #C8102E;
            margin-bottom: 12pt; padding: 10pt 12pt; page-break-inside: avoid; }
    .card-title { font-size: 10pt; font-weight: bold; color: #0D1E34; margin-bottom: 6pt; }
    .card-num { background: #C8102E; color: white; font-size: 8pt; font-weight: bold;
                padding: 1pt 5pt; margin-right: 6pt; }
    .meta-row { display: flex; gap: 8pt; margin-bottom: 6pt; flex-wrap: wrap; }
    .badge { font-size: 7.5pt; font-weight: bold; padding: 2pt 7pt; letter-spacing: 0.5pt; }
    .badge-dept { background: #C8102E; color: white; }
    .badge-status { background: #EAF0F7; color: #3D5A78; border: 1pt solid #C8D8E8; }
    .field { margin: 3pt 0; font-size: 8.5pt; }
    .field-label { font-weight: bold; color: #C8102E; }
    .comments-block { background: #F8FBFF; border-top: 1pt solid #C8D8E8; margin-top: 8pt; padding-top: 6pt; }
    .comment-item { font-size: 8pt; color: #3D5A78; margin: 2pt 0; padding-left: 8pt; border-left: 2pt solid #C8D8E8; }
    .footer { position: fixed; bottom: 10mm; left: 18mm; right: 18mm;
              border-top: 1pt solid #C8D8E8; padding-top: 4pt;
              display: flex; justify-content: space-between; font-size: 7.5pt; color: #8AA0B8; }
  </style></head><body>
  <div class="cover">
    <div style="margin-bottom:12pt">
      <img src="${LOGO_FULL_B64}" style="height:52pt;width:auto">
    </div>
    <div class="cover-title">МОНИТОРИНГ ИЗМЕНЕНИЙ ЗАКОНОДАТЕЛЬСТВА</div>
    <div class="cover-sub">${QUARTER} &nbsp;·&nbsp; Дата формирования: ${date}</div>
  </div>
  <div class="footer">
    <span>MARSHALL Compliance Monitor</span>
    <span>${QUARTER} · ${date}</span>
    <span>Конфиденциально</span>
  </div>
  <div class="section-header">I. ОПУБЛИКОВАННЫЕ НОРМАТИВНО-ПРАВОВЫЕ АКТЫ</div>`;

  // Сводная таблица в PDF
  const pdfCritList = ['Высокая','Средняя','Низкая','Отсутствует'];
  html += `<div style="margin:0 0 16pt;padding:10pt;background:#F8FAFB;border:1pt solid #C8D8E8;border-radius:4pt">
    <div style="font-weight:bold;font-size:10pt;color:#0D1E34;margin-bottom:8pt;border-bottom:1pt solid #C8D8E8;padding-bottom:4pt">
      Сводка · Департамент: ${deptLabel}
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:8.5pt">
      <tr>
        <th style="text-align:left;padding:3pt 6pt;background:#0D1E34;color:#fff">Критичность</th>
        <th style="padding:3pt 6pt;background:#0D1E34;color:#fff;text-align:center">Опубл.</th>
        <th style="padding:3pt 6pt;background:#0D1E34;color:#fff;text-align:center">Проект.</th>
        <th style="padding:3pt 6pt;background:#0D1E34;color:#fff;text-align:center">Итого</th>
      </tr>
      ${pdfCritList.map(crit => {
        const p = pub.filter(c=>c.criticality===crit).length;
        const d = dft.filter(c=>c.criticality===crit).length;
        const s = crit_style[crit] || '';
        return `<tr>
          <td style="padding:3pt 6pt;border-bottom:0.5pt solid #E0E8F0;${s}">${crit}</td>
          <td style="padding:3pt 6pt;border-bottom:0.5pt solid #E0E8F0;text-align:center">${p}</td>
          <td style="padding:3pt 6pt;border-bottom:0.5pt solid #E0E8F0;text-align:center">${d}</td>
          <td style="padding:3pt 6pt;border-bottom:0.5pt solid #E0E8F0;text-align:center;font-weight:bold">${p+d}</td>
        </tr>`;
      }).join('')}
      <tr style="background:#F0F4F8">
        <td style="padding:3pt 6pt;font-weight:bold">Всего</td>
        <td style="padding:3pt 6pt;text-align:center;font-weight:bold">${pub.length}</td>
        <td style="padding:3pt 6pt;text-align:center;font-weight:bold">${dft.length}</td>
        <td style="padding:3pt 6pt;text-align:center;font-weight:bold">${pub.length+dft.length}</td>
      </tr>
    </table>
  </div>`;

  // Ближайшие НПА
  const pdfNow = new Date();
  const pdf90 = pub.filter(c => {
    const d = new Date(c.effectiveDate);
    return !isNaN(d) && d >= pdfNow && (d-pdfNow)/86400000 <= 90;
  }).sort((a,b)=>new Date(a.effectiveDate)-new Date(b.effectiveDate));
  if (pdf90.length) {
    html += `<div style="margin-bottom:16pt">
      <div style="font-weight:bold;font-size:9pt;color:#C8102E;margin-bottom:6pt">⚡ БЛИЖАЙШИЕ (следующие 90 дней)</div>
      ${pdf90.map(c=>`<div style="display:flex;gap:8pt;padding:4pt 6pt;border-left:2pt solid #C8102E;margin-bottom:4pt;background:#FFF8F8;font-size:8.5pt">
        <span style="min-width:70pt;color:#C8102E;font-weight:bold">${formatDate(c.effectiveDate)}</span>
        <span style="flex:1">${c.title}</span>
        <span style="${crit_style[c.criticality]||''};font-weight:bold">${c.criticality||'—'}</span>
      </div>`).join('')}
    </div>`;
  }

  if (pub.length) {
    html += `<div class="section-header">I. ОПУБЛИКОВАННЫЕ НОРМАТИВНО-ПРАВОВЫЕ АКТЫ</div>`;
    pub.forEach((c, i) => {
      const cs = crit_style[c.criticality] || '';
      const cmts = incComm ? getComments(c.id).filter(cm => cm.type !== 'ack') : [];
      html += `<div class="card">
        <div class="card-title">${i+1}. ${c.title}</div>
        <div class="meta-row">
          <span class="badge" style="${cs};padding:2pt 7pt;font-size:7.5pt;font-weight:bold">${c.criticality||'—'}</span>
          ${(c.departments||[]).map(d=>`<span class="badge badge-dept">${d}</span>`).join('')}
          <span class="badge badge-status">${c.status||'—'}</span>
        </div>
        <div class="field"><span class="field-label">Категория: </span>${c.category||'—'}</div>
        <div class="field"><span class="field-label">Нормативный акт: </span>${c.normAct||'—'}${c.sourceUrl ? ` <a href="${c.sourceUrl}" style="color:#C8102E;font-size:7.5pt">↗</a>` : ''}</div>
        <div class="field"><span class="field-label">Дата вступления: </span>${formatDate(c.effectiveDate)}</div>
        ${c.deadline ? `<div class="field"><span class="field-label">Срок адаптации: </span>${c.deadline}</div>` : ''}
        <div class="field"><span class="field-label">Суть: </span>${(c.summary||'—').replace(/\n/g,'<br>')}</div>
        ${c.impact ? `<div class="field"><span class="field-label">Влияние: </span>${c.impact.replace(/\n/g,'<br>')}</div>` : ''}
        ${c.mitigation ? `<div class="field"><span class="field-label">Что сделать: </span>${c.mitigation.replace(/\n/g,'<br>')}</div>` : ''}
        ${c.sanctions ? `<div class="field"><span class="field-label">Санкции: </span>${c.sanctions}</div>` : ''}
        ${cmts.length ? `<div class="comments-block">
          ${cmts.map(cm=>`<div class="comment-item">
            <b>${cm.author||'—'}</b> · ${cm.time||''}${cm.type==='issue'?' ⚠ Вопрос':''}
            ${cm.text ? `<br>${cm.text}` : ''}</div>`).join('')}
        </div>` : ''}
      </div>`;
    });
  }

  if (dft.length) {
    html += `<div class="section-header">II. ПРОЕКТНЫЕ НОРМАТИВНО-ПРАВОВЫЕ АКТЫ</div>`;
    dft.forEach((c, i) => {
      html += `<div class="card" style="border-left-color:#4a7fa5">
        <div class="card-title">${i+1}. ${c.title}</div>
        <div class="meta-row">
          <span class="badge" style="background:#E8F0F8;color:#2E6A9A;padding:2pt 7pt;font-size:7.5pt;font-weight:bold">
            Вероятность: ${c.probability||'—'}</span>
          ${(c.departments||[]).map(d=>`<span class="badge badge-dept">${d}</span>`).join('')}
        </div>
        <div class="field"><span class="field-label">Категория: </span>${c.category||'—'}</div>
        <div class="field"><span class="field-label">Нормативный акт: </span>${c.normAct||'—'}${c.sourceUrl ? ` <a href="${c.sourceUrl}" style="color:#C8102E;font-size:7.5pt">↗</a>` : ''}</div>
        <div class="field"><span class="field-label">Плановая дата: </span>${c.plannedDate||'—'}</div>
        <div class="field"><span class="field-label">Суть: </span>${(c.summary||'—').replace(/\n/g,'<br>')}</div>
        ${c.mitigation||c.practicalValue ? `<div class="field"><span class="field-label">Что сделать: </span>${(c.mitigation||c.practicalValue||'').replace(/\n/g,'<br>')}</div>` : ''}
      </div>`;
    });
  }

  html += `</body></html>`;
  printWin.document.write(html);
  printWin.document.close();
  printWin.focus();
  setTimeout(() => { printWin.print(); }, 600);
  showToast('Открыт диалог печати — выберите «Сохранить как PDF»', 'success');
}

// ── Старый текстовый экспорт (оставляем как запасной) ──
function exportReport() { openExportModal(); }

// ============================================================
// TOAST
// ============================================================
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  // Отменяем pending undo если был
  if (_deleteUndoTimer) { clearTimeout(_deleteUndoTimer); _deleteUndoTimer = null; }
  t.innerHTML = '';
  const span = document.createElement('span');
  span.textContent = msg;
  t.appendChild(span);
  t.className = 'toast show ' + type;
  setTimeout(() => t.classList.remove('show'), 3500);
}

function showToastUndo(msg, onUndo, onConfirm) {
  const t = document.getElementById('toast');
  if (_deleteUndoTimer) { clearTimeout(_deleteUndoTimer); _deleteUndoTimer = null; }

  t.innerHTML = '';
  const span = document.createElement('span');
  span.textContent = msg;
  const btn = document.createElement('button');
  btn.textContent = 'Отменить';
  btn.className = 'toast-undo-btn';
  btn.onclick = () => {
    clearTimeout(_deleteUndoTimer);
    _deleteUndoTimer = null;
    t.classList.remove('show');
    onUndo();
  };
  t.appendChild(span);
  t.appendChild(btn);
  t.className = 'toast show';

  _deleteUndoTimer = setTimeout(() => {
    t.classList.remove('show');
    _deleteUndoTimer = null;
    onConfirm();
  }, 5000);
}


// ============================================================
// ADMIN EDITOR
// ============================================================
function renderEditor() {
  if (!isAdmin()) return;
  const container = document.getElementById('editor-list');
  if (!container) return;

  // ВАЖНО: используем getAllChanges() (а не PUBLISHED_CHANGES/DRAFT_CHANGES напрямую),
  // т.к. там уже реализована корректная фильтрация переведённых записей
  // (флаги _promoted/_patchFor) — см. баг "счётчик Проектных НПА не уменьшается".
  //
  // ВАЖНО №2: базовые записи DRAFT_CHANGES из data.js НЕ имеют поля type вообще
  // (только extraChanges/AI-импорт его выставляют). Поэтому isDraft проверяется
  // ДВУМЯ способами — как и в editorCard()/openEditModal() — иначе записи из
  // data.js без явного type попадают в "Опубликованные" по ошибке.
  const allChanges = getAllChanges();
  const allPub = allChanges.filter(c => !isDraftRecord(c));
  const allDft = allChanges.filter(c => isDraftRecord(c));

  container.innerHTML = `
    <div class="editor-section">
      <div class="editor-section-title">Опубликованные НПА (${allPub.length})</div>
      ${allPub.map(c => editorCard(c)).join('')}
    </div>
    <div class="editor-section" style="margin-top:24px">
      <div class="editor-section-title">Проектные НПА (${allDft.length})</div>
      ${allDft.map(c => editorCard(c)).join('')}
    </div>`;

  // Обновляем бейдж предложений
  const newProps = (store.proposals||[]).filter(p => p.status === 'new').length;
  const badge = document.getElementById('proposals-badge');
  if (badge) badge.textContent = newProps > 0 ? newProps : '';
}

function editorCard(c) {
  const isExtra  = store.extraChanges.some(x => x.id === c.id);
  const isDraft  = isDraftRecord(c);
  const hasPatch = store.extraChanges.some(x => x._patchFor === c.id);

  return `<div class="editor-card" id="ecard-${c.id}">
    <div class="editor-card-header">
      
      <span class="editor-card-title">${c.title}</span>
      <div class="editor-card-actions">
        <button class="editor-btn-edit" onclick="openEditModal('${c.id}')">✎ Редактировать</button>
        ${isDraft ? `<button class="editor-btn-promote" onclick="promoteToPublished('${c.id}')">→ В опубликованные</button>` : ''}
        ${isExtra ? `<button class="editor-btn-delete" onclick="deleteChange('${c.id}')">✕ Удалить</button>` : ''}
        ${!isExtra && hasPatch ? `<button class="editor-btn-delete" onclick="deletePatch('${c.id}')">✕ Сбросить правки</button>` : ''}
      </div>
    </div>
    <div class="editor-card-meta">
      <span class="badge badge-dept">${(c.departments||[]).join(', ')}</span>
      ${c.criticality ? `<span class="badge badge-${critClass(c.criticality)}">${c.criticality}</span>` : ''}
      ${c.status ? `<span class="badge badge-status">${c.status}</span>` : ''}
    </div>
  </div>`;
}

function openEditModal(id) {
  const c = getAllChanges().find(x => x.id === id);
  if (!c) return;
  const isDraft = isDraftRecord(c);

  document.getElementById('edit-modal-overlay').classList.add('open');
  document.getElementById('edit-modal-content').innerHTML = `
    <div class="modal-cat">${isDraft ? 'Проектный НПА' : 'Опубликованный НПА'} · редактирование</div>
    <div class="modal-title" style="margin-bottom:20px">${c.title}</div>
    <form class="admin-form" onsubmit="saveEdit(event, '${id}')">
      <div class="form-group">
        <label>Заголовок</label>
        <input name="title" value="${(c.title||'').replace(/"/g,'&quot;')}" required placeholder="Краткий заголовок НПА…">
      </div>
      <div class="form-group">
        <label>Категория</label>
        <input name="category" value="${(c.category||'').replace(/"/g,'&quot;')}" required>
      </div>
      <div class="form-group">
        <label>Суть изменения</label>
        <textarea name="summary" rows="5" required>${c.summary||''}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Нормативный акт</label>
          <input name="norm_act" value="${(c.normAct||'').replace(/"/g,'&quot;')}">
        </div>
        <div class="form-group">
          <label>${isDraft ? 'Плановая дата' : 'Дата вступления'}</label>
          <input name="effective_date" type="date" value="${c.effectiveDate||''}">
        </div>
      </div>
      <div class="form-group">
        <label>Ссылка на источник <span style="font-weight:400;color:var(--text-3)">(необязательно)</span></label>
        <input name="source_url" type="url" value="${(c.sourceUrl||'').replace(/"/g,'&quot;')}" placeholder="https://…">
      </div>
      <div class="form-group">
        <label>Штрафные санкции</label>
        <input name="sanctions" value="${(c.sanctions||'').replace(/"/g,'&quot;')}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Критичность</label>
          <select name="criticality">
            ${['Высокая','Средняя','Низкая','Отсутствует'].map(v =>
              `<option value="${v}" ${c.criticality===v?'selected':''}>${v}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Статус</label>
          <select name="status">
            ${['Учесть в работе','Для информации','Выполнено','Мониторинг'].map(v =>
              `<option value="${v}" ${c.status===v?'selected':''}>${v}</option>`
            ).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Влияние на компанию</label>
        <textarea name="impact" rows="3">${c.impact||''}</textarea>
      </div>
      <div class="form-group">
        <label>Митигация риска</label>
        <textarea name="mitigation" rows="3">${c.mitigation||''}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Срок адаптации</label>
          <input name="deadline" value="${(c.deadline||'').replace(/"/g,'&quot;')}">
        </div>
        <div class="form-group">
          <label>Департаменты (через запятую)</label>
          <div class="dept-checkboxes">
            ${['ДУП','ФЭД','КД','ОД','ДЦТ','Все'].map(d =>
              `<label class="dept-check-label"><input type="checkbox" name="dept[]" value="${d}"
                ${(c.departments||[]).includes(d) ? 'checked' : ''}>
              <span>${d}</span></label>`
            ).join('')}
          </div>
        </div>
      </div>
      ${isDraft ? `<div class="form-group"><label>Вероятность принятия</label>
        <input name="probability" value="${(c.probability||'').replace(/"/g,'&quot;')}"></div>` : ''}
      <div class="form-actions">
        <button type="button" class="btn-secondary" onclick="closeEditModal()">Отмена</button>
        <button type="submit" class="btn-primary">Сохранить изменения</button>
      </div>
    </form>`;
}

async function saveEdit(e, id) {
  e.preventDefault();
  const fd  = new FormData(e.target);
  const idx = store.extraChanges.findIndex(x => x.id === id);

  const updated = {
    title:         fd.get('title') || undefined,
    category:      fd.get('category'),
    summary:       fd.get('summary'),
    normAct:       fd.get('norm_act'),
    sourceUrl:     fd.get('source_url') || undefined,
    effectiveDate: fd.get('effective_date'),
    sanctions:     fd.get('sanctions'),
    criticality:   fd.get('criticality'),
    status:        fd.get('status'),
    impact:        fd.get('impact'),
    mitigation:    fd.get('mitigation'),
    deadline:      fd.get('deadline'),
    departments:   fd.getAll('dept[]').filter(Boolean),
    probability:   fd.get('probability') || null,
    urgent:        fd.get('urgent') === 'on',
  };

  if (idx !== -1) {
    // Запись из extraChanges — редактируем напрямую
    store.extraChanges[idx] = { ...store.extraChanges[idx], ...updated };
  } else {
    // Запись из data.js — сохраняем патч в extraChanges с флагом patch
    const orig = getAllChanges().find(x => x.id === id);
    if (orig) {
      // Ищем существующий патч
      const patchIdx = store.extraChanges.findIndex(x => x._patchFor === id);
      const patch = { ...orig, ...updated, _patchFor: id };
      if (patchIdx !== -1) store.extraChanges[patchIdx] = patch;
      else store.extraChanges.push(patch);
    }
  }

  await saveToCloud();
  closeEditModal();
  renderEditor();
  renderPublished();
  renderDraft();
  renderDashboard();
  showToast('✓ Изменения сохранены', 'success');
}

async function deleteChange(id) {
  if (!confirm('Удалить эту запись? Действие нельзя отменить.')) return;
  store.extraChanges = store.extraChanges.filter(x => x.id !== id);
  await saveToCloud();
  renderEditor();
  renderPublished();
  renderDraft();
  renderDashboard();
  showToast('Запись удалена', 'success');
}

async function deletePatch(id) {
  if (!confirm('Сбросить все правки этой записи к исходному варианту?')) return;
  store.extraChanges = store.extraChanges.filter(x => x._patchFor !== id);
  await saveToCloud();
  renderEditor();
  renderPublished();
  renderDraft();
  renderDashboard();
  showToast('Правки сброшены', 'success');
}

function promoteToPublished(id) {
  const c = getAllChanges().find(x => x.id === id);
  if (!c) return;

  // Открываем модальное окно с формой перевода
  document.getElementById('promote-modal-overlay').classList.add('open');
  document.getElementById('promote-modal-content').innerHTML = `
    <div class="modal-cat">→ Перевод в опубликованные</div>
    <div class="modal-title" style="margin-bottom:6px">${c.title}</div>
    <p style="font-size:12px;color:var(--text-2);margin-bottom:20px">
      Заполните поля для опубликованного НПА. Данные из проектной карточки перенесены автоматически — проверьте и дополните.
    </p>
    <form class="admin-form" onsubmit="confirmPromote(event,'${id}')">
      <div class="form-group">
        <label>Заголовок</label>
        <input name="title" value="${(c.title||'').replace(/"/g,'&quot;')}" required>
      </div>
      <div class="form-group">
        <label>Категория</label>
        <input name="category" value="${(c.category||'').replace(/"/g,'&quot;')}" required>
      </div>
      <div class="form-group">
        <label>Суть изменения</label>
        <textarea name="summary" rows="4" required>${c.summary||''}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Нормативный акт</label>
          <input name="norm_act" value="${(c.normAct||'').replace(/"/g,'&quot;')}">
        </div>
        <div class="form-group">
          <label>Дата вступления в силу</label>
          <input name="effective_date" type="date" value="${c.plannedDate||c.effectiveDate||''}">
        </div>
      </div>
      <div class="form-group">
        <label>Штрафные санкции</label>
        <input name="sanctions" placeholder="Размер штрафов, иные санкции…" value="${(c.sanctions||'').replace(/"/g,'&quot;')}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Критичность</label>
          <select name="criticality">
            ${['Высокая','Средняя','Низкая','Отсутствует'].map(v=>
              `<option value="${v}" ${(c.criticality||'Средняя')===v?'selected':''}>${v}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Статус</label>
          <select name="status">
            ${['Учесть в работе','Для информации','Выполнено','Мониторинг'].map(v=>
              `<option value="${v}" ${(c.status||'Учесть в работе')===v?'selected':''}>${v}</option>`
            ).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Влияние на компанию</label>
        <textarea name="impact" rows="3">${c.practicalValue||c.impact||''}</textarea>
      </div>
      <div class="form-group">
        <label>Митигация риска / Рекомендуемые действия</label>
        <textarea name="mitigation" rows="3">${c.mitigation||''}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Срок адаптации</label>
          <input name="deadline" value="${(c.deadline||'').replace(/"/g,'&quot;')}">
        </div>
        <div class="form-group">
          <label>Департаменты (через запятую)</label>
          <div class="dept-checkboxes">
            ${['ДУП','ФЭД','КД','ОД','ДЦТ','Все'].map(d =>
              `<label class="dept-check-label"><input type="checkbox" name="dept[]" value="${d}"
                ${(c.departments||[]).map(x => x==='ДЛ'?'ОД':x).includes(d) ? 'checked' : ''}>
              <span>${d}</span></label>`
            ).join('')}
          </div>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-secondary" onclick="closePromoteModal()">Отмена</button>
        <button type="submit" class="btn-primary" style="background:var(--low)">→ Перевести в опубликованные</button>
      </div>
    </form>`;
}

function closePromoteModal() {
  document.getElementById('promote-modal-overlay').classList.remove('open');
}

async function confirmPromote(e, id) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const c  = getAllChanges().find(x => x.id === id);
  if (!c) return;

  const isExtra = store.extraChanges.some(x => x.id === id);

  const publishedEntry = {
    id:            'promoted-' + id + '-' + Date.now(),
    num:           c.num,
    type:          'published',
    _promotedFrom: id,
    title:         fd.get('title'),
    category:      fd.get('category'),
    summary:       fd.get('summary'),
    normAct:       fd.get('norm_act'),
    effectiveDate: fd.get('effective_date'),
    sanctions:     fd.get('sanctions'),
    criticality:   fd.get('criticality'),
    status:        fd.get('status'),
    impact:        fd.get('impact'),
    mitigation:    fd.get('mitigation'),
    deadline:      fd.get('deadline'),
    departments:   fd.getAll('dept[]').filter(Boolean),
  };

  store.extraChanges.push(publishedEntry);

  // Помечаем оригинальный проектный как переведённый
  if (isExtra) {
    const idx = store.extraChanges.findIndex(x => x.id === id);
    if (idx !== -1) store.extraChanges[idx]._promoted = true;
  } else {
    // Базовая запись из data.js — добавляем патч с флагом
    const existingPatch = store.extraChanges.find(x => x._patchFor === id);
    if (existingPatch) {
      existingPatch._promoted = true;
    } else {
      store.extraChanges.push({ ...c, _patchFor: id, _promoted: true });
    }
  }

  await saveToCloud();
  closePromoteModal();
  renderEditor();
  renderPublished();
  renderDraft();
  renderDashboard();
  showToast('✓ НПА переведён в опубликованные', 'success');
}

function closeEditModal() {
  document.getElementById('edit-modal-overlay').classList.remove('open');
}



// ============================================================
// ANALYTICS & RISK MATRIX (только для администраторов)
// ============================================================

function renderAnalytics() {
  if (!isAdmin()) return;

  const pub = getAllChanges().filter(c => !isDraftRecord(c));
  const dft = getAllChanges().filter(c => isDraftRecord(c));
  const all = getAllChanges();

  // ── Статистика ──
  const totalComments = Object.values(store.comments).flat().length;
  const totalAcks = Object.values(store.comments).flat().filter(c=>c.type==='ack').length;
  const totalIssues = Object.values(store.comments).flat().filter(c=>c.type==='issue').length;

  // % ознакомления по всем департаментам
  let totalRequired = 0, totalDone = 0;
  pub.forEach(c => {
    (c.departments||[]).filter(d=>d!=='Все').forEach(d => {
      totalRequired++;
      if (getAck(c.id)[d]) totalDone++;
    });
  });
  const ackPct = totalRequired ? Math.round(totalDone/totalRequired*100) : 0;

  // По критичности
  const critCount = {Высокая:0, Средняя:0, Низкая:0, Отсутствует:0};
  pub.forEach(c => { if (critCount[c.criticality]!==undefined) critCount[c.criticality]++; });

  // По департаментам
  const deptCount = {};
  DEPARTMENTS.forEach(d => { deptCount[d] = 0; });
  pub.forEach(c => (c.departments||[]).forEach(d => { if (deptCount[d]!==undefined) deptCount[d]++; }));

  // Ближайшие дедлайны
  const upcoming = pub
    .filter(c => c.effectiveDate)
    .map(c => ({ ...c, daysLeft: Math.ceil((new Date(c.effectiveDate)-new Date())/86400000) }))
    .filter(c => c.daysLeft >= 0)
    .sort((a,b) => a.daysLeft - b.daysLeft)
    .slice(0, 5);

  const container = document.getElementById('analytics-content');
  if (!container) return;

  container.innerHTML = `
    <!-- KPI ряд -->
    <div class="an-kpi-row">
      <div class="an-kpi">
        <div class="an-kpi-num">${pub.length}</div>
        <div class="an-kpi-label">Опубликованных НПА</div>
      </div>
      <div class="an-kpi">
        <div class="an-kpi-num">${dft.length}</div>
        <div class="an-kpi-label">Проектных НПА</div>
      </div>
      <div class="an-kpi an-kpi-accent">
        <div class="an-kpi-num">${ackPct}%</div>
        <div class="an-kpi-label">Общий % ознакомления</div>
      </div>
      <div class="an-kpi">
        <div class="an-kpi-num">${totalComments}</div>
        <div class="an-kpi-label">Комментариев</div>
      </div>
      <div class="an-kpi ${totalIssues>0?'an-kpi-warn':''}">
        <div class="an-kpi-num">${totalIssues}</div>
        <div class="an-kpi-label">Открытых вопросов</div>
      </div>
    </div>

    <div class="an-grid-2">
      <!-- Критичность -->
      <div class="card">
        <div class="card-header"><h3>По критичности</h3><span class="card-hint">опубликованные</span></div>
        <div class="an-bars">
          ${Object.entries(critCount).map(([k,v]) => {
            const pct = pub.length ? Math.round(v/pub.length*100) : 0;
            const cls = {Высокая:'high',Средняя:'medium',Низкая:'low',Отсутствует:'none'}[k]||'low';
            return `<div class="an-bar-row">
              <span class="an-bar-label">${k}</span>
              <div class="an-bar-track">
                <div class="an-bar-fill an-bar-${cls}" style="width:${pct}%"></div>
              </div>
              <span class="an-bar-val">${v}</span>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- По департаментам -->
      <div class="card">
        <div class="card-header"><h3>Нагрузка по департаментам</h3><span class="card-hint">кол-во НПА</span></div>
        <div class="an-bars">
          ${Object.entries(deptCount).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).map(([d,v]) => {
            const pct = pub.length ? Math.round(v/pub.length*100) : 0;
            const ackP = deptAckPct(d);
            return `<div class="an-bar-row">
              <span class="an-bar-label">${d}</span>
              <div class="an-bar-track">
                <div class="an-bar-fill an-bar-dept" style="width:${pct}%"></div>
              </div>
              <span class="an-bar-val">${v} НПА · ${ackP}% озн.</span>
            </div>`;
          }).join('') || '<div style="color:var(--text-3);font-size:13px">Нет данных</div>'}
        </div>
      </div>
    </div>

    <!-- Ознакомление по департаментам детально -->
    <div class="card">
      <div class="card-header"><h3>Детальный статус ознакомления</h3><span class="card-hint">по НПА и департаментам</span></div>
      <div class="an-ack-table-wrap">
        <table class="an-ack-table">
          <thead>
            <tr>
              <th>НПА</th>
              ${DEPARTMENTS.map(d=>`<th>${d}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${pub.map(c => `<tr>
              <td class="an-npa-cell" onclick="openChange('${c.id}')">${c.title.substring(0,55)}…</td>
              ${DEPARTMENTS.map(d => {
                const relevant = (c.departments||[]).some(cd=>cd===d||cd==='Все');
                if (!relevant) return '<td class="an-cell-na">—</td>';
                const acked = getAck(c.id)[d];
                return `<td class="an-cell-${acked?'ok':'pending'}">${acked?'✓':'○'}</td>`;
              }).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Ближайшие дедлайны -->
    <div class="card">
      <div class="card-header"><h3>Ближайшие дедлайны</h3><span class="card-hint">топ-5</span></div>
      <div class="an-deadlines">
        ${upcoming.length ? upcoming.map(c => {
          const cls = c.daysLeft<=30?'urgent':c.daysLeft<=90?'soon':'ok';
          return `<div class="an-deadline-item" onclick="openChange('${c.id}')">
            <div class="deadline-badge deadline-${cls}">${c.daysLeft} дн.</div>
            <div class="an-deadline-text">
              <div class="an-deadline-title">${c.title}</div>
              <div class="an-deadline-date">${formatDate(c.effectiveDate)} · ${(c.departments||[]).join(', ')}</div>
            </div>
          </div>`;
        }).join('') : '<div style="color:var(--text-3);font-size:13px">Нет предстоящих дедлайнов</div>'}
      </div>
    </div>`;
}

// ── Матрица рисков ──
function renderRiskMatrix() {
  if (!isAdmin()) return;

  // !c.type ложно захватывал и базовые DRAFT_CHANGES (у них тоже нет type) —
  // используем isDraftRecord() (см. HELPERS), как в renderEditor().
  const pub = getAllChanges().filter(c => !isDraftRecord(c));

  // Вероятность (на основе критичности) × Влияние (на основе критичности)
  const IMPACT = { 'Высокая': 3, 'Средняя': 2, 'Низкая': 1, 'Отсутствует': 0 };
  // Для матрицы используем критичность как вероятность и реальное влияние
  // По осям: Y = вероятность нарушения (критичность), X = скорость вступления (дни)
  const now = new Date();

  function getUrgency(c) {
    if (!c.effectiveDate) return 1;
    const days = Math.ceil((new Date(c.effectiveDate)-now)/86400000);
    if (days <= 0)  return 3; // уже вступил
    if (days <= 60) return 3; // срочно
    if (days <= 180) return 2; // скоро
    return 1; // не срочно
  }

  function getCritLevel(c) {
    return { 'Высокая':3, 'Средняя':2, 'Низкая':1, 'Отсутствует':0 }[c.criticality] || 0;
  }

  // Матрица 3×3: X=срочность, Y=критичность
  const matrix = [[],[],[],[]], // 0-none, 1-low, 2-med, 3-high cells
  cells = {};
  for (let y=1; y<=3; y++) for (let x=1; x<=3; x++) cells[`${x}-${y}`] = [];

  pub.forEach(c => {
    const x = getUrgency(c);
    const y = getCritLevel(c);
    if (y === 0) return; // без риска не показываем
    const key = `${x}-${y}`;
    if (cells[key]) cells[key].push(c);
  });

  const riskColor = (x,y) => {
    const score = x * y;
    if (score >= 7) return 'risk-critical';
    if (score >= 4) return 'risk-high';
    if (score >= 2) return 'risk-medium';
    return 'risk-low';
  };

  const yLabels = {3:'Высокая', 2:'Средняя', 1:'Низкая'};
  const xLabels = {1:'Не срочно', 2:'До 6 мес.', 3:'Срочно / в силе'};

  const container = document.getElementById('risk-matrix-content');
  if (!container) return;

  container.innerHTML = `
    <div class="risk-matrix-wrap">
      <div class="risk-axis-y-label">← Критичность риска</div>
      <div class="risk-matrix-inner">
        <div class="risk-matrix-grid">
          <!-- Y axis labels -->
          <div class="risk-y-labels">
            ${[3,2,1].map(y=>`<div class="risk-y-label">${yLabels[y]}</div>`).join('')}
          </div>
          <!-- Cells -->
          <div class="risk-cells">
            ${[3,2,1].map(y =>
              [1,2,3].map(x => {
                const items = cells[`${x}-${y}`] || [];
                const rc = riskColor(x,y);
                return `<div class="risk-cell ${rc}">
                  ${items.length ? items.map(c=>
                    `<div class="risk-item" onclick="openChange('${c.id}')" title="${c.title}">
                      <span class="risk-item-num" style="font-size:9px;font-weight:600;letter-spacing:0">${c.title.substring(0,12)}…</span>
                      <span class="risk-item-title">${c.title.substring(0,40)}${c.title.length>40?'…':''}</span>
                    </div>`
                  ).join('') : `<div class="risk-cell-empty"></div>`}
                </div>`;
              }).join('')
            ).join('')}
          </div>
        </div>
        <!-- X axis labels -->
        <div class="risk-x-labels">
          <div></div>
          ${[1,2,3].map(x=>`<div class="risk-x-label">${xLabels[x]}</div>`).join('')}
        </div>
        <div class="risk-axis-x-label">Срочность →</div>
      </div>
    </div>

    <!-- Легенда -->
    <div class="risk-legend">
      <div class="risk-legend-item"><div class="risk-legend-dot risk-critical"></div>Критический риск</div>
      <div class="risk-legend-item"><div class="risk-legend-dot risk-high"></div>Высокий риск</div>
      <div class="risk-legend-item"><div class="risk-legend-dot risk-medium"></div>Средний риск</div>
      <div class="risk-legend-item"><div class="risk-legend-dot risk-low"></div>Низкий риск</div>
    </div>

    <!-- НПА без матрицы (нет критичности) -->
    ${pub.filter(c=>c.criticality==='Отсутствует'||!c.criticality).length ?
      `<div style="margin-top:16px;font-size:12px;color:var(--text-3)">
        ⬡ НПА без риска (не отображаются на матрице): ${pub.filter(c=>!getCritLevel(c)).map(c=>c.title.substring(0,30)).join(', ')}
      </div>` : ''}`;
}

function setAdminTab(tab) {
  document.querySelectorAll('.admin-tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
  document.querySelectorAll('.admin-tab-panel').forEach(p =>
    p.style.display = p.dataset.panel === tab ? 'block' : 'none'
  );
  if (tab === 'analytics')    renderAnalytics();
  if (tab === 'risk-matrix')  renderRiskMatrix();
  if (tab === 'editor')       renderEditor();
  if (tab === 'proposals')    renderProposals();
}
// ============================================================
// PROPOSALS (предложения от пользователей)
// ============================================================
function openProposalModal() {
  if (!currentUser) { showToast('Выберите роль для отправки предложения', 'error'); return; }
  document.getElementById('proposal-modal-overlay').classList.add('open');
}
function closeProposalModal() {
  document.getElementById('proposal-modal-overlay').classList.remove('open');
}

async function submitProposal(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = 'Отправка…';

  if (!store.proposals) store.proposals = [];
  store.proposals.push({
    id:        'prop-' + Date.now(),
    author:    currentUser,
    email:     currentEmail,
    category:  fd.get('category'),
    title:     fd.get('title'),
    summary:   fd.get('summary'),
    normAct:   fd.get('norm_act'),
    source:    fd.get('source'),
    time:      new Date().toLocaleDateString('ru-RU') + ' ' +
               new Date().toLocaleTimeString('ru-RU', {hour:'2-digit',minute:'2-digit'}),
    status:    'new'   // new | reviewed | rejected
  });

  await saveToCloud();
  closeProposalModal();
  e.target.reset();
  btn.disabled = false; btn.textContent = 'Отправить предложение';
  showToast('✓ Предложение отправлено администратору', 'success');
}

// Рендер раздела предложений (только для администратора)
function renderProposals() {
  const container = document.getElementById('proposals-list');
  if (!container) return;
  const props = store.proposals || [];
  if (!props.length) {
    container.innerHTML = '<div class="empty-state"><div class="icon">◈</div><p>Предложений пока нет</p></div>';
    return;
  }
  // Обновляем бейдж вкладки
  const badge = document.getElementById('proposals-badge');
  const newCount = props.filter(p=>p.status==='new').length;
  if (badge) badge.textContent = newCount > 0 ? newCount : '';

  container.innerHTML = [...props].reverse().map(p => `
    <div class="proposal-card ${p.status === 'new' ? 'proposal-new' : ''}">
      <div class="proposal-header">
        <div>
          <div class="proposal-title">${esc(p.title)}</div>
          <div class="proposal-meta">${esc(p.author)} · ${esc(p.email||'')} · ${esc(p.time)}</div>
        </div>
        <div class="proposal-actions">
          ${p.status === 'new' ? `
            <button class="editor-btn-edit" onclick="acceptProposal('${p.id}')">✓ Принять</button>
            <button class="editor-btn-delete" onclick="rejectProposal('${p.id}')">✕ Отклонить</button>
          ` : `<span class="badge badge-${p.status === 'reviewed' ? 'ack' : 'high'}">${
            p.status === 'reviewed' ? 'Принято' : 'Отклонено'
          }</span>`}
        </div>
      </div>
      <div class="proposal-body">
        <div class="field"><span class="field-lbl">Категория:</span> ${esc(p.category)}</div>
        <div class="field"><span class="field-lbl">Суть:</span> ${esc(p.summary)}</div>
        ${p.normAct ? `<div class="field"><span class="field-lbl">Нормативный акт:</span> ${esc(p.normAct)}</div>` : ''}
        ${p.source  ? `<div class="field"><span class="field-lbl">Источник:</span> ${esc(p.source)}</div>` : ''}
      </div>
    </div>`).join('');
}

async function acceptProposal(id) {
  const p = (store.proposals||[]).find(x => x.id === id);
  if (!p) return;
  p.status = 'reviewed';
  // Автоматически создаём запись в extraChanges для рассмотрения
  store.extraChanges.push({
    id:           'from-prop-' + Date.now(),
    num:          getAllChanges().length + 1,
    type:         'published',
    category:     p.category,
    title:        p.title,
    summary:      p.summary,
    normAct:      p.normAct || '—',
    departments:  [p.author],
    status:       'Мониторинг',
    criticality:  'Средняя',
    effectiveDate: '',
    _fromProposal: id
  });
  await saveToCloud();
  renderProposals();
  renderPublished();
  showToast('✓ Предложение принято и добавлено в черновик', 'success');
}

async function rejectProposal(id) {
  const p = (store.proposals||[]).find(x => x.id === id);
  if (p) { p.status = 'rejected'; await saveToCloud(); renderProposals(); }
  showToast('Предложение отклонено', '');
}

// ============================================================
// EMAIL NOTIFICATIONS (EmailJS)
// Инструкция по настройке — в README.md
// ============================================================
const EMAILJS_SERVICE_ID  = 'service_u7mo4k9';
const EMAILJS_TEMPLATE_ID = 'template_zmp7g7t';
const EMAILJS_PUBLIC_KEY  = 'TEl016U64K4jHvw9z';

const EMAILJS_CONFIGURED = EMAILJS_SERVICE_ID !== 'service_u7mo4k9';

// Инициализация SDK
function initEmailJS() {
  if (!EMAILJS_CONFIGURED) return;
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
  s.onload = () => emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
  document.head.appendChild(s);
}

function sendEmailNotification(entry) {
  if (!EMAILJS_CONFIGURED) {
    console.warn('EmailJS не настроен — см. README.md');
    showToast('⚠ Email не настроен — см. README', 'error');
    return;
  }
  if (typeof emailjs === 'undefined') {
    setTimeout(() => sendEmailNotification(entry), 1000);
    return;
  }
  _doSendEmail(entry);
}

function _doSendEmail(entry) {
  // Собираем получателей по департаментам из таблицы USERS
  const recipients = Object.entries(USERS).filter(([, u]) =>
    (entry.departments || []).includes(u.dept) ||
    (entry.departments || []).includes('Все')
  ).map(([email, u]) => ({ email, name: u.name }));

  if (!recipients.length) {
    showToast('Нет получателей для выбранных департаментов', 'error');
    return;
  }

  const siteUrl   = window.location.origin + window.location.pathname;
  const critColor = { 'Высокая':'#C8102E', 'Средняя':'#B36800', 'Низкая':'#1A8A4A', 'Отсутствует':'#2E6A9A' };
  const depts     = (entry.departments || []).join(', ');
  const dateStr   = entry.effectiveDate ? formatDate(entry.effectiveDate) : (entry.plannedDate || '—');

  let sent = 0;
  recipients.forEach(r => {
    emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email:      r.email,
      to_name:       r.name,
      from_name:     currentName || 'Юридический департамент Marshall',
      title:         entry.title,
      category:      entry.category || '—',
      criticality:   entry.criticality || '—',
      crit_color:    critColor[entry.criticality] || '#3D5A78',
      summary:       entry.summary || '—',
      impact:        entry.impact || '—',
      mitigation:    entry.mitigation || '—',
      effective:     dateStr,
      sanctions:     entry.sanctions || '—',
      dept:          depts,
      status:        entry.status || '—',
      is_urgent:     entry.urgent ? 'СРОЧНО' : '',
      site_url:      siteUrl,
      reply_to:      currentEmail
    }).then(() => {
      sent++;
      if (sent === recipients.length) {
        showToast(`✓ Уведомления отправлены (${sent} получателей)`, 'success');
      }
    }).catch(e => {
      console.warn('EmailJS error:', e);
      showToast('Ошибка отправки email: ' + (e.text || e.message || 'неизвестная ошибка'), 'error');
    });
  });
}

// ============================================================
// ONBOARDING TOUR
// ============================================================
const TOUR_STEPS = [
  {
    title: 'Добро пожаловать в Compliance Monitor',
    text: 'Эта система помогает вам быть в курсе всех изменений в законодательстве, которые касаются вашей работы. Ничего лишнего — только то, что важно для вас лично.',
    target: null,
    position: 'center',
    icon: '⚖'
  },
  {
    title: 'Обзор — ваш главный экран',
    text: 'Здесь сразу видно самое важное: актуальные законы которые требуют вашего внимания, последние изменения и комментарии коллег.',
    target: '[data-view="dashboard"]',
    position: 'right',
    icon: '◈'
  },
  {
    title: 'Опубликованные НПА',
    text: 'Законы и нормативные акты, которые уже вступили в силу или скоро вступят. Каждый документ сопровождается объяснением — как он влияет на вашу работу и что нужно сделать.',
    target: '[data-view="published"]',
    position: 'right',
    icon: '◉',
    action: () => setView('published')
  },
  {
    title: 'Как ознакомиться с изменением',
    text: 'Нажмите на карточку НПА → прочитайте → нажмите «✓ Ознакомлен(а)». Система фиксирует это автоматически. Если есть вопрос — выберите «⚠ Вопрос» и юрист ответит прямо здесь.',
    target: '#list-published',
    position: 'top',
    icon: '✓',
    action: () => setView('published')
  },
  {
    title: 'Красный баннер — не игнорируйте',
    text: 'Если при входе появляется красная полоска сверху — есть важные изменения которые вы ещё не прочитали. Нажмите на неё и система покажет что именно нужно изучить.',
    target: '#ack-banner',
    position: 'bottom',
    icon: '⚠'
  },
  {
    title: 'Проектные НПА',
    text: 'Законопроекты на стадии обсуждения. Юристы уже отслеживают их и оценивают вероятность принятия — чтобы вы могли подготовиться заранее.',
    target: '[data-view="draft"]',
    position: 'right',
    icon: '◎',
    action: () => setView('draft')
  },
  {
    title: 'Календарь — события по датам',
    text: 'Раздел «Календарь» показывает все НПА по месяцам: когда что вступает в силу, дедлайны адаптации и плановые даты законопроектов. Удобно планировать заранее.',
    target: '[data-view="calendar"]',
    position: 'right',
    icon: '⊟',
    action: () => setView('calendar')
  },
  {
    title: 'Поиск — быстро найти нужное',
    text: 'Начните вводить слово в строку поиска — сразу появятся результаты из всех разделов. Нажмите на результат и сразу попадёте в нужную карточку.',
    target: '#search-input',
    position: 'bottom',
    icon: '⌕'
  },
  {
    title: 'Фильтры — показать только своё',
    text: 'Выберите свой департамент слева — и увидите только те изменения, которые касаются вас. Если случайно поставили фильтры и не можете найти НПА — нажмите красную кнопку «Сбросить фильтры».',
    target: '.dept-filters',
    position: 'right',
    icon: '⊟',
    action: () => setView('published')
  },
  {
    title: 'Уведомления',
    text: 'Колокольчик 🔔 в шапке сигнализирует о новых комментариях к НПА и приближающихся дедлайнах. Красная точка — есть непрочитанные уведомления.',
    target: '#bell-wrapper',
    position: 'bottom',
    icon: '🔔'
  },
  {
    title: 'Комментарии — диалог с юристом',
    text: 'В разделе «Комментарии» два раздела: обсуждения и вопросы — и список ознакомлений по каждому НПА. Задайте вопрос под любым документом — юрист ответит прямо в системе.',
    target: '[data-view="comments"]',
    position: 'right',
    icon: '💬',
    action: () => setView('comments')
  },
  {
    title: 'Предложить изменение',
    text: 'Заметили важное изменение в законодательстве, которого нет в системе? Нажмите «✉ Предложить изменение» — юрист рассмотрит вашу находку.',
    target: '#btn-propose',
    position: 'top',
    icon: '✉',
    action: () => setView('dashboard')
  },
  {
    title: 'Всё готово!',
    text: 'Теперь вы знаете как пользоваться системой. Главное правило: заходите раз в неделю, читайте новые изменения и нажимайте «Ознакомлен». Это занимает 5–10 минут, но защищает вас и компанию от рисков.',
    target: null,
    position: 'center',
    icon: '🎯'
  }
];

let tourStep = 0;
let tourActive = false;

function startTour() {
  tourStep = 0;
  tourActive = true;
  setView('dashboard');
  document.getElementById('tour-overlay').style.display = 'block';
  renderTourStep();
}

function endTour() {
  tourActive = false;
  document.getElementById('tour-overlay').style.display = 'none';
  document.getElementById('tour-popup').style.cssText = '';
  clearTourHighlight();
  localStorage.setItem('compliance_tour_done', '1');
  // Убираем кнопку "?" с подсветкой
  const btn = document.getElementById('tour-btn');
  if (btn) btn.classList.remove('tour-btn-pulse');
}

function tourNext() {
  tourStep++;
  if (tourStep >= TOUR_STEPS.length) { endTour(); return; }
  renderTourStep();
}

function tourPrev() {
  if (tourStep > 0) { tourStep--; renderTourStep(); }
}

function renderTourStep() {
  const step = TOUR_STEPS[tourStep];
  if (!step) { endTour(); return; }

  // Выполняем action если есть
  if (step.action) step.action();

  clearTourHighlight();

  // Подсвечиваем целевой элемент
  let targetEl = null;
  if (step.target) {
    targetEl = document.querySelector(step.target);
    if (targetEl) targetEl.classList.add('tour-highlight');
  }

  const popup = document.getElementById('tour-popup');
  const total = TOUR_STEPS.length;
  const isFirst = tourStep === 0;
  const isLast  = tourStep === total - 1;

  popup.innerHTML = `
    <div class="tour-icon">${step.icon}</div>
    <div class="tour-progress">
      ${Array.from({length: total}, (_,i) =>
        `<div class="tour-dot ${i === tourStep ? 'active' : i < tourStep ? 'done' : ''}"></div>`
      ).join('')}
    </div>
    <div class="tour-step-label">Шаг ${tourStep + 1} из ${total}</div>
    <h3 class="tour-title">${step.title}</h3>
    <p class="tour-text">${step.text}</p>
    <div class="tour-actions">
      <button class="tour-skip" onclick="endTour()">Пропустить</button>
      <div style="display:flex;gap:8px">
        ${!isFirst ? `<button class="tour-prev" onclick="tourPrev()">← Назад</button>` : ''}
        <button class="tour-next" onclick="tourNext()">
          ${isLast ? '🎯 Начать работу' : 'Далее →'}
        </button>
      </div>
    </div>`;

  // Позиционируем popup
  positionTourPopup(popup, targetEl, step.position);
}

function positionTourPopup(popup, targetEl, position) {
  popup.style.cssText = '';
  popup.style.display = 'block';

  if (!targetEl || position === 'center') {
    popup.style.position = 'fixed';
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    return;
  }

  const rect = targetEl.getBoundingClientRect();
  const pw = popup.offsetWidth || 320;
  const ph = popup.offsetHeight || 260;
  const margin = 16;

  popup.style.position = 'fixed';
  popup.style.transform = 'none';

  if (position === 'right') {
    popup.style.left = Math.min(rect.right + margin, window.innerWidth - pw - margin) + 'px';
    popup.style.top  = Math.max(margin, Math.min(rect.top, window.innerHeight - ph - margin)) + 'px';
  } else if (position === 'bottom') {
    popup.style.top  = (rect.bottom + margin) + 'px';
    popup.style.left = Math.max(margin, Math.min(rect.left, window.innerWidth - pw - margin)) + 'px';
  } else if (position === 'top') {
    popup.style.top  = Math.max(margin, rect.top - ph - margin) + 'px';
    popup.style.left = Math.max(margin, Math.min(rect.left, window.innerWidth - pw - margin)) + 'px';
  } else {
    popup.style.top  = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
  }
}

function clearTourHighlight() {
  document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
}

// Показываем кнопку тура после входа и проверяем первый визит
function initTourButton() {
  const done = localStorage.getItem('compliance_tour_done');
  const btn = document.getElementById('tour-btn');
  if (btn) {
    if (!done) btn.classList.add('tour-btn-pulse');
  }
  if (!done && !isAdmin()) {
    // Первый вход — показываем приветственное окно с небольшой задержкой
    setTimeout(() => {
      if (!tourActive) showWelcomeModal();
    }, 1200);
  }
}

function showWelcomeModal() {
  const overlay = document.getElementById('welcome-modal-overlay');
  if (overlay) overlay.classList.add('open');
}

function closeWelcomeModal(startTourNow) {
  const overlay = document.getElementById('welcome-modal-overlay');
  if (overlay) overlay.classList.remove('open');
  localStorage.setItem('compliance_tour_done', 'welcomed');
  const btn = document.getElementById('tour-btn');
  if (btn) btn.classList.add('tour-btn-pulse');
  if (startTourNow) setTimeout(startTour, 300);
}

function showLoginHelp() {
  document.getElementById('login-help-modal').classList.add('open');
}
function closeLoginHelp() {
  document.getElementById('login-help-modal').classList.remove('open');
}


// ============================================================
// AI JSON IMPORT — ручная вставка карточек НПА
// ============================================================
// Без интеграции с внешним AI API: пользователь вставляет готовый JSON
// (сформированный вручную или скопированный из любого ИИ-чата) в текстовое
// поле, код его парсит и показывает предпросмотр перед публикацией.


// ── Загрузить вставленный JSON ──
function loadJsonFromClaude() {
  const raw = document.getElementById('ai-json-input').value.trim();
  if (!raw) { showToast('Вставьте JSON от Claude', 'error'); return; }

  try {
    // Чистим от markdown если есть
    const clean = raw.replace(/```json|```/g, '').trim();
    const items = JSON.parse(clean);

    if (!Array.isArray(items) || !items.length) {
      showToast('JSON должен быть массивом объектов', 'error');
      return;
    }

    document.getElementById('ai-status').textContent = `Найдено изменений: ${items.length}`;
    renderAiResults(items);
    document.getElementById('ai-btn-publish').style.display = 'block';
    showToast(`✓ Загружено ${items.length} записей`, 'success');
  } catch(e) {
    showToast('Ошибка разбора JSON: ' + e.message, 'error');
  }
}

// ── Открыть AI-панель ──
function openAiPanel() {
  document.getElementById('ai-panel-overlay').classList.add('open');
  const ji = document.getElementById('ai-json-input');
  if (ji) ji.value = '';
  document.getElementById('ai-results').innerHTML = '';
  document.getElementById('ai-btn-publish').style.display = 'none';
  document.getElementById('ai-status').textContent = '';
}

function closeAiPanel() {
  document.getElementById('ai-panel-overlay').classList.remove('open');
}



// ── Рендер результатов ──
let aiParsedItems = [];

function renderAiResults(items) {
  aiParsedItems = items;
  const container = document.getElementById('ai-results');

  container.innerHTML = items.map((c, i) => {
    const cc = critClass(c.criticality || '');
    return `<div class="ai-result-card" id="ai-card-${i}">
      <div class="ai-card-header">
        <label class="ai-card-check">
          <input type="checkbox" id="ai-check-${i}" checked>
          
        </label>
        <div class="ai-card-info">
          <div class="ai-card-cat">${c.category || '—'}</div>
          <div class="ai-card-title">${c.title || '—'}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <span class="badge badge-${cc}">${c.criticality||'—'}</span>
          <span class="badge badge-status">${c.type==='draft'?'Проект':'Опубликован'}</span>
          <button class="cmt-action-btn" onclick="toggleAiEdit(${i})">✎ Правка</button>
        </div>
      </div>
      <div class="ai-card-preview">
        <div class="ai-field"><span class="ai-field-lbl">Суть:</span> ${c.summary||'—'}</div>
        <div class="ai-field"><span class="ai-field-lbl">Нормативный акт:</span> ${c.normAct||'—'}</div>
        <div class="ai-field"><span class="ai-field-lbl">Дата:</span> ${c.effectiveDate||c.plannedDate||'—'}</div>
        <div class="ai-field"><span class="ai-field-lbl">Департаменты:</span> ${(c.departments||[]).join(', ')||'—'}</div>
        ${c.impact ? `<div class="ai-field"><span class="ai-field-lbl">Влияние:</span> ${c.impact}</div>` : ''}
        ${c.regulationUrl ? `<div class="ai-field"><span class="ai-field-lbl">Ссылка:</span> <a href="${c.regulationUrl}" target="_blank" style="color:var(--accent)">${c.regulationUrl}</a></div>` : ''}
      </div>
      <div class="ai-card-edit" id="ai-edit-${i}" style="display:none">
        <div class="form-row">
          <div class="form-group">
            <label>Тип</label>
            <select onchange="aiParsedItems[${i}].type=this.value">
              <option value="published" ${c.type==='published'?'selected':''}>Опубликованный</option>
              <option value="draft" ${c.type==='draft'?'selected':''}>Проектный</option>
            </select>
          </div>
          <div class="form-group">
            <label>Критичность</label>
            <select onchange="aiParsedItems[${i}].criticality=this.value">
              ${['Высокая','Средняя','Низкая','Отсутствует'].map(v=>
                `<option ${c.criticality===v?'selected':''}>${v}</option>`
              ).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Категория</label>
          <input value="${(c.category||'').replace(/"/g,'&quot;')}" oninput="aiParsedItems[${i}].category=this.value">
        </div>
        <div class="form-group">
          <label>Название</label>
          <input value="${(c.title||'').replace(/"/g,'&quot;')}" oninput="aiParsedItems[${i}].title=this.value">
        </div>
        <div class="form-group">
          <label>Суть изменения</label>
          <textarea rows="3" oninput="aiParsedItems[${i}].summary=this.value">${c.summary||''}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Нормативный акт</label>
            <input value="${(c.normAct||'').replace(/"/g,'&quot;')}" oninput="aiParsedItems[${i}].normAct=this.value">
          </div>
          <div class="form-group">
            <label>Дата вступления</label>
            <input type="date" value="${c.effectiveDate||''}" oninput="aiParsedItems[${i}].effectiveDate=this.value">
          </div>
        </div>
        <div class="form-group">
          <label>Влияние на компанию</label>
          <textarea rows="2" oninput="aiParsedItems[${i}].impact=this.value">${c.impact||''}</textarea>
        </div>
        <div class="form-group">
          <label>Митигация риска</label>
          <textarea rows="2" oninput="aiParsedItems[${i}].mitigation=this.value">${c.mitigation||''}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Штрафные санкции</label>
            <input value="${(c.sanctions||'').replace(/"/g,'&quot;')}" oninput="aiParsedItems[${i}].sanctions=this.value">
          </div>
          <div class="form-group">
            <label>Срок адаптации</label>
            <input value="${(c.deadline||'').replace(/"/g,'&quot;')}" oninput="aiParsedItems[${i}].deadline=this.value">
          </div>
        </div>
        <div class="form-group">
          <label>Департаменты (через запятую)</label>
          <input value="${(c.departments||[]).join(', ')}"
            oninput="aiParsedItems[${i}].departments=this.value.split(',').map(d=>d.trim()).filter(Boolean)">
        </div>
        <div class="form-group">
          <label>Ссылка на regulation.gov.ru</label>
          <input value="${(c.regulationUrl||'').replace(/"/g,'&quot;')}" oninput="aiParsedItems[${i}].regulationUrl=this.value">
        </div>
      </div>
    </div>`;
  }).join('');
}

function toggleAiEdit(i) {
  const el = document.getElementById('ai-edit-' + i);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// ── Публикация выбранных ──
async function publishAiResults() {
  const selected = aiParsedItems.filter((_, i) => {
    const cb = document.getElementById('ai-check-' + i);
    return cb && cb.checked;
  });

  if (!selected.length) { showToast('Выберите хотя бы одну запись', 'error'); return; }

  const btn = document.getElementById('ai-btn-publish');
  btn.disabled    = true;
  btn.textContent = 'Сохранение…';

  const notify = document.getElementById('ai-notify-check')?.checked;

  selected.forEach(c => {
    const id  = (c.type||'published') + '-ai-' + Date.now() + '-' + Math.random().toString(36).slice(2,6);
    const entry = {
      id,
      num:           getAllChanges().length + 1,
      type:          c.type || 'published',
      category:      c.category || '—',
      title:         c.title || c.category,
      summary:       c.summary || '—',
      normAct:       c.normAct || '—',
      effectiveDate: c.effectiveDate || '',
      sanctions:     c.sanctions || '—',
      criticality:   c.criticality || 'Низкая',
      impact:        c.impact || '—',
      mitigation:    c.mitigation || '—',
      deadline:      c.deadline || '—',
      departments:   c.departments || [],
      status:        c.status || 'Учесть в работе',
      probability:   c.probability || null,
      plannedDate:   c.plannedDate || c.effectiveDate || null,
      regulationUrl: c.regulationUrl || '',
      _aiGenerated:  true
    };
    store.extraChanges.push(entry);
    if (notify) sendEmailNotification(entry);
  });

  await saveToCloud();
  closeAiPanel();
  buildDeptFilters();
  renderPublished();
  renderDraft();
  renderDashboard();
  showToast(`✓ Опубликовано ${selected.length} записей${notify?' + уведомления':''}`, 'success');

  btn.disabled    = false;
  btn.textContent = '✓ Опубликовать выбранные';
}





// ============================================================
// COMPLIANCE CALENDAR
// ============================================================

// Парсит даты в форматах: "2026-09-01", "01.09.2026", "До 01.09.2026", "До 15.06.2027 (подача)"
function parseFlexDate(str) {
  if (!str || str === '—' || str === '-') return null;
  // Ищем паттерн ДД.ММ.ГГГГ внутри любой строки
  const m = str.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}`);
  // ISO-формат YYYY-MM-DD
  const iso = new Date(str);
  if (!isNaN(iso)) return iso;
  return null;
}

function renderCalendar() {
  const container = document.getElementById('calendar-container');
  if (!container) return;

  const year = new Date().getFullYear();
  const months = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const nowMonth = new Date().getMonth();
  const nowYear  = new Date().getFullYear();

  // Собираем все НПА с датами
  const all = getAllChanges();
  const events = []; // { date, title, id, type, criticality }

  all.forEach(c => {
    const isDraft = isDraftRecord(c);

    // Ролевой фильтр (кто смотрит)
    const roleOk = isAdmin()
      || currentUser === 'Руководство'
      || (c.departments || []).some(d => d === currentUser || d === 'Все');
    if (!roleOk) return;

    // Фильтр сайдбара по департаменту
    const deptOk = activeDept === 'all'
      || (c.departments || []).some(d => d === activeDept || d === 'Все');
    if (!deptOk) return;

    // Фильтр сайдбара по критичности
    const critOk = activeCrit === 'all' || c.criticality === activeCrit;
    if (!critOk) return;

    // Опубликованные — дата вступления в силу
    if (!isDraft && c.effectiveDate && c.effectiveDate !== '—') {
      const d = parseFlexDate(c.effectiveDate);
      if (d) events.push({ date: d, title: c.title, id: c.id, kind: 'published', criticality: c.criticality });
    }

    // Проектные — плановая дата
    if (isDraft && c.plannedDate && c.plannedDate !== '—') {
      const d = parseFlexDate(c.plannedDate);
      if (d) events.push({ date: d, title: c.title, id: c.id, kind: 'draft', criticality: c.criticality });
    }

    // Дедлайн адаптации (у опубликованных) — не добавляем если совпадает с датой вступления
    if (!isDraft && c.deadline && c.deadline !== '—') {
      const d = parseFlexDate(c.deadline);
      const effD = parseFlexDate(c.effectiveDate);
      const isDuplicate = d && effD && d.getTime() === effD.getTime();
      if (d && !isDuplicate) events.push({ date: d, title: c.title, id: c.id, kind: 'deadline', criticality: c.criticality });
    }
  });

  // Группируем по году-месяцу
  function eventsForMonth(y, m) {
    return events.filter(e => e.date.getFullYear() === y && e.date.getMonth() === m)
                 .sort((a, b) => a.date - b.date);
  }

  function kindLabel(kind) {
    return { published:'Опубликованный', draft:'Проектный', deadline:'Дедлайн адаптации' }[kind] || kind;
  }
  function kindClass(kind) {
    return { published:'cal-kind-pub', draft:'cal-kind-draft', deadline:'cal-kind-ddl' }[kind] || '';
  }
  function critClass2(crit) {
    return { 'Высокая':'cal-crit-high','Средняя':'cal-crit-med','Низкая':'cal-crit-low' }[crit] || 'cal-crit-low';
  }
  function dotClass(ev) {
    if (ev.kind === 'draft')    return 'cal-dot-draft';
    if (ev.kind === 'deadline') return 'cal-dot-ddl';
    return { 'Высокая':'cal-dot-high','Средняя':'cal-dot-med','Низкая':'cal-dot-low','Отсутствует':'cal-dot-low' }[ev.criticality] || 'cal-dot-low';
  }
  function fmtDay(d) {
    return d.toLocaleDateString('ru-RU', { day:'numeric', month:'short' });
  }

  let html = `<div class="cal-header">
    <div class="cal-title-row">
      <span class="cal-year-label">${year}</span>
      <div class="cal-legend">
        <span class="cal-leg-item"><span class="cal-leg-dot cal-dot-high"></span>Высокая</span>
        <span class="cal-leg-item"><span class="cal-leg-dot cal-dot-med"></span>Средняя</span>
        <span class="cal-leg-item"><span class="cal-leg-dot cal-dot-low"></span>Низкая</span>
        <span class="cal-leg-item"><span class="cal-leg-dot cal-dot-draft"></span>Проектный</span>
        <span class="cal-leg-item"><span class="cal-leg-dot cal-dot-ddl"></span>Дедлайн адаптации</span>
      </div>
    </div>
  </div>
  <div class="cal-grid">`;

  for (let m = 0; m < 12; m++) {
    const evs = eventsForMonth(year, m);
    const isCurrent = (m === nowMonth && year === nowYear);

    html += `<div class="cal-month${isCurrent ? ' cal-month-current' : ''}">
      <div class="cal-month-head">
        <span class="cal-month-name">${months[m]}${isCurrent ? ' <span class="cal-now-badge">сейчас</span>' : ''}</span>
        <span class="cal-month-count">${evs.length}</span>
      </div>
      <div class="cal-month-body">`;

    if (evs.length === 0) {
      html += `<div class="cal-empty">Нет событий</div>`;
    } else {
      evs.forEach(ev => {
        html += `<div class="cal-item" onclick="openChange('${ev.id}')">
          <span class="cal-item-dot ${dotClass(ev)}"></span>
          <div class="cal-item-inner">
            <div class="cal-item-title">${ev.title}</div>
            <div class="cal-item-meta">
              <span class="cal-item-date">${fmtDay(ev.date)}</span>
              <span class="cal-item-badge ${kindClass(ev.kind)}">${kindLabel(ev.kind)}</span>
              ${ev.criticality && ev.kind !== 'deadline' && ev.kind !== 'draft'
                ? `<span class="cal-item-badge ${critClass2(ev.criticality)}">${ev.criticality}</span>`
                : ''}
            </div>
          </div>
        </div>`;
      });
    }

    html += `</div></div>`;
  }

  html += `</div>`;
  container.innerHTML = html;
}

// ============================================================
// REMINDERS — напоминания о дедлайнах
// ============================================================

const REMINDER_THRESHOLDS = [7, 30]; // дней до дедлайна

function initReminders() {
  checkDeadlineReminders();
  // Проверяем каждые 6 часов
  setInterval(checkDeadlineReminders, 6 * 60 * 60 * 1000);
}

function checkDeadlineReminders() {
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const shownKey = 'compliance_reminders_' + todayKey;
  const shown = JSON.parse(localStorage.getItem(shownKey) || '[]');

  // !c.type ложно захватывал и базовые DRAFT_CHANGES — используем isDraftRecord().
  // На практике безвредно (у проектных нет effectiveDate, их отсеивал бы следующий
  // фильтр), но исправлено для согласованности с остальным кодом.
  const pub = getAllChanges().filter(c => !isDraftRecord(c));
  const reminders = [];

  pub.forEach(c => {
    if (!c.effectiveDate) return;
    const d = new Date(c.effectiveDate);
    const daysLeft = Math.ceil((d - now) / 86400000);

    REMINDER_THRESHOLDS.forEach(threshold => {
      const key = `${c.id}-${threshold}`;
      if (daysLeft <= threshold && daysLeft >= 0 && !shown.includes(key)) {
        reminders.push({ c, daysLeft, key, threshold });
      }
    });
  });

  if (!reminders.length) return;

  // Сохраняем показанные
  const newShown = [...shown, ...reminders.map(r => r.key)];
  localStorage.setItem(shownKey, JSON.stringify(newShown));

  // Добавляем в колокольчик
  addBellNotifications(reminders);

  // Браузерные push-уведомления
  requestNotificationPermission(() => {
    reminders.forEach(r => {
      sendBrowserNotification(
        r.daysLeft <= 7
          ? `⚡ Срочно: ${r.daysLeft} дн. до вступления в силу`
          : `⏱ Напоминание: ${r.daysLeft} дн. до вступления в силу`,
        r.c.title,
        r.c.id
      );
    });
  });
}

// ── Браузерные уведомления ──
function requestNotificationPermission(callback) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') { callback(); return; }
  if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(p => { if (p === 'granted') callback(); });
  }
}

function sendBrowserNotification(title, body, changeId) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const n = new Notification(title, {
    body,
    icon: '',  // можно добавить URL иконки
    tag: changeId,
    requireInteraction: false
  });
  n.onclick = () => {
    window.focus();
    openChange(changeId);
    n.close();
  };
  setTimeout(() => n.close(), 8000);
}

// ── Колокольчик внутри приложения ──
// ============================================================
// FIRESTORE NOTIFICATIONS
// ============================================================

// Ключ для хранения уведомлений — email без точек (Firestore не любит точки в id)
function notifDocId(email) {
  return email.replace(/[.@]/g, '_');
}

async function loadNotificationsFromFirestore() {
  if (!CONFIGURED || !db || !currentEmail) return;
  try {
    const snap = await db.collection('notifications').doc(notifDocId(currentEmail))
      .collection('items').limit(20).get();
    snap.forEach(doc => {
      const n = doc.data();
      // Не дублируем уже существующие
      if (!bellNotifications.find(x => x.id === doc.id)) {
        bellNotifications.push({
          id:       doc.id,
          title:    n.title || '',
          text:     n.text  || '',
          changeId: n.changeId || '',
          urgent:   n.urgent || false,
          kind:     n.kind   || 'deadline',
          time:     n.time   || '',
          read:     n.read   || false
        });
      }
    });
    // Сортируем — сначала по непрочитанным, потом по дате
    bellNotifications.sort((a, b) => {
      if (a.read !== b.read) return a.read ? 1 : -1;
      if (a.createdAt && b.createdAt) return b.createdAt.localeCompare(a.createdAt);
      return 0;
    });
    updateBellBadge();
    renderBellPanel();
  } catch(e) {
    console.warn('Notifications load error:', e);
  }
}

async function saveNotificationToFirestore(recipientEmail, notif) {
  if (!CONFIGURED || !db) return;
  try {
    await db.collection('notifications').doc(notifDocId(recipientEmail))
      .collection('items').doc(notif.id).set({
        ...notif,
        createdAt: new Date().toISOString()
      });
  } catch(e) {
    console.warn('Notification save error:', e);
  }
}

async function markNotifReadInFirestore(notifId) {
  if (!CONFIGURED || !db || !currentEmail) return;
  try {
    await db.collection('notifications').doc(notifDocId(currentEmail))
      .collection('items').doc(notifId).update({ read: true });
  } catch(e) { /* тихо */ }
}

// Определяем кому отправить уведомление о комментарии
function getNotifRecipients(changeId, senderEmail) {
  const c = getAllChanges().find(x => x.id === changeId);
  const recipients = new Set();

  if (isAdmin()) {
    // Юрист ответил — уведомляем автора исходного комментария (если есть)
    const cmts = store.comments[changeId] || [];
    cmts.forEach(cm => {
      if (cm.email && cm.email.toLowerCase() !== senderEmail.toLowerCase()) {
        recipients.add(cm.email.toLowerCase());
      }
    });
  } else {
    // Пользователь написал — уведомляем всех юристов
    ADMIN_EMAILS.forEach(e => recipients.add(e.toLowerCase()));
  }

  // Убираем отправителя
  recipients.delete(senderEmail.toLowerCase());
  return [...recipients];
}

let bellNotifications = [];

function addBellNotifications(reminders) {
  reminders.forEach(r => {
    bellNotifications.unshift({
      id: r.key,
      title: r.c.title,
      text: `До вступления в силу: ${r.daysLeft} дн. (${formatDate(r.c.effectiveDate)})`,
      changeId: r.c.id,
      urgent: r.daysLeft <= 7,
      time: new Date().toLocaleTimeString('ru-RU', {hour:'2-digit',minute:'2-digit'}),
      read: false
    });
  });
  // Максимум 20 уведомлений
  bellNotifications = bellNotifications.slice(0, 20);
  updateBellBadge();
  renderBellPanel();
}

function updateBellBadge() {
  const unread = bellNotifications.filter(n => !n.read).length;
  const badge = document.getElementById('bell-badge');
  if (badge) {
    const wasHidden = badge.style.display === 'none' || badge.style.display === '';
    badge.textContent = unread || '';
    if (unread) {
      badge.style.display = 'flex';
      if (wasHidden) {
        badge.classList.remove('badge-appeared');
        void badge.offsetWidth;
        badge.classList.add('badge-appeared');
        badge.addEventListener('animationend', () => badge.classList.remove('badge-appeared'), { once: true });
      }
    } else {
      badge.style.display = 'none';
    }
  }
}

function toggleBellPanel() {
  const panel = document.getElementById('bell-panel');
  if (!panel) return;
  const isOpen = panel.classList.toggle('open');
  if (isOpen) {
    renderBellPanel();
    // Отмечаем все как прочитанные через 2 сек
    setTimeout(() => {
      bellNotifications.forEach(n => {
        if (!n.read) {
          n.read = true;
          if (n.kind === 'comment') markNotifReadInFirestore(n.id);
        }
      });
      updateBellBadge();
    }, 2000);
  }
}

function closeBellPanel() {
  const panel = document.getElementById('bell-panel');
  if (panel) panel.classList.remove('open');
}

function renderBellPanel() {
  const list = document.getElementById('bell-list');
  if (!list) return;

  if (!bellNotifications.length) {
    list.innerHTML = `<div class="bell-empty">
      <div style="font-size:28px;margin-bottom:8px">🔔</div>
      <div>Нет новых уведомлений</div>
      <div style="font-size:11px;margin-top:4px;color:var(--text-3)">Здесь появятся напоминания о дедлайнах и новых комментариях</div>
    </div>`;
    return;
  }

  list.innerHTML = bellNotifications.map(n => {
    let icon;
    if (n.kind === 'comment') icon = n.urgent ? '⚠' : '💬';
    else icon = n.urgent ? '⚡' : '⏱';
    return `
    <div class="bell-item ${n.read ? '' : 'bell-unread'} ${n.urgent ? 'bell-urgent' : ''}"
         onclick="openChange('${n.changeId}');closeBellPanel()">
      <div class="bell-item-icon">${icon}</div>
      <div class="bell-item-body">
        <div class="bell-item-title">${esc(n.title)}</div>
        <div class="bell-item-text">${esc(n.text)}</div>
        <div class="bell-item-time">${esc(n.time)}</div>
      </div>
    </div>`;
  }).join('');
}

function clearBellNotifications() {
  bellNotifications = [];
  updateBellBadge();
  renderBellPanel();
}

// Инициализируем после входа
function initRemindersAfterLogin() {
  // Небольшая задержка чтобы данные загрузились
  setTimeout(initReminders, 2000);
}
// ============================================================
// THEME TOGGLE
// ============================================================
function initTheme() {
  const saved = localStorage.getItem('compliance_theme') || 'dark';
  applyTheme(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('compliance_theme', theme);
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = theme === 'light' ? '☾' : '☀';
}

// Применяем тему сразу при загрузке (до DOMContentLoaded чтобы не мигало)
(function() {
  const saved = localStorage.getItem('compliance_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
})();
