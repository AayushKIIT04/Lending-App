// ─── State ──────────────────────────────────────────────────────────
let slots = [];
let activeSlotId = null;
let monthYear = currentMonthYear();
let customers = [];
let summary = null;
let editingCell = null;
let currentRole = null;

// ─── Helpers ────────────────────────────────────────────────────────
function fmt(n) {
  return Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
function fmtDate(d) {
  if (!d) return '';
  const date = new Date(d);
  return `${String(date.getDate()).padStart(2,'0')}.${String(date.getMonth()+1).padStart(2,'0')}.${String(date.getFullYear()).slice(2)}`;
}
function monthLabel(my) {
  const [y, m] = my.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m)-1]} ${y}`;
}
function currentMonthYear() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
}
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Profit rate helper ──────────────────────────────────────────────
function getActiveSlotRates() {
  const slot = slots.find(s => s.id === activeSlotId);
  const name = slot?.slot_name?.toLowerCase() || '';

  const profitRate = name.includes('raigarh') ? 0.22 : 0.28;

  let staffRate, netRate;
  if (name.includes('raigarh')) {
    staffRate = 0.08; netRate = 0.14;
  } else if (name.includes('gomti nagar')) {
    staffRate = 0.08; netRate = 0.20;
  } else if (name.includes('barabanki')) {
    staffRate = 0.08; netRate = 0.20;
  } else if (name.includes('arjun ganj') || name.includes('arjunganj')) {
    staffRate = 0.08; netRate = 0.20;
  } else if (name.includes('lucknow') || name.includes('tedhi puliya') || name.includes('azad nagar') || name.includes('azaad nagar')) {
    staffRate = 0.06; netRate = 0.22;
  } else if (name.includes('aashram') || name.includes('ashram')) {
    staffRate = 0.06; netRate = 0.28;
  } else {
    staffRate = 0.06; netRate = profitRate - staffRate;
  }

  const totalRate = 1 + profitRate;
  return { profitRate, staffRate, netRate, totalRate };
}
function profitPctLabel()   { const { profitRate } = getActiveSlotRates(); return `${Math.round(profitRate * 100)}%`; }
function staffPctLabel()    { const { staffRate }  = getActiveSlotRates(); return `${Math.round(staffRate * 100)}%`; }
function netIncomePctLabel(){ const { netRate }    = getActiveSlotRates(); return `${Math.round(netRate * 100)}%`; }

// ─── API ─────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + path, opts);
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Request failed'); }
  return res.json();
}

// ─── Toast ───────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.style.display = 'block';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.display = 'none'; }, 3000);
}

// ═══════════════════════════════════════════════════════════════════
// AUTH / LOGIN
// ═══════════════════════════════════════════════════════════════════
async function checkSession() {
  try {
    const res = await fetch('/api/session', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      currentRole = data.role;
      showApp();
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('loginOverlay').style.display = 'flex';
  document.getElementById('mainApp').style.display = 'none';
}

async function showApp() {
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';
  applyRoleRestrictions();
  await startApp();
}

async function submitLogin() {
  const pw    = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  if (!pw) { errEl.textContent = 'Please enter a password'; errEl.style.display = 'block'; return; }
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password: pw })
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    currentRole = data.role;
    errEl.style.display = 'none';
    document.getElementById('loginPassword').value = '';
    showApp();
  } catch {
    errEl.textContent = 'Incorrect password';
    errEl.style.display = 'block';
  }
}

async function doLogout() {
  try { await fetch('/api/logout', { method: 'POST', credentials: 'include' }); } catch {}
  currentRole  = null;
  activeSlotId = null;
  const lockStyle = document.getElementById('viewerLockStyle');
  if (lockStyle) lockStyle.remove();
  showLogin();
}

function applyRoleRestrictions() {
  const existing = document.getElementById('viewerLockStyle');
  if (existing) existing.remove();
  if (currentRole === 'admin') return;

  const style = document.createElement('style');
  style.id = 'viewerLockStyle';
  style.textContent = `
    .btn-gold, .btn-carry, .status-btn, .del-btn, .kothi-edit-btn { display: none !important; }
    td.editable {
      cursor: default !important;
      pointer-events: none;
      background: none !important;
      border-left-color: transparent !important;
    }
    td.editable::after { display: none !important; }
    .collect-input, .opening-pawana-input { pointer-events: none; opacity: 0.6; }
    tr[draggable="true"] { cursor: default !important; }
  `;
  document.head.appendChild(style);
}

// ═══════════════════════════════════════════════════════════════════
// WELCOME / SLOT SELECTION VIEW
// ═══════════════════════════════════════════════════════════════════
function renderSlotCards() {
  const grid = document.getElementById('slotCardGrid');
  grid.innerHTML = '';

  slots.forEach(s => {
    const card = document.createElement('div');
    card.className = 'slot-card';
    card.innerHTML = `
      <div class="slot-card-icon">₹</div>
      <div class="slot-card-name">${escHtml(s.slot_name)}</div>
      <div class="slot-card-kothi">
        <span class="slot-card-kothi-label">Kothi Capital</span>
        <span class="slot-card-kothi-val">₹${fmt(s.kothi_amount)}</span>
      </div>
      <div class="slot-card-kothi" style="margin-top:2px">
        <span class="slot-card-kothi-label">Received Capital</span>
        <span class="slot-card-kothi-val" style="color:var(--sapphire)">₹${fmt(s.received_capital)}</span>
      </div>
      <div class="slot-card-kothi" style="margin-top:2px">
        <span class="slot-card-kothi-label">Income (This Month)</span>
        <span class="slot-card-kothi-val" style="color:var(--emerald)">₹${fmt(s.total_income_this_month)}</span>
      </div>
      <div class="slot-card-kothi" style="margin-top:2px">
        <span class="slot-card-kothi-label">Khata (This Month)</span>
        <span class="slot-card-kothi-val" style="color:var(--violet)">₹${fmt(s.total_khata_this_month)}</span>
      </div>
      <div class="slot-card-cta">View Ledger →</div>
    `;
    card.addEventListener('click', () => openSlot(s.id));
    grid.appendChild(card);
  });
}

let recoveryChartInstance = null;
function renderRecoveryChart() {
  const canvas = document.getElementById('recoveryChart');
  if (!canvas || typeof Chart === 'undefined') return;

  const ctx = canvas.getContext('2d');
  const isMobile = window.innerWidth <= 640;

  const labels = slots.map(s => s.slot_name);
const data   = slots.map(s => Number(s.achieved_pct || 0));

// Color each bar by its own recovery percentage tier
function tierColorsFor(pct) {
  if (pct < 25)  return ['#F87171', '#B91C1C']; // dark red
  if (pct < 50)  return ['#FECACA', '#FCA5A5']; // light red
  if (pct < 75)  return ['#BBF7D0', '#86EFAC']; // light green
  return ['#34D399', '#0B7B52'];                // good green
}
const gradients = data.map(pct => {
  const [from, to] = tierColorsFor(pct);
  const g = ctx.createLinearGradient(0, 0, 0, 300);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  return g;
});

  if (recoveryChartInstance) recoveryChartInstance.destroy();

  recoveryChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Recovery %',
        data,
        backgroundColor: gradients,
        borderRadius: 10,
        borderSkipped: false,
        maxBarThickness: isMobile ? 30 : 52,
        hoverBackgroundColor: gradients,
      }],
    },
    options: {
      indexAxis: isMobile ? 'y' : 'x',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 900, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0D1B3E',
          titleFont: { family: 'Sora', weight: '700', size: 13 },
          bodyFont: { family: 'JetBrains Mono', size: 13 },
          padding: 12,
          cornerRadius: 8,
          displayColors: false,
          callbacks: { label: (ctx) => `${ctx.parsed[isMobile ? 'x' : 'y']}% achieved` },
        },
      },
      scales: isMobile ? {
        x: {
          beginAtZero: true, max: 100,
          ticks: { callback: (v) => v + '%', font: { size: 11 } },
          grid: { color: '#EDF1FB' },
        },
        y: {
          grid: { display: false },
          ticks: { font: { family: 'Sora', weight: '600', size: 12 } },
        },
      } : {
        y: {
          beginAtZero: true, max: 100,
          ticks: { callback: (v) => v + '%', font: { size: 12 } },
          grid: { color: '#EDF1FB' },
        },
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Sora', weight: '600', size: 12 } },
        },
      },
    },
  });
}

function startKothiEdit(slotId, btn) {
  const row  = document.getElementById('kothiRow');
  const slot = slots.find(s => s.id === slotId);
  if (!slot || !row) return;

  row.innerHTML = `
    <span class="kothi-label">🏦 Kothi Capital</span>
    <span class="slot-card-kothi-edit-wrap">
      <input type="number" class="kothi-edit-input" id="kothiEditInput" value="${slot.kothi_amount || 0}" />
      <button type="button" class="kothi-save-btn" title="Save">✓</button>
      <button type="button" class="kothi-cancel-btn" title="Cancel">✕</button>
    </span>
  `;

  const input     = row.querySelector('#kothiEditInput');
  const saveBtn   = row.querySelector('.kothi-save-btn');
  const cancelBtn = row.querySelector('.kothi-cancel-btn');

  input.focus();
  input.select();

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); saveKothiEdit(slotId, input.value); }
    if (e.key === 'Escape') { e.preventDefault(); renderSummary(); }
  });

  saveBtn.addEventListener('click', () => saveKothiEdit(slotId, input.value));
  cancelBtn.addEventListener('click', () => renderSummary());
}

async function saveKothiEdit(slotId, value) {
  const amount = Number(value);
  if (isNaN(amount) || amount < 0) {
    showToast('Please enter a valid amount', 'error');
    return;
  }
  const slot = slots.find(s => s.id === slotId);
  if (!slot) return;

  try {
    const updated = await api('PUT', `/slots/${slotId}`, {
      slot_name:    slot.slot_name,
      kothi_amount: amount,
    });
    slot.kothi_amount = updated.kothi_amount;
    renderSummary();
    showToast('Kothi Capital updated');
  } catch (e) {
    showToast(e.message || 'Failed to update Kothi Capital', 'error');
  }
}

function startReceivedCapitalEdit(slotId, btn) {
  const row  = document.getElementById('receivedCapitalRow');
  const slot = slots.find(s => s.id === slotId);
  if (!slot || !row) return;

  row.innerHTML = `
    <span class="kothi-label">💼 Received Capital</span>
    <span class="slot-card-kothi-edit-wrap">
      <input type="number" class="kothi-edit-input" id="receivedCapitalEditInput" value="${slot.received_capital || 0}" />
      <button type="button" class="kothi-save-btn" title="Save">✓</button>
      <button type="button" class="kothi-cancel-btn" title="Cancel">✕</button>
    </span>
  `;

  const input     = row.querySelector('#receivedCapitalEditInput');
  const saveBtn   = row.querySelector('.kothi-save-btn');
  const cancelBtn = row.querySelector('.kothi-cancel-btn');

  input.focus();
  input.select();

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); saveReceivedCapitalEdit(slotId, input.value); }
    if (e.key === 'Escape') { e.preventDefault(); renderSummary(); }
  });

  saveBtn.addEventListener('click', () => saveReceivedCapitalEdit(slotId, input.value));
  cancelBtn.addEventListener('click', () => renderSummary());
}

async function saveReceivedCapitalEdit(slotId, value) {
  const amount = Number(value);
  if (isNaN(amount) || amount < 0) {
    showToast('Please enter a valid amount', 'error');
    return;
  }
  const slot = slots.find(s => s.id === slotId);
  if (!slot) return;

  try {
    const updated = await api('PUT', `/slots/${slotId}`, {
      slot_name:        slot.slot_name,
      kothi_amount:     slot.kothi_amount,
      received_capital: amount,
    });
    slot.received_capital = updated.received_capital;
    renderSummary();
    showToast('Received Capital updated');
  } catch (e) {
    showToast(e.message || 'Failed to update Received Capital', 'error');
  }
}

function setSlotActionsVisible(visible) {
  const display     = visible ? '' : 'none';
  const carryBtn    = document.querySelector('.header-controls .btn-carry');
  const addBtn      = document.querySelector('.header-controls .btn-gold');
  const monthSelect = document.getElementById('monthSelect');
  const searchWrap  = document.getElementById('headerSearchWrap');
  
  const slotTitle   = document.getElementById('headerSlotTitle');
  if (carryBtn)    carryBtn.style.display    = display;
  if (addBtn)      addBtn.style.display      = display;
  if (monthSelect) monthSelect.style.display = display;
  if (searchWrap)  searchWrap.style.display  = visible ? 'flex' : 'none';
  if (slotTitle)   slotTitle.style.display   = visible ? 'inline-block' : 'none';
}
async function openSlot(id) {
  activeSlotId = id;
  document.getElementById('welcomeView').style.display = 'none';
  document.getElementById('appView').style.display     = 'block';
  setSlotActionsVisible(true);
  await loadData();
  history.pushState({ view: 'slot', slotId: id }, '', '');
}
function showWelcome() {
  activeSlotId = null;
  document.getElementById('welcomeView').style.display = 'block';
  document.getElementById('appView').style.display     = 'none';
  setSlotActionsVisible(false);
}
function goToWelcomeWithHistory() {
  showWelcome();
  history.pushState({ view: 'welcome' }, '', '');
}

window.addEventListener('popstate', (event) => {
  const state = event.state;
  if (!state || state.view === 'welcome') {
    showWelcome();
  } else if (state.view === 'slot') {
    activeSlotId = state.slotId;
    document.getElementById('welcomeView').style.display = 'none';
    document.getElementById('appView').style.display     = 'block';
    setSlotActionsVisible(true);
    loadData();
  }
});

function initHistoryState() {
  history.replaceState({ view: 'welcome' }, '', '');
}

// ─── Month selector ──────────────────────────────────────────────────
function buildMonthSelector() {
  const sel = document.getElementById('monthSelect');
  sel.innerHTML = '';
  const now = new Date();
  for (let i = 5; i >= -6; i--) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const opt = document.createElement('option');
    opt.value       = val;
    opt.textContent = monthLabel(val);
    if (val === monthYear) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => {
    monthYear = sel.value;
    if (activeSlotId) loadData();
  });
}

// ─── Load data ───────────────────────────────────────────────────────
async function loadData() {
  if (!activeSlotId) return;
  const slot = slots.find(s => s.id === activeSlotId);
  const titleText = `${slot ? slot.slot_name : ''} — ${monthLabel(monthYear)}`;
  document.getElementById('tableTitle').textContent = titleText;
  const headerSlotTitle = document.getElementById('headerSlotTitle');
  if (headerSlotTitle) headerSlotTitle.textContent = titleText;
  document.getElementById('loadingText').style.display = 'inline';
  try {
    const [cust, sum] = await Promise.all([
      api('GET', `/customers/${activeSlotId}/${monthYear}`),
      api('GET', `/slots/summary/${activeSlotId}/${monthYear}`)
    ]);
    customers = cust;
    summary   = sum;
    renderTable();
    renderSummary();
    await loadDailyCollections();
  } catch (e) {
    showToast('Failed to load data', 'error');
  } finally {
    document.getElementById('loadingText').style.display = 'none';
  }
}

// ═══════════════════════════════════════════════════════════════════
// RENDER TABLE  — drag handles built in here
// ═══════════════════════════════════════════════════════════════════
function renderTable() {
  const tbody = document.getElementById('ledgerBody');
  const tfoot = document.getElementById('ledgerFoot');
  tbody.innerHTML = '';
  tfoot.innerHTML = '';

  const profitTh    = document.getElementById('th_profit');
  const staffTh     = document.getElementById('th_staff_comm');
  const netIncomeTh = document.getElementById('th_net_income');
  if (profitTh)    profitTh.textContent    = `Profit ${profitPctLabel()}`;
  if (staffTh)     staffTh.textContent     = `Staff Comm (${staffPctLabel()})`;
  if (netIncomeTh) netIncomeTh.textContent = `Net Income`;

  if (customers.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="12">No entries for this month. Click <strong>+ Add Entry</strong> to begin.</td></tr>`;
    return;
  }

  const isAdmin = currentRole === 'admin';

  customers.forEach((c) => {
    const tr = document.createElement('tr');
    if (c.is_closed) tr.classList.add('closed');
    tr.dataset.id = c.id;

    // ── Set draggable only for admin ──
    if (isAdmin) tr.setAttribute('draggable', 'true');

    const balClass = Number(c.balance_recovery) > 0 ? 'text-red' : 'text-green';

    // ── Drag handle icon shown only for admin ──
    const dragIcon = isAdmin
      ? `<span class="drag-handle" title="Drag to reorder">⠿</span>`
      : '';

    tr.innerHTML = `
      <td class="text-center text-muted" style="white-space:nowrap">${dragIcon}${c.sl_no}</td>
      <td class="editable text-left"  data-field="opening_date"        data-val="${c.opening_date || ''}">${fmtDate(c.opening_date)}</td>
      <td class="editable text-left"  data-field="customer_name"       data-val="${escHtml(c.customer_name)}">${escHtml(c.customer_name)}</td>
      <td class="editable text-right" data-field="funding"             data-val="${c.funding}">₹${fmt(c.funding)}</td>
      <td class="text-right text-green">₹${fmt(c.profit_28_percent)}</td>
      <td class="text-right text-yellow">₹${fmt(c.staff_commission)}</td>
      <td class="text-right text-purple">₹${fmt(c.total_payment_to_be_made)}</td>
      <td class="editable text-right" data-field="payment_has_been_done" data-val="${c.payment_has_been_done}">₹${fmt(c.payment_has_been_done)}</td>
      <td class="text-right font-mono ${balClass}">₹${fmt(c.balance_recovery)}</td>
      <td class="text-right text-rupee">₹${fmt(c.net_income)}</td>
      <td class="text-center">
        <button class="status-btn ${c.is_closed ? 'status-closed' : 'status-active'}" data-id="${c.id}">
          ${c.is_closed ? 'Closed' : 'Active'}
        </button>
      </td>
      <td class="text-center"><button class="del-btn" data-id="${c.id}" title="Delete">✕</button></td>
    `;
    tbody.appendChild(tr);
  });
   if (customers.length > 0) {
    const spacer = document.createElement('tr');
    spacer.innerHTML = `<td colspan="12" style="height:64px;padding:0;border:none;"></td>`;
    tbody.appendChild(spacer);
  }

  // ── Inline edit ──
  tbody.querySelectorAll('td.editable').forEach(td => {
  td.addEventListener('click', () => startInlineEdit(td));
});

  // ── Status toggle ──
  tbody.querySelectorAll('.status-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id);
      const c  = customers.find(x => x.id === id);
      try {
        await api('PUT', `/customers/${id}`, { is_closed: c.is_closed ? 0 : 1 });
        await loadData();
      } catch { showToast('Update failed', 'error'); }
    });
  });

  // ── Delete ──
  tbody.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this entry?')) return;
      try {
        await api('DELETE', `/customers/${btn.dataset.id}`);
        showToast('Deleted');
        await loadData();
      } catch { showToast('Delete failed', 'error'); }
    });
  });

  // ── Mini stat counts ──
  const activeCount = customers.filter(c => !c.is_closed).length;
  const closedCount = customers.filter(c =>  c.is_closed).length;
  const elActive = document.getElementById('activeCount');
  const elClosed = document.getElementById('closedCount');
  const elTotal  = document.getElementById('totalCount');
  if (elActive) elActive.textContent = activeCount;
  if (elClosed) elClosed.textContent = closedCount;
  if (elTotal)  elTotal.textContent  = customers.length;

  // ── Footer totals ──
  if (summary) {
  tfoot.innerHTML = `<tr>
    <td colspan="3" class="text-right footer-label-highlight footer-green" style="padding-right:12px">THIS MONTH FUNDING</td>
    <td class="text-right footer-highlight footer-green">₹${fmt(summary.this_month_funding)}</td>
    <td class="text-right text-green"  style="font-weight:700">₹${fmt(summary.total_profit_28)}</td>
    <td class="text-right footer-highlight footer-green">₹${fmt(summary.total_staff_commission)}</td>
    <td class="text-right text-purple" style="font-weight:700">₹${fmt(summary.total_funding_and_profit)}</td>
    <td class="text-right text-slate2" style="font-weight:700">₹${fmt(summary.actual_recovery)}</td>
    <td class="text-right text-red"    style="font-weight:700">₹${fmt(summary.total_balance_recovery)}</td>
    <td class="text-right text-rupee"  style="font-weight:700">₹${fmt(summary.total_net_income)}</td>
    <td colspan="2"></td>
  </tr>`;
}

  // ── Enable drag-and-drop (admin only) ──
  if (isAdmin) enableRowDragging();
}


// ═══════════════════════════════════════════════════════════════════
// DRAG-AND-DROP ROW REORDERING — scrolls .table-wrapper, not window
// ═══════════════════════════════════════════════════════════════════
function enableRowDragging() {
  const tbody = document.getElementById('ledgerBody');
  if (!tbody) return;

  // The actual scrollable element — NOT window
  const scrollEl = tbody.closest('.table-wrapper') || tbody.closest('table').parentElement;

  let dragSrc      = null;
  let placeholder  = null;
  let scrollTimer  = null;

  // ── Auto-scroll the table-wrapper, speed scales with proximity to edge ──
  function startAutoScroll(e) {
    clearInterval(scrollTimer);
    const rect = scrollEl.getBoundingClientRect();
    const ZONE = 60; // px from the wrapper's own top/bottom edge
    const y    = e.clientY;

    let dir = 0, dist = 0;

    if (y < rect.top + ZONE) {
      dir  = -1;
      dist = (rect.top + ZONE) - y;
    } else if (y > rect.bottom - ZONE) {
      dir  = 1;
      dist = y - (rect.bottom - ZONE);
    } else {
      return; // cursor not near an edge of the scrollable area
    }

    const speed = Math.min(28, 6 + dist / 3); // 6px..28px per tick
    scrollTimer = setInterval(() => {
      scrollEl.scrollTop += dir * speed;
    }, 16);
  }
  function stopAutoScroll() {
    clearInterval(scrollTimer);
    scrollTimer = null;
  }

  function createPlaceholder(height) {
    const ph = document.createElement('tr');
    ph.className = 'drag-placeholder';
    ph.innerHTML = `<td colspan="12" style="height:${height}px;pointer-events:none;background:rgba(212,175,55,0.13);border:2px dashed rgba(212,175,55,0.55);border-radius:6px;"></td>`;
    return ph;
  }

  function cleanUp() {
    stopAutoScroll();
    if (dragSrc) {
      dragSrc.style.opacity = '';
      dragSrc.classList.remove('dragging-row');
    }
    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.removeChild(placeholder);
    }
    tbody.querySelectorAll('tr').forEach(r => r.classList.remove('dragover-row'));
    placeholder = null;
    dragSrc     = null;
  }

  // Move placeholder to wherever row `tr` is, based on cursor Y vs midpoint
  function positionPlaceholder(tr, clientY) {
    if (!tr || tr === dragSrc || tr === placeholder) return;
    tbody.querySelectorAll('tr').forEach(r => r.classList.remove('dragover-row'));
    tr.classList.add('dragover-row');

    const rect       = tr.getBoundingClientRect();
    const insertAfter = clientY > rect.top + rect.height / 2;

    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.removeChild(placeholder);
    }
    if (insertAfter) {
      tr.parentNode.insertBefore(placeholder, tr.nextSibling);
    } else {
      tr.parentNode.insertBefore(placeholder, tr);
    }
  }

  function attachRowHandlers(tr) {
    tr.addEventListener('dragstart', (e) => {
      dragSrc     = tr;
      placeholder = createPlaceholder(tr.offsetHeight);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', tr.dataset.id);
      setTimeout(() => {
        tr.classList.add('dragging-row');
        tr.style.opacity = '0.35';
      }, 0);
    });

    tr.addEventListener('dragend', cleanUp);

    tr.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!dragSrc) return;
      startAutoScroll(e);
      positionPlaceholder(tr, e.clientY);
    });

    tr.addEventListener('dragleave', (e) => {
      if (!scrollEl.contains(e.relatedTarget)) stopAutoScroll();
    });

    tr.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await finishDrop(e);
    });
  }

  async function finishDrop(e) {
    stopAutoScroll();
    if (!dragSrc) return;

    tbody.querySelectorAll('tr').forEach(r => r.classList.remove('dragover-row'));

    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.insertBefore(dragSrc, placeholder);
      placeholder.parentNode.removeChild(placeholder);
      placeholder = null;
    }

    dragSrc.style.opacity = '';
    dragSrc.classList.remove('dragging-row');
    dragSrc = null;

    const newOrder = Array.from(tbody.querySelectorAll('tr[data-id]'))
      .map(r => parseInt(r.dataset.id));

    try {
      await api('POST', '/customers/reorder', {
        slot_id:    activeSlotId,
        month_year: monthYear,
        order:      newOrder,
      });
      showToast('✓ Order saved');
      await loadData();
    } catch {
      showToast('Failed to save order', 'error');
      await loadData();
    }
  }

  Array.from(tbody.querySelectorAll('tr[draggable="true"]')).forEach(attachRowHandlers);

  // ── Fallback: dragover/drop on the SCROLLABLE WRAPPER (covers empty
  //    space above the first row, below the last row, and the scrollbar
  //    gutter — anywhere that isn't directly over a <tr>) ──
  scrollEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!dragSrc) return;
    startAutoScroll(e);

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const tr = el && el.closest('tr[data-id]');
    if (tr) positionPlaceholder(tr, e.clientY);
  });

  scrollEl.addEventListener('dragleave', (e) => {
    if (!scrollEl.contains(e.relatedTarget)) stopAutoScroll();
  });

  scrollEl.addEventListener('drop', async (e) => {
    if (e.target.closest('tr[data-id]')) return; // row-level handler already covers this
    e.preventDefault();
    await finishDrop(e);
  });
}
// ─── Inline edit ────────────────────────────────────────────────────
function startInlineEdit(td) {
  if (currentRole !== 'admin') return;
  cancelInlineEdit();

  const tr    = td.closest('tr');
  const id    = parseInt(tr.dataset.id);
  const field = td.dataset.field;
  const val   = td.dataset.val;

  editingCell = { id, field, td };
  const isName = field === 'customer_name';
  const isDate = field === 'opening_date';

  const input = document.createElement('input');
input.className = isName ? 'inline-input-name' : 'inline-input';
input.type      = isDate ? 'date' : (isName ? 'text' : 'number');
input.value     = val || '';
if (isDate) input.setAttribute('lang', 'en-GB');
if (isName || isDate) input.style.textAlign = 'left';

  td.textContent = '';
  td.appendChild(input);
  input.focus();
  if (!isDate) input.select();

  input.addEventListener('blur', () => commitEdit(input.value));
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit(input.value, { moveNext: true });
    }
    if (e.key === 'Escape') cancelInlineEdit();
  });
}

function cancelInlineEdit() {
  if (!editingCell) return;
  const { id, field, td } = editingCell;
  const c = customers.find(x => x.id === id);
  if (c) {
    const display = field === 'opening_date'
      ? fmtDate(c[field])
      : (field === 'customer_name' ? escHtml(c[field]) : `₹${fmt(c[field])}`);
    td.innerHTML = display;
  }
  editingCell = null;
}

async function commitEdit(newVal, opts = {}) {
  if (!editingCell) return;
  const { id, field, td } = editingCell;
  editingCell = null;

  const numericFields = ['funding', 'payment_has_been_done', 'daily_recovery'];
  let payloadVal = newVal;
  if (numericFields.includes(field)) {
    const n = Number(newVal);
    if (newVal === '' || isNaN(n)) {
      showToast('Please enter a valid number', 'error');
      renderTable();
      return;
    }
    payloadVal = n;
  }

  const currentIndex = customers.findIndex(c => c.id === id);

  try {
    await api('PUT', `/customers/${id}`, { [field]: payloadVal });
    const c = customers.find(x => x.id === id);
    if (c) {
      c[field] = payloadVal;
      if (['funding', 'payment_has_been_done'].includes(field)) {
        const f = Number(c.funding);
        const { profitRate, staffRate, netRate, totalRate } = getActiveSlotRates();
        c.profit_28_percent        = (f * profitRate).toFixed(2);
        c.staff_commission         = (f * staffRate).toFixed(2);
        c.net_income               = (f * netRate).toFixed(2);
        c.total_payment_to_be_made = (f * totalRate).toFixed(2);
        c.balance_recovery         = (f * totalRate - Number(c.payment_has_been_done)).toFixed(2);
      }
    }
    summary = await api('GET', `/slots/summary/${activeSlotId}/${monthYear}`);
    renderTable();
    renderSummary();
    renderDailyCollections();

    if (opts.moveNext && currentIndex >= 0 && currentIndex < customers.length - 1) {
      const nextCustomer = customers[currentIndex + 1];
      const nextTd = document.querySelector(
        `#ledgerBody tr[data-id="${nextCustomer.id}"] td[data-field="${field}"]`
      );
      if (nextTd) startInlineEdit(nextTd);
    }
  } catch (e) {
    showToast(e.message || 'Update failed', 'error');
    renderTable();
  }
}

// ─── Summary panel ───────────────────────────────────────────────────
function renderSummary() {
  const panel = document.getElementById('summaryPanel');
  if (!summary) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';

  document.getElementById('customerBadge').textContent = `${summary.total_customers || 0} customers`;

  const total     = Number(summary.total_funding_and_profit) || 0;
const rawBalance       = Number(summary.total_balance_recovery || 0);
const actualRecovery   = Number(summary.actual_recovery || 0);
const totalDailyIncome = dailyData.reduce((sum, d) => sum + Number(d.amount_collected || 0), 0);
const liveBalance      = rawBalance - totalDailyIncome;

// Total Recovery Done = money actually recovered so far
const recoveredAmount = actualRecovery + totalDailyIncome;
const pct = total > 0 ? Math.max(0, Math.min((recoveredAmount / total * 100), 100)).toFixed(1) : 0;
const pctNum = Number(pct);

// Total Recovery Left = what's still outstanding (previous calculation)
const leftPct = total > 0 ? Math.max(0, Math.min((liveBalance / total * 100), 100)).toFixed(1) : 0;

let tierClass, pctClass;
if (pctNum < 25) {
  tierClass = 'tier-critical'; pctClass = 'recovery-pct-critical';
} else if (pctNum < 50) {
  tierClass = 'tier-low'; pctClass = 'recovery-pct-low';
} else if (pctNum < 75) {
  tierClass = 'tier-mid'; pctClass = 'recovery-pct-mid';
} else {
  tierClass = 'tier-good'; pctClass = 'recovery-pct-good';
}

const pctEl  = document.getElementById('recoveryPct');
const fillEl = document.getElementById('recoveryFill');

pctEl.textContent  = `${pct}%`;
fillEl.style.width = `${pct}%`;

pctEl.className  = `mono ${pctClass}`;
fillEl.className = `recovery-fill ${tierClass}`;

// ── NEW: Total Recovery Left bar ──
const leftPctEl    = document.getElementById('recoveryLeftPct');
const leftFillEl   = document.getElementById('recoveryLeftFill');
const leftAmountEl = document.getElementById('recoveryLeftAmount');
if (leftPctEl && leftFillEl) {
  leftPctEl.textContent  = `${leftPct}%`;
  leftFillEl.style.width = `${leftPct}%`;
}
if (leftAmountEl) {
  leftAmountEl.textContent = `₹${fmt(liveBalance)}`;
}

const slot = slots.find(s => s.id === activeSlotId);

const kothiRow = document.getElementById('kothiRow');
if (kothiRow) {
  kothiRow.innerHTML = `
    <span class="kothi-label">🏦 Kothi Capital</span>
    <span class="slot-card-kothi-val-wrap">
      <span class="kothi-value mono" id="kothiValue">₹${fmt(slot?.kothi_amount)}</span>
      <button type="button" class="kothi-edit-btn" id="kothiEditBtn" title="Edit Kothi Capital">✎</button>
    </span>
  `;
  const kothiEditBtn = document.getElementById('kothiEditBtn');
  if (kothiEditBtn) {
    kothiEditBtn.onclick = () => startKothiEdit(activeSlotId, kothiEditBtn);
  }
}

const receivedCapitalRow = document.getElementById('receivedCapitalRow');
if (receivedCapitalRow) {
  receivedCapitalRow.innerHTML = `
    <span class="kothi-label">💼 Received Capital</span>
    <span class="slot-card-kothi-val-wrap">
      <span class="kothi-value mono" id="receivedCapitalValue">₹${fmt(slot?.received_capital)}</span>
      <button type="button" class="kothi-edit-btn" id="receivedCapitalEditBtn" title="Edit Received Capital">✎</button>
    </span>
  `;
  const receivedCapitalEditBtn = document.getElementById('receivedCapitalEditBtn');
  if (receivedCapitalEditBtn) {
    receivedCapitalEditBtn.onclick = () => startReceivedCapitalEdit(activeSlotId, receivedCapitalEditBtn);
  }
}

const pLabel   = profitPctLabel();
const netLabel = netIncomePctLabel();

const closedFunding    = Number(summary.closed_funding_total || 0);
const totalRunningFund = Number(summary.running_funding || 0) - closedFunding;

  const rows = [
    { label: '🔄 Total Running Funding (Total Funding (−) Closed Funding)', val: totalRunningFund, color: 'text-sky' },
  { label: 'This Month Funding',           val: summary.this_month_funding,       color: 'text-green', isHighlight: true },
  { label: `Net Income (${netLabel})`,      val: summary.total_net_income,          color: 'text-green', isHighlight: true },
  { label: `Staff Commission (${staffPctLabel()})`, val: summary.total_staff_commission, color: 'text-green', isHighlight: true },
  { label: '✅ This Month Closed Funding',             val: closedFunding,                     color: 'text-green', isHighlight: true },
  { label: 'Total Income Collected In This Month',     val: totalDailyIncome,                  color: 'text-green', isHighlight: true },
  { label: 'Total Funding',         val: summary.running_funding,           color: 'text-sapphire', isHighlightBlue: true },
  { label: `Total Profit (${pLabel})`,      val: summary.total_profit_28,           color: 'text-sapphire', isHighlightBlue: true },
  { label: 'Total Funding + Profit',        val: summary.total_funding_and_profit,  color: 'text-sapphire', isHighlightBlue: true },
  { label: 'Previous Month Recovery',               val: summary.actual_recovery,           color: 'text-sapphire', isHighlightBlue: true },
  { label: 'Balance',                       val: summary.total_balance_recovery,    color: 'text-sapphire', isHighlightBlue: true },
   
];

  document.getElementById('summaryRows').innerHTML = rows.map(r => `
    <div class="summary-row${r.isLive ? ' summary-row-live' : ''}${r.isClosed ? ' summary-row-closed' : ''}${r.isHighlight ? ' summary-row-highlight-green' : ''}${r.isHighlightBlue ? ' summary-row-highlight-blue' : ''}">
      <span class="summary-row-label">${r.label}</span>
      <span class="summary-row-val ${r.color}">₹${fmt(r.val)}</span>
    </div>
  `).join('');
}

// ─── Add Customer Modal ──────────────────────────────────────────────
function openAddModal() {
  if (currentRole !== 'admin') return;
  if (!activeSlotId) { showToast('Please open a slot first.', 'error'); return; }
  document.getElementById('f_name').value    = '';
  document.getElementById('f_date').value    = new Date().toISOString().split('T')[0];
  document.getElementById('f_funding').value = '';
  document.getElementById('f_payment').value = '';
  document.getElementById('calcPreview').style.display = 'none';

  const profitLabelEl = document.getElementById('modal_profit_label');
  if (profitLabelEl) profitLabelEl.textContent = `${profitPctLabel()} Profit:`;
  const staffLabelEl = document.getElementById('modal_staff_label');
  if (staffLabelEl) staffLabelEl.textContent = `${staffPctLabel()} Commission:`;

  document.getElementById('addModal').style.display = 'flex';
}
function closeAddModal() { document.getElementById('addModal').style.display = 'none'; }
function handleOverlayClick(e) { if (e.target === document.getElementById('addModal')) closeAddModal(); }

function updateCalcPreview() {
  const f = Number(document.getElementById('f_funding').value) || 0;
  const p = Number(document.getElementById('f_payment').value) || 0;
  if (f <= 0) { document.getElementById('calcPreview').style.display = 'none'; return; }
  const { profitRate, staffRate, totalRate } = getActiveSlotRates();
  document.getElementById('calcPreview').style.display = 'block';
  document.getElementById('c_profit').textContent = `₹${fmt(f * profitRate)}`;
  document.getElementById('c_comm').textContent   = `₹${fmt(f * staffRate)}`;
  document.getElementById('c_due').textContent    = `₹${fmt(f * totalRate)}`;
  document.getElementById('c_bal').textContent    = `₹${fmt(f * totalRate - p)}`;
}

async function submitAddCustomer() {
  const name    = document.getElementById('f_name').value.trim();
  const date    = document.getElementById('f_date').value;
  const funding = document.getElementById('f_funding').value;
  const payment = document.getElementById('f_payment').value || 0;
  if (!activeSlotId)    { showToast('No slot selected', 'error'); return; }
  if (!name || !funding){ showToast('Customer name and funding are required', 'error'); return; }
  try {
    await api('POST', '/customers', {
      slot_id:               activeSlotId,
      month_year:            monthYear,
      customer_name:         name,
      opening_date:          date,
      funding:               Number(funding),
      payment_has_been_done: Number(payment),
    });
    showToast('Customer added!');
    closeAddModal();
    await loadData();
  } catch (e) {
    showToast(e.message || 'Error adding customer', 'error');
  }
}
// ─── Daily Collection Quick-Entry Modal ──────────────────────────────
function openDailyEntryModal() {
  if (currentRole !== 'admin') return;
  if (!activeSlotId) { showToast('Please open a slot first.', 'error'); return; }
  document.getElementById('de_date').value   = new Date().toISOString().split('T')[0];
  document.getElementById('de_income').value = '';
  document.getElementById('de_khata').value  = '';
  document.getElementById('de_target').value = '';
  document.getElementById('dailyEntryModal').style.display = 'flex';
}
function closeDailyEntryModal() { document.getElementById('dailyEntryModal').style.display = 'none'; }
function handleDailyEntryOverlayClick(e) {
  if (e.target === document.getElementById('dailyEntryModal')) closeDailyEntryModal();
}

async function submitDailyEntry() {
  const dateVal = document.getElementById('de_date').value;
  const income  = document.getElementById('de_income').value || 0;
  const khata   = document.getElementById('de_khata').value || 0;
  const target  = document.getElementById('de_target').value || 0;

  if (!activeSlotId) { showToast('No slot selected', 'error'); return; }
  if (!dateVal)       { showToast('Please pick a date', 'error'); return; }

  const [yy, mm, dd] = dateVal.split('-').map(Number);
  const entryMonthYear = `${yy}-${String(mm).padStart(2, '0')}`;
  const dayNumber       = dd;

  try {
    await api('POST', '/daily-collections', {
      slot_id:      activeSlotId,
      month_year:   entryMonthYear,
      day_number:   dayNumber,
      amount:       Number(income),
      khata_amount: Number(khata),
    });
    if (Number(target) > 0) {
      await api('POST', '/daily-collections/target', {
        slot_id:       activeSlotId,
        month_year:    entryMonthYear,
        day_number:    dayNumber,
        target_income: Number(target),
      });
    }

    showToast('Entry saved!');
    closeDailyEntryModal();

    // If the picked date is in a different month, switch the view to it
    if (entryMonthYear !== monthYear) {
      const sel = document.getElementById('monthSelect');
      let opt = Array.from(sel.options).find(o => o.value === entryMonthYear);
      if (!opt) { opt = new Option(monthLabel(entryMonthYear), entryMonthYear); sel.insertBefore(opt, sel.options[0]); }
      sel.value = entryMonthYear;
      monthYear = entryMonthYear;
    }
    await loadData();
  } catch (e) {
    showToast(e.message || 'Error saving entry', 'error');
  }
}
// ─── % Achieved (Daily Ledger) per slot, for the welcome-screen chart ──
async function computeAchievedPct() {
  const my = currentMonthYear();
  await Promise.all(slots.map(async (s) => {
    try {
      const res = await api('GET', `/daily-collections/${s.id}/${my}`);
      const days = res.days || [];
      const totalIncome = days.reduce((sum, d) => sum + Number(d.amount_collected || 0), 0);
      const totalTarget = days.reduce((sum, d) => sum + Number(d.target_income || 0), 0);
      s.achieved_pct = totalTarget > 0
        ? Number(((totalIncome / totalTarget) * 100).toFixed(1))
        : 0;
    } catch {
      s.achieved_pct = 0;
    }
  }));
}

// ─── Init ────────────────────────────────────────────────────────────
async function startApp() {
  buildMonthSelector();
  initHistoryState();
  setSlotActionsVisible(false);
  try {
    slots = await api('GET', `/slots?month_year=${currentMonthYear()}`);
    await computeAchievedPct();
    renderSlotCards();
    renderRecoveryChart();
    showWelcome();
    document.getElementById('homeBtn').addEventListener('click', goToWelcomeWithHistory);
  } catch {
    showToast('Could not connect to server', 'error');
  }
}

checkSession();

// ═══════════════════════════════════════════════════════════════════
// DAILY LEDGER
// ═══════════════════════════════════════════════════════════════════
let dailyData       = [];
let openingAmount   = 0;
let saveTimers      = {};
let openingSaveTimer = null;

// ─── Khata day notes (client-side only, NEVER sent to the server /
//     stored in the database — persisted in this browser's localStorage) ──
let dayNotes = {};
let activeNotePopover = null;

function notesKey() {
  return `khata_notes_${activeSlotId}_${monthYear}`;
}
function loadDayNotes() {
  try { dayNotes = JSON.parse(localStorage.getItem(notesKey())) || {}; }
  catch { dayNotes = {}; }
}
function saveDayNotes() {
  try { localStorage.setItem(notesKey(), JSON.stringify(dayNotes)); } catch {}
}

function closeNotePopover() {
  if (activeNotePopover) {
    activeNotePopover.remove();
    activeNotePopover = null;
    document.removeEventListener('mousedown', handleNotePopoverOutsideClick);
  }
}
function handleNotePopoverOutsideClick(e) {
  if (activeNotePopover && !activeNotePopover.contains(e.target) && !e.target.classList.contains('note-btn')) {
    closeNotePopover();
  }
}

function openNotePopover(day, btn) {
  closeNotePopover();
  const existing = dayNotes[day] || '';
  const isAdmin  = currentRole === 'admin';

  const pop = document.createElement('div');
  pop.className = 'note-popover';
  pop.innerHTML = `
    <textarea class="note-textarea" placeholder="Add a note for day ${day}…" ${isAdmin ? '' : 'readonly'}>${escHtml(existing)}</textarea>
    <div class="note-popover-actions">
      ${isAdmin ? `
        <button type="button" class="note-btn-delete">Delete</button>
        <button type="button" class="note-btn-save">Save</button>
      ` : `<button type="button" class="note-btn-save">Close</button>`}
    </div>
  `;
  document.body.appendChild(pop);

  const rect = btn.getBoundingClientRect();
  const top  = window.scrollY + rect.bottom + 6;
  let left   = window.scrollX + rect.left - 190;
  if (left < 8) left = 8;
  pop.style.position = 'absolute';
  pop.style.top  = `${top}px`;
  pop.style.left = `${left}px`;

  activeNotePopover = pop;
  const textarea = pop.querySelector('.note-textarea');
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  pop.querySelector('.note-btn-save').addEventListener('click', () => {
    if (isAdmin) {
      const val = textarea.value.trim();
      if (val) dayNotes[day] = val; else delete dayNotes[day];
      saveDayNotes();
    }
    closeNotePopover();
    renderDailyCollections();
  });

  const delBtn = pop.querySelector('.note-btn-delete');
  if (delBtn) {
    delBtn.addEventListener('click', () => {
      delete dayNotes[day];
      saveDayNotes();
      closeNotePopover();
      renderDailyCollections();
    });
  }

  textarea.addEventListener('keydown', e => { if (e.key === 'Escape') closeNotePopover(); });
  setTimeout(() => document.addEventListener('mousedown', handleNotePopoverOutsideClick), 0);
}

function getDaysInMonth(my) {
  const [y, m] = my.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
function getDateForDay(my, day) {
  const [y, m] = my.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', weekday: 'short' });
}
function isToday(my, day) {
  const now = new Date();
  const [y, m] = my.split('-').map(Number);
  return now.getFullYear() === y && (now.getMonth() + 1) === m && now.getDate() === day;
}
function isFuture(my, day) {
  const now = new Date();
  const [y, m] = my.split('-').map(Number);
  return new Date(y, m - 1, day) > new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

async function loadDailyCollections() {
  try {
    const res     = await api('GET', `/daily-collections/${activeSlotId}/${monthYear}`);
    openingAmount = Number(res.opening_amount || 0);
    dailyData     = res.days || [];
  } catch {
    openingAmount = 0;
    dailyData     = [];
  }
  loadDayNotes();
  renderDailyCollections();
}

function renderDailyCollections() {
  const daysInMonth = getDaysInMonth(monthYear);

  const input = document.getElementById('openingPawanaInput');
  if (input && document.activeElement !== input) input.value = openingAmount || '';

  const tbody = document.getElementById('dailyBody');
  const tfoot = document.getElementById('dailyFoot');
  tbody.innerHTML = '';
  tfoot.innerHTML = '';

 const rawBalance          = Number(summary?.total_balance_recovery || 0);
  const totalDailyIncome    = dailyData.reduce((sum, d) => sum + Number(d.amount_collected || 0), 0);
  const liveBalance         = rawBalance - totalDailyIncome;
 const totalFunding = Number(summary?.running_funding || 0);
const closedFunding = Number(summary?.closed_funding_total || 0);

// Running Funding = Total Funding − Closed Funding
const totalRunningFunding = Math.max(0, totalFunding - closedFunding);

// Suggested target = Running Funding / 50
const suggestedTarget = totalRunningFunding / 50;
  const suggestedEl = document.getElementById('suggestedTargetVal');
  if (suggestedEl) suggestedEl.textContent = `₹${fmt(suggestedTarget)}`;

  let totalIncome = 0;
  let totalKhata  = 0;
  let totalTarget = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const rec           = dailyData.find(d => d.day_number === day) || {};
    const income        = Number(rec.amount_collected || 0);
    const khata         = Number(rec.khata_amount || 0);
    const targetIncome  = Number(rec.target_income || 0);
    const openingPawana = Number(rec.opening_pawana || 0);
    const closingPawana = Number(rec.closing_pawana || 0);

    totalIncome += income;
    totalKhata  += khata;
    totalTarget += targetIncome;

    const future      = isFuture(monthYear, day);
    const todayBadge  = isToday(monthYear, day) ? ' today' : '';
    const pawanaClass = closingPawana >= 0 ? 'text-green' : 'text-red';

    let pctAchieved  = targetIncome > 0 ? (income / targetIncome) * 100 : 0;
    let achievedClass = pctAchieved >= 100 ? 'achieved-good' : pctAchieved >= 50 ? 'achieved-mid' : 'achieved-low';

    const hasNote = !!dayNotes[day];

    const tr = document.createElement('tr');
    if (future) tr.classList.add('future-row');
    tr.innerHTML = `
      <td class="text-center"><span class="day-badge${todayBadge}">${day}</span></td>
      <td class="text-left text-muted" style="font-size:0.78rem">${getDateForDay(monthYear, day)}</td>
      <td class="text-right text-sky">₹${fmt(openingPawana)}</td>
      <td class="text-right" style="padding:4px 12px">
        <input class="collect-input" type="number" value="${income || ''}" placeholder="0"
          data-day="${day}" ${future ? 'disabled' : ''} />
      </td>
      <td class="text-right" style="padding:4px 12px">
        <div class="khata-cell">
          <input class="collect-input khata-input" type="number" value="${khata || ''}" placeholder="0"
            data-day="${day}" ${future ? 'disabled' : ''} />
          <button type="button" class="note-btn ${hasNote ? 'has-note' : ''}" data-day="${day}"
            title="${hasNote ? escHtml(dayNotes[day]) : 'Add note'}">📝</button>
        </div>
      </td>
      <td class="text-right ${pawanaClass}" style="font-weight:700">₹${fmt(closingPawana)}</td>
      <td class="text-right" style="padding:4px 12px">
        <input class="collect-input target-input" type="number" value="${targetIncome || ''}" placeholder="0"
          data-day="${day}" ${future ? 'disabled' : ''} />
      </td>
      <td class="text-center"><span class="achieved-badge ${achievedClass}">${pctAchieved.toFixed(1)}%</span></td>
    `;
    tbody.appendChild(tr);
  }
  const spacer = document.createElement('tr');
  spacer.innerHTML = `<td colspan="8" style="height:44px;padding:0;border:none;"></td>`;
  tbody.appendChild(spacer);

  tbody.querySelectorAll('.collect-input:not(.khata-input):not(.target-input)').forEach(input => {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const day = parseInt(input.dataset.day);
      saveDaily(day, input.value, true);
    }
  });
});

 tbody.querySelectorAll('.khata-input').forEach(input => {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const day = parseInt(input.dataset.day);
      saveKhata(day, input.value, true);
    }
  });
});

  tbody.querySelectorAll('.target-input').forEach(input => {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const day = parseInt(input.dataset.day);
      saveTarget(day, input.value, true);
    }
  });
});

  // ── Khata note button ──
  tbody.querySelectorAll('.note-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openNotePopover(parseInt(btn.dataset.day), btn);
    });
  });

  const lastDay      = dailyData.find(d => d.day_number === daysInMonth) || {};
  const finalClosing = Number(lastDay.closing_pawana ?? openingAmount);
  const overallPct   = totalTarget > 0 ? (totalIncome / totalTarget * 100) : 0;

  tfoot.innerHTML = `<tr>
  <td class="text-center text-muted" style="font-size:0.72rem"></td>
  <td class="text-left text-muted" style="font-size:0.72rem">TOTALS</td>
  <td class="text-right text-muted" style="font-size:0.72rem"></td>
  <td class="text-right text-green">₹${fmt(totalIncome)}</td>
  <td class="text-right text-purple">₹${fmt(totalKhata)}</td>
  <td class="text-right ${finalClosing >= 0 ? 'text-green' : 'text-red'}">₹${fmt(finalClosing)}</td>
  <td class="text-right text-yellow">₹${fmt(totalTarget)}</td>
  <td class="text-center">${overallPct.toFixed(1)}%</td>
</tr>`;

  renderSummary();
}

async function saveDaily(day, value, moveNext) {
  const amount = Number(value) || 0;
  try {
    await api('POST', '/daily-collections', { slot_id: activeSlotId, month_year: monthYear, day_number: day, amount });
    await loadDailyCollections();
    if (moveNext) focusInputForDay(day + 1, false);
  } catch { showToast('Failed to save', 'error'); }
}

async function saveKhata(day, value, moveNext) {
  const khata_amount = Number(value) || 0;
  try {
    await api('POST', '/daily-collections/khata', { slot_id: activeSlotId, month_year: monthYear, day_number: day, khata_amount });
    await loadDailyCollections();
    if (moveNext) focusInputForDay(day + 1, 'khata');
  } catch { showToast('Failed to save Khata', 'error'); }
}

async function saveTarget(day, value, moveNext) {
  const target_income = Number(value) || 0;
  try {
    await api('POST', '/daily-collections/target', { slot_id: activeSlotId, month_year: monthYear, day_number: day, target_income });
    await loadDailyCollections();
    if (moveNext) focusInputForDay(day + 1, 'target');
  } catch { showToast('Failed to save target', 'error'); }
}

function focusInputForDay(day, kind) {
  const daysInMonth = getDaysInMonth(monthYear);
  if (day > daysInMonth) return;
  let selector;
  if (kind === 'target') selector = `.collect-input.target-input[data-day="${day}"]`;
  else if (kind === true || kind === 'khata') selector = `.collect-input.khata-input[data-day="${day}"]`;
  else selector = `.collect-input:not(.khata-input):not(.target-input)[data-day="${day}"]`;
  const input = document.querySelector(selector);
  if (input && !input.disabled) {
    input.focus();
    input.select();
  }
}

function handleOpeningPawanaInput() {
  const input = document.getElementById('openingPawanaInput');
  clearTimeout(openingSaveTimer);
  openingSaveTimer = setTimeout(() => saveOpeningPawana(input.value), 800);
}

async function saveOpeningPawana(value) {
  const amount = Number(value) || 0;
  try {
    await api('POST', '/opening-pawana', { slot_id: activeSlotId, month_year: monthYear, opening_amount: amount });
    openingAmount = amount;
    await loadDailyCollections();
    showToast('Opening Pawana saved');
  } catch { showToast('Failed to save opening Pawana', 'error'); }
}

// ─── Carry Forward ───────────────────────────────────────────────────
function openCarryModal() {
  if (currentRole !== 'admin') return;
  if (!activeSlotId || !monthYear) { showToast('Please select a slot and month first.', 'error'); return; }

  const [y, m] = monthYear.split('-').map(Number);
  const nextDate = new Date(y, m, 1);
  const toMonth  = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;

  document.getElementById('carry_from').value = monthLabel(monthYear);
  document.getElementById('carry_to').value   = monthLabel(toMonth);

  const rows = Array.from(document.querySelectorAll('#ledgerBody tr[data-id]'));
  let active = 0, closed = 0;
  rows.forEach(r => {
    r.classList.contains('closed') ? closed++ : active++;
  });

  const info = document.getElementById('carryInfo');
  info.innerHTML = `
    <div class="carry-counts">
      <div class="carry-count-item carry-count-active">
        <span class="carry-count-num">${active}</span>
        <span class="carry-count-label">Active — Will be copied</span>
      </div>
      <div class="carry-count-item carry-count-closed">
        <span class="carry-count-num">${closed}</span>
        <span class="carry-count-label">Closed — Will be skipped</span>
      </div>
    </div>
  `;

  const confirmBtn = document.getElementById('carryConfirmBtn');
  if (active === 0) {
    confirmBtn.disabled = true;
    info.innerHTML += `<p style="color:#f87171;font-size:0.78rem;margin-top:10px;text-align:center;">No active customers found to carry forward.</p>`;
  } else {
    confirmBtn.disabled    = false;
    confirmBtn.textContent = '✅ Carry Forward Active Customers';
  }
  document.getElementById('carryModal').style.display = 'flex';
}
function exportToExcel() {
  if (currentRole !== 'admin') return;
  if (!activeSlotId || !monthYear) { showToast('Please select a slot and month first.', 'error'); return; }
  window.location.href = `/api/export/${activeSlotId}/${monthYear}`;
}

function closeCarryModal() { document.getElementById('carryModal').style.display = 'none'; }
function handleCarryOverlayClick(e) { if (e.target === document.getElementById('carryModal')) closeCarryModal(); }

async function submitCarryForward() {
  const [y, m] = monthYear.split('-').map(Number);
  const nextDate = new Date(y, m, 1);
  const toMonth  = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;

  const btn = document.getElementById('carryConfirmBtn');
  btn.disabled    = true;
  btn.textContent = 'Copying…';

  try {
    const res  = await fetch('/api/carry-forward', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ slot_id: activeSlotId, from_month: monthYear, to_month: toMonth }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');

    showToast('✅ ' + data.message, 'success');
    closeCarryModal();

    setTimeout(() => {
      if (confirm(`Carry forward complete!\n\n${data.message}\n\nSwitch to ${monthLabel(toMonth)} now?`)) {
        const sel = document.getElementById('monthSelect');
        let opt = Array.from(sel.options).find(o => o.value === toMonth);
        if (!opt) { opt = new Option(monthLabel(toMonth), toMonth); sel.insertBefore(opt, sel.options[0]); }
        sel.value = toMonth;
        monthYear = toMonth;
        loadData();
      }
    }, 300);
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
    btn.disabled    = false;
    btn.textContent = '✅ Carry Forward Active Customers';
  }
}
// ═══════════════════════════════════════════════════════════════════
// LEDGER SEARCH (customer name) — highlight + jump to matching rows
// ═══════════════════════════════════════════════════════════════════
let searchMatches = [];
let searchActiveIndex = -1;

function onLedgerSearchInput() {
  const input = document.getElementById('ledgerSearchInput');
  const query = input.value.trim().toLowerCase();

  clearSearchHighlights();

  const countEl = document.getElementById('searchResultCount');
  const prevBtn = document.getElementById('searchPrevBtn');
  const nextBtn = document.getElementById('searchNextBtn');
  const clearBtn = document.getElementById('searchClearBtn');

  if (!query) {
    searchMatches = [];
    searchActiveIndex = -1;
    countEl.style.display = 'none';
    prevBtn.style.display = 'none';
    nextBtn.style.display = 'none';
    clearBtn.style.display = 'none';
    return;
  }

  clearBtn.style.display = 'inline-flex';

  const rows = Array.from(document.querySelectorAll('#ledgerBody tr[data-id]'));
  searchMatches = rows.filter(tr => {
    const nameCell = tr.querySelector('[data-field="customer_name"]');
    const name = nameCell ? nameCell.textContent.trim().toLowerCase() : '';
    return name.includes(query);
  });

  searchMatches.forEach(tr => tr.classList.add('search-match-row'));

  if (searchMatches.length === 0) {
    countEl.textContent = 'No matches';
    countEl.style.display = 'inline';
    prevBtn.style.display = 'none';
    nextBtn.style.display = 'none';
    searchActiveIndex = -1;
    return;
  }

  prevBtn.style.display = 'inline-flex';
  nextBtn.style.display = 'inline-flex';
  searchActiveIndex = 0;
  updateSearchActiveRow();
}

function updateSearchActiveRow() {
  searchMatches.forEach(tr => tr.classList.remove('search-active-row'));
  const countEl = document.getElementById('searchResultCount');

  if (searchMatches.length === 0 || searchActiveIndex < 0) return;

  const activeRow = searchMatches[searchActiveIndex];
  activeRow.classList.add('search-active-row');
  activeRow.scrollIntoView({ behavior: 'smooth', block: 'center' });

  countEl.textContent = `${searchActiveIndex + 1} / ${searchMatches.length}`;
  countEl.style.display = 'inline';
}

function gotoNextMatch() {
  if (searchMatches.length === 0) return;
  searchActiveIndex = (searchActiveIndex + 1) % searchMatches.length;
  updateSearchActiveRow();
}

function gotoPrevMatch() {
  if (searchMatches.length === 0) return;
  searchActiveIndex = (searchActiveIndex - 1 + searchMatches.length) % searchMatches.length;
  updateSearchActiveRow();
}

function handleLedgerSearchKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (e.shiftKey) gotoPrevMatch(); else gotoNextMatch();
  } else if (e.key === 'Escape') {
    clearLedgerSearch();
  }
}

function clearLedgerSearch() {
  const input = document.getElementById('ledgerSearchInput');
  input.value = '';
  clearSearchHighlights();
  searchMatches = [];
  searchActiveIndex = -1;
  document.getElementById('searchResultCount').style.display = 'none';
  document.getElementById('searchPrevBtn').style.display = 'none';
  document.getElementById('searchNextBtn').style.display = 'none';
  document.getElementById('searchClearBtn').style.display = 'none';
  input.focus();
}

function clearSearchHighlights() {
  document.querySelectorAll('#ledgerBody tr').forEach(tr => {
    tr.classList.remove('search-match-row', 'search-active-row');
  });
}
window.exportToExcel = exportToExcel;