/**
 * WealthOne — Chart rendering utilities (pure CSS/SVG, zero dependencies)
 */

// Palette for asset classes
const ASSET_COLORS = {
  EQUITY: '#6C63FF',
  DEBT: '#00D9A6',
  HYBRID: '#FBBF24',
  GOLD: '#F59E0B',
  CASH: '#8B5CF6',
  REAL_ESTATE: '#EC4899',
  OTHER: '#6B7280',
};

/**
 * Renders a donut chart via SVG conic-gradient technique
 */
export function renderDonutChart(container, slices, centerHTML = '') {
  if (!slices || slices.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No allocation data</p></div>';
    return;
  }

  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 90;
  const innerR = 60;
  let currentAngle = -90; // start from top

  let paths = '';
  slices.forEach((slice) => {
    const angle = (slice.weight_pct / 100) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    const color = ASSET_COLORS[slice.asset_class] || ASSET_COLORS.OTHER;

    const startOuter = polarToCartesian(cx, cy, outerR, startAngle);
    const endOuter = polarToCartesian(cx, cy, outerR, endAngle);
    const startInner = polarToCartesian(cx, cy, innerR, endAngle);
    const endInner = polarToCartesian(cx, cy, innerR, startAngle);

    const largeArc = angle > 180 ? 1 : 0;

    paths += `<path d="M ${startOuter.x} ${startOuter.y}
                       A ${outerR} ${outerR} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}
                       L ${startInner.x} ${startInner.y}
                       A ${innerR} ${innerR} 0 ${largeArc} 0 ${endInner.x} ${endInner.y} Z"
                    fill="${color}" opacity="0.85" stroke="${color}" stroke-width="1">
                <title>${slice.asset_class}: ${slice.weight_pct}%</title>
              </path>`;
    currentAngle = endAngle;
  });

  container.innerHTML = `
    <div style="position:relative;width:${size}px;height:${size}px;margin:0 auto;">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        ${paths}
      </svg>
      <div class="donut-center" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
        ${centerHTML}
      </div>
    </div>
    <div class="legend">
      ${slices.map(s => `
        <div class="legend-item">
          <span class="legend-dot" style="background:${ASSET_COLORS[s.asset_class] || ASSET_COLORS.OTHER}"></span>
          <span>${s.asset_class} (${s.weight_pct}%)</span>
        </div>
      `).join('')}
    </div>
  `;
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * Renders a horizontal stacked allocation bar
 */
export function renderAllocationBar(container, slices) {
  if (!slices || slices.length === 0) {
    container.innerHTML = '<div class="alloc-bar"></div>';
    return;
  }
  const segments = slices.map(s => {
    const color = ASSET_COLORS[s.asset_class] || ASSET_COLORS.OTHER;
    return `<div class="alloc-segment" style="width:${s.weight_pct}%;background:${color}" title="${s.asset_class}: ${s.weight_pct}%"></div>`;
  }).join('');
  container.innerHTML = `<div class="alloc-bar">${segments}</div>`;
}

/**
 * Renders a diversification score ring via SVG
 */
export function renderScoreRing(container, score) {
  const size = 160;
  const r = 65;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const offset = circumference - (pct / 100) * circumference;

  let color = '#00D9A6';
  if (pct < 40) color = '#EF4444';
  else if (pct < 70) color = '#FBBF24';

  container.innerHTML = `
    <div class="risk-score-ring">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size/2}" cy="${size/2}" r="${r}"
                fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="10" />
        <circle cx="${size/2}" cy="${size/2}" r="${r}"
                fill="none" stroke="${color}" stroke-width="10"
                stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
                stroke-linecap="round"
                transform="rotate(-90 ${size/2} ${size/2})"
                style="transition: stroke-dashoffset 1.5s cubic-bezier(0.4,0,0.2,1)" />
      </svg>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
        <span class="risk-score-value" style="color:${color}">${pct}</span>
        <span class="risk-score-label">out of 100</span>
      </div>
    </div>
  `;
}

/**
 * Horizontal bar chart for platform breakdown
 */
export function renderPlatformBars(container, platformMap) {
  const entries = Object.entries(platformMap || {});
  if (entries.length === 0) {
    container.innerHTML = '<p class="text-muted text-sm">No platform data</p>';
    return;
  }
  const maxVal = Math.max(...entries.map(([, v]) => v));
  const colors = ['#6C63FF', '#00D9A6', '#FBBF24', '#EC4899', '#8B5CF6', '#3B82F6'];

  container.innerHTML = entries.map(([name, value], i) => {
    const pct = maxVal > 0 ? (value / maxVal) * 100 : 0;
    const color = colors[i % colors.length];
    return `
      <div style="margin-bottom:1rem">
        <div style="display:flex;justify-content:space-between;margin-bottom:0.375rem">
          <span class="text-sm" style="font-weight:600">${name}</span>
          <span class="text-sm text-secondary">₹${formatNum(value)}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Format a number as Indian currency style (lakhs/crores shorthand)
 */
export function formatNum(n) {
  if (n == null) return '—';
  if (Math.abs(n) >= 1e7) return (n / 1e7).toFixed(2) + ' Cr';
  if (Math.abs(n) >= 1e5) return (n / 1e5).toFixed(2) + ' L';
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
