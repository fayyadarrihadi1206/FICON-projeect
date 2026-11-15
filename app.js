/* ============================================================
   FINANCE APP — app.js
   All logic: routing, localStorage, charts, calendar, etc.
   ============================================================ */

// ─────────────────────────────────────────
// DATA LAYER (localStorage)
// ─────────────────────────────────────────

const STORAGE_KEYS = {
  expenses: 'fa_expenses',
  income:   'fa_income',
};

function loadExpenses() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.expenses)) || []; }
  catch { return []; }
}
function saveExpenses(data) {
  localStorage.setItem(STORAGE_KEYS.expenses, JSON.stringify(data));
}
function loadIncome() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.income)) || {}; }
  catch { return {}; }
}
function persistIncome(data) {
  localStorage.setItem(STORAGE_KEYS.income, JSON.stringify(data));
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

function formatRp(n) {
  if (isNaN(n) || n === null || n === undefined) return 'Rp 0';
  return 'Rp ' + Number(n).toLocaleString('id-ID');
}

// Format ringkas untuk summary cards & savings: 3.000.000 → Rp 3 jt, 1.500.000 → Rp 1,5 jt
function formatRpShort(n) {
  if (isNaN(n) || n === null || n === undefined) return 'Rp 0';
  const num  = Number(n);
  const abs  = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  function compact(val, suffix) {
    // show 1 decimal only if meaningful, strip trailing ".0"
    const rounded = Math.round(val * 10) / 10;
    const str = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return sign + 'Rp ' + str.replace('.', ',') + ' ' + suffix;
  }

  if (abs >= 1_000_000_000) return compact(abs / 1_000_000_000, 'M');
  if (abs >= 1_000_000)     return compact(abs / 1_000_000,     'jt');
  if (abs >= 1_000)         return compact(abs / 1_000,         'rb');
  return sign + 'Rp ' + abs.toLocaleString('id-ID');
}

function toMonthKey(year, month) {
  // month is 0-indexed
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  // key: "2026-11"
  const [y, m] = key.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function currentMonthKey() {
  const d = new Date();
  return toMonthKey(d.getFullYear(), d.getMonth());
}

// ─────────────────────────────────────────
// SIDEBAR / NAVIGATION
// ─────────────────────────────────────────

let currentPage = 'dashboard';

function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('overlay').classList.add('active');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('active');
}

const PAGE_TITLES = {
  'dashboard':    'Dashboard',
  'add-expense':  'Tambah Pengeluaran',
  'income':       'Pendapatan',
  'savings':      'Tabungan Bulanan',
  'total-savings':'Total Tabungan',
};

function navigateTo(page) {
  closeSidebar();
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');

  document.querySelectorAll('.nav-list a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });

  document.getElementById('topbar-title').textContent = PAGE_TITLES[page] || page;
  currentPage = page;

  // Render the target page
  switch (page) {
    case 'dashboard':     renderDashboard(); break;
    case 'add-expense':   renderAddExpensePage(); break;
    case 'income':        renderIncomePage(); break;
    case 'savings':       renderSavingsPage(); break;
    case 'total-savings': renderTotalSavingsPage(); break;
  }
}

// ─────────────────────────────────────────
// LIVE CLOCK
// ─────────────────────────────────────────

function updateClock() {
  const now = new Date();
  const opts = { weekday:'short', day:'2-digit', month:'short', year:'numeric',
                 hour:'2-digit', minute:'2-digit', second:'2-digit' };
  document.getElementById('live-clock').textContent =
    now.toLocaleDateString('id-ID', opts).replace(',', ' •');
}
setInterval(updateClock, 1000);
updateClock();

// ─────────────────────────────────────────
// CALENDAR
// ─────────────────────────────────────────

function renderCalendar() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayDate = now.getDate();

  const expenses = loadExpenses();
  const monthKey = toMonthKey(year, month);
  const expenseDays = new Set(
    expenses
      .filter(e => e.date && e.date.startsWith(monthKey))
      .map(e => Number(e.date.split('-')[2]))
  );

  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthName = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const dayNames = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];

  let html = `<div class="cal-header"><span>${monthName}</span></div>`;
  html += `<div class="cal-grid">`;
  dayNames.forEach(d => { html += `<div class="cal-day-name">${d}</div>`; });

  // empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    html += `<div class="cal-day empty"></div>`;
  }
  for (let d = 1; d <= daysInMonth; d++) {
    let cls = 'cal-day';
    if (d === todayDate) cls += ' today';
    if (expenseDays.has(d)) cls += ' has-expense';
    html += `<div class="${cls}">${d}</div>`;
  }
  html += `</div>`;

  document.getElementById('calendar-container').innerHTML = html;
}

// ─────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────

let chartMonthOffset = 0; // 0 = current month, -1 = previous, etc.
let expenseChart = null;

function renderDashboard() {
  renderCalendar();
  renderSummaryCards();
  renderExpenseChart();
}

function renderSummaryCards() {
  const mk = getChartMonthKey();
  const expenses = loadExpenses();
  const income = loadIncome();

  const totalExp = expenses
    .filter(e => e.date && e.date.startsWith(mk))
    .reduce((s, e) => s + Number(e.amount), 0);

  const totalInc = Number(income[mk] || 0);
  const saving = totalInc - totalExp;

  // Update label dengan nama bulan yang sedang ditampilkan
  const bulan = monthLabel(mk);
  document.getElementById('label-income').textContent  = `Pendapatan — ${bulan}`;
  document.getElementById('label-expense').textContent = `Pengeluaran — ${bulan}`;
  document.getElementById('label-saving').textContent  = `Tabungan — ${bulan}`;

  document.getElementById('dash-income').textContent  = formatRpShort(totalInc);
  document.getElementById('dash-expense').textContent = formatRpShort(totalExp);
  document.getElementById('dash-saving').textContent  = formatRpShort(saving);
}

function getChartMonthKey() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + chartMonthOffset, 1);
  return toMonthKey(d.getFullYear(), d.getMonth());
}

function changeChartMonth(delta) {
  chartMonthOffset += delta;
  renderExpenseChart();
  renderSummaryCards();
}

function renderExpenseChart() {
  const mk = getChartMonthKey();
  const [year, month] = mk.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();

  document.getElementById('chart-month-label').textContent = monthLabel(mk);

  // Disable next button if at current month
  const now = new Date();
  const currentMk = toMonthKey(now.getFullYear(), now.getMonth());
  document.getElementById('btn-next-month').disabled = (mk >= currentMk);

  const expenses = loadExpenses();
  const dailyTotals = Array(daysInMonth).fill(0);
  expenses
    .filter(e => e.date && e.date.startsWith(mk))
    .forEach(e => {
      const day = Number(e.date.split('-')[2]);
      if (day >= 1 && day <= daysInMonth) {
        dailyTotals[day - 1] += Number(e.amount);
      }
    });

  const labels = Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`);

  const ctx = document.getElementById('expenseChart').getContext('2d');

  if (expenseChart) expenseChart.destroy();

  expenseChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Pengeluaran (Rp)',
        data: dailyTotals,
        borderColor: '#a78bfa',
        backgroundColor: 'rgba(167,139,250,0.08)',
        pointBackgroundColor: '#a78bfa',
        pointBorderColor: '#0d0d0d',
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.4,
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          labels: { color: '#f0f0f0', font: { size: 12 }, cursor: 'default' },
          onClick: () => {}
        },
        tooltip: {
          backgroundColor: '#161616',
          borderColor: '#2a2a3d',
          borderWidth: 1,
          titleColor: '#a78bfa',
          bodyColor: '#f0f0f0',
          callbacks: {
            label: ctx => ' ' + formatRp(ctx.parsed.y)
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#888aaa', maxTicksLimit: 10 },
          grid:  { color: 'rgba(255,255,255,0.05)' }
        },
        y: {
          ticks: {
            color: '#888aaa',
            callback: v => formatRpShort(v)
          },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      }
    }
  });

  renderCategoryPanel(mk);
}

// ─────────────────────────────────────────
// CATEGORY PANEL
// ─────────────────────────────────────────

function renderCategoryPanel(mk) {
  const expenses = loadExpenses();
  const catMap = {};
  expenses
    .filter(e => e.date && e.date.startsWith(mk))
    .forEach(e => {
      const cat = (e.category || 'Lainnya').trim();
      catMap[cat] = (catMap[cat] || 0) + 1;
    });

  const sorted = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7);

  const container = document.getElementById('category-list');
  if (sorted.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🏷️</div>Belum ada data</div>`;
    return;
  }

  container.innerHTML = sorted.map(([cat, count], i) => `
    <div class="category-item cat-rank-${i + 1}">
      <span class="cat-name">${cat}</span>
      <span class="cat-count">${count}x</span>
    </div>
  `).join('');
}

// ─────────────────────────────────────────
// ADD EXPENSE PAGE
// ─────────────────────────────────────────

function renderAddExpensePage() {
  // Set default date to today
  const dateField = document.getElementById('exp-date');
  if (!dateField.value) dateField.value = today();

  // Populate datalist suggestions from past categories
  const expenses = loadExpenses();
  const cats = [...new Set(expenses.map(e => e.category).filter(Boolean))];
  document.getElementById('category-suggestions').innerHTML =
    cats.map(c => `<option value="${c}"></option>`).join('');

  renderExpenseList();
}

function addExpense() {
  const date     = document.getElementById('exp-date').value;
  const amount   = Number(document.getElementById('exp-amount').value);
  const category = document.getElementById('exp-category').value.trim();
  const note     = document.getElementById('exp-note').value.trim();
  const fb       = document.getElementById('expense-feedback');

  if (!date) { showFeedback(fb, 'Pilih tanggal terlebih dahulu.', 'error'); return; }
  if (!amount || amount <= 0) { showFeedback(fb, 'Masukkan jumlah pengeluaran yang valid.', 'error'); return; }
  if (!category) { showFeedback(fb, 'Masukkan kategori pengeluaran.', 'error'); return; }

  const expenses = loadExpenses();
  expenses.push({ id: Date.now(), date, amount, category, note });
  saveExpenses(expenses);

  // Clear form
  document.getElementById('exp-amount').value   = '';
  document.getElementById('exp-category').value = '';
  document.getElementById('exp-note').value      = '';

  showFeedback(fb, `✅ Pengeluaran ${formatRp(amount)} berhasil disimpan!`, 'success');
  renderExpenseList();

  // Refresh datalist
  const cats = [...new Set(expenses.map(e => e.category).filter(Boolean))];
  document.getElementById('category-suggestions').innerHTML =
    cats.map(c => `<option value="${c}"></option>`).join('');
}

function renderExpenseList() {
  const mk = currentMonthKey();
  const expenses = loadExpenses()
    .filter(e => e.date && e.date.startsWith(mk))
    .sort((a, b) => b.date.localeCompare(a.date));

  const container = document.getElementById('expense-list-container');
  if (expenses.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div>Belum ada pengeluaran bulan ini</div>`;
    return;
  }

  container.innerHTML = expenses.map(e => `
    <div class="expense-item">
      <div class="exp-left">
        <span class="exp-date">${formatDate(e.date)}</span>
        <span class="exp-cat">${e.category}</span>
        ${e.note ? `<span class="exp-note">${e.note}</span>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <span class="exp-amount">-${formatRp(e.amount)}</span>
        <button class="btn-delete" onclick="deleteExpense(${e.id})">✕</button>
      </div>
    </div>
  `).join('');
}

function deleteExpense(id) {
  if (!confirm('Hapus pengeluaran ini?')) return;
  let expenses = loadExpenses();
  expenses = expenses.filter(e => e.id !== id);
  saveExpenses(expenses);
  renderExpenseList();
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
}

function showFeedback(el, msg, type) {
  el.textContent = msg;
  el.className = `feedback ${type}`;
  setTimeout(() => { el.textContent = ''; el.className = 'feedback'; }, 4000);
}

// ─────────────────────────────────────────
// INCOME PAGE
// ─────────────────────────────────────────

function onIncomeMonthChange() {
  const incomeField = document.getElementById('income-month');
  const amountField = document.getElementById('income-amount');
  if (!incomeField) return;
  const income = loadIncome();
  amountField.value = income[incomeField.value] || '';
}

function renderIncomePage() {
  const mk = currentMonthKey();
  const incomeField  = document.getElementById('income-month');
  const amountField  = document.getElementById('income-amount');

  if (!incomeField.value) incomeField.value = mk;

  // Remove old listener to avoid duplicates, then re-add
  incomeField.removeEventListener('change', onIncomeMonthChange);
  incomeField.addEventListener('change', onIncomeMonthChange);

  // Trigger initial fill
  const income = loadIncome();
  amountField.value = income[incomeField.value] || '';

  renderIncomeList();
}

function saveIncome() {
  const mk     = document.getElementById('income-month').value;
  const amount = Number(document.getElementById('income-amount').value);
  const fb     = document.getElementById('income-feedback');

  if (!mk) { showFeedback(fb, 'Pilih bulan terlebih dahulu.', 'error'); return; }
  if (!amount || amount <= 0) { showFeedback(fb, 'Masukkan jumlah pendapatan yang valid.', 'error'); return; }

  const income = loadIncome();
  income[mk] = amount;
  persistIncome(income);

  showFeedback(fb, `✅ Pendapatan ${formatRp(amount)} untuk ${monthLabel(mk)} disimpan!`, 'success');
  renderIncomeList();
}

function renderIncomeList() {
  const income = loadIncome();
  const entries = Object.entries(income)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 24);

  const container = document.getElementById('income-list-container');
  if (entries.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">💵</div>Belum ada data pendapatan</div>`;
    return;
  }

  container.innerHTML = entries.map(([mk, amount]) => `
    <div class="income-item">
      <span class="inc-month">${monthLabel(mk)}</span>
      <div style="display:flex;align-items:center;gap:10px">
        <span class="inc-amount">${formatRpShort(amount)}</span>
        <button class="btn-edit" onclick="editIncome('${mk}', ${amount})">Edit</button>
      </div>
    </div>
  `).join('');
}

function editIncome(mk, amount) {
  document.getElementById('income-month').value  = mk;
  document.getElementById('income-amount').value = amount;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─────────────────────────────────────────
// SAVINGS PAGE (Bulanan)
// ─────────────────────────────────────────

function renderSavingsPage() {
  const expenses = loadExpenses();
  const income   = loadIncome();

  // Collect all months from both sources
  const allMonths = new Set([
    ...Object.keys(income),
    ...expenses.map(e => e.date ? e.date.substring(0, 7) : null).filter(Boolean)
  ]);

  const sorted = [...allMonths].sort((a, b) => b.localeCompare(a));
  const now = new Date();
  const currentMk = currentMonthKey();

  const container = document.getElementById('savings-list');
  if (sorted.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🏦</div>Belum ada data</div>`;
    return;
  }

  container.innerHTML = sorted.map(mk => {
    const inc = Number(income[mk] || 0);
    const exp = expenses
      .filter(e => e.date && e.date.startsWith(mk))
      .reduce((s, e) => s + Number(e.amount), 0);

    // For current month: use expenses up to today
    let expLabel;
    if (mk === currentMk) {
      const todayStr = today();
      const expToday = expenses
        .filter(e => e.date && e.date.startsWith(mk) && e.date <= todayStr)
        .reduce((s, e) => s + Number(e.amount), 0);
      expLabel = `Pengeluaran s.d. hari ini: ${formatRpShort(expToday)}`;
    } else {
      expLabel = `Total pengeluaran: ${formatRpShort(exp)}`;
    }

    const saving = inc - exp;
    const cls    = saving >= 0 ? 'positive' : 'negative';

    return `
      <div class="savings-item">
        <div>
          <div class="sav-month">${monthLabel(mk)}</div>
          <div class="sav-detail">Pendapatan: ${formatRpShort(inc)} | ${expLabel}</div>
        </div>
        <div class="sav-amount ${cls}">${formatRpShort(saving)}</div>
      </div>`;
  }).join('');
}

// ─────────────────────────────────────────
// TOTAL SAVINGS PAGE
// ─────────────────────────────────────────

let savingsChart = null;

function renderTotalSavingsPage() {
  const expenses = loadExpenses();
  const income   = loadIncome();

  const allMonths = new Set([
    ...Object.keys(income),
    ...expenses.map(e => e.date ? e.date.substring(0, 7) : null).filter(Boolean)
  ]);

  const sorted = [...allMonths].sort();

  let cumulative = 0;
  const chartLabels = [];
  const chartData   = [];

  sorted.forEach(mk => {
    const inc = Number(income[mk] || 0);
    const exp = expenses
      .filter(e => e.date && e.date.startsWith(mk))
      .reduce((s, e) => s + Number(e.amount), 0);
    cumulative += (inc - exp);
    chartLabels.push(monthLabel(mk).replace(' ', '\n'));
    chartData.push(cumulative);
  });

  const display = document.getElementById('total-savings-display');
  const cls = cumulative >= 0 ? 'positive' : 'negative';
  display.innerHTML = `
    <div class="total-box">
      <div class="total-label">Total Tabungan Kumulatif</div>
      <div class="total-value ${cls}">${formatRpShort(cumulative)}</div>
    </div>
  `;

  // Chart
  const ctx = document.getElementById('savingsChart').getContext('2d');
  if (savingsChart) savingsChart.destroy();

  if (chartLabels.length === 0) {
    document.querySelector('#page-total-savings .chart-wrap').style.display = 'none';
    return;
  }
  document.querySelector('#page-total-savings .chart-wrap').style.display = '';

  savingsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartLabels,
      datasets: [{
        label: 'Tabungan Kumulatif',
        data: chartData,
        borderColor: '#3ddc84',
        backgroundColor: 'rgba(61,220,132,0.08)',
        pointBackgroundColor: chartData.map(v => v >= 0 ? '#3ddc84' : '#f87171'),
        pointBorderColor: '#0d0d0d',
        pointRadius: 5,
        pointHoverRadius: 7,
        fill: true,
        tension: 0.4,
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          labels: { color: '#f0f0f0', font: { size: 12 } },
          onClick: () => {}
        },
        tooltip: {
          backgroundColor: '#161616',
          borderColor: '#2a2a3d',
          borderWidth: 1,
          titleColor: '#3ddc84',
          bodyColor: '#f0f0f0',
          callbacks: {
            label: ctx => ' ' + formatRp(ctx.parsed.y)
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#888aaa', maxRotation: 45 },
          grid:  { color: 'rgba(255,255,255,0.05)' }
        },
        y: {
          ticks: {
            color: '#888aaa',
            callback: v => formatRpShort(v)
          },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      }
    }
  });
}

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  navigateTo('dashboard');
});
