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
let searchQuery  = '';
let searchComments = false; // поиск по комментариям

let store = { comments: {}, acknowledgements: {}, extraChanges: [] };
let db    = null;
let auth  = null;

const CONFIGURED = FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY';

// ============================================================
// MARSHALL BRAND ASSETS (SVG)
// ============================================================
const LOGO_ICON_B64 = 'data:image/png;base64,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';
const LOGO_FULL_B64 = 'data:image/png;base64,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';
// Для обратной совместимости
const LOGO_ICON_SVG = `<img src="${LOGO_ICON_B64}" style="width:38px;height:38px;border-radius:4px;display:block">`;
const LOGO_FULL_SVG = `<img src="${LOGO_FULL_B64}" style="height:48px;width:auto;display:block">`;



// ============================================================
// ПОЛЬЗОВАТЕЛИ — email → имя, департамент, роль
// Добавляйте новых сотрудников сюда
// ============================================================
const USERS = {
  'lev.minin@marshall.parts':           { name: 'Лев Минин',             dept: 'Юрист',  role: 'admin' },
  'dinara.gumbatova@marshall.parts':    { name: 'Динара Гумбатова',      dept: 'Юрист',  role: 'admin' },
  'margarita.kaplina@marshall.parts':   { name: 'Маргарита Каплина',     dept: 'Юрист',  role: 'admin' },
  // ── Сотрудники — добавляйте по образцу ──
  // 'ivan.ivanov@marshall.parts':      { name: 'Иван Иванов',           dept: 'ФЭД',    role: 'user'  },
  // 'anna.petrova@marshall.parts':     { name: 'Анна Петрова',          dept: 'КД',     role: 'user'  },
  // 'oleg.sidorov@marshall.parts':     { name: 'Олег Сидоров',          dept: 'ДУП',    role: 'user'  },
  // 'maria.kozlova@marshall.parts':    { name: 'Мария Козлова',         dept: 'ДМ',     role: 'user'  },
  // 'dmitry.novikov@marshall.parts':   { name: 'Дмитрий Новиков',       dept: 'ОД',     role: 'user'  },
  // 'elena.smirnova@marshall.parts':   { name: 'Елена Смирнова',        dept: 'ДЦТ',    role: 'user'  },
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
      updatedAt:        firebase.firestore.FieldValue.serverTimestamp()
    });
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

  // Показываем баннер обязательного ознакомления
  setTimeout(showAckBanner, 800);
}

function showAckBanner() {
  if (!currentUser) return;
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
  return { comments: {}, acknowledgements: {}, extraChanges: [] };
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
    'admin-editor': '⚙ Редактор НПА'
  };
  document.getElementById('page-title').textContent = titles[view] || '';
  if (view === 'comments')      renderAllComments();
  if (view === 'admin-editor')  renderEditor();
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
  const allDepts = [...new Set([...DEPARTMENTS, ...fromData])].filter(d => d !== 'Все').sort();
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
}

function filterCrit(crit) {
  activeCrit = crit;
  document.querySelectorAll('.crit-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.crit === crit);
  });
  renderPublished(); renderDraft(); renderDashboard();
}

function filterSearch(q) {
  searchQuery = q.toLowerCase();
  renderPublished(); renderDraft();
  if (searchComments) renderAllComments();
}

function toggleSearchComments(el) {
  searchComments = el.checked;
  renderPublished(); renderDraft();
  if (currentView === 'comments') renderAllComments();
}

function filterAck(val) {
  activeAck = val;
  document.querySelectorAll('.ack-filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.ack === val);
  });
  renderPublished();
}

function applyFilters(changes) {
  return changes.filter(c => {
    const deptOk = activeDept === 'all' || c.departments.some(d => d === activeDept || d === 'Все');
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

    return deptOk && critOk && ackOk && searchOk;
  });
}

// ============================================================
// HELPERS
// ============================================================
function getAllChanges() {
  // Применяем патчи к базовым записям из data.js
  const patches = {};
  store.extraChanges.forEach(x => { if (x._patchFor) patches[x._patchFor] = x; });

  const base = [...PUBLISHED_CHANGES, ...DRAFT_CHANGES].map(c =>
    patches[c.id] ? { ...c, ...patches[c.id] } : c
  );
  const extras = store.extraChanges.filter(x => !x._patchFor);
  return [...base, ...extras];
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
function renderDashboard() {
  document.getElementById('stat-total').textContent  = getAllChanges().length;
  document.getElementById('stat-high').textContent   = PUBLISHED_CHANGES.filter(c => c.criticality === 'Высокая').length;
  document.getElementById('stat-medium').textContent = PUBLISHED_CHANGES.filter(c => c.criticality === 'Средняя').length;

  const depts = ['ДУП','ФЭД','КД','ДЛ'];
  let pending = 0;
  PUBLISHED_CHANGES.forEach(c => {
    c.departments.forEach(d => { if (d !== 'Все' && !getAck(c.id)[d]) pending++; });
  });
  document.getElementById('stat-pending').textContent   = pending;
  document.getElementById('badge-comments').textContent = Object.values(store.comments).flat().length;

  const urgent = PUBLISHED_CHANGES
    .filter(c => c.effectiveDate && c.effectiveDate !== '—')
    .sort((a,b) => new Date(a.effectiveDate) - new Date(b.effectiveDate))
    .slice(0, 5);
  document.getElementById('urgent-list').innerHTML = urgent.map(c => `
    <div class="urgent-item" onclick="openChange('${c.id}')">
      <span class="urgent-date">${formatDate(c.effectiveDate)}</span>
      <span class="urgent-text">${c.title}</span>
      <span class="urgent-dept">${c.departments[0]}</span>
    </div>`).join('') || '<div class="empty-state"><p>Нет срочных изменений</p></div>';

  document.getElementById('ack-summary').innerHTML = depts.map(d => {
    const pct = deptAckPct(d);
    return `<div class="ack-dept-row">
      <span class="ack-dept-name">${d}</span>
      <div class="ack-bar-track"><div class="ack-bar-fill" style="width:${pct}%"></div></div>
      <span class="ack-pct">${pct}%</span>
    </div>`;
  }).join('');

  document.getElementById('digest-grid').innerHTML =
    [...PUBLISHED_CHANGES, ...DRAFT_CHANGES].slice(0,6).map(c => {
      const cc = critClass(c.criticality || '');
      return `<div class="digest-card" onclick="openChange('${c.id}')">
        <div class="digest-cat">${c.category}</div>
        <div class="digest-title">${c.title}</div>
        <div class="digest-meta">
          ${c.criticality ? `<span class="badge badge-${cc}">${c.criticality}</span>` : ''}
          ${c.probability ? `<span class="badge badge-prob">${c.probability}</span>`  : ''}
          <span class="badge badge-dept">${c.departments[0]}</span>
        </div>
      </div>`;
    }).join('');
}

// ============================================================
// LISTS
// ============================================================
function renderPublished() {
  const changes = applyFilters([...PUBLISHED_CHANGES, ...store.extraChanges.filter(c => c.type === 'published')]);
  document.getElementById('badge-published').textContent = changes.length;
  document.getElementById('list-published').innerHTML = changes.length
    ? changes.map(c => changeCard(c, false)).join('')
    : `<div class="empty-state"><div class="icon">◈</div><p>Нет изменений по выбранным фильтрам</p></div>`;
}

function renderDraft() {
  const changes = applyFilters([...DRAFT_CHANGES, ...store.extraChanges.filter(c => c.type === 'draft')]);
  document.getElementById('badge-draft').textContent = changes.length;
  document.getElementById('list-draft').innerHTML = changes.length
    ? changes.map(c => changeCard(c, true)).join('')
    : `<div class="empty-state"><div class="icon">◎</div><p>Нет проектных изменений</p></div>`;
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
  const depts = (c.departments || []).map(d => `<span class="badge badge-dept">${d}</span>`).join('');
  const urgent = c.urgent ? '<span class="badge-urgent">🔴 СРОЧНО</span>' : '';
  const ddl   = !isDraft ? deadlineIndicator(c.effectiveDate) : '';

  return `<div class="change-card${acked ? ' acknowledged' : ''}${c.urgent ? ' urgent-card' : ''}" onclick="openChange('${c.id}')">
    <div class="change-top">
      <span class="change-number">#${c.num || '—'}</span>
      <div class="change-title-group">
        <div class="change-category">${c.category}</div>
        <div class="change-title">${urgent}${c.title}</div>
      </div>
      <div class="change-badges">
        ${c.criticality ? `<span class="badge badge-${cc}">${c.criticality}</span>` : ''}
        ${c.probability ? `<span class="badge badge-prob">${c.probability}</span>`  : ''}
        ${c.status      ? `<span class="badge badge-status">${c.status}</span>`     : ''}
        ${acked         ? `<span class="badge badge-ack">✓ Ознакомлен</span>`       : ''}
      </div>
    </div>
    <div class="change-summary">${c.summary}</div>
    <div class="change-bottom">
      ${depts}
      ${!isDraft && c.effectiveDate ? `<span class="change-date">Вступает: ${formatDate(c.effectiveDate)}</span>` : ''}
      ${isDraft && c.plannedDate ? `<span class="change-date">Планируется: ${c.plannedDate}</span>` : ''}
      ${ddl}
      ${cnt > 0 ? `<span class="change-comments-count">💬 ${cnt}</span>` : ''}
    </div>
  </div>`;
}

// ============================================================
// MODAL
// ============================================================
function openChange(id) {
  const c = getAllChanges().find(x => x.id === id);
  if (!c) return;
  const isDraft = DRAFT_CHANGES.some(x => x.id === id) || c.type === 'draft';
  const cc      = critClass(c.criticality || '');
  const acked   = currentUser && isAcknowledgedByUser(c.id, currentUser);

  let html = `
    <div class="modal-cat">${isDraft ? '⬡ Проектный НПА' : '◉ Опубликованный НПА'} · ${c.category}</div>
    <div class="modal-title">${c.title}</div>
    <div class="modal-badges">
      ${c.criticality ? `<span class="badge badge-${cc}">${c.criticality}</span>`             : ''}
      ${c.probability ? `<span class="badge badge-prob">Вероятность: ${c.probability}</span>` : ''}
      ${c.status      ? `<span class="badge badge-status">${c.status}</span>`                 : ''}
      ${acked         ? `<span class="badge badge-ack">✓ Ознакомлен</span>`                   : ''}
      ${(c.departments||[]).map(d=>`<span class="badge badge-dept">${d}</span>`).join('')}
    </div>
    <div class="modal-section">
      <div class="modal-section-label">Суть изменения</div>
      <div class="modal-section-text">${c.summary.replace(/\\n/g,'<br>')}</div>
    </div>
    <div class="modal-grid">
      <div class="modal-field">
        <label>Нормативный акт</label>
        <span>${c.normAct || '—'}</span>
      </div>
      <div class="modal-field">
        <label>${isDraft ? 'Плановая дата' : 'Дата вступления в силу'}</label>
        <span>${isDraft ? (c.plannedDate||'—') : formatDate(c.effectiveDate)}</span>
      </div>
      ${isDraft ? `<div class="modal-field"><label>Стадия</label><span>${c.discussionDate||'—'}</span></div>` : ''}
      ${c.deadline ? `<div class="modal-field"><label>Срок адаптации</label><span>${c.deadline}</span></div>` : ''}
    </div>`;

  if (!isDraft && c.sanctions) html += `
    <div class="modal-section">
      <div class="modal-section-label">Штрафные санкции</div>
      <div class="modal-section-text">${c.sanctions}</div>
    </div>`;
  if (c.impact) html += `
    <div class="modal-section">
      <div class="modal-section-label">Влияние на компанию</div>
      <div class="modal-section-text">${c.impact.replace(/\\n/g,'<br>')}</div>
    </div>`;
  if (c.mitigation || c.practicalValue) html += `
    <div class="modal-section">
      <div class="modal-section-label">${isDraft ? 'Практическое значение' : 'Митигация риска'}</div>
      <div class="modal-section-text">${(c.mitigation||c.practicalValue||'').replace(/\\n/g,'<br>')}</div>
    </div>`;

  html += `<div class="modal-divider"></div>${renderCommentsSection(id)}`;
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

// ============================================================
// COMMENTS
// ============================================================
function renderCommentsSection(id) {
  const comments = getComments(id);
  const userNote = currentUser
    ? `Вы вошли как: <strong>${currentUser}</strong> (${currentEmail})`
    : '<span style="color:var(--high)">Роль не определена</span>';

  const commentsHtml = comments.length
    ? comments.map(cm => `
      <div class="comment-item type-${cm.type}">
        <div class="comment-meta">
          <span class="comment-author">${cm.author}</span>
          <span class="comment-time">${cm.time}</span>
          <span class="comment-type-badge ${cm.type}">${
            cm.type === 'ack' ? '✓ Ознакомлен' : cm.type === 'issue' ? '⚠ Вопрос' : '💬 Комментарий'
          }</span>
        </div>
        ${cm.email ? `<div style="font-size:11px;color:var(--text-3);margin-bottom:4px">${cm.email}</div>` : ''}
        ${cm.text  ? `<div class="comment-text">${cm.text}</div>` : ''}
      </div>`).join('')
    : '<div style="color:var(--text-3);font-size:13px;padding:8px 0">Комментариев пока нет</div>';

  return `<div class="comments-section">
    <h4>Комментарии и ознакомления (${comments.length})</h4>
    ${commentsHtml}
    <div class="comment-form">
      <div class="comment-user-note">${userNote}</div>
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
  // onSnapshot обновит модал автоматически если Firebase подключён
  if (!CONFIGURED) { openChange(id); updateBadges(); renderDashboard(); renderPublished(); renderDraft(); }
}

// ============================================================
// ALL COMMENTS VIEW
// ============================================================
function renderAllComments() {
  const container = document.getElementById('all-comments-list');
  const all = [];
  Object.entries(store.comments).forEach(([id, cmts]) => {
    const c = getAllChanges().find(x => x.id === id);
    cmts.forEach(cm => all.push({ ...cm, id, changeTitle: c ? c.title : id }));
  });

  if (!all.length) {
    container.innerHTML = `<div class="empty-state"><div class="icon">◷</div><p>Комментариев пока нет</p></div>`;
    return;
  }
  container.innerHTML = [...all].reverse().map(cm => `
    <div class="all-comment-item type-${cm.type}" onclick="openChange('${cm.id}')">
      <div class="all-comment-link">→ ${cm.changeTitle}</div>
      <div class="comment-meta">
        <span class="comment-author">${cm.author}</span>
        <span class="comment-time">${cm.time}</span>
        <span class="comment-type-badge ${cm.type}">${
          cm.type === 'ack' ? '✓ Ознакомлен' : cm.type === 'issue' ? '⚠ Вопрос' : '💬 Комментарий'
        }</span>
      </div>
      ${cm.email ? `<div style="font-size:11px;color:var(--text-3);margin:2px 0 4px">${cm.email}</div>` : ''}
      ${cm.text  ? `<div class="comment-text">${cm.text}</div>` : ''}
    </div>`).join('');
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
    title:         fd.get('category').split('/')[0].trim() + ': ' + fd.get('summary').substring(0,60) + '…',
    summary:       fd.get('summary'),
    normAct:       fd.get('norm_act'),
    effectiveDate: fd.get('effective_date'),
    sanctions:     fd.get('sanctions'),
    criticality:   fd.get('criticality'),
    impact:        fd.get('impact'),
    mitigation:    fd.get('mitigation'),
    deadline:      fd.get('deadline'),
    departments:   fd.get('departments').split(',').map(d => d.trim()).filter(Boolean),
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

function _doExportExcel() {
  const wb = XLSX.utils.book_new();

  // Лист 1 — Опубликованные
  const pub = getAllChanges().filter(c => !c.type || c.type === 'published');
  const pubRows = [
    ['№','Категория','Суть изменения','Нормативный акт','Дата вступления',
     'Штрафные санкции','Критичность','Влияние на компанию','Митигация риска',
     'Срок адаптации','Департамент','Статус']
  ];
  pub.forEach(c => pubRows.push([
    c.num, c.category, c.summary, c.normAct||'—',
    formatDate(c.effectiveDate), c.sanctions||'—', c.criticality||'—',
    c.impact||'—', c.mitigation||'—', c.deadline||'—',
    (c.departments||[]).join(', '), c.status||'—'
  ]));
  const ws1 = XLSX.utils.aoa_to_sheet(pubRows);
  ws1['!cols'] = [4,22,55,35,14,28,12,38,35,16,14,16].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, ws1, 'I. Q1 2026 ОПУБЛИКОВАННЫЕ');

  // Лист 2 — Проектные
  const dft = getAllChanges().filter(c => c.type === 'draft' || DRAFT_CHANGES.some(d=>d.id===c.id));
  const dftRows = [
    ['Категория','Суть изменения','Нормативный акт','Дата обсуждения',
     'Вероятность','Дата вступления (план.)','Практическое значение','Департамент','Комментарии']
  ];
  dft.forEach(c => dftRows.push([
    c.category, c.summary, c.normAct||'—', c.discussionDate||'—',
    c.probability||'—', c.plannedDate||'—',
    c.practicalValue||c.mitigation||'—',
    (c.departments||[]).join(', '), c.comments||'—'
  ]));
  const ws2 = XLSX.utils.aoa_to_sheet(dftRows);
  ws2['!cols'] = [22,55,35,22,12,22,40,14,30].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, ws2, 'II. ПРОЕКТНЫЕ');

  // Лист 3 — Комментарии
  const cmtRows = [['НПА','Автор','Email','Тип','Комментарий','Дата']];
  Object.entries(store.comments).forEach(([id, cmts]) => {
    const c = getAllChanges().find(x=>x.id===id);
    cmts.forEach(cm => cmtRows.push([
      c ? c.title : id, cm.author, cm.email||'—',
      cm.type==='ack'?'Ознакомлен':cm.type==='issue'?'Вопрос':'Комментарий',
      cm.text||'', cm.time
    ]));
  });
  const ws3 = XLSX.utils.aoa_to_sheet(cmtRows);
  ws3['!cols'] = [40,12,24,14,40,18].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, ws3, 'Комментарии');

  XLSX.writeFile(wb, `Compliance_${QUARTER.replace(' ','_')}.xlsx`);
  showToast('Excel скачан', 'success');
}

// ── Word (HTML→.doc trick) ──
function exportWord() {
  closeExportModal();
  const pub = getAllChanges().filter(c => !c.type || c.type === 'published');
  const dft = getAllChanges().filter(c => c.type === 'draft' || DRAFT_CHANGES.some(d=>d.id===c.id));
  const date = new Date().toLocaleDateString('ru-RU');

  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:w="urn:schemas-microsoft-com:office:word"
    xmlns="http://www.w3.org/TR/REC-html40">
  <head><meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; font-size: 10pt; color: #0D1E34; }
    h1 { font-size: 20pt; color: #C8102E; text-align: center; }
    h2 { font-size: 13pt; color: #0D1E34; border-bottom: 2pt solid #C8102E; padding-bottom: 4pt; }
    h3 { font-size: 11pt; color: #0D1E34; margin-bottom: 4pt; }
    .meta { background: #F0F4F8; padding: 6pt; margin-bottom: 8pt; font-size: 9pt; }
    .meta b { color: #C8102E; }
    .field { margin: 3pt 0 3pt 12pt; font-size: 9pt; }
    .field b { color: #C8102E; }
    .sep { border-top: 1pt solid #C8D8E8; margin: 10pt 0; }
    .crit-low    { color: #1A8A4A; font-weight: bold; }
    .crit-med    { color: #B36800; font-weight: bold; }
    .crit-high   { color: #C8102E; font-weight: bold; }
    .crit-none   { color: #2E6A9A; font-weight: bold; }
    .subtitle { text-align: center; font-size: 12pt; color: #3D5A78; }
    .center { text-align: center; }
  </style></head><body>
  <div style="text-align:center;margin-bottom:12pt">
    <img src="data:image/png;base64,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" style="height:44pt;width:auto">
  </div>
  <p class="subtitle"><b>МОНИТОРИНГ ИЗМЕНЕНИЙ ЗАКОНОДАТЕЛЬСТВА</b></p>
  <p class="subtitle">${QUARTER} &nbsp;·&nbsp; Дата формирования: ${date}</p>
  <br>
  <h2>I. Опубликованные нормативно-правовые акты</h2>`;

  pub.forEach(c => {
    const cc = c.criticality==='Высокая'?'high':c.criticality==='Средняя'?'med':c.criticality==='Низкая'?'low':'none';
    html += `<h3>#${c.num} ${c.title}</h3>
    <div class="meta">
      <b>Категория:</b> ${c.category} &nbsp;|&nbsp;
      <b>Критичность:</b> <span class="crit-${cc}">${c.criticality||'—'}</span> &nbsp;|&nbsp;
      <b>Департамент:</b> ${(c.departments||[]).join(', ')} &nbsp;|&nbsp;
      <b>Статус:</b> ${c.status||'—'}
    </div>
    <div class="field"><b>Нормативный акт:</b> ${c.normAct||'—'}</div>
    <div class="field"><b>Дата вступления в силу:</b> ${formatDate(c.effectiveDate)}</div>
    <div class="field"><b>Штрафные санкции:</b> ${c.sanctions||'—'}</div>
    <div class="field"><b>Суть изменения:</b> ${c.summary}</div>
    <div class="field"><b>Влияние на компанию:</b> ${c.impact||'—'}</div>
    <div class="field"><b>Митигация риска:</b> ${c.mitigation||'—'}</div>
    <div class="field"><b>Срок адаптации:</b> ${c.deadline||'—'}</div>`;
    const cmts = getComments(c.id);
    if (cmts.length) {
      html += `<div class="field"><b>Комментарии (${cmts.length}):</b></div>`;
      cmts.forEach(cm => html += `<div class="field" style="margin-left:24pt">
        [${cm.author}${cm.email?' / '+cm.email:''}] ${cm.time}: ${cm.text||'(Ознакомлен)'}</div>`);
    }
    html += `<div class="sep"></div>`;
  });

  html += `<br><h2>II. Проектные нормативно-правовые акты</h2>`;
  dft.forEach(c => {
    html += `<h3>${c.title}</h3>
    <div class="meta">
      <b>Категория:</b> ${c.category} &nbsp;|&nbsp;
      <b>Вероятность:</b> ${c.probability||'—'} &nbsp;|&nbsp;
      <b>Департамент:</b> ${(c.departments||[]).join(', ')}
    </div>
    <div class="field"><b>Нормативный акт:</b> ${c.normAct||'—'}</div>
    <div class="field"><b>Стадия:</b> ${c.discussionDate||'—'}</div>
    <div class="field"><b>Плановая дата:</b> ${c.plannedDate||'—'}</div>
    <div class="field"><b>Суть изменения:</b> ${c.summary}</div>
    <div class="field"><b>Практическое значение:</b> ${c.practicalValue||c.mitigation||'—'}</div>
    <div class="sep"></div>`;
  });

  html += `</body></html>`;
  const blob = new Blob([html], {type:'application/msword'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `Compliance_${QUARTER.replace(' ','_')}.doc`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Word-документ скачан', 'success');
}

// ── PDF ──
function exportPDF() {
  closeExportModal();
  const printWin = window.open('', '_blank', 'width=900,height=700');
  const pub = getAllChanges().filter(c => !c.type || c.type === 'published');
  const dft = getAllChanges().filter(c => c.type === 'draft' || DRAFT_CHANGES.some(d=>d.id===c.id));
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
      <img src="data:image/png;base64,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" style="height:52pt;width:auto">
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

  pub.forEach(c => {
    const cs = crit_style[c.criticality] || '';
    const cmts = getComments(c.id);
    html += `<div class="card">
      <div class="card-title">
        <span class="card-num">#${c.num}</span>${c.title}
      </div>
      <div class="meta-row">
        <span class="badge" style="${cs}; padding:2pt 7pt; font-size:7.5pt; font-weight:bold">${c.criticality||'—'}</span>
        ${(c.departments||[]).map(d=>`<span class="badge badge-dept">${d}</span>`).join('')}
        <span class="badge badge-status">${c.status||'—'}</span>
      </div>
      <div class="field"><span class="field-label">Категория: </span>${c.category}</div>
      <div class="field"><span class="field-label">Нормативный акт: </span>${c.normAct||'—'}</div>
      <div class="field"><span class="field-label">Дата вступления: </span>${formatDate(c.effectiveDate)}</div>
      <div class="field"><span class="field-label">Суть: </span>${c.summary}</div>
      <div class="field"><span class="field-label">Влияние: </span>${c.impact||'—'}</div>
      <div class="field"><span class="field-label">Митигация: </span>${c.mitigation||'—'}</div>
      ${cmts.length ? `<div class="comments-block">
        ${cmts.map(cm=>`<div class="comment-item">
          [${cm.author}] ${cm.time}: ${cm.text||'Ознакомлен'}</div>`).join('')}
      </div>` : ''}
    </div>`;
  });

  html += `<div class="section-header">II. ПРОЕКТНЫЕ НОРМАТИВНО-ПРАВОВЫЕ АКТЫ</div>`;
  dft.forEach(c => {
    html += `<div class="card" style="border-left-color:#4a7fa5">
      <div class="card-title">${c.title}</div>
      <div class="meta-row">
        <span class="badge" style="background:#E8F0F8;color:#2E6A9A;padding:2pt 7pt;font-size:7.5pt;font-weight:bold">
          ${c.probability||'—'}</span>
        ${(c.departments||[]).map(d=>`<span class="badge badge-dept">${d}</span>`).join('')}
      </div>
      <div class="field"><span class="field-label">Категория: </span>${c.category}</div>
      <div class="field"><span class="field-label">Нормативный акт: </span>${c.normAct||'—'}</div>
      <div class="field"><span class="field-label">Стадия: </span>${c.discussionDate||'—'}</div>
      <div class="field"><span class="field-label">Плановая дата: </span>${c.plannedDate||'—'}</div>
      <div class="field"><span class="field-label">Суть: </span>${c.summary}</div>
      <div class="field"><span class="field-label">Практическое значение: </span>${c.practicalValue||c.mitigation||'—'}</div>
    </div>`;
  });

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
  t.textContent = msg;
  t.className   = 'toast show ' + type;
  setTimeout(() => t.classList.remove('show'), 3500);
}


// ============================================================
// ADMIN EDITOR
// ============================================================
function renderEditor() {
  if (!isAdmin()) return;
  const container = document.getElementById('editor-list');
  if (!container) return;

  const allPub = [...PUBLISHED_CHANGES, ...store.extraChanges.filter(c => c.type === 'published')];
  const allDft = [...DRAFT_CHANGES,     ...store.extraChanges.filter(c => c.type === 'draft')];

  container.innerHTML = `
    <div class="editor-section">
      <div class="editor-section-title">Опубликованные НПА (${allPub.length})</div>
      ${allPub.map(c => editorCard(c)).join('')}
    </div>
    <div class="editor-section" style="margin-top:24px">
      <div class="editor-section-title">Проектные НПА (${allDft.length})</div>
      ${allDft.map(c => editorCard(c)).join('')}
    </div>`;

  // Показываем блок предложений
  const propCard = document.getElementById('proposals-card');
  const newProps = (store.proposals||[]).filter(p => p.status === 'new').length;
  if (propCard) {
    propCard.style.display = 'block';
    const h3 = propCard.querySelector('h3');
    if (h3) h3.textContent = `Входящие предложения от сотрудников${newProps ? ' (' + newProps + ' новых)' : ''}`;
  }
  renderProposals();
}

function editorCard(c) {
  const isExtra = store.extraChanges.some(x => x.id === c.id);
  return `<div class="editor-card" id="ecard-${c.id}">
    <div class="editor-card-header">
      <span class="change-number">#${c.num}</span>
      <span class="editor-card-title">${c.title}</span>
      <div class="editor-card-actions">
        <button class="editor-btn-edit" onclick="openEditModal('${c.id}')">✎ Редактировать</button>
        ${isExtra ? `<button class="editor-btn-delete" onclick="deleteChange('${c.id}')">✕ Удалить</button>` : ''}
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
  const isDraft = DRAFT_CHANGES.some(x => x.id === id) || c.type === 'draft';

  document.getElementById('edit-modal-overlay').classList.add('open');
  document.getElementById('edit-modal-content').innerHTML = `
    <div class="modal-cat">${isDraft ? 'Проектный НПА' : 'Опубликованный НПА'} · редактирование</div>
    <div class="modal-title" style="margin-bottom:20px">${c.title}</div>
    <form class="admin-form" onsubmit="saveEdit(event, '${id}')">
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
          <input name="departments" value="${(c.departments||[]).join(', ')}">
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
    departments:   fd.get('departments').split(',').map(d => d.trim()).filter(Boolean),
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

function closeEditModal() {
  document.getElementById('edit-modal-overlay').classList.remove('open');
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
  container.innerHTML = [...props].reverse().map(p => `
    <div class="proposal-card ${p.status === 'new' ? 'proposal-new' : ''}">
      <div class="proposal-header">
        <div>
          <div class="proposal-title">${p.title}</div>
          <div class="proposal-meta">${p.author} · ${p.email||''} · ${p.time}</div>
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
        <div class="field"><span class="field-lbl">Категория:</span> ${p.category}</div>
        <div class="field"><span class="field-lbl">Суть:</span> ${p.summary}</div>
        ${p.normAct ? `<div class="field"><span class="field-lbl">Нормативный акт:</span> ${p.normAct}</div>` : ''}
        ${p.source  ? `<div class="field"><span class="field-lbl">Источник:</span> ${p.source}</div>` : ''}
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
// Настройте на emailjs.com: Service ID, Template ID, Public Key
// ============================================================
const EMAILJS_SERVICE_ID  = 'YOUR_SERVICE_ID';   // ← из EmailJS
const EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID';  // ← из EmailJS
const EMAILJS_PUBLIC_KEY  = 'YOUR_PUBLIC_KEY';   // ← из EmailJS

function sendEmailNotification(entry) {
  if (EMAILJS_SERVICE_ID === 'YOUR_SERVICE_ID') {
    console.warn('EmailJS не настроен — уведомления не отправлены');
    return;
  }
  // Загружаем SDK EmailJS если ещё не загружен
  if (typeof emailjs === 'undefined') {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
    s.onload = () => {
      emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
      _doSendEmail(entry);
    };
    document.head.appendChild(s);
  } else {
    _doSendEmail(entry);
  }
}

function _doSendEmail(entry) {
  const depts = (entry.departments || []).join(', ');
  // Собираем email-адреса получателей из USERS по департаментам
  const recipients = Object.entries(USERS)
    .filter(([, u]) => entry.departments.includes(u.dept) || entry.departments.includes('Все'))
    .map(([email, u]) => ({ email, name: u.name }));

  recipients.forEach(r => {
    emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email:    r.email,
      to_name:     r.name,
      title:       entry.title,
      category:    entry.category,
      criticality: entry.criticality || '—',
      summary:     entry.summary,
      effective:   entry.effectiveDate || entry.plannedDate || '—',
      dept:        depts,
      from_name:   currentName || 'Юридический департамент Marshall',
      site_url:    window.location.origin + window.location.pathname
    }).catch(e => console.warn('EmailJS error:', e));
  });
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
