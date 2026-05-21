// app.js — Compliance Monitor Application Logic

// ============================================================
// STATE
// ============================================================
let currentView = 'dashboard';
let currentUser = '';
let activeDept = 'all';
let activeCrit = 'all';
let searchQuery = '';

// Storage key
const STORAGE_KEY = 'compliance_monitor_data';

// Load or init persistent data
function loadStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return { comments: {}, acknowledgements: {}, extraChanges: [] };
}

function saveStorage(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch(e) {}
}

let store = loadStorage();

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  buildDeptFilters();
  renderDashboard();
  renderPublished();
  renderDraft();
  updateBadges();

  // Watch admin form type change
  document.querySelector('[name="type"]').addEventListener('change', function() {
    document.getElementById('draft-fields').style.display =
      this.value === 'draft' ? 'block' : 'none';
  });
});

// ============================================================
// NAVIGATION
// ============================================================
function setView(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.view === view);
  });
  const titles = { dashboard: 'Обзор', published: 'Опубликованные НПА', draft: 'Проектные НПА', comments: 'Комментарии' };
  document.getElementById('page-title').textContent = titles[view] || '';
  if (view === 'comments') renderAllComments();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('hidden');
}

// ============================================================
// USER
// ============================================================
function updateUser(val) {
  currentUser = val;
  if (val) showToast(`Вы вошли как: ${val}`, 'success');
}

// ============================================================
// FILTERS
// ============================================================
function buildDeptFilters() {
  const all = getAllChanges().flatMap(c => c.departments);
  const depts = [...new Set(all)].sort();
  const container = document.getElementById('dept-filters');
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
    b.classList.toggle('active', b.textContent.trim() === (crit === 'all' ? 'Все' : crit));
  });
  renderPublished(); renderDraft(); renderDashboard();
}

function filterSearch(q) {
  searchQuery = q.toLowerCase();
  renderPublished(); renderDraft();
}

function applyFilters(changes) {
  return changes.filter(c => {
    const deptOk = activeDept === 'all' || c.departments.some(d => d === activeDept || d === 'Все');
    const critOk = activeCrit === 'all' || c.criticality === activeCrit;
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
  return [...PUBLISHED_CHANGES, ...DRAFT_CHANGES, ...store.extraChanges];
}

function critClass(crit) {
  return { 'Высокая': 'high', 'Средняя': 'medium', 'Низкая': 'low', 'Отсутствует': 'none' }[crit] || 'low';
}

function formatDate(dateStr) {
  if (!dateStr || dateStr === '—' || dateStr === '-') return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getComments(id) {
  return store.comments[id] || [];
}

function getAck(id) {
  return store.acknowledgements[id] || {};
}

function commentCount(id) {
  return getComments(id).length;
}

function isAcknowledgedByUser(id, user) {
  return !!getAck(id)[user];
}

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
  const allPub = applyFilters(PUBLISHED_CHANGES);
  const allDft = applyFilters(DRAFT_CHANGES);
  const all = [...allPub, ...allDft, ...applyFilters(store.extraChanges)];

  document.getElementById('stat-total').textContent = getAllChanges().length;
  document.getElementById('stat-high').textContent =
    PUBLISHED_CHANGES.filter(c => c.criticality === 'Высокая').length;
  document.getElementById('stat-medium').textContent =
    PUBLISHED_CHANGES.filter(c => c.criticality === 'Средняя').length;

  // Pending acknowledgements count (published only, for all depts)
  const depts = ['ДУП','ФЭД','КД','ДЛ'];
  let pending = 0;
  PUBLISHED_CHANGES.forEach(c => {
    c.departments.forEach(d => {
      if (d !== 'Все' && !getAck(c.id)[d]) pending++;
    });
  });
  document.getElementById('stat-pending').textContent = pending;
  document.getElementById('badge-comments').textContent =
    Object.values(store.comments).flat().length;

  // Urgent list
  const urgent = PUBLISHED_CHANGES
    .filter(c => c.effectiveDate && c.effectiveDate !== '—')
    .sort((a,b) => new Date(a.effectiveDate) - new Date(b.effectiveDate))
    .slice(0, 5);
  document.getElementById('urgent-list').innerHTML = urgent.map(c => `
    <div class="urgent-item" onclick="openChange('${c.id}')">
      <span class="urgent-date">${formatDate(c.effectiveDate)}</span>
      <span class="urgent-text">${c.title}</span>
      <span class="urgent-dept">${c.departments[0]}</span>
    </div>
  `).join('') || '<div class="empty-state"><p>Нет срочных изменений</p></div>';

  // Ack summary
  const ackHtml = depts.map(d => {
    const pct = deptAckPct(d);
    return `<div class="ack-dept-row">
      <span class="ack-dept-name">${d}</span>
      <div class="ack-bar-track"><div class="ack-bar-fill" style="width:${pct}%"></div></div>
      <span class="ack-pct">${pct}%</span>
    </div>`;
  }).join('');
  document.getElementById('ack-summary').innerHTML = ackHtml;

  // Digest
  const digestChanges = [...PUBLISHED_CHANGES, ...DRAFT_CHANGES].slice(0, 6);
  document.getElementById('digest-grid').innerHTML = digestChanges.map(c => {
    const cc = critClass(c.criticality || '');
    return `<div class="digest-card" onclick="openChange('${c.id}')">
      <div class="digest-cat">${c.category}</div>
      <div class="digest-title">${c.title}</div>
      <div class="digest-meta">
        ${c.criticality ? `<span class="badge badge-${cc}">${c.criticality}</span>` : ''}
        ${c.probability ? `<span class="badge badge-prob">${c.probability}</span>` : ''}
        <span class="badge badge-dept">${c.departments[0]}</span>
      </div>
    </div>`;
  }).join('');
}

// ============================================================
// PUBLISHED LIST
// ============================================================
function renderPublished() {
  const changes = applyFilters([...PUBLISHED_CHANGES, ...store.extraChanges.filter(c => c.type === 'published')]);
  const container = document.getElementById('list-published');
  document.getElementById('badge-published').textContent = changes.length;
  if (!changes.length) {
    container.innerHTML = `<div class="empty-state"><div class="icon">◈</div><p>Нет изменений по выбранным фильтрам</p></div>`;
    return;
  }
  container.innerHTML = changes.map(c => changeCard(c, false)).join('');
}

// ============================================================
// DRAFT LIST
// ============================================================
function renderDraft() {
  const changes = applyFilters([...DRAFT_CHANGES, ...store.extraChanges.filter(c => c.type === 'draft')]);
  const container = document.getElementById('list-draft');
  document.getElementById('badge-draft').textContent = changes.length;
  if (!changes.length) {
    container.innerHTML = `<div class="empty-state"><div class="icon">◎</div><p>Нет проектных изменений</p></div>`;
    return;
  }
  container.innerHTML = changes.map(c => changeCard(c, true)).join('');
}

function changeCard(c, isDraft) {
  const cc = critClass(c.criticality || '');
  const acked = currentUser && isAcknowledgedByUser(c.id, currentUser);
  const cnt = commentCount(c.id);
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
        ${c.probability ? `<span class="badge badge-prob">${c.probability}</span>` : ''}
        ${c.status ? `<span class="badge badge-status">${c.status}</span>` : ''}
        ${acked ? `<span class="badge badge-ack">✓ Ознакомлен</span>` : ''}
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
// MODAL — CHANGE DETAIL
// ============================================================
function openChange(id) {
  const c = [...PUBLISHED_CHANGES, ...DRAFT_CHANGES, ...store.extraChanges].find(x => x.id === id);
  if (!c) return;
  const isDraft = DRAFT_CHANGES.some(x => x.id === id) || c.type === 'draft';
  const cc = critClass(c.criticality || '');
  const acked = currentUser && isAcknowledgedByUser(c.id, currentUser);

  let html = `
    <div class="modal-cat">${isDraft ? '⬡ Проектный НПА' : '◉ Опубликованный НПА'} · ${c.category}</div>
    <div class="modal-title">${c.title}</div>
    <div class="modal-badges">
      ${c.criticality ? `<span class="badge badge-${cc}">${c.criticality}</span>` : ''}
      ${c.probability ? `<span class="badge badge-prob">Вероятность: ${c.probability}</span>` : ''}
      ${c.status ? `<span class="badge badge-status">${c.status}</span>` : ''}
      ${acked ? `<span class="badge badge-ack">✓ Ознакомлен</span>` : ''}
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
        <label>${isDraft ? 'Плановая дата вступления' : 'Дата вступления в силу'}</label>
        <span>${isDraft ? (c.plannedDate||'—') : formatDate(c.effectiveDate)}</span>
      </div>
      ${isDraft ? `<div class="modal-field"><label>Стадия</label><span>${c.discussionDate||'—'}</span></div>` : ''}
      ${c.deadline ? `<div class="modal-field"><label>Срок адаптации</label><span>${c.deadline}</span></div>` : ''}
    </div>`;

  if (!isDraft && c.sanctions) {
    html += `<div class="modal-section">
      <div class="modal-section-label">Штрафные санкции</div>
      <div class="modal-section-text">${c.sanctions}</div>
    </div>`;
  }
  if (c.impact) {
    html += `<div class="modal-section">
      <div class="modal-section-label">Влияние на компанию</div>
      <div class="modal-section-text">${c.impact.replace(/\\n/g,'<br>')}</div>
    </div>`;
  }
  if (c.mitigation || c.practicalValue) {
    html += `<div class="modal-section">
      <div class="modal-section-label">${isDraft ? 'Практическое значение' : 'Митигация риска'}</div>
      <div class="modal-section-text">${(c.mitigation||c.practicalValue||'').replace(/\\n/g,'<br>')}</div>
    </div>`;
  }

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
    ? `Вы вошли как: <strong>${currentUser}</strong>`
    : '<span style="color:var(--high)">Выберите вашу роль в шапке, чтобы оставить комментарий</span>';

  const commentsHtml = comments.length
    ? comments.map(cm => `
      <div class="comment-item type-${cm.type}">
        <div class="comment-meta">
          <span class="comment-author">${cm.author}</span>
          <span class="comment-time">${cm.time}</span>
          <span class="comment-type-badge ${cm.type}">${
            cm.type === 'ack' ? '✓ Ознакомлен' :
            cm.type === 'issue' ? '⚠ Вопрос' : '💬 Комментарий'
          }</span>
        </div>
        ${cm.text ? `<div class="comment-text">${cm.text}</div>` : ''}
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
      <textarea class="comment-textarea" id="ctext-${id}" placeholder="Текст комментария (необязательно для 'Ознакомлен')…"></textarea>
      <div style="margin-top:8px">
        <button class="comment-submit" onclick="submitComment('${id}')">Отправить</button>
      </div>
    </div>
  </div>`;
}

function submitComment(id) {
  if (!currentUser) {
    showToast('Сначала выберите вашу роль в шапке страницы', 'error');
    return;
  }
  const type = document.getElementById('ctype-' + id).value;
  const text = document.getElementById('ctext-' + id).value.trim();

  if (!store.comments[id]) store.comments[id] = [];

  const now = new Date();
  const timeStr = now.toLocaleDateString('ru-RU') + ' ' + now.toLocaleTimeString('ru-RU', {hour:'2-digit',minute:'2-digit'});

  store.comments[id].push({ author: currentUser, type, text, time: timeStr });

  // Mark acknowledgement
  if (type === 'ack') {
    if (!store.acknowledgements[id]) store.acknowledgements[id] = {};
    store.acknowledgements[id][currentUser] = true;
  }

  saveStorage(store);
  showToast(type === 'ack' ? '✓ Ознакомление зафиксировано' : 'Комментарий добавлен', 'success');

  // Re-render modal
  openChange(id);
  updateBadges();
  renderDashboard();
  renderPublished();
  renderDraft();
}

// ============================================================
// ALL COMMENTS VIEW
// ============================================================
function renderAllComments() {
  const container = document.getElementById('all-comments-list');
  const all = [];
  Object.entries(store.comments).forEach(([id, cmts]) => {
    const c = [...PUBLISHED_CHANGES, ...DRAFT_CHANGES, ...store.extraChanges].find(x => x.id === id);
    cmts.forEach(cm => all.push({ ...cm, id, changeTitle: c ? c.title : id }));
  });

  if (!all.length) {
    container.innerHTML = `<div class="empty-state"><div class="icon">◷</div><p>Комментариев пока нет</p></div>`;
    return;
  }

  // Sort newest first
  const sorted = all.reverse();
  container.innerHTML = sorted.map(cm => `
    <div class="all-comment-item type-${cm.type}" onclick="openChange('${cm.id}')">
      <div class="all-comment-link">→ ${cm.changeTitle}</div>
      <div class="comment-meta">
        <span class="comment-author">${cm.author}</span>
        <span class="comment-time">${cm.time}</span>
        <span class="comment-type-badge ${cm.type}">${
          cm.type === 'ack' ? '✓ Ознакомлен' :
          cm.type === 'issue' ? '⚠ Вопрос' : '💬 Комментарий'
        }</span>
      </div>
      ${cm.text ? `<div class="comment-text">${cm.text}</div>` : ''}
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
function openAdminPanel() {
  document.getElementById('admin-overlay').classList.add('open');
}

function closeAdmin() {
  document.getElementById('admin-overlay').classList.remove('open');
}

function submitNewChange(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const type = fd.get('type');
  const id = type + '-extra-' + Date.now();

  const entry = {
    id,
    num: getAllChanges().length + 1,
    type,
    category: fd.get('category'),
    title: fd.get('category').split('/')[0].trim() + ': ' + fd.get('summary').substring(0,60) + '…',
    summary: fd.get('summary'),
    normAct: fd.get('norm_act'),
    effectiveDate: fd.get('effective_date'),
    sanctions: fd.get('sanctions'),
    criticality: fd.get('criticality'),
    impact: fd.get('impact'),
    mitigation: fd.get('mitigation'),
    deadline: fd.get('deadline'),
    departments: fd.get('departments').split(',').map(d => d.trim()).filter(Boolean),
    status: fd.get('status'),
    probability: fd.get('probability') || null,
    plannedDate: fd.get('effective_date') || null
  };

  store.extraChanges.push(entry);
  saveStorage(store);

  closeAdmin();
  e.target.reset();
  buildDeptFilters();
  renderPublished();
  renderDraft();
  renderDashboard();
  showToast('✓ Изменение добавлено', 'success');
}

// ============================================================
// EXPORT
// ============================================================
function exportReport() {
  const lines = [];
  lines.push(`COMPLIANCE MONITOR — ОТЧЁТ ${QUARTER}`);
  lines.push(`Дата формирования: ${new Date().toLocaleDateString('ru-RU')}`);
  lines.push('='.repeat(70));
  lines.push('\nI. ОПУБЛИКОВАННЫЕ НПА\n');

  PUBLISHED_CHANGES.forEach(c => {
    lines.push(`#${c.num} ${c.title}`);
    lines.push(`Категория: ${c.category}`);
    lines.push(`Критичность: ${c.criticality}`);
    lines.push(`Нормативный акт: ${c.normAct}`);
    lines.push(`Дата вступления: ${formatDate(c.effectiveDate)}`);
    lines.push(`Департаменты: ${c.departments.join(', ')}`);
    lines.push(`Статус: ${c.status}`);
    const cmts = getComments(c.id);
    if (cmts.length) {
      lines.push(`Комментарии (${cmts.length}):`);
      cmts.forEach(cm => lines.push(`  [${cm.author}] ${cm.time}: ${cm.text || '(Ознакомлен)'}`));
    }
    lines.push('-'.repeat(50));
  });

  lines.push('\nII. ПРОЕКТНЫЕ НПА\n');
  DRAFT_CHANGES.forEach(c => {
    lines.push(`#${c.num} ${c.title}`);
    lines.push(`Категория: ${c.category}`);
    lines.push(`Вероятность: ${c.probability}`);
    lines.push(`Нормативный акт: ${c.normAct}`);
    lines.push(`Плановая дата: ${c.plannedDate}`);
    lines.push(`Департаменты: ${c.departments.join(', ')}`);
    lines.push('-'.repeat(50));
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Compliance_Report_${QUARTER.replace(' ','_')}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Отчёт скачан', 'success');
}

// ============================================================
// TOAST
// ============================================================
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.classList.remove('show'), 3000);
}
