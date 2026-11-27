/**
 * Kemist Admin Dashboard
 * Main application logic for the admin panel
 */

// ============================================
// Configuration & State
// ============================================
const ADMIN_TOKEN = localStorage.getItem('admin_token') || '';
const API_BASE = '/api/admin';

let state = {
  currentSection: 'overview',
  charts: {},
  jobsPage: 1,
  imagesPage: 1,
  jobsFilters: { status: '', type: '', search: '' },
  imagesFilters: { status: '', search: '' },
  analyticsPeriod: 30,
  selectedImageId: null,
};

// ============================================
// Utility Functions
// ============================================
function $(selector, root = document) { return root.querySelector(selector); }
function $$(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }

function getIcon(name) {
  const icons = {
    layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
    server: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>',
    'hard-drive': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="12" x2="2" y2="12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/><line x1="6" y1="16" x2="6.01" y2="16"/><line x1="10" y1="16" x2="10.01" y2="16"/></svg>',
    cpu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="15" x2="4" y2="15"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="15" x2="23" y2="15"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    'trending-up': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
    database: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
    'flask-conical': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 2v7.31"/><path d="M14 2v7.31"/><path d="M8.5 2h7"/><path d="M7 16.31c0 .8.3 1.5.8 2H4a1 1 0 0 1-.8-.8c-.1-.5-.2-1-.2-1.5"/><path d="M17 16.31c0 .8.3 1.5.8 2h2.2a1 1 0 0 0 .8-.8c.1-.5.2-1 .2-1.5"/></svg>',
    'file-text': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
    'map-pin': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    'alert-circle': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    'check-circle': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    'x-circle': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    package: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
    percent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>',
  };
  return icons[name] || '';
}

function showToast(message, type = 'info') {
  const container = $('#toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  };
  toast.innerHTML = `${icons[type]}<span class="toast-message">${escapeHtml(message)}</span><button class="toast-close" aria-label="Dismiss">&times;</button>`;
  toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatNumber(num) {
  if (num == null) return '—';
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toLocaleString();
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (isNaN(date)) return '—';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDuration(start, end) {
  if (!start || !end) return '—';
  const ms = new Date(end) - new Date(start);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function getStatusBadgeClass(status) {
  const map = {
    success: 'badge-success',
    failed: 'badge-failed',
    running: 'badge-running',
    queued: 'badge-queued',
    partial: 'badge-partial',
    cancelled: 'badge-cancelled',
    pending: 'badge-pending',
    approved: 'badge-approved',
    rejected: 'badge-rejected',
    downloaded: 'badge-downloaded',
    done: 'badge-done',
  };
  return map[status] || 'badge-queued';
}

// ============================================
// API Functions
// ============================================
async function apiRequest(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(ADMIN_TOKEN ? { 'X-Admin-Token': ADMIN_TOKEN } : {}),
    ...options.headers,
  };
  
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });
  
  const data = await res.json().catch(() => ({}));
  
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  
  return data;
}

async function fetchOverview() {
  return apiRequest('/overview');
}

async function fetchJobs(page = 1, filters = {}) {
  const params = new URLSearchParams({ page: page.toString(), limit: '50' });
  if (filters.status) params.append('status', filters.status);
  if (filters.type) params.append('job_type', filters.type);
  return apiRequest(`/jobs?${params}`);
}

async function fetchAnalytics(days = 30) {
  return apiRequest(`/analytics?days=${days}`);
}

async function fetchMedicineStats() {
  return apiRequest('/medicines/stats');
}

async function fetchCoverage() {
  return apiRequest('/coverage');
}

async function fetchHealth() {
  return apiRequest('/system/health');
}

async function retryJob(id) {
  return apiRequest(`/jobs/${id}/retry`, { method: 'POST' });
}

async function triggerJob(jobType, params = {}) {
  return apiRequest(`/trigger/${jobType}`, { method: 'POST', body: JSON.stringify({ params }) });
}

// ============================================
// Section Rendering
// ============================================
function renderOverview(data) {
  const { stats, jobs, apiUsage } = data;
  
  // Stats cards
  const statCards = [
    { key: 'totalUsers', label: 'Total Users', icon: 'users', class: 'primary' },
    { key: 'pageVisitsToday', label: 'Visits Today', icon: 'activity', class: 'success' },
    { key: 'pageVisits30d', label: 'Visits (30d)', icon: 'trending-up', class: 'info' },
    { key: 'nafdacRecords', label: 'NAFDAC Records', icon: 'database', class: 'primary' },
    { key: 'openfdaRecords', label: 'OpenFDA Records', icon: 'flask-conical', class: 'purple' },
    { key: 'dailymedLabels', label: 'DailyMed Labels', icon: 'file-text', class: 'warning' },
    { key: 'facilities', label: 'Health Facilities', icon: 'map-pin', class: 'success' },
    { key: 'medicineImages', label: 'Medicine Images', icon: 'image', class: 'info' },
    { key: 'imageCandidatesPending', label: 'Images Pending Review', icon: 'alert-circle', class: 'warning' },
    { key: 'coverageAreasDone', label: 'Areas Completed', icon: 'check-circle', class: 'success' },
    { key: 'coverageAreasPending', label: 'Areas Pending', icon: 'clock', class: 'warning' },
    { key: 'coverageAreasFailed', label: 'Areas Failed', icon: 'x-circle', class: 'danger' },
  ];
  
  const icons = {
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    'trending-up': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
    database: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
    'flask-conical': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 2v7.31"/><path d="M14 2v7.31"/><path d="M8.5 2h7"/><path d="M7 16.31c0 .8.3 1.5.8 2H4a1 1 0 0 1-.8-.8c-.1-.5-.2-1-.2-1.5"/><path d="M17 16.31c0 .8.3 1.5.8 2h2.2a1 1 0 0 0 .8-.8c.1-.5.2-1 .2-1.5"/></svg>',
    'file-text': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>',
    'map-pin': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
    'alert-circle': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    'check-circle': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    'x-circle': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  };
  
  const grid = $('#statsGrid');
  grid.innerHTML = statCards.map(card => {
    const value = stats[card.key] ?? 0;
    return `
      <div class="stat-card" data-aos="fade-up">
        <div class="stat-icon ${card.class}">${icons[card.icon]}</div>
        <div class="stat-content">
          <div class="stat-value">${formatNumber(value)}</div>
          <div class="stat-label">${card.label}</div>
        </div>
      </div>
    `;
  }).join('');
  
  // Recent jobs table
  const recentJobs = jobs.recentRuns || [];
  const tbody = $('#recentJobsTable tbody');
  tbody.innerHTML = recentJobs.map(job => `
    <tr>
      <td><code>${escapeHtml(job.job_type)}</code></td>
      <td><span class="badge ${getStatusBadgeClass(job.status)}">${escapeHtml(job.status)}</span></td>
      <td>${formatNumber(job.records_found)}</td>
      <td>${formatDuration(job.started_at, job.finished_at)}</td>
      <td>${formatDate(job.started_at)}</td>
      <td>
        ${job.status === 'failed' || job.status === 'cancelled' 
          ? `<button class="btn btn-ghost btn-xs" onclick="retryJobHandler('${job.id}')">Retry</button>`
          : '—'}
      </td>
    </tr>
  `).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2rem;">No recent jobs</td></tr>';
  
  // API Usage Chart
  renderApiUsageChart(apiUsage);
  renderJobStatusChart(jobs);
}

function renderApiUsageChart(usage) {
  const ctx = $('#apiUsageChart');
  if (!ctx) return;
  
  const labels = Object.keys(usage);
  const data = Object.values(usage);
  const colors = ['#0ea5e9', '#10b981', '#f59e0b', '#a855f7', '#ef4444', '#ec4899'];
  
  if (state.charts.apiUsage) state.charts.apiUsage.destroy();
  
  state.charts.apiUsage = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors.slice(0, labels.length), borderWidth: 0 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: { legend: { display: false } },
    },
  });
  
  const legend = $('#apiUsageLegend');
  legend.innerHTML = labels.map((label, i) => `
    <span class="legend-item"><span class="legend-color" style="background:${colors[i]}"></span>${label}: ${formatNumber(data[i])}</span>
  `).join('');
}

function renderJobStatusChart(jobs) {
  const ctx = $('#jobStatusChart');
  if (!ctx) return;
  
  const labels = ['Success', 'Failed', 'Running', 'Queued'];
  const data = [jobs.successful || 0, jobs.failed || 0, jobs.running || 0, jobs.queued || 0];
  const colors = ['#10b981', '#ef4444', '#0ea5e9', '#f59e0b'];
  
  if (state.charts.jobStatus) state.charts.jobStatus.destroy();
  
  state.charts.jobStatus = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: { legend: { display: false } },
    },
  });
  
  const legend = $('#jobStatusLegend');
  legend.innerHTML = labels.map((label, i) => `
    <span class="legend-item"><span class="legend-color" style="background:${colors[i]}"></span>${label}: ${data[i]}</span>
  `).join('');
}

async function renderAnalytics() {
  try {
    const data = await fetchAnalytics(state.analyticsPeriod);
    const { dailyVisits, topPages, topSearches } = data.data;
    
    // Daily visits chart
    const ctx = $('#dailyVisitsChart');
    if (ctx) {
      if (state.charts.dailyVisits) state.charts.dailyVisits.destroy();
      state.charts.dailyVisits = new Chart(ctx, {
        type: 'line',
        data: {
          labels: dailyVisits.map(d => d.date),
          datasets: [{
            label: 'Page Visits',
            data: dailyVisits.map(d => d.count),
            borderColor: '#0ea5e9',
            backgroundColor: 'rgba(14, 165, 233, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointHoverRadius: 5,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false } },
            y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,0.1)' } },
          },
        },
      });
    }
    
    // Top pages table
    $('#topPagesTable tbody').innerHTML = topPages.map(p => `
      <tr><td><code>${escapeHtml(p.page)}</code></td><td>${formatNumber(p.count)}</td></tr>
    `).join('') || '<tr><td colspan="2" style="text-align:center;color:var(--text-muted);">No data</td></tr>';
    
    // Top searches table
    $('#topSearchesTable tbody').innerHTML = topSearches.map(s => `
      <tr><td>${escapeHtml(s.term)}</td><td>${formatNumber(s.count)}</td></tr>
    `).join('') || '<tr><td colspan="2" style="text-align:center;color:var(--text-muted);">No data</td></tr>';
    
  } catch (e) {
    showToast('Failed to load analytics: ' + e.message, 'error');
  }
}

async function renderMedicines() {
  try {
    const data = await fetchMedicineStats();
    const stats = data.data;
    
    // Stats cards
    const grid = $('#medStatsGrid');
    const cards = [
      { key: 'nafdac.total', label: 'NAFDAC Records', value: stats.nafdac?.total ?? 0, icon: 'database', class: 'primary' },
      { key: 'clinical.totalIngredients', label: 'Clinical Ingredients', value: stats.clinical?.totalIngredients ?? 0, icon: 'flask-conical', class: 'purple' },
      { key: 'dailymed.totalLabels', label: 'DailyMed Labels', value: stats.dailymed?.totalLabels ?? 0, icon: 'file-text', class: 'warning' },
      { key: 'dailymed.withMedia', label: 'Labels with Media', value: stats.dailymed?.withMedia ?? 0, icon: 'image', class: 'info' },
      { key: 'images.totalDrugs', label: 'Total Drugs', value: stats.images?.totalDrugs ?? 0, icon: 'package', class: 'primary' },
      { key: 'images.withImages', label: 'Drugs with Images', value: stats.images?.withImages ?? 0, icon: 'check-circle', class: 'success' },
      { key: 'images.coveragePercent', label: 'Image Coverage', value: stats.images?.coveragePercent ?? 0, icon: 'percent', class: 'success', suffix: '%' },
    ];
    
    const icons = {
      database: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
      'flask-conical': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 2v7.31"/><path d="M14 2v7.31"/><path d="M8.5 2h7"/><path d="M7 16.31c0 .8.3 1.5.8 2H4a1 1 0 0 1-.8-.8c-.1-.5-.2-1-.2-1.5"/><path d="M17 16.31c0 .8.3 1.5.8 2h2.2a1 1 0 0 0 .8-.8c.1-.5.2-1 .2-1.5"/></svg>',
      'file-text': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>',
      image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
      package: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
      'check-circle': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      percent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>',
    };
    
    grid.innerHTML = cards.map(card => `
      <div class="stat-card" data-aos="fade-up">
        <div class="stat-icon ${card.class}">${icons[card.icon]}</div>
        <div class="stat-content">
          <div class="stat-value">${card.suffix ? card.value + card.suffix : formatNumber(card.value)}</div>
          <div class="stat-label">${card.label}</div>
        </div>
      </div>
    `).join('');
    
    // NAFDAC status table
    const nafdacStatus = stats.nafdac?.byStatus || [];
    $('#nafdacStatusTable').innerHTML = nafdacStatus.map(s => `
      <tr><td><span class="badge badge-${s.value.toLowerCase().replace('_', '-')}">${escapeHtml(s.value)}</span></td><td>${formatNumber(s.count)}</td></tr>
    `).join('') || '<tr><td colspan="2" style="text-align:center;color:var(--text-muted);">No data</td></tr>';
    
    // NAFDAC manufacturers
    const nafdacMfr = stats.nafdac?.byManufacturer || [];
    $('#nafdacMfrTable').innerHTML = nafdacMfr.map(m => `
      <tr><td>${escapeHtml(m.value)}</td><td>${formatNumber(m.count)}</td></tr>
    `).join('') || '<tr><td colspan="2" style="text-align:center;color:var(--text-muted);">No data</td></tr>';
    
    // Clinical sources
    const clinicalSources = stats.clinical?.bySource || [];
    $('#clinicalSourceTable').innerHTML = clinicalSources.map(s => `
      <tr><td>${escapeHtml(s.value)}</td><td>${formatNumber(s.count)}</td></tr>
    `).join('') || '<tr><td colspan="2" style="text-align:center;color:var(--text-muted);">No data</td></tr>';
    
    // DailyMed stats
    $('#dailymedStats').innerHTML = `
      <div class="stat-mini"><div class="stat-mini-value">${formatNumber(stats.dailymed?.totalLabels ?? 0)}</div><div class="stat-mini-label">Total Labels</div></div>
      <div class="stat-mini"><div class="stat-mini-value">${formatNumber(stats.dailymed?.withMedia ?? 0)}</div><div class="stat-mini-label">With Media</div></div>
      <div class="stat-mini"><div class="stat-mini-value">${formatNumber(stats.dailymed?.withoutMedia ?? 0)}</div><div class="stat-mini-label">Without Media</div></div>
    `;
    
    // Image stats
    $('#imageStats').innerHTML = `
      <div class="stat-mini"><div class="stat-mini-value">${formatNumber(stats.images?.totalDrugs ?? 0)}</div><div class="stat-mini-label">Total Drugs</div></div>
      <div class="stat-mini"><div class="stat-mini-value">${formatNumber(stats.images?.withImages ?? 0)}</div><div class="stat-mini-label">With Images</div></div>
      <div class="stat-mini"><div class="stat-mini-value">${stats.images?.coveragePercent ?? 0}%</div><div class="stat-mini-label">Coverage</div></div>
    `;
    
  } catch (e) {
    showToast('Failed to load medicine stats: ' + e.message, 'error');
  }
}

async function renderJobs(page = 1) {
  state.jobsPage = page;
  try {
    const data = await fetchJobs(page, state.jobsFilters);
    const { runs, total } = data.data;
    
    $('#jobsTable tbody').innerHTML = runs.map(job => `
      <tr>
        <td><code>${escapeHtml(job.job_type)}</code></td>
        <td>${escapeHtml(job.source || '—')}</td>
        <td><span class="badge ${getStatusBadgeClass(job.status)}">${escapeHtml(job.status)}</span></td>
        <td>${formatNumber(job.records_found)}</td>
        <td>${formatNumber(job.records_inserted)}</td>
        <td>${formatNumber(job.records_updated)}</td>
        <td>${formatNumber(job.records_skipped)}</td>
        <td>${job.error_message ? `<span class="text-danger" title="${escapeHtml(job.error_message)}">${escapeHtml(job.error_message.substring(0, 50))}…</span>` : '—'}</td>
        <td>${formatDate(job.started_at)}</td>
        <td>${formatDate(job.finished_at)}</td>
        <td>
          ${(job.status === 'failed' || job.status === 'cancelled') 
            ? `<button class="btn btn-ghost btn-xs" onclick="retryJobHandler('${job.id}')">Retry</button>`
            : '—'}
        </td>
      </tr>
    `).join('') || '<tr><td colspan="11" style="text-align:center;color:var(--text-muted);padding:2rem;">No jobs found</td></tr>';
    
    // Pagination
    const totalPages = Math.ceil(total / 50);
    renderPagination('jobsPagination', page, totalPages, (p) => renderJobs(p));
    
  } catch (e) {
    showToast('Failed to load jobs: ' + e.message, 'error');
  }
}

async function renderCoverage() {
  try {
    const data = await fetchCoverage();
    const { byState, byStatus, bySource, areas } = data.data;
    
    // Coverage stats
    const grid = $('#coverageStatsGrid');
    const totalAreas = byStatus.reduce((sum, s) => sum + s.count, 0);
    const doneAreas = byStatus.find(s => s.value === 'done')?.count || 0;
    const pendingAreas = byStatus.find(s => s.value === 'pending')?.count || 0;
    const failedAreas = byStatus.find(s => s.value === 'failed')?.count || 0;
    const totalFacilities = bySource.reduce((sum, s) => sum + s.count, 0);
    
    grid.innerHTML = [
      { label: 'Total Areas', value: totalAreas, icon: 'layers', class: 'primary' },
      { label: 'Completed', value: doneAreas, icon: 'check-circle', class: 'success' },
      { label: 'Pending', value: pendingAreas, icon: 'clock', class: 'warning' },
      { label: 'Failed', value: failedAreas, icon: 'x-circle', class: 'danger' },
      { label: 'Total Facilities', value: totalFacilities, icon: 'map-pin', class: 'info' },
      { label: 'Progress', value: totalAreas ? Math.round(doneAreas / totalAreas * 100) + '%' : '0%', icon: 'trending-up', class: 'success' },
    ].map(card => `
      <div class="stat-card" data-aos="fade-up">
        <div class="stat-icon ${card.class}">${getIcon(card.icon)}</div>
        <div class="stat-content">
          <div class="stat-value">${card.value}</div>
          <div class="stat-label">${card.label}</div>
        </div>
      </div>
    `).join('');
    
    // State table
    $('#coverageStateTable tbody').innerHTML = byState.map(s => {
      const progress = s.total > 0 ? Math.round(s.done / s.total * 100) : 0;
      return `
        <tr>
          <td>${escapeHtml(s.state)}</td>
          <td>${s.total}</td>
          <td>${s.done}</td>
          <td>${s.pending}</td>
          <td>${s.failed}</td>
          <td>${formatNumber(s.places)}</td>
          <td>
            <div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div>
            <span style="font-size:0.75rem;color:var(--text-muted);">${progress}%</span>
          </td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">No data</td></tr>';
    
    // Facility sources
    $('#facilitySourceTable tbody').innerHTML = bySource.map(s => `
      <tr><td>${escapeHtml(s.value)}</td><td>${formatNumber(s.count)}</td></tr>
    `).join('') || '<tr><td colspan="2" style="text-align:center;color:var(--text-muted);">No data</td></tr>';
    
  } catch (e) {
    showToast('Failed to load coverage: ' + e.message, 'error');
  }
}

async function renderImages(page = 1) {
  state.imagesPage = page;
  try {
    // For now, we'll use a simple API call - in reality this would need a dedicated endpoint
    // Using job_runs as a proxy for now
    showToast('Image candidates endpoint not yet implemented', 'warning');
  } catch (e) {
    showToast('Failed to load images: ' + e.message, 'error');
  }
}

async function renderHealth() {
  try {
    const data = await fetchHealth();
    const checks = data.data;
    
    const grid = $('#healthStatsGrid');
    const statuses = [
      { key: 'database', label: 'Database', icon: 'database' },
      { key: 'supabase', label: 'Supabase', icon: 'server' },
      { key: 'storage', label: 'Storage', icon: 'hard-drive' },
      { key: 'api', label: 'API', icon: 'cpu' },
    ];
    
    grid.innerHTML = statuses.map(s => {
      const status = checks[s.key];
      const isOk = status === 'ok' || status === 'connected' || status === 'memory';
      return `
        <div class="stat-card" data-aos="fade-up">
          <div class="stat-icon ${isOk ? 'success' : 'danger'}">${getIcon(s.icon)}</div>
          <div class="stat-content">
            <div class="stat-value"><span class="badge ${isOk ? 'badge-success' : 'badge-failed'}">${escapeHtml(status)}</span></div>
            <div class="stat-label">${s.label}</div>
          </div>
        </div>
      `;
    }).join('');
    
    // Health checks table
    $('#healthChecksTable tbody').innerHTML = Object.entries(checks).map(([key, value]) => `
      <tr>
        <td>${escapeHtml(key)}</td>
        <td><span class="badge ${(value === 'ok' || value === 'connected' || value === 'memory') ? 'badge-success' : 'badge-failed'}">${escapeHtml(value)}</span></td>
        <td>${escapeHtml(typeof value === 'object' ? JSON.stringify(value) : '—')}</td>
      </tr>
    `).join('');
    
  } catch (e) {
    showToast('Failed to load health: ' + e.message, 'error');
  }
}

// ============================================
// Event Handlers
// ============================================
function showSection(sectionId) {
  $$('.admin-section').forEach(s => s.classList.remove('active'));
  $$('.nav-link').forEach(l => l.classList.remove('active'));
  
  const section = $(`#${sectionId}`);
  const link = $(`.nav-link[data-section="${sectionId}"]`);
  
  if (section) section.classList.add('active');
  if (link) link.classList.add('active');
  
  state.currentSection = sectionId;
  $('#pageTitle').textContent = link?.textContent?.trim() || sectionId;
  
  // Load section data
  switch (sectionId) {
    case 'overview': loadOverview(); break;
    case 'analytics': renderAnalytics(); break;
    case 'medicines': renderMedicines(); break;
    case 'jobs': renderJobs(1); break;
    case 'coverage': renderCoverage(); break;
    case 'images': renderImages(1); break;
    case 'health': renderHealth(); break;
  }
  
  // Close sidebar on mobile
  $('#sidebar')?.classList.remove('open');
}

async function loadOverview() {
  try {
    const data = await fetchOverview();
    renderOverview(data.data);
  } catch (e) {
    showToast('Failed to load overview: ' + e.message, 'error');
  }
}

async function retryJobHandler(id) {
  try {
    showToast('Retrying job...', 'info');
    const data = await retryJob(id);
    showToast('Job queued for retry', 'success');
    if (state.currentSection === 'jobs') renderJobs(state.jobsPage);
    else if (state.currentSection === 'overview') loadOverview();
  } catch (e) {
    showToast('Failed to retry job: ' + e.message, 'error');
  }
}

async function triggerJobHandler(jobType, params = {}) {
  try {
    showToast(`Triggering ${jobType}...`, 'info');
    const data = await triggerJob(jobType, params);
    showToast(`${jobType} queued successfully`, 'success');
    addTriggerLog(jobType, 'queued', JSON.stringify(params));
  } catch (e) {
    showToast(`Failed to trigger ${jobType}: ${e.message}`, 'error');
    addTriggerLog(jobType, 'failed', e.message);
  }
}

function addTriggerLog(job, status, details) {
  const tbody = $('#triggerLogTable tbody');
  const row = document.createElement('tr');
  row.innerHTML = `
    <td>${formatDate(new Date().toISOString())}</td>
    <td><code>${escapeHtml(job)}</code></td>
    <td><span class="badge ${status === 'queued' ? 'badge-queued' : 'badge-failed'}">${escapeHtml(status)}</span></td>
    <td>${escapeHtml(details.substring(0, 100))}</td>
  `;
  tbody.insertBefore(row, tbody.firstChild);
}

function renderPagination(containerId, currentPage, totalPages, onPageChange) {
  const container = $(`#${containerId}`);
  if (totalPages <= 1) { container.innerHTML = ''; return; }
  
  let html = '';
  if (currentPage > 1) html += `<button onclick="${onPageChange.name}(${currentPage - 1})">« Prev</button>`;
  
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  
  if (start > 1) { html += `<button onclick="${onPageChange.name}(1)">1</button>`; if (start > 2) html += `<span>…</span>`; }
  for (let i = start; i <= end; i++) {
    html += `<button class="${i === currentPage ? 'active' : ''}" onclick="${onPageChange.name}(${i})">${i}</button>`;
  }
  if (end < totalPages) { if (end < totalPages - 1) html += `<span>…</span>`; html += `<button onclick="${onPageChange.name}(${totalPages})">${totalPages}</button>`; }
  if (currentPage < totalPages) html += `<button onclick="${onPageChange.name}(${currentPage + 1})">Next »</button>`;
  
  container.innerHTML = html;
}

// ============================================
// Modal Handlers
// ============================================
function openImageModal(candidate) {
  state.selectedImageId = candidate.id;
  $('#modalDrug').textContent = candidate.drug_name || '—';
  $('#modalNrn').textContent = candidate.nrn || '—';
  $('#modalQuery').textContent = candidate.search_query || '—';
  $('#modalSourceLink').href = candidate.source_page_url || '#';
  $('#modalSourceLink').textContent = candidate.source_domain || '—';
  $('#modalDims').textContent = candidate.image_width && candidate.image_height ? `${candidate.image_width}×${candidate.image_height}` : '—';
  $('#modalImage').src = candidate.thumbnail_url || candidate.image_url;
  $('#modalImage').alt = `Candidate image for ${candidate.drug_name || candidate.nrn}`;
  $('#decisionApproved').checked = true;
  $('#rejectionReasonDiv').hidden = true;
  $('#rejectionNote').hidden = true;
  $('#imageModal').hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeImageModal() {
  $('#imageModal').hidden = true;
  document.body.style.overflow = '';
  state.selectedImageId = null;
}

$('#decisionApproved').addEventListener('change', () => {
  $('#rejectionReasonDiv').hidden = true;
  $('#rejectionNote').hidden = true;
});

$('#decisionRejected').addEventListener('change', () => {
  $('#rejectionReasonDiv').hidden = false;
  $('#rejectionNote').hidden = false;
});

async function submitImageReview() {
  if (!state.selectedImageId) return;
  
  const approved = $('#decisionApproved').checked;
  const reason = $('#rejectionReason').value;
  const note = $('#rejectionNote').value;
  
  // This would call an API endpoint to update the candidate
  showToast('Image review submission not yet implemented', 'warning');
  closeImageModal();
}

// ============================================
// Initialization
// ============================================
function initSidebar() {
  // Navigation clicks
  $$('.nav-link[data-section]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      showSection(link.dataset.section);
    });
  });
  
  // Mobile toggle
  $('#sidebarToggle')?.addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
    const expanded = $('#sidebar').classList.contains('open');
    $('#sidebarToggle').setAttribute('aria-expanded', expanded);
  });
  
  // Close sidebar on overlay click (mobile)
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 1024 && 
        !$('#sidebar').contains(e.target) && 
        !$('#sidebarToggle').contains(e.target)) {
      $('#sidebar').classList.remove('open');
    }
  });
}

function initControls() {
  // Refresh buttons
  $('#refreshBtn')?.addEventListener('click', () => {
    if (state.currentSection === 'overview') loadOverview();
    else if (state.currentSection === 'jobs') renderJobs(state.jobsPage);
    else if (state.currentSection === 'analytics') renderAnalytics();
    else if (state.currentSection === 'medicines') renderMedicines();
    else if (state.currentSection === 'coverage') renderCoverage();
    else if (state.currentSection === 'images') renderImages(state.imagesPage);
    else if (state.currentSection === 'health') renderHealth();
  });
  
  // Analytics period
  $('#analyticsPeriod')?.addEventListener('change', (e) => {
    state.analyticsPeriod = parseInt(e.target.value);
    renderAnalytics();
  });
  $('#refreshAnalytics')?.addEventListener('click', renderAnalytics);
  
  // Jobs filters
  $('#jobStatusFilter')?.addEventListener('change', (e) => {
    state.jobsFilters.status = e.target.value;
    renderJobs(1);
  });
  $('#jobTypeFilter')?.addEventListener('change', (e) => {
    state.jobsFilters.type = e.target.value;
    renderJobs(1);
  });
  $('#jobSearch')?.addEventListener('input', debounce((e) => {
    state.jobsFilters.search = e.target.value;
    renderJobs(1);
  }, 300));
  $('#refreshJobs')?.addEventListener('click', () => renderJobs(state.jobsPage));
  
  // Medicine tabs
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tab-btn').forEach(b => b.classList.remove('active'));
      $$('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $(`#tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
  
  // Image filters
  $('#imageStatusFilter')?.addEventListener('change', (e) => {
    state.imagesFilters.status = e.target.value;
    renderImages(1);
  });
  $('#imageSearch')?.addEventListener('input', debounce((e) => {
    state.imagesFilters.search = e.target.value;
    renderImages(1);
  }, 300));
  $('#refreshImages')?.addEventListener('click', () => renderImages(state.imagesPage));
  $('#triggerImageEnrichment')?.addEventListener('click', () => triggerJobHandler('enrich-images'));
  
  // Action buttons
  $$('.action-btn[data-job]').forEach(btn => {
    btn.addEventListener('click', () => {
      const job = btn.dataset.job;
      const params = btn.dataset.params ? JSON.parse(btn.dataset.params) : {};
      triggerJobHandler(job, params);
    });
  });
  
  // Modal
  $('#modalClose')?.addEventListener('click', closeImageModal);
  $('#modalCancel')?.addEventListener('click', closeImageModal);
  $('#modalSubmit')?.addEventListener('click', submitImageReview);
  $('#imageModal .modal-overlay')?.addEventListener('click', closeImageModal);
  
  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeImageModal();
  });
}

function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

function initCharts() {
  // Chart.js defaults
  Chart.defaults.font.family = getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim() || 'Inter';
  Chart.defaults.color = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#475569';
  Chart.defaults.borderColor = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim() || '#e2e8f0';
}

function initAOS() {
  if (typeof AOS !== 'undefined') {
    AOS.init({ duration: 400, easing: 'ease-out', once: true });
  }
}

function checkAuth() {
  if (!ADMIN_TOKEN) {
    const token = prompt('Enter admin token:');
    if (token) {
      localStorage.setItem('admin_token', token);
      location.reload();
    } else {
      document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;color:#64748b;">Admin access required</div>';
      return false;
    }
  }
  return true;
}

// ============================================
// Main Entry Point
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth()) return;
  
  initSidebar();
  initControls();
  initCharts();
  initAOS();
  
  // Load initial section
  showSection('overview');
  
  // Periodic health check
  setInterval(() => {
    if (state.currentSection === 'health') renderHealth();
  }, 60000);
  
  console.log('Kemist Admin Dashboard initialized');
});

// Expose for inline handlers
window.retryJobHandler = retryJobHandler;
window.triggerJobHandler = triggerJobHandler;