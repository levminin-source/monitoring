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
let currentUser  = '';       // роль/департамент (ДУП, ФЭД…)
let currentEmail = '';       // email вошедшего пользователя
let activeDept   = 'all';
let activeCrit   = 'all';
let searchQuery  = '';

let store = { comments: {}, acknowledgements: {}, extraChanges: [] };
let db    = null;
let auth  = null;

const CONFIGURED = FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY';

// ============================================================
// ADMIN CONFIG — добавьте email юриста-администратора
// ============================================================
const ADMIN_EMAILS = [
  'YOUR_LAWYER_EMAIL@marshall.com'   // ← замените на реальный email
];

function isAdmin() {
  return ADMIN_EMAILS.includes(currentEmail);
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
      // Пользователь вошёл — показываем приложение
      currentEmail = user.email;
      // Восстанавливаем роль из sessionStorage (если была выбрана)
      const savedRole = sessionStorage.getItem('compliance_role') || '';
      currentUser = savedRole;
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
  const role     = document.getElementById('login-role').value;
  const btn      = document.getElementById('login-btn');
  const errEl    = document.getElementById('login-error');

  errEl.classList.remove('visible');

  if (!email || !password) {
    showLoginError('Введите email и пароль.');
    return;
  }
  if (!role) {
    showLoginError('Выберите ваш департамент / роль.');
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Вход…';

  if (!CONFIGURED) {
    // Демо-режим без Firebase: любой email/пароль
    currentEmail = email;
    currentUser  = role;
    sessionStorage.setItem('compliance_role', role);
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
    // После входа onAuthStateChanged сам вызовет showApp()
    currentUser = role;
    sessionStorage.setItem('compliance_role', role);
  } catch(e) {
    btn.disabled    = false;
    btn.textContent = 'Войти';
    const msgs = {
      'auth/user-not-found':   'Пользователь с таким email не найден.',
      'auth/wrong-password':   'Неверный пароль.',
      'auth/invalid-email':    'Некорректный формат email.',
      'auth/too-many-requests':'Слишком много попыток. Попробуйте позже.',
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
  const initials = currentEmail ? currentEmail[0].toUpperCase() : '?';
  document.getElementById('user-chip-avatar').textContent = initials;
  document.getElementById('user-chip-name').textContent   = currentEmail || 'Пользователь';
  document.getElementById('user-chip-role').textContent   = currentUser  || '—';

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
  const all   = getAllChanges().flatMap(c => c.departments);
  // Исключаем 'Все' из списка — это служебное значение, не департамент
  const depts = [...new Set(all)].filter(d => d !== 'Все').sort();
  const container = document.getElementById('dept-filters');
  if (!container) return;
  container.innerHTML = `<button class="dept-btn active" data-dept="all" onclick="filterDept('all')">Все</button>`;
  depts.forEach(d => {
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
}

function applyFilters(changes) {
  return changes.filter(c => {
    const deptOk   = activeDept === 'all' || c.departments.some(d => d === activeDept || d === 'Все');
    const critOk   = activeCrit === 'all' || c.criticality === activeCrit;
    const searchOk = !searchQuery ||
      c.title.toLowerCase().includes(searchQuery) ||
      c.summary.toLowerCase().includes(searchQuery) ||
      c.category.toLowerCase().includes(searchQuery);
    return deptOk && critOk && searchOk;
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

function changeCard(c, isDraft) {
  const cc    = critClass(c.criticality || '');
  const acked = currentUser && isAcknowledgedByUser(c.id, currentUser);
  const cnt   = commentCount(c.id);
  const depts = (c.departments || []).map(d => `<span class="badge badge-dept">${d}</span>`).join('');
  return `<div class="change-card${acked ? ' acknowledged' : ''}" onclick="openChange('${c.id}')">
    <div class="change-top">
      <span class="change-number">#${c.num || '—'}</span>
      <div class="change-title-group">
        <div class="change-category">${c.category}</div>
        <div class="change-title">${c.title}</div>
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
      ${c.effectiveDate ? `<span class="change-date">Вступает: ${formatDate(c.effectiveDate)}</span>` : ''}
      ${isDraft && c.plannedDate ? `<span class="change-date">Планируется: ${c.plannedDate}</span>` : ''}
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
    author: currentUser,
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

  store.extraChanges.push({
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
    plannedDate:   fd.get('effective_date') || null
  });

  await saveToCloud();
  closeAdmin();
  e.target.reset();
  if (!CONFIGURED) { buildDeptFilters(); renderPublished(); renderDraft(); renderDashboard(); }
  showToast('✓ Изменение добавлено', 'success');
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
  <h1>MARSHALL</h1>
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
    <div class="cover-logo">MARSHALL</div>
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
