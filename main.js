/**
 * WealthOne — Main Application
 * A premium portfolio consolidation dashboard with goal-based planning,
 * actionable recommendations, and educational explainers.
 */
import './style.css';
import { api } from './api.js';
import { showToast } from './toast.js';
import {
  renderDonutChart, renderAllocationBar, renderScoreRing,
  renderPlatformBars, formatNum,
} from './charts.js';

// ─── Educational Content Database ─────────────────────────────────
const EDUCATION = {
  xirr: {
    term: 'XIRR',
    short: 'Money-weighted annualized return',
    long: 'XIRR (Extended Internal Rate of Return) accounts for the exact timing and amount of every cash flow — every SIP installment, lump sum, dividend, and redemption. Unlike simple CAGR which assumes one lump investment, XIRR gives you the true annualized return when you invest irregularly (which most SIP investors do).',
    example: 'If you invested ₹5,000/month via SIP for 3 years and your portfolio is now worth ₹2.1L, your CAGR might show 12% but your XIRR (which accounts for each monthly investment) might be 14.5%.',
    icon: '📈',
  },
  asset_allocation: {
    term: 'Asset Allocation',
    short: 'How your money is split across asset types',
    long: 'Asset allocation is the strategy of dividing your investments among different asset categories — equity (stocks/mutual funds), debt (bonds/FDs), gold, real estate, and cash. It\'s widely considered the single most important factor in long-term investment success, often accounting for 90%+ of portfolio return variation.',
    example: 'A Moderate risk profile typically targets 50-60% equity, 30-40% debt, and 5-10% gold/alternatives.',
    icon: '🥧',
  },
  diversification: {
    term: 'Diversification',
    short: 'Don\'t put all your eggs in one basket',
    long: 'Diversification reduces portfolio risk by spreading investments across different assets, sectors, and platforms. When one investment drops, others may hold steady or rise, cushioning the overall impact. However, "diworsification" is also real — owning too many similar funds creates hidden overlap without adding real diversification.',
    example: 'If you have 5 large-cap mutual funds, they likely hold the same top 15-20 stocks. You\'d be better off with 1 large-cap + 1 mid-cap + 1 debt fund.',
    icon: '🛡️',
  },
  fund_overlap: {
    term: 'Fund Overlap',
    short: 'When multiple funds hold the same stocks',
    long: 'Fund overlap occurs when two or more mutual funds in your portfolio hold the same underlying stocks. High overlap (>30%) means you\'re paying multiple fund managers to essentially hold the same positions — increasing expense ratios without adding diversification. It\'s one of the most common mistakes retail investors make.',
    example: 'HDFC Top 100 and ICICI Bluechip Fund often have 60-70% overlap because both invest in the same large-cap stocks.',
    icon: '🔄',
  },
  concentration_risk: {
    term: 'Concentration Risk',
    short: 'Too much money in one place',
    long: 'Concentration risk is the potential for loss when a large portion of your portfolio is in a single stock, sector, or asset class. While concentrated bets can deliver higher returns, they also dramatically increase downside risk. A single negative event can wipe out a significant portion of your wealth.',
    example: 'If 40% of your portfolio is in one IT stock and the tech sector crashes 30%, your overall portfolio drops 12% from just that one holding.',
    icon: '⚠️',
  },
  sip: {
    term: 'SIP (Systematic Investment Plan)',
    short: 'Regular, automated investing',
    long: 'A SIP lets you invest a fixed amount at regular intervals (usually monthly) into mutual funds. It leverages rupee cost averaging — buying more units when prices are low and fewer when prices are high. Over time, this tends to lower your average cost and reduce the impact of market volatility.',
    example: 'A ₹10,000 monthly SIP in a Nifty 50 index fund for 20 years at 12% returns would grow to approximately ₹1 Crore.',
    icon: '🔁',
  },
  risk_profile: {
    term: 'Risk Profile',
    short: 'Your comfort with investment ups and downs',
    long: 'Your risk profile reflects your ability and willingness to tolerate fluctuations in your investment value. It depends on your age, income stability, investment horizon, financial obligations, and psychological comfort with losses. There\'s no "better" profile — the right one is the one you can stick with during market downturns.',
    example: 'A 25-year-old with stable income and 30+ years to retirement can typically afford an Aggressive profile. A 55-year-old nearing retirement should lean Conservative.',
    icon: '🎚️',
  },
  goal_planning: {
    term: 'Goal-Based Planning',
    short: 'Investing with purpose, not just returns',
    long: 'Goal-based planning ties each investment to a specific life goal (retirement, home, education, etc.) with a target amount and deadline. This shifts focus from "beating the market" to "will I reach my goal?" — a much more actionable and less anxiety-inducing framework. Each goal can have a different asset allocation based on its timeline.',
    example: 'A retirement goal 25 years away can be 80% equity, while a home down payment goal 3 years away should be 80% debt/liquid.',
    icon: '🎯',
  },
  rebalancing: {
    term: 'Rebalancing',
    short: 'Bringing your portfolio back to target allocation',
    long: 'Rebalancing is the process of realigning your portfolio weights to your target asset allocation. As markets move, your allocation drifts — a bull run might push equity from 60% to 75%. Rebalancing enforces a disciplined "buy low, sell high" approach by trimming winners and adding to laggards. Most experts recommend checking quarterly.',
    example: 'If your target is 60:40 equity:debt but markets pushed you to 70:30, you\'d sell ₹10L of equity and buy ₹10L of debt to rebalance.',
    icon: '⚖️',
  },
  emergency_fund: {
    term: 'Emergency Fund',
    short: '3-6 months of expenses kept liquid',
    long: 'An emergency fund is money set aside in highly liquid, low-risk instruments (liquid mutual funds, savings account) that you can access within 24-48 hours. It prevents you from having to sell long-term investments at a loss during emergencies (job loss, medical bills, car repairs). Building this before aggressive investing is Financial Planning 101.',
    example: 'If your monthly expenses are ₹50,000, aim for ₹1.5L-3L in a liquid fund or high-yield savings account before maxing out your SIPs.',
    icon: '🏦',
  },
};

// ─── State ────────────────────────────────────────────────────────
let state = {
  currentPage: 'onboarding', // 'onboarding' | 'dashboard' | 'accounts' | 'risk' | 'goals' | 'recommendations'
  user: null,
  accounts: [],
  portfolio: null,
  risk: null,
  goals: [],
  recommendations: null,
  loading: false,
};

// Try to restore user from localStorage
const saved = localStorage.getItem('wealthone_user');
if (saved) {
  try {
    state.user = JSON.parse(saved);
    state.currentPage = 'dashboard';
  } catch (e) { /* ignore */ }
}

// ─── Router ───────────────────────────────────────────────────────
function navigate(page) {
  state.currentPage = page;
  render();
  if (page === 'dashboard' && state.user) loadPortfolio();
  if (page === 'accounts' && state.user) loadAccounts();
  if (page === 'risk' && state.user) loadRisk();
  if (page === 'goals' && state.user) loadGoals();
  if (page === 'recommendations' && state.user) loadRecommendations();
}

// ─── Data loaders ─────────────────────────────────────────────────
async function loadPortfolio() {
  if (!state.user) return;
  try {
    state.loading = true;
    renderDashboardSkeleton();
    const [portfolio, accounts] = await Promise.all([
      api.getPortfolio(state.user.id),
      api.listAccounts(state.user.id),
    ]);
    state.portfolio = portfolio;
    state.accounts = accounts;
    state.loading = false;
    renderDashboardContent();
  } catch (err) {
    state.loading = false;
    showToast(err.message, 'error');
    renderDashboardEmpty();
  }
}

async function loadAccounts() {
  if (!state.user) return;
  try {
    state.accounts = await api.listAccounts(state.user.id);
    renderAccountsContent();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadRisk() {
  if (!state.user) return;
  try {
    state.risk = await api.getRiskInsights(state.user.id);
    renderRiskContent();
  } catch (err) {
    showToast(err.message, 'error');
    renderRiskEmpty();
  }
}

async function loadGoals() {
  if (!state.user) return;
  try {
    state.goals = await api.listGoals(state.user.id);
    renderGoalsContent();
  } catch (err) {
    showToast(err.message, 'error');
    renderGoalsEmpty();
  }
}

async function loadRecommendations() {
  if (!state.user) return;
  try {
    state.recommendations = await api.getRecommendations(state.user.id);
    renderRecommendationsContent();
  } catch (err) {
    showToast(err.message, 'error');
    renderRecommendationsEmpty();
  }
}

// ─── Tooltip Helper ───────────────────────────────────────────────
function eduTooltip(key, inline = false) {
  const edu = EDUCATION[key];
  if (!edu) return '';
  if (inline) {
    return `<span class="edu-trigger" data-edu="${key}" tabindex="0" title="Learn: ${edu.term}">${edu.icon}</span>`;
  }
  return `<button class="edu-trigger edu-btn" data-edu="${key}" tabindex="0" title="Learn: ${edu.term}">${edu.icon} What is ${edu.term}?</button>`;
}

function attachEduListeners(root) {
  (root || document).querySelectorAll('.edu-trigger').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      showEducationModal(el.dataset.edu);
    });
  });
}

function showEducationModal(key) {
  const edu = EDUCATION[key];
  if (!edu) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content edu-modal">
      <div class="modal-header">
        <div style="display:flex;align-items:center;gap:0.75rem">
          <span style="font-size:2rem">${edu.icon}</span>
          <div>
            <h3>${edu.term}</h3>
            <div class="text-sm text-muted">${edu.short}</div>
          </div>
        </div>
        <button class="btn-icon modal-close" style="width:32px;height:32px">✕</button>
      </div>
      <div class="edu-body">
        <div class="edu-section">
          <h4>📖 Explained Simply</h4>
          <p>${edu.long}</p>
        </div>
        <div class="edu-example">
          <h4>💡 Real-World Example</h4>
          <p>${edu.example}</p>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => overlay.remove());
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  // ESC key
  const escHandler = (e) => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);
}


// ─── App Shell ────────────────────────────────────────────────────
const app = document.querySelector('#app');

function render() {
  if (state.currentPage === 'onboarding') {
    renderOnboarding();
  } else {
    renderAppShell();
  }
}

function renderAppShell() {
  const pages = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard' },
    { id: 'accounts', icon: '🏦', label: 'Accounts' },
    { id: 'goals', icon: '🎯', label: 'Goals' },
    { id: 'risk', icon: '🛡️', label: 'Risk' },
    { id: 'recommendations', icon: '💡', label: 'Actions' },
  ];

  app.innerHTML = `
    <nav class="navbar">
      <div class="navbar-inner">
        <div class="navbar-brand">
          <div class="logo-icon">W₁</div>
          <span>Wealth<span class="text-gradient">One</span></span>
        </div>
        <div class="navbar-nav" id="main-nav">
          ${pages.map(p => `
            <button data-page="${p.id}" class="${state.currentPage === p.id ? 'active' : ''}">
              ${p.icon} ${p.label}
            </button>
          `).join('')}
        </div>
        <div class="navbar-actions">
          <span class="text-sm text-secondary" style="margin-right:0.5rem">
            ${state.user?.name || ''}
          </span>
          <button class="btn btn-ghost btn-sm" id="logout-btn" title="Logout">⏻ Logout</button>
        </div>
      </div>
    </nav>
    <main class="container dashboard" id="main-content"></main>
  `;

  // Nav listeners
  document.querySelectorAll('#main-nav button').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });
  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('wealthone_user');
    state = { currentPage: 'onboarding', user: null, accounts: [], portfolio: null, risk: null, goals: [], recommendations: null, loading: false };
    if (window.google && window.google.accounts) {
      google.accounts.id.disableAutoSelect();
    }
    render();
    showToast('Logged out', 'info');
  });

  // Render page content
  const content = document.getElementById('main-content');
  content.innerHTML = `<div id="${state.currentPage}-root"></div>`;
}


// ═══════════════════════════════════════════════════════════════════
//  PAGE: Onboarding / Login
// ═══════════════════════════════════════════════════════════════════
function renderOnboarding() {
  app.innerHTML = `
    <div class="hero-section">
      <div class="hero-content container">
        <h1 class="animate-in">
          Your entire wealth,<br><span class="text-gradient">one dashboard.</span>
        </h1>
        <p class="animate-in animate-in-delay-1">
          Consolidate investments across Zerodha, Groww, Coin, CAS statements & more.
          See your real returns (XIRR), hidden overlaps, and concentration risks — instantly.
        </p>

        <div class="card animate-in animate-in-delay-2" style="max-width:440px;margin:0 auto;text-align:left">
          <h3 style="margin-bottom:1.25rem;text-align:center">Get Started</h3>
          <div class="form-group">
            <label class="form-label" for="ob-risk">Risk Profile ${eduTooltip('risk_profile', true)}</label>
            <select class="form-select" id="ob-risk">
              <option value="CONSERVATIVE">Conservative</option>
              <option value="MODERATE" selected>Moderate</option>
              <option value="AGGRESSIVE">Aggressive</option>
            </select>
          </div>
          <div id="google-btn-container" style="margin-top: 1.5rem; width: 100%; display: flex; justify-content: center;">
          </div>
        </div>

        <div class="hero-features animate-in animate-in-delay-3">
          <div class="hero-feature">
            <div class="hero-feature-icon">🔗</div>
            <h4>Multi-Platform</h4>
            <p>Link brokers, AMCs & CAS PDFs</p>
          </div>
          <div class="hero-feature">
            <div class="hero-feature-icon">📈</div>
            <h4>True XIRR</h4>
            <p>Money-weighted returns, not misleading CAGR</p>
          </div>
          <div class="hero-feature">
            <div class="hero-feature-icon">🛡️</div>
            <h4>Risk Radar</h4>
            <p>Fund overlaps, concentration flags, profile fit</p>
          </div>
          <div class="hero-feature">
            <div class="hero-feature-icon">🎯</div>
            <h4>Goal Mapping</h4>
            <p>Tag holdings to life goals</p>
          </div>
        </div>
      </div>
    </div>
  `;

  attachEduListeners();
  renderGoogleButton();
}

function renderGoogleButton() {
  if (window.google && window.google.accounts) {
    google.accounts.id.initialize({
      client_id: "289964824699-i6gpr4f3nh37csqkhg8p49jarevkcpvc.apps.googleusercontent.com",
      callback: handleGoogleLogin,
      auto_select: false
    });
    google.accounts.id.renderButton(
      document.getElementById("google-btn-container"),
      { theme: "outline", size: "large", type: "standard", shape: "rectangular" }
    );
  } else {
    setTimeout(renderGoogleButton, 100);
  }
}

window.handleGoogleLogin = async (response) => {
  const risk = document.getElementById('ob-risk').value;

  try {
    const user = await api.googleLogin(response.credential, risk);
    state.user = user;
    localStorage.setItem('wealthone_user', JSON.stringify(user));
    showToast(`Welcome, ${user.name}! 🎉`, 'success');
    navigate('dashboard');
  } catch (err) {
    showToast(err.message, 'error');
  }
};


// ═══════════════════════════════════════════════════════════════════
//  PAGE: Dashboard
// ═══════════════════════════════════════════════════════════════════
function renderDashboardSkeleton() {
  const root = document.getElementById('dashboard-root');
  if (!root) return;
  root.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
      <h2>Portfolio Overview</h2>
      <button class="btn btn-primary btn-sm" id="dash-link-btn">+ Link Account</button>
    </div>
    <div class="stats-grid" style="margin-bottom:1.5rem">
      ${Array(4).fill('<div class="stat-card"><div class="skeleton" style="height:16px;width:80px;margin-bottom:12px"></div><div class="skeleton" style="height:32px;width:140px"></div></div>').join('')}
    </div>
    <div class="dashboard-grid">
      <div class="card"><div class="skeleton" style="height:200px"></div></div>
      <div class="card"><div class="skeleton" style="height:200px"></div></div>
      <div class="card full-width"><div class="skeleton" style="height:200px"></div></div>
    </div>
  `;
  document.getElementById('dash-link-btn')?.addEventListener('click', showLinkModal);
}

function renderDashboardEmpty() {
  const root = document.getElementById('dashboard-root');
  if (!root) return;
  root.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
      <h2>Portfolio Overview</h2>
    </div>
    <div class="card">
      <div class="empty-state">
        <div class="empty-state-icon">🏦</div>
        <h3>No accounts linked yet</h3>
        <p>Link your first investment account to see your consolidated portfolio, real returns, and risk analysis.</p>
        <button class="btn btn-accent" id="dash-empty-link">+ Link Your First Account</button>
      </div>
    </div>
  `;
  document.getElementById('dash-empty-link')?.addEventListener('click', showLinkModal);
}

function renderDashboardContent() {
  const root = document.getElementById('dashboard-root');
  if (!root) return;
  const p = state.portfolio;
  if (!p || (p.total_invested === 0 && p.holdings.length === 0)) {
    renderDashboardEmpty();
    return;
  }

  const gainClass = p.absolute_gain >= 0 ? 'positive' : 'negative';
  const gainSign = p.absolute_gain >= 0 ? '+' : '';

  root.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;flex-wrap:wrap;gap:1rem">
      <h2>Portfolio Overview</h2>
      <div style="display:flex;gap:0.5rem">
        <button class="btn btn-ghost btn-sm" id="dash-refresh">↻ Refresh</button>
        <button class="btn btn-primary btn-sm" id="dash-link-btn">+ Link Account</button>
      </div>
    </div>

    <!-- Stats -->
    <div class="stats-grid animate-in" style="margin-bottom:1.5rem">
      <div class="stat-card">
        <div class="stat-label">Total Invested</div>
        <div class="stat-value">₹${formatNum(p.total_invested)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Current Value</div>
        <div class="stat-value">₹${formatNum(p.total_current_value)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Absolute Gain</div>
        <div class="stat-value ${gainClass}">${gainSign}₹${formatNum(Math.abs(p.absolute_gain))}</div>
        <div class="stat-change ${gainClass}">${gainSign}${p.absolute_gain_pct}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">XIRR (Annualized) ${eduTooltip('xirr', true)}</div>
        <div class="stat-value" style="color:${p.xirr_pct != null && p.xirr_pct >= 0 ? 'var(--accent)' : 'var(--danger)'}">
          ${p.xirr_pct != null ? p.xirr_pct + '%' : '—'}
        </div>
        <div class="stat-change text-muted">Money-weighted return</div>
      </div>
    </div>

    <!-- Charts Row -->
    <div class="dashboard-grid">
      <div class="card animate-in animate-in-delay-1">
        <div class="card-header">
          <div><div class="card-title">Asset Allocation ${eduTooltip('asset_allocation', true)}</div><div class="card-subtitle">By asset class</div></div>
        </div>
        <div id="donut-chart"></div>
      </div>
      <div class="card animate-in animate-in-delay-2">
        <div class="card-header">
          <div><div class="card-title">Platform Breakdown</div><div class="card-subtitle">Value by provider</div></div>
        </div>
        <div id="platform-bars" style="margin-top:0.5rem"></div>
        <div style="margin-top:1rem">
          <div class="card-title" style="font-size:0.85rem;margin-bottom:0.75rem">Allocation Bar</div>
          <div id="alloc-bar"></div>
        </div>
      </div>

      <!-- Holdings Table -->
      <div class="card full-width animate-in animate-in-delay-3">
        <div class="card-header">
          <div><div class="card-title">All Holdings</div><div class="card-subtitle">${p.holdings.length} position${p.holdings.length !== 1 ? 's' : ''} across ${state.accounts.length} account${state.accounts.length !== 1 ? 's' : ''}</div></div>
          <div class="tabs" id="holdings-tabs">
            <button class="tab-btn active" data-filter="ALL">All</button>
            <button class="tab-btn" data-filter="MUTUAL_FUND">Mutual Funds</button>
            <button class="tab-btn" data-filter="STOCK">Stocks</button>
            <button class="tab-btn" data-filter="OTHER">Other</button>
          </div>
        </div>
        <div id="holdings-table"></div>
      </div>
    </div>
  `;

  // Render charts
  const totalVal = formatNum(p.total_current_value);
  renderDonutChart(
    document.getElementById('donut-chart'),
    p.asset_allocation,
    `<span style="font-size:1.25rem;font-weight:700">₹${totalVal}</span><span class="text-xs text-muted">Total</span>`
  );
  renderPlatformBars(document.getElementById('platform-bars'), p.holdings_by_platform);
  renderAllocationBar(document.getElementById('alloc-bar'), p.asset_allocation);
  renderHoldingsTable(p.holdings, 'ALL');

  // Event listeners
  document.getElementById('dash-link-btn')?.addEventListener('click', showLinkModal);
  document.getElementById('dash-refresh')?.addEventListener('click', () => loadPortfolio());
  document.querySelectorAll('#holdings-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#holdings-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderHoldingsTable(p.holdings, btn.dataset.filter);
    });
  });
  attachEduListeners();
}

function renderHoldingsTable(holdings, filter) {
  const container = document.getElementById('holdings-table');
  if (!container) return;

  let filtered = holdings;
  if (filter === 'MUTUAL_FUND') filtered = holdings.filter(h => h.holding_type === 'MUTUAL_FUND');
  else if (filter === 'STOCK') filtered = holdings.filter(h => h.holding_type === 'STOCK');
  else if (filter === 'OTHER') filtered = holdings.filter(h => !['MUTUAL_FUND', 'STOCK'].includes(h.holding_type));

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:2rem"><p class="text-muted">No holdings in this category</p></div>';
    return;
  }

  container.innerHTML = `
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Asset Class</th>
            <th>Units</th>
            <th>Avg Cost</th>
            <th>CMP</th>
            <th>Invested</th>
            <th>Current</th>
            <th>Gain/Loss</th>
            <th>%</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(h => {
            const cls = h.gain_loss >= 0 ? 'positive' : 'negative';
            const sign = h.gain_loss >= 0 ? '+' : '';
            const typeBadge = h.holding_type === 'MUTUAL_FUND' ? 'badge-purple' :
                              h.holding_type === 'STOCK' ? 'badge-blue' : 'badge-yellow';
            return `
            <tr>
              <td style="font-weight:600;max-width:200px;overflow:hidden;text-overflow:ellipsis" title="${h.name}">${h.name}</td>
              <td><span class="badge ${typeBadge}">${h.holding_type.replace('_', ' ')}</span></td>
              <td>${h.asset_class}</td>
              <td>${h.units?.toFixed(2) || '—'}</td>
              <td>₹${formatNum(h.avg_cost_price)}</td>
              <td>₹${formatNum(h.current_price)}</td>
              <td>₹${formatNum(h.invested_value)}</td>
              <td style="font-weight:600">₹${formatNum(h.current_value)}</td>
              <td class="${cls}" style="font-weight:600">${sign}₹${formatNum(Math.abs(h.gain_loss))}</td>
              <td class="${cls}">${sign}${h.gain_loss_pct}%</td>
              <td><span class="badge badge-green">${h.source_provider || '—'}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}


// ═══════════════════════════════════════════════════════════════════
//  PAGE: Accounts
// ═══════════════════════════════════════════════════════════════════
function renderAccountsContent() {
  const root = document.getElementById('accounts-root');
  if (!root) return;

  root.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem">
      <h2>Linked Accounts</h2>
      <button class="btn btn-primary" id="acc-link-btn">+ Link New Account</button>
    </div>
    <div id="accounts-list"></div>
  `;

  const list = document.getElementById('accounts-list');

  if (state.accounts.length === 0) {
    list.innerHTML = `
      <div class="card">
        <div class="empty-state">
          <div class="empty-state-icon">🔗</div>
          <h3>No accounts linked</h3>
          <p>Connect your broker or upload a CAS statement to begin consolidation.</p>
          <button class="btn btn-accent" id="acc-empty-link">+ Link Account</button>
        </div>
      </div>
    `;
    document.getElementById('acc-empty-link')?.addEventListener('click', showLinkModal);
  } else {
    list.innerHTML = state.accounts.map(acc => {
      const initial = acc.provider_name.charAt(0).toUpperCase();
      const sourceLabel = acc.source_type === 'ACCOUNT_AGGREGATOR' ? 'Account Aggregator' :
                          acc.source_type === 'CAS_UPLOAD' ? 'CAS Upload' : 'Manual';
      const statusBadge = acc.is_active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Unlinked</span>';
      const syncedAt = acc.last_synced_at ? new Date(acc.last_synced_at).toLocaleString('en-IN') : 'Never';
      return `
        <div class="account-card animate-in">
          <div class="account-icon">${initial}</div>
          <div class="account-info">
            <div class="account-name">${acc.provider_name} ${statusBadge}</div>
            <div class="account-meta">${sourceLabel} · Ref: ${acc.account_ref || '—'} · ${acc.holdings_count} holdings · Synced: ${syncedAt}</div>
          </div>
          <div class="account-actions">
            ${acc.is_active ? `
              <button class="btn btn-ghost btn-sm resync-btn" data-id="${acc.id}" title="Re-sync holdings">↻ Sync</button>
              <button class="btn btn-danger btn-sm unlink-btn" data-id="${acc.id}" title="Unlink account">✕ Unlink</button>
            ` : '<span class="text-muted text-sm">Unlinked</span>'}
          </div>
        </div>
      `;
    }).join('');

    // Resync
    list.querySelectorAll('.resync-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true; btn.textContent = '⏳';
        try {
          await api.resyncAccount(parseInt(btn.dataset.id));
          showToast('Account re-synced!', 'success');
          await loadAccounts();
        } catch (err) { showToast(err.message, 'error'); btn.disabled = false; btn.textContent = '↻ Sync'; }
      });
    });
    // Unlink
    list.querySelectorAll('.unlink-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Unlink this account? Holdings will be removed from your consolidated view.')) return;
        try {
          await api.unlinkAccount(parseInt(btn.dataset.id));
          showToast('Account unlinked', 'info');
          await loadAccounts();
        } catch (err) { showToast(err.message, 'error'); }
      });
    });
  }

  document.getElementById('acc-link-btn')?.addEventListener('click', showLinkModal);
}


// ═══════════════════════════════════════════════════════════════════
//  PAGE: Risk Insights
// ═══════════════════════════════════════════════════════════════════
function renderRiskEmpty() {
  const root = document.getElementById('risk-root');
  if (!root) return;
  root.innerHTML = `
    <h2 style="margin-bottom:1.5rem">Risk Insights</h2>
    <div class="card">
      <div class="empty-state">
        <div class="empty-state-icon">🛡️</div>
        <h3>No risk data yet</h3>
        <p>Link at least one account and let the system analyze your portfolio.</p>
      </div>
    </div>
  `;
}

function renderRiskContent() {
  const root = document.getElementById('risk-root');
  if (!root) return;
  const r = state.risk;
  if (!r) { renderRiskEmpty(); return; }

  root.innerHTML = `
    <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1.5rem">
      <h2>Risk Insights</h2>
      ${eduTooltip('diversification', true)}
      ${eduTooltip('concentration_risk', true)}
    </div>

    <div class="dashboard-grid">
      <!-- Diversification Score -->
      <div class="card animate-in">
        <div class="card-header">
          <div><div class="card-title">Diversification Score ${eduTooltip('diversification', true)}</div><div class="card-subtitle">Higher is better diversified</div></div>
        </div>
        <div id="score-ring" style="display:flex;justify-content:center;margin:1rem 0"></div>
      </div>

      <!-- Risk Profile Verdict -->
      <div class="card animate-in animate-in-delay-1">
        <div class="card-header">
          <div><div class="card-title">Profile Fit ${eduTooltip('risk_profile', true)}</div><div class="card-subtitle">vs. your stated risk profile (${state.user?.risk_profile || '—'})</div></div>
        </div>
        <div style="padding:1.5rem 0;font-size:1rem;line-height:1.7;color:var(--text-secondary)">
          ${r.asset_allocation_vs_risk_profile}
        </div>
      </div>

      <!-- Fund Overlaps -->
      <div class="card full-width animate-in animate-in-delay-2">
        <div class="card-header">
          <div>
            <div class="card-title">Fund Overlaps ${eduTooltip('fund_overlap', true)}</div>
            <div class="card-subtitle">Funds that hold the same stocks — hidden duplication</div>
          </div>
        </div>
        <div id="overlaps-list"></div>
      </div>

      <!-- Concentration Flags -->
      <div class="card full-width animate-in animate-in-delay-3">
        <div class="card-header">
          <div>
            <div class="card-title">Concentration Flags ${eduTooltip('concentration_risk', true)}</div>
            <div class="card-subtitle">Positions that carry outsized weight</div>
          </div>
        </div>
        <div id="flags-list"></div>
      </div>
    </div>
  `;

  // Score ring
  renderScoreRing(document.getElementById('score-ring'), r.diversification_score);

  // Overlaps
  const overlapsEl = document.getElementById('overlaps-list');
  if (r.fund_overlaps.length === 0) {
    overlapsEl.innerHTML = '<p class="text-muted" style="padding:1rem 0">No significant overlaps detected. Nice diversification! 🎉</p>';
  } else {
    overlapsEl.innerHTML = r.fund_overlaps.map(o => `
      <div class="overlap-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
          <div>
            <span style="font-weight:600">${o.fund_a}</span>
            <span class="text-muted" style="margin:0 0.5rem">↔</span>
            <span style="font-weight:600">${o.fund_b}</span>
          </div>
          <span class="badge ${o.overlap_pct >= 40 ? 'badge-red' : o.overlap_pct >= 25 ? 'badge-yellow' : 'badge-blue'}">${o.overlap_pct}% overlap</span>
        </div>
        <div class="text-sm text-muted">Common stocks: ${o.common_stocks.join(', ')}</div>
      </div>
    `).join('');
  }

  // Flags
  const flagsEl = document.getElementById('flags-list');
  if (r.concentration_flags.length === 0) {
    flagsEl.innerHTML = '<p class="text-muted" style="padding:1rem 0">No concentration warnings. Your portfolio is well-balanced! ✅</p>';
  } else {
    flagsEl.innerHTML = r.concentration_flags.map(f => `
      <div class="flag-item ${f.level}">
        <span style="font-size:1.2rem">${f.level === 'HIGH' ? '🔴' : f.level === 'WARN' ? '🟡' : '🔵'}</span>
        <span class="text-sm">${f.message}</span>
      </div>
    `).join('');
  }

  attachEduListeners();
}


// ═══════════════════════════════════════════════════════════════════
//  PAGE: Goals-Based Planning
// ═══════════════════════════════════════════════════════════════════
function renderGoalsEmpty() {
  const root = document.getElementById('goals-root');
  if (!root) return;
  root.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem">
      <div style="display:flex;align-items:center;gap:0.75rem">
        <h2>Goal-Based Planning</h2>
        ${eduTooltip('goal_planning', true)}
      </div>
      <button class="btn btn-accent" id="goals-add-btn">+ Create Goal</button>
    </div>

    <div class="card">
      <div class="empty-state">
        <div class="empty-state-icon">🎯</div>
        <h3>No goals set yet</h3>
        <p>Create your first financial goal — retirement, home, education, or anything else. We'll tell you exactly how much to invest monthly.</p>
        <button class="btn btn-accent" id="goals-empty-add">+ Create Your First Goal</button>
        <div style="margin-top:1.5rem">
          ${eduTooltip('goal_planning')}
          ${eduTooltip('sip')}
        </div>
      </div>
    </div>
  `;
  document.getElementById('goals-add-btn')?.addEventListener('click', showGoalModal);
  document.getElementById('goals-empty-add')?.addEventListener('click', showGoalModal);
  attachEduListeners();
}

function renderGoalsContent() {
  const root = document.getElementById('goals-root');
  if (!root) return;

  if (state.goals.length === 0) {
    renderGoalsEmpty();
    return;
  }

  root.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem;flex-wrap:wrap;gap:1rem">
      <div style="display:flex;align-items:center;gap:0.75rem">
        <h2>Goal-Based Planning</h2>
        ${eduTooltip('goal_planning', true)}
      </div>
      <div style="display:flex;gap:0.5rem">
        <button class="btn btn-ghost btn-sm" id="goals-refresh">↻ Refresh</button>
        <button class="btn btn-accent btn-sm" id="goals-add-btn">+ New Goal</button>
      </div>
    </div>

    <!-- Summary Stats -->
    <div class="stats-grid animate-in" style="margin-bottom:1.5rem">
      <div class="stat-card">
        <div class="stat-label">Active Goals</div>
        <div class="stat-value">${state.goals.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Target</div>
        <div class="stat-value">₹${formatNum(state.goals.reduce((s, g) => s + g.target_amount, 0))}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Current Progress</div>
        <div class="stat-value">₹${formatNum(state.goals.reduce((s, g) => s + g.current_value, 0))}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Monthly SIP Needed ${eduTooltip('sip', true)}</div>
        <div class="stat-value">₹${formatNum(state.goals.reduce((s, g) => s + g.monthly_sip_needed, 0))}</div>
      </div>
    </div>

    <!-- Goal Cards -->
    <div class="goals-grid" id="goals-list"></div>

    <!-- Educational Section -->
    <div class="card animate-in animate-in-delay-4" style="margin-top:1.5rem">
      <div class="card-header">
        <div><div class="card-title">📚 Learn About Goal Planning</div></div>
      </div>
      <div class="edu-chips">
        ${eduTooltip('goal_planning')}
        ${eduTooltip('sip')}
        ${eduTooltip('rebalancing')}
        ${eduTooltip('asset_allocation')}
        ${eduTooltip('emergency_fund')}
      </div>
    </div>
  `;

  const list = document.getElementById('goals-list');
  list.innerHTML = state.goals.map((goal, i) => {
    const progressColor = goal.progress_pct >= 75 ? 'var(--accent)' :
                          goal.progress_pct >= 40 ? 'var(--warning)' : 'var(--danger)';
    const targetDate = new Date(goal.target_date);
    const now = new Date();
    const monthsLeft = Math.max(0, (targetDate.getFullYear() - now.getFullYear()) * 12 + (targetDate.getMonth() - now.getMonth()));
    const yearsLeft = (monthsLeft / 12).toFixed(1);
    const gap = goal.target_amount - goal.current_value;
    
    // Choose a goal icon based on name keywords
    let goalIcon = '🎯';
    const nameLower = goal.name.toLowerCase();
    if (nameLower.includes('retire')) goalIcon = '🏖️';
    else if (nameLower.includes('home') || nameLower.includes('house')) goalIcon = '🏠';
    else if (nameLower.includes('edu') || nameLower.includes('study') || nameLower.includes('college')) goalIcon = '🎓';
    else if (nameLower.includes('car') || nameLower.includes('vehicle')) goalIcon = '🚗';
    else if (nameLower.includes('travel') || nameLower.includes('trip')) goalIcon = '✈️';
    else if (nameLower.includes('wedding') || nameLower.includes('marriage')) goalIcon = '💍';
    else if (nameLower.includes('emergency')) goalIcon = '🏦';
    else if (nameLower.includes('child') || nameLower.includes('baby')) goalIcon = '👶';

    return `
      <div class="goal-card animate-in animate-in-delay-${Math.min(i, 3) + 1}">
        <div class="goal-card-header">
          <div class="goal-icon-wrap">
            <span class="goal-icon">${goalIcon}</span>
          </div>
          <div class="goal-info">
            <div class="goal-name">${goal.name}</div>
            <div class="goal-meta">Target: ${targetDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })} · ${yearsLeft} yrs left</div>
          </div>
          <button class="btn-icon goal-delete-btn" data-id="${goal.id}" title="Delete goal" style="width:28px;height:28px;font-size:0.75rem">✕</button>
        </div>
        
        <div class="goal-progress-section">
          <div class="goal-progress-header">
            <span class="text-sm text-secondary">Progress</span>
            <span class="text-sm" style="font-weight:700;color:${progressColor}">${goal.progress_pct}%</span>
          </div>
          <div class="progress-bar" style="height:10px;margin-bottom:0.75rem">
            <div class="progress-fill" style="width:${Math.min(goal.progress_pct, 100)}%;background:${progressColor}"></div>
          </div>
          
          <div class="goal-stats">
            <div class="goal-stat">
              <span class="goal-stat-label">Current</span>
              <span class="goal-stat-value positive">₹${formatNum(goal.current_value)}</span>
            </div>
            <div class="goal-stat">
              <span class="goal-stat-label">Target</span>
              <span class="goal-stat-value">₹${formatNum(goal.target_amount)}</span>
            </div>
            <div class="goal-stat">
              <span class="goal-stat-label">Gap</span>
              <span class="goal-stat-value" style="color:var(--warning)">₹${formatNum(Math.max(gap, 0))}</span>
            </div>
          </div>
        </div>

        <div class="goal-sip-section">
          <div class="goal-sip-label">
            Monthly SIP needed ${eduTooltip('sip', true)}
          </div>
          <div class="goal-sip-amount">₹${formatNum(goal.monthly_sip_needed)}</div>
          <div class="text-xs text-muted">@ ~12% expected annual return</div>
        </div>
      </div>
    `;
  }).join('');

  // Delete listeners
  list.querySelectorAll('.goal-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this goal? This cannot be undone.')) return;
      try {
        await api.deleteGoal(parseInt(btn.dataset.id));
        showToast('Goal deleted', 'info');
        await loadGoals();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  document.getElementById('goals-add-btn')?.addEventListener('click', showGoalModal);
  document.getElementById('goals-refresh')?.addEventListener('click', () => loadGoals());
  attachEduListeners();
}

function showGoalModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>🎯 Create New Goal</h3>
        <button class="btn-icon modal-close" style="width:32px;height:32px">✕</button>
      </div>
      <div class="form-group">
        <label class="form-label">Goal Name</label>
        <input class="form-input" id="goal-name" placeholder="e.g. Retirement, Home Down Payment, Child's Education" />
      </div>
      <div class="form-group">
        <label class="form-label">Target Amount (₹)</label>
        <input class="form-input" id="goal-amount" type="number" min="0" placeholder="e.g. 5000000" />
      </div>
      <div class="form-group">
        <label class="form-label">Target Date</label>
        <input class="form-input" id="goal-date" type="date" />
      </div>
      
      <!-- Quick Presets -->
      <div style="margin-bottom:1.5rem">
        <div class="text-sm text-muted" style="margin-bottom:0.5rem">Quick presets:</div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm goal-preset" data-name="Retirement" data-amount="10000000" data-years="25">🏖️ Retirement</button>
          <button class="btn btn-ghost btn-sm goal-preset" data-name="Home Down Payment" data-amount="2500000" data-years="5">🏠 Home</button>
          <button class="btn btn-ghost btn-sm goal-preset" data-name="Child's Education" data-amount="5000000" data-years="15">🎓 Education</button>
          <button class="btn btn-ghost btn-sm goal-preset" data-name="Emergency Fund" data-amount="300000" data-years="1">🏦 Emergency</button>
          <button class="btn btn-ghost btn-sm goal-preset" data-name="Dream Vacation" data-amount="500000" data-years="2">✈️ Vacation</button>
        </div>
      </div>

      <div style="display:flex;gap:0.75rem">
        <button class="btn btn-accent" style="flex:1" id="goal-submit">🎯 Create Goal</button>
        <button class="btn btn-ghost modal-close">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Preset handlers
  overlay.querySelectorAll('.goal-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('goal-name').value = btn.dataset.name;
      document.getElementById('goal-amount').value = btn.dataset.amount;
      const targetDate = new Date();
      targetDate.setFullYear(targetDate.getFullYear() + parseInt(btn.dataset.years));
      document.getElementById('goal-date').value = targetDate.toISOString().split('T')[0];
    });
  });

  // Close handlers
  overlay.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => overlay.remove());
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // Submit
  document.getElementById('goal-submit').addEventListener('click', async () => {
    const name = document.getElementById('goal-name').value.trim();
    const amount = parseFloat(document.getElementById('goal-amount').value);
    const date = document.getElementById('goal-date').value;

    if (!name || !amount || !date) {
      showToast('Please fill in all fields', 'error');
      return;
    }

    const btn = document.getElementById('goal-submit');
    btn.disabled = true; btn.textContent = 'Creating…';

    try {
      await api.createGoal(state.user.id, name, amount, date);
      showToast(`Goal "${name}" created! 🎯`, 'success');
      overlay.remove();
      await loadGoals();
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false; btn.textContent = '🎯 Create Goal';
    }
  });
}


// ═══════════════════════════════════════════════════════════════════
//  PAGE: Actionable Recommendations
// ═══════════════════════════════════════════════════════════════════
function renderRecommendationsEmpty() {
  const root = document.getElementById('recommendations-root');
  if (!root) return;
  root.innerHTML = `
    <h2 style="margin-bottom:1.5rem">Actionable Recommendations</h2>
    <div class="card">
      <div class="empty-state">
        <div class="empty-state-icon">💡</div>
        <h3>No recommendations yet</h3>
        <p>Link investment accounts to receive personalized, AI-powered recommendations for your portfolio.</p>
      </div>
    </div>
  `;
}

function renderRecommendationsContent() {
  const root = document.getElementById('recommendations-root');
  if (!root) return;
  const rec = state.recommendations;
  if (!rec) { renderRecommendationsEmpty(); return; }

  const scoreColor = rec.score >= 70 ? 'var(--accent)' : rec.score >= 40 ? 'var(--warning)' : 'var(--danger)';
  const scoreLabel = rec.score >= 80 ? 'Excellent' : rec.score >= 60 ? 'Good' : rec.score >= 40 ? 'Needs Work' : 'Requires Attention';

  const categoryIcons = {
    REBALANCE: '⚖️', DIVERSIFY: '🌐', RISK: '⚠️', GOAL: '🎯', SIP: '📊', OVERLAP: '🔄'
  };
  const categoryColors = {
    REBALANCE: 'var(--primary)', DIVERSIFY: 'var(--info)', RISK: 'var(--danger)',
    GOAL: 'var(--accent)', SIP: 'var(--warning)', OVERLAP: 'var(--primary-light)'
  };
  const severityBadge = {
    HIGH: 'badge-red', MEDIUM: 'badge-yellow', LOW: 'badge-blue'
  };

  // Category mapping for educational tooltips
  const categoryEduMap = {
    REBALANCE: 'rebalancing', DIVERSIFY: 'diversification', RISK: 'concentration_risk',
    GOAL: 'goal_planning', SIP: 'sip', OVERLAP: 'fund_overlap'
  };

  root.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem;flex-wrap:wrap;gap:1rem">
      <h2>Actionable Recommendations</h2>
      <button class="btn btn-ghost btn-sm" id="rec-refresh">↻ Refresh Analysis</button>
    </div>

    <!-- Health Score -->
    <div class="card animate-in" style="margin-bottom:1.5rem">
      <div class="rec-health-header">
        <div>
          <div class="card-title">Financial Health Score</div>
          <div class="card-subtitle">Based on your consolidated portfolio analysis</div>
        </div>
        <div class="rec-health-score" style="color:${scoreColor}">
          <span class="rec-score-number">${rec.score}</span>
          <span class="rec-score-label">${scoreLabel}</span>
        </div>
      </div>
      <div class="rec-health-bar">
        <div class="rec-health-fill" style="width:${rec.score}%;background:${scoreColor}"></div>
      </div>
      <div class="rec-health-scale">
        <span>0</span>
        <span class="text-xs text-muted">Poor</span>
        <span class="text-xs text-muted">Fair</span>
        <span class="text-xs text-muted">Good</span>
        <span class="text-xs text-muted">Excellent</span>
        <span>100</span>
      </div>
    </div>

    <!-- Category Filter -->
    <div class="tabs animate-in animate-in-delay-1" id="rec-tabs" style="margin-bottom:1.5rem">
      <button class="tab-btn active" data-cat="ALL">All (${rec.recommendations.length})</button>
      ${[...new Set(rec.recommendations.map(r => r.category))].map(cat => {
        const count = rec.recommendations.filter(r => r.category === cat).length;
        return `<button class="tab-btn" data-cat="${cat}">${categoryIcons[cat] || '📌'} ${cat.charAt(0) + cat.slice(1).toLowerCase()} (${count})</button>`;
      }).join('')}
    </div>

    <!-- Recommendations List -->
    <div id="rec-list"></div>

    <!-- Educational Footer -->
    <div class="card animate-in animate-in-delay-4" style="margin-top:1.5rem">
      <div class="card-header">
        <div><div class="card-title">📚 Understand Your Recommendations</div></div>
      </div>
      <div class="edu-chips">
        ${eduTooltip('rebalancing')}
        ${eduTooltip('diversification')}
        ${eduTooltip('fund_overlap')}
        ${eduTooltip('concentration_risk')}
        ${eduTooltip('sip')}
        ${eduTooltip('goal_planning')}
        ${eduTooltip('emergency_fund')}
      </div>
    </div>
  `;

  function renderRecList(filter) {
    const listEl = document.getElementById('rec-list');
    const items = filter === 'ALL' ? rec.recommendations : rec.recommendations.filter(r => r.category === filter);
    
    if (items.length === 0) {
      listEl.innerHTML = '<div class="empty-state" style="padding:2rem"><p class="text-muted">No recommendations in this category</p></div>';
      return;
    }

    listEl.innerHTML = items.map((r, i) => {
      const icon = categoryIcons[r.category] || '📌';
      const catColor = categoryColors[r.category] || 'var(--text-secondary)';
      const eduKey = categoryEduMap[r.category];

      return `
        <div class="rec-card animate-in animate-in-delay-${Math.min(i, 3) + 1}" style="--rec-accent:${catColor}">
          <div class="rec-card-accent"></div>
          <div class="rec-card-body">
            <div class="rec-card-top">
              <div class="rec-icon-wrap" style="background:${catColor}20;color:${catColor}">
                <span style="font-size:1.5rem">${icon}</span>
              </div>
              <div class="rec-card-meta">
                <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
                  <span class="badge ${severityBadge[r.severity] || 'badge-blue'}">${r.severity}</span>
                  <span class="badge" style="background:${catColor}15;color:${catColor}">${r.category}</span>
                  ${eduKey ? `<span class="edu-trigger" data-edu="${eduKey}" tabindex="0" style="cursor:pointer;font-size:0.9rem" title="Learn about ${EDUCATION[eduKey]?.term || r.category}">❓</span>` : ''}
                </div>
                <h4 class="rec-title">${r.title}</h4>
              </div>
            </div>
            <p class="rec-description">${r.description}</p>
            <div class="rec-action-row">
              <button class="btn btn-sm" style="background:${catColor}20;color:${catColor};border:1px solid ${catColor}30">${r.action} →</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
    attachEduListeners(listEl);
  }

  renderRecList('ALL');

  // Tab switching
  document.querySelectorAll('#rec-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#rec-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderRecList(btn.dataset.cat);
    });
  });

  document.getElementById('rec-refresh')?.addEventListener('click', () => loadRecommendations());
  attachEduListeners();
}


// ═══════════════════════════════════════════════════════════════════
//  MODAL: Link Account
// ═══════════════════════════════════════════════════════════════════
function showLinkModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>Link New Account</h3>
        <button class="btn-icon modal-close" style="width:32px;height:32px">✕</button>
      </div>
      <div class="form-group">
        <label class="form-label">Source Type</label>
        <select class="form-select" id="link-source">
          <option value="ACCOUNT_AGGREGATOR">Account Aggregator (AA)</option>
          <option value="CAS_UPLOAD">CAS PDF Upload</option>
          <option value="MANUAL">Manual Entry</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Provider / Platform Name</label>
        <select class="form-select" id="link-provider">
          <option value="Zerodha">Zerodha</option>
          <option value="Groww">Groww</option>
          <option value="Coin">Coin (Zerodha MF)</option>
          <option value="NSDL-CAS">NSDL CAS</option>
          <option value="CAMS">CAMS</option>
          <option value="Kuvera">Kuvera</option>
          <option value="INDmoney">INDmoney</option>
          <option value="EPF">EPF (EPFO)</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Consent Handle / File Reference (optional)</label>
        <input class="form-input" id="link-ref" placeholder="e.g. consent-abc123" />
      </div>
      <div style="display:flex;gap:0.75rem;margin-top:1.5rem">
        <button class="btn btn-accent" style="flex:1" id="link-submit">🔗 Link & Sync</button>
        <button class="btn btn-ghost modal-close">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Close handlers
  overlay.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => overlay.remove());
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // Submit
  document.getElementById('link-submit').addEventListener('click', async () => {
    const source = document.getElementById('link-source').value;
    const provider = document.getElementById('link-provider').value;
    const ref = document.getElementById('link-ref').value.trim() || null;
    const btn = document.getElementById('link-submit');
    btn.disabled = true; btn.textContent = 'Linking…';

    try {
      await api.linkAccount(state.user.id, source, provider, ref);
      showToast(`${provider} linked successfully! 🎉`, 'success');
      overlay.remove();
      if (state.currentPage === 'dashboard') loadPortfolio();
      else if (state.currentPage === 'accounts') loadAccounts();
      else navigate('dashboard');
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false; btn.textContent = '🔗 Link & Sync';
    }
  });
}


// ═══════════════════════════════════════════════════════════════════
//  CHATBOT: Grok AI-Powered Assistant
// ═══════════════════════════════════════════════════════════════════
let chatHistory = []; // conversation history for multi-turn context
let chatOpen = false;

function createChatbot() {
  // Remove existing chatbot if any
  document.getElementById('chatbot-container')?.remove();

  const container = document.createElement('div');
  container.id = 'chatbot-container';
  container.innerHTML = `
    <!-- Floating Toggle Button -->
    <button class="chatbot-fab" id="chatbot-toggle" title="Ask AI anything">
      <span class="chatbot-fab-icon" id="chatbot-fab-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      </span>
      <span class="chatbot-fab-pulse"></span>
    </button>

    <!-- Chat Window -->
    <div class="chatbot-window" id="chatbot-window">
      <div class="chatbot-header">
        <div class="chatbot-header-info">
          <div class="chatbot-avatar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
          </div>
          <div>
            <div class="chatbot-header-title">WealthOne AI</div>
            <div class="chatbot-header-subtitle">Powered by Grok AI · Ask me anything</div>
          </div>
        </div>
        <div class="chatbot-header-actions">
          <button class="btn-icon chatbot-clear-btn" id="chatbot-clear" title="Clear chat">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
          <button class="btn-icon chatbot-close-btn" id="chatbot-close" title="Close chat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <div class="chatbot-messages" id="chatbot-messages">
        <div class="chatbot-welcome">
          <div class="chatbot-welcome-icon">✨</div>
          <h4>Hi! I'm your AI Financial Advisor</h4>
          <p>Ask me anything — investments, mutual funds, taxes, budgeting, or even general questions. I'm powered by Grok AI.</p>
          <div class="chatbot-suggestions" id="chatbot-suggestions">
            <button class="chatbot-suggestion-chip">What is XIRR vs CAGR?</button>
            <button class="chatbot-suggestion-chip">How to start investing?</button>
            <button class="chatbot-suggestion-chip">Explain mutual fund overlap</button>
            <button class="chatbot-suggestion-chip">Best SIP strategy for beginners</button>
          </div>
        </div>
      </div>

      <div class="chatbot-input-area">
        <div class="chatbot-input-wrap">
          <textarea
            class="chatbot-input"
            id="chatbot-input"
            placeholder="Ask me anything..."
            rows="1"
            maxlength="2000"
          ></textarea>
          <button class="chatbot-send-btn" id="chatbot-send" title="Send message" disabled>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
        <div class="chatbot-input-hint">
          <span>Press Enter to send · Shift+Enter for new line</span>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(container);

  // Event listeners
  const toggleBtn = document.getElementById('chatbot-toggle');
  const closeBtn = document.getElementById('chatbot-close');
  const clearBtn = document.getElementById('chatbot-clear');
  const sendBtn = document.getElementById('chatbot-send');
  const input = document.getElementById('chatbot-input');
  const chatWindow = document.getElementById('chatbot-window');

  toggleBtn.addEventListener('click', () => toggleChat());
  closeBtn.addEventListener('click', () => toggleChat(false));
  clearBtn.addEventListener('click', () => clearChat());
  sendBtn.addEventListener('click', () => sendMessage());

  // Input handling
  input.addEventListener('input', () => {
    // Auto-resize textarea
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    // Enable/disable send button
    sendBtn.disabled = !input.value.trim();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.value.trim()) sendMessage();
    }
  });

  // Suggestion chips
  document.querySelectorAll('.chatbot-suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      input.value = chip.textContent;
      input.dispatchEvent(new Event('input'));
      sendMessage();
    });
  });

  // Close on ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && chatOpen) toggleChat(false);
  });
}

function toggleChat(forceState) {
  chatOpen = forceState !== undefined ? forceState : !chatOpen;
  const chatWindow = document.getElementById('chatbot-window');
  const fabIcon = document.getElementById('chatbot-fab-icon');
  const fab = document.getElementById('chatbot-toggle');

  if (chatOpen) {
    chatWindow.classList.add('open');
    fab.classList.add('active');
    // Focus input after animation
    setTimeout(() => {
      document.getElementById('chatbot-input')?.focus();
    }, 300);
  } else {
    chatWindow.classList.remove('open');
    fab.classList.remove('active');
  }
}

function clearChat() {
  chatHistory = [];
  const messagesEl = document.getElementById('chatbot-messages');
  messagesEl.innerHTML = `
    <div class="chatbot-welcome">
      <div class="chatbot-welcome-icon">✨</div>
      <h4>Hi! I'm your AI Financial Advisor</h4>
      <p>Ask me anything — investments, mutual funds, taxes, budgeting, or even general questions. I'm powered by Grok AI.</p>
      <div class="chatbot-suggestions" id="chatbot-suggestions">
        <button class="chatbot-suggestion-chip">What is XIRR vs CAGR?</button>
        <button class="chatbot-suggestion-chip">How to start investing?</button>
        <button class="chatbot-suggestion-chip">Explain mutual fund overlap</button>
        <button class="chatbot-suggestion-chip">Best SIP strategy for beginners</button>
      </div>
    </div>
  `;
  // Re-attach suggestion listeners
  document.querySelectorAll('.chatbot-suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const input = document.getElementById('chatbot-input');
      input.value = chip.textContent;
      input.dispatchEvent(new Event('input'));
      sendMessage();
    });
  });
}

function addMessage(role, text) {
  const messagesEl = document.getElementById('chatbot-messages');
  // Hide welcome on first message
  const welcome = messagesEl.querySelector('.chatbot-welcome');
  if (welcome) welcome.style.display = 'none';

  const msgDiv = document.createElement('div');
  msgDiv.className = `chatbot-msg chatbot-msg-${role}`;

  const avatarHtml = role === 'user'
    ? `<div class="chatbot-msg-avatar chatbot-msg-avatar-user">You</div>`
    : `<div class="chatbot-msg-avatar chatbot-msg-avatar-ai">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
        </svg>
      </div>`;

  // Simple markdown-like formatting for AI responses
  let formattedText = text;
  if (role === 'model') {
    formattedText = formatAIResponse(text);
  } else {
    formattedText = escapeHtml(text);
  }

  msgDiv.innerHTML = `
    ${avatarHtml}
    <div class="chatbot-msg-bubble">
      <div class="chatbot-msg-text">${formattedText}</div>
      <div class="chatbot-msg-time">${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
    </div>
  `;

  messagesEl.appendChild(msgDiv);
  // Smooth scroll to bottom
  messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
  return msgDiv;
}

function addTypingIndicator() {
  const messagesEl = document.getElementById('chatbot-messages');
  const typingDiv = document.createElement('div');
  typingDiv.className = 'chatbot-msg chatbot-msg-model chatbot-typing';
  typingDiv.id = 'chatbot-typing';
  typingDiv.innerHTML = `
    <div class="chatbot-msg-avatar chatbot-msg-avatar-ai">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
      </svg>
    </div>
    <div class="chatbot-msg-bubble">
      <div class="chatbot-typing-dots">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  messagesEl.appendChild(typingDiv);
  messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
}

function removeTypingIndicator() {
  document.getElementById('chatbot-typing')?.remove();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatAIResponse(text) {
  // Convert markdown-style formatting to HTML
  let html = escapeHtml(text);

  // Bold: **text** or __text__
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');

  // Italic: *text* or _text_
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Code: `text`
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');

  // Bullet points
  html = html.replace(/^[\s]*[-•]\s(.+)/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
  // Clean up nested <ul> tags
  html = html.replace(/<\/ul>\s*<ul>/g, '');

  // Numbered lists
  html = html.replace(/^\d+\.\s(.+)/gm, '<li>$1</li>');

  // Headers: ### text
  html = html.replace(/^###\s(.+)/gm, '<h5>$1</h5>');
  html = html.replace(/^##\s(.+)/gm, '<h4>$1</h4>');

  // Line breaks
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  // Wrap in paragraph
  html = `<p>${html}</p>`;

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');

  return html;
}

async function sendMessage() {
  const input = document.getElementById('chatbot-input');
  const sendBtn = document.getElementById('chatbot-send');
  const message = input.value.trim();

  if (!message) return;

  // Clear input
  input.value = '';
  input.style.height = 'auto';
  sendBtn.disabled = true;

  // Add user message to UI
  addMessage('user', message);

  // Add to history
  chatHistory.push({ role: 'user', text: message });

  // Show typing indicator
  addTypingIndicator();

  try {
    // Send to Grok AI via backend — NO keyword matching, pure AI
    const response = await api.chatWithAI(message, chatHistory);
    removeTypingIndicator();

    // Add AI response to UI
    addMessage('model', response.reply);

    // Add to history for context
    chatHistory.push({ role: 'model', text: response.reply });

    // Keep history manageable (last 20 messages)
    if (chatHistory.length > 20) {
      chatHistory = chatHistory.slice(-20);
    }
  } catch (err) {
    removeTypingIndicator();
    addMessage('model', `⚠️ Sorry, I couldn't process that right now. Error: ${err.message}. Please try again.`);
  }
}


// ─── Bootstrap ────────────────────────────────────────────────────
render();
if (state.currentPage === 'dashboard' && state.user) loadPortfolio();

// Initialize chatbot (available on all pages after login)
createChatbot();
