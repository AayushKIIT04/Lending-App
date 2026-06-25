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
  const isRaigarh = slot?.slot_name?.toLowerCase().includes('raigarh');
  const profitRate = isRaigarh ? 0.22 : 0.28;
  const staffRate  = 0.08;
  const netRate    = profitRate - staffRate;
  const totalRate  = 1 + profitRate;
  return { profitRate, staffRate, netRate, totalRate };
}
function profitPctLabel()   { return slots.find(s => s.id === activeSlotId)?.slot_name?.toLowerCase().includes('raigarh') ? '22%' : '28%'; }
function netIncomePctLabel(){ return slots.find(s => s.id === activeSlotId)?.slot_name?.toLowerCase().includes('raigarh') ? '14%' : '20%'; }

// ─── Live balance helper ─────────────────────────────────────────────
function getLiveBalance() {
  const rawBalance = Number(summary?.total_balance_recovery || 0);
  const totalDailyIncome = dailyData.reduce((sum, d) => sum + Number(d.amount_collected || 0), 0);
  return rawBalance - totalDailyIncome;
}

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
    .btn-gold, .btn-carry, .status-btn, .del-btn { display: none !important; }
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
      <div class="slot-card-cta">View Ledger →</div>
    `;
    card.addEventListener('click', () => openSlot(s.id));
    grid.appendChild(card);
  });
}

function setSlotActionsVisible(visible) {
  const display     = visible ? '' : 'none';
  const carryBtn    = document.querySelector('.header-controls .btn-carry');
  const addBtn      = document.querySelector('.header-controls .btn-gold');
  const monthSelect = document.getElementById('monthSelect');
  if (carryBtn)    carryBtn.style.display    = display;
  if (addBtn)      addBtn.style.display      = display;
  if (monthSelect) monthSelect.style.display = display;
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
  document.getElementById('tableTitle').textContent =
    `${slot ? slot.slot_name : ''} — ${monthLabel(monthYear)}`;
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
  const netIncomeTh = document.getElementById('th_net_income');
  if (profitTh)    profitTh.textContent    = `Profit ${profitPctLabel()}`;
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

  // ── Inline edit ──
  tbody.querySelectorAll('td.editable').forEach(td => {
    td.addEventListener('dblclick', () => startInlineEdit(td));
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
      <td colspan="3" class="text-right text-muted" style="font-size:0.75rem;padding-right:12px">TOTALS</td>
      <td class="text-right text-blue"   style="font-weight:700">₹${fmt(summary.this_month_funding)}</td>
      <td class="text-right text-green"  style="font-weight:700">₹${fmt(summary.total_profit_28)}</td>
      <td class="text-right text-yellow" style="font-weight:700">₹${fmt(summary.total_staff_commission)}</td>
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
// DRAG-AND-DROP ROW REORDERING
// ═══════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════
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
  if (isName || isDate) input.style.textAlign = 'left';

  td.textContent = '';
  td.appendChild(input);
  input.focus();

  input.addEventListener('blur',    () => commitEdit(input.value));
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  commitEdit(input.value);
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

async function commitEdit(newVal) {
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
  const recovered = Number(summary.actual_recovery) || 0;
  const pct       = total > 0 ? Math.min((recovered / total * 100), 100).toFixed(1) : 0;
  document.getElementById('recoveryPct').textContent  = `${pct}%`;
  document.getElementById('recoveryFill').style.width = `${pct}%`;

  const slot = slots.find(s => s.id === activeSlotId);
  document.getElementById('kothiValue').textContent = `₹${fmt(slot?.kothi_amount)}`;

  const pLabel   = profitPctLabel();
  const netLabel = netIncomePctLabel();

  const rawBalance       = Number(summary.total_balance_recovery || 0);
  const totalDailyIncome = dailyData.reduce((sum, d) => sum + Number(d.amount_collected || 0), 0);
  const liveBalance      = rawBalance - totalDailyIncome;
  const closedFunding    = Number(summary.closed_funding_total || 0);

  const rows = [
    { label: 'This Month Funding',           val: summary.this_month_funding,       color: 'text-blue' },
    { label: 'Total Running Funding',         val: summary.running_funding,           color: 'text-sky' },
    { label: '✅ Closed Funding',             val: closedFunding,                     color: 'text-slate2', isClosed: true },
    { label: 'Total Funding + Profit',        val: summary.total_funding_and_profit,  color: 'text-purple' },
    { label: 'Actual Recovery ( Upto Previous Month )',               val: summary.actual_recovery,           color: 'text-green' },
     { label: 'Total Income Collected In This Month',     val: totalDailyIncome,                  color: 'text-green' },
    { label: '⚡ Live Balance (Updated according to Daily Income)', val: liveBalance,                       color: liveBalance <= 0 ? 'text-green' : 'text-orange', isLive: true },
    { label: `Total Profit (${pLabel})`,      val: summary.total_profit_28,           color: 'text-emerald' },
    { label: 'Staff Commission (8%)',         val: summary.total_staff_commission,    color: 'text-yellow' },
    { label: `Net Income (${netLabel})`,      val: summary.total_net_income,          color: 'text-rupee' },
  ];

  document.getElementById('summaryRows').innerHTML = rows.map(r => `
    <div class="summary-row${r.isLive ? ' summary-row-live' : ''}${r.isClosed ? ' summary-row-closed' : ''}">
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

// ─── Init ────────────────────────────────────────────────────────────
async function startApp() {
  buildMonthSelector();
  initHistoryState();
  setSlotActionsVisible(false);
  try {
    slots = await api('GET', '/slots');
    renderSlotCards();
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

  const rawBalance       = Number(summary?.total_balance_recovery || 0);
  const totalDailyIncome = dailyData.reduce((sum, d) => sum + Number(d.amount_collected || 0), 0);
  const liveBalance      = rawBalance - totalDailyIncome;
  const TARGET_DAYS      = 64;
  const dailyTarget      = liveBalance > 0 ? liveBalance / TARGET_DAYS : 0;

  let totalIncome = 0;
  let totalKhata  = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const rec           = dailyData.find(d => d.day_number === day) || {};
    const income        = Number(rec.amount_collected || 0);
    const khata         = Number(rec.khata_amount || 0);
    const openingPawana = Number(rec.opening_pawana || 0);
    const closingPawana = Number(rec.closing_pawana || 0);

    totalIncome += income;
    totalKhata  += khata;

    const future      = isFuture(monthYear, day);
    const todayBadge  = isToday(monthYear, day) ? ' today' : '';
    const pawanaClass = closingPawana >= 0 ? 'text-green' : 'text-red';

    let pctAchieved  = dailyTarget > 0 ? (income / dailyTarget) * 100 : 0;
    let achievedClass = pctAchieved >= 100 ? 'achieved-good' : pctAchieved >= 50 ? 'achieved-mid' : 'achieved-low';

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
        <input class="collect-input khata-input" type="number" value="${khata || ''}" placeholder="0"
          data-day="${day}" ${future ? 'disabled' : ''} />
      </td>
      <td class="text-right ${pawanaClass}" style="font-weight:700">₹${fmt(closingPawana)}</td>
      <td class="text-right target-val">₹${fmt(dailyTarget)}</td>
      <td class="text-center"><span class="achieved-badge ${achievedClass}">${pctAchieved.toFixed(1)}%</span></td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('.collect-input:not(.khata-input)').forEach(input => {
    input.addEventListener('input', () => {
      const day = parseInt(input.dataset.day);
      clearTimeout(saveTimers[day]);
      saveTimers[day] = setTimeout(() => saveDaily(day, input.value), 800);
    });
    input.addEventListener('blur', () => {
      const day = parseInt(input.dataset.day);
      clearTimeout(saveTimers[day]);
      saveDaily(day, input.value);
    });
  });

  tbody.querySelectorAll('.khata-input').forEach(input => {
    input.addEventListener('input', () => {
      const day = parseInt(input.dataset.day);
      clearTimeout(saveTimers['khata_' + day]);
      saveTimers['khata_' + day] = setTimeout(() => saveKhata(day, input.value), 800);
    });
    input.addEventListener('blur', () => {
      const day = parseInt(input.dataset.day);
      clearTimeout(saveTimers['khata_' + day]);
      saveKhata(day, input.value);
    });
  });

  const lastDay      = dailyData.find(d => d.day_number === daysInMonth) || {};
  const finalClosing = Number(lastDay.closing_pawana ?? openingAmount);
  const overallPct   = (dailyTarget * daysInMonth) > 0
    ? (totalIncome / (dailyTarget * daysInMonth) * 100) : 0;

  const liveBalClass = liveBalance <= 0 ? 'text-green' : 'text-orange';
  document.getElementById('dailyStats').innerHTML = `
    <div class="daily-stat">
      <span class="daily-stat-label">Opening Pawana (1st)</span>
      <span class="daily-stat-val text-sky">₹${fmt(openingAmount)}</span>
    </div>
    <div class="daily-stat">
      <span class="daily-stat-label">Total Income (This Month)</span>
      <span class="daily-stat-val text-green">₹${fmt(totalIncome)}</span>
    </div>
    <div class="daily-stat">
      <span class="daily-stat-label">Total Khata</span>
      <span class="daily-stat-val text-purple">₹${fmt(totalKhata)}</span>
    </div>
    <div class="daily-stat">
      <span class="daily-stat-label">Closing Pawana</span>
      <span class="daily-stat-val ${finalClosing >= 0 ? 'text-green' : 'text-red'}">₹${fmt(finalClosing)}</span>
    </div>
    <div class="daily-stat daily-stat-live">
      <span class="daily-stat-label">⚡ Live Balance (after daily)</span>
      <span class="daily-stat-val ${liveBalClass}">₹${fmt(liveBalance)}</span>
    </div>
    <div class="daily-stat">
      <span class="daily-stat-label">Target/Day (on live balance)</span>
      <span class="daily-stat-val text-yellow">₹${fmt(dailyTarget)}</span>
    </div>
  `;

  tfoot.innerHTML = `<tr>
    <td colspan="3" class="text-right text-muted" style="font-size:0.72rem">TOTALS</td>
    <td class="text-right text-green">₹${fmt(totalIncome)}</td>
    <td class="text-right text-purple">₹${fmt(totalKhata)}</td>
    <td class="text-right ${finalClosing >= 0 ? 'text-green' : 'text-red'}">₹${fmt(finalClosing)}</td>
    <td class="text-right text-yellow">₹${fmt(dailyTarget * daysInMonth)}</td>
    <td class="text-center">${overallPct.toFixed(1)}%</td>
  </tr>`;

  renderSummary();
}

async function saveDaily(day, value) {
  const amount = Number(value) || 0;
  try {
    await api('POST', '/daily-collections', { slot_id: activeSlotId, month_year: monthYear, day_number: day, amount });
    await loadDailyCollections();
  } catch { showToast('Failed to save', 'error'); }
}

async function saveKhata(day, value) {
  const khata_amount = Number(value) || 0;
  try {
    await api('POST', '/daily-collections/khata', { slot_id: activeSlotId, month_year: monthYear, day_number: day, khata_amount });
    await loadDailyCollections();
  } catch { showToast('Failed to save Khata', 'error'); }
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

  const rows = Array.from(document.querySelectorAll('#ledgerBody tr'));
  let active = 0, closed = 0;
  rows.forEach(r => {
    if (r.classList.contains('empty-row')) return;
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
window.exportToExcel = exportToExcel;