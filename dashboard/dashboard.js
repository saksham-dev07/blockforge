/**
 * BlockForge - Enhanced Dashboard Script
 * Advanced analytics and detailed statistics
 */

// State
let statistics = {};
let dailyStats = {};
let blockLog = [];
let hourlyStats = {};
let siteStats = {};
let requestTypes = {};
let sessionStartTime = Date.now();

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  setupEventListeners();
  startAutoRefresh();
  updateFooterTime();
});

/**
 * Load dashboard data
 */
async function loadData() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getStatistics' });
    
    if (response) {
      statistics = response.statistics || {};
      dailyStats = response.dailyStats || {};
      blockLog = response.blockLog || [];
    }
    
    // Process additional stats from block log
    processBlockLog();
    updateUI();
    updateLastUpdated();
  } catch (error) {
    console.error('Failed to load data:', error);
    // Fallback to storage
    const data = await chrome.storage.local.get(['statistics', 'dailyStats', 'blockLog']);
    statistics = data.statistics || {};
    dailyStats = data.dailyStats || {};
    blockLog = data.blockLog || [];
    processBlockLog();
    updateUI();
  }
}

/**
 * Process block log for additional statistics
 */
function processBlockLog() {
  hourlyStats = {};
  siteStats = {};
  requestTypes = {};
  
  blockLog.forEach(block => {
    // Hourly stats
    const hour = new Date(block.timestamp).getHours();
    hourlyStats[hour] = (hourlyStats[hour] || 0) + 1;
    
    // Site stats (source site)
    if (block.source) {
      const sourceDomain = extractDomain(block.source);
      if (!siteStats[sourceDomain]) {
        siteStats[sourceDomain] = { total: 0, ads: 0, trackers: 0, miners: 0, malware: 0 };
      }
      siteStats[sourceDomain].total++;
      if (block.type === 'ad') siteStats[sourceDomain].ads++;
      else if (block.type === 'tracker') siteStats[sourceDomain].trackers++;
      else if (block.type === 'miner') siteStats[sourceDomain].miners++;
      else if (block.type === 'malware') siteStats[sourceDomain].malware++;
    }
    
    // Request types
    const reqType = block.resourceType || 'other';
    requestTypes[reqType] = (requestTypes[reqType] || 0) + 1;
  });
}

/**
 * Update all UI elements
 */
function updateUI() {
  updateOverviewCards();
  updateSecondaryStats();
  updateCategoryChart();
  updateTrendsChart();
  updateHourlyChart();
  updateProtectionSummary();
  updateRecentBlocks();
  updateTopDomains();
  updateTopSites();
  updateRequestTypes();
  updatePrivacyScore();
}

/**
 * Update overview stat cards
 */
function updateOverviewCards() {
  const total = statistics.totalBlocked || 0;
  
  // Total blocked
  const totalEl = document.getElementById('totalBlocked');
  if (totalEl) totalEl.textContent = formatNumber(total);
  
  // Ads blocked
  const adsEl = document.getElementById('adsBlocked');
  const adsPercEl = document.getElementById('adsPercent');
  const ads = statistics.adsBlocked || 0;
  if (adsEl) adsEl.textContent = formatNumber(ads);
  if (adsPercEl) adsPercEl.textContent = total > 0 ? Math.round(ads / total * 100) + '%' : '0%';
  
  // Trackers blocked
  const trackersEl = document.getElementById('trackersBlocked');
  const trackersPercEl = document.getElementById('trackersPercent');
  const trackers = statistics.trackersBlocked || 0;
  if (trackersEl) trackersEl.textContent = formatNumber(trackers);
  if (trackersPercEl) trackersPercEl.textContent = total > 0 ? Math.round(trackers / total * 100) + '%' : '0%';
  
  // Miners blocked
  const minersEl = document.getElementById('minersBlocked');
  const minersPercEl = document.getElementById('minersPercent');
  const miners = statistics.minersBlocked || 0;
  if (minersEl) minersEl.textContent = formatNumber(miners);
  if (minersPercEl) minersPercEl.textContent = total > 0 ? Math.round(miners / total * 100) + '%' : '0%';
  
  // Malware blocked
  const malwareEl = document.getElementById('malwareBlocked');
  const malwarePercEl = document.getElementById('malwarePercent');
  const malware = statistics.malwareBlocked || 0;
  if (malwareEl) malwareEl.textContent = formatNumber(malware);
  if (malwarePercEl) malwarePercEl.textContent = total > 0 ? Math.round(malware / total * 100) + '%' : '0%';
  
  // Data saved
  const dataEl = document.getElementById('dataSaved');
  if (dataEl) dataEl.textContent = formatBytes(statistics.dataSaved || 0);
  
  // Time saved
  const timeEl = document.getElementById('timeSaved');
  if (timeEl) timeEl.textContent = formatTime(statistics.timeSaved || 0);
  
  // Trend calculation
  const trendEl = document.getElementById('totalTrend');
  if (trendEl) {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const todayBlocks = dailyStats[today]?.total || 0;
    const yesterdayBlocks = dailyStats[yesterday]?.total || 0;
    
    if (yesterdayBlocks > 0) {
      const change = Math.round((todayBlocks - yesterdayBlocks) / yesterdayBlocks * 100);
      const icon = change >= 0 ? '📈' : '📉';
      trendEl.innerHTML = `<span class="trend-icon">${icon}</span><span class="trend-text">${change >= 0 ? '+' : ''}${change}% vs yesterday</span>`;
    } else if (todayBlocks > 0) {
      trendEl.innerHTML = `<span class="trend-icon">🆕</span><span class="trend-text">${todayBlocks} blocked today</span>`;
    }
  }
}

/**
 * Update secondary stats
 */
function updateSecondaryStats() {
  // Sites visited/protected
  const sitesEl = document.getElementById('sitesVisited');
  if (sitesEl) sitesEl.textContent = formatNumber(Object.keys(siteStats).length);
  
  // Average blocks per page
  const avgEl = document.getElementById('avgPerPage');
  const siteCount = Object.keys(siteStats).length;
  if (avgEl) {
    const avg = siteCount > 0 ? Math.round((statistics.totalBlocked || 0) / siteCount) : 0;
    avgEl.textContent = formatNumber(avg);
  }
  
  // Blocks today
  const todayEl = document.getElementById('blocksToday');
  const today = new Date().toISOString().split('T')[0];
  if (todayEl) todayEl.textContent = formatNumber(dailyStats[today]?.total || 0);
  
  // Active days
  const daysEl = document.getElementById('activeDays');
  if (daysEl) daysEl.textContent = formatNumber(Object.keys(dailyStats).length);
}

/**
 * Update category breakdown chart
 */
function updateCategoryChart() {
  const container = document.getElementById('categoryChart');
  if (!container) return;
  
  const total = (statistics.adsBlocked || 0) + 
                (statistics.trackersBlocked || 0) + 
                (statistics.minersBlocked || 0) + 
                (statistics.malwareBlocked || 0);
  
  if (total === 0) {
    container.innerHTML = '<div class="no-data">No data yet. Start browsing to see statistics.</div>';
    return;
  }
  
  const categories = [
    { name: 'Ads', value: statistics.adsBlocked || 0, color: '#ef4444', icon: '📢' },
    { name: 'Trackers', value: statistics.trackersBlocked || 0, color: '#f59e0b', icon: '👁️' },
    { name: 'Miners', value: statistics.minersBlocked || 0, color: '#8b5cf6', icon: '⛏️' },
    { name: 'Malware', value: statistics.malwareBlocked || 0, color: '#ec4899', icon: '☠️' }
  ];
  
  let html = '<div class="category-cards">';
  
  categories.forEach(cat => {
    const percent = total > 0 ? (cat.value / total * 100).toFixed(1) : 0;
    html += `
      <div class="category-card" style="--cat-color: ${cat.color}">
        <div class="category-icon">${cat.icon}</div>
        <div class="category-info">
          <div class="category-name">${cat.name}</div>
          <div class="category-value">${formatNumber(cat.value)}</div>
        </div>
        <div class="category-bar-wrap">
          <div class="category-bar" style="width: ${percent}%; background: ${cat.color}"></div>
        </div>
        <div class="category-percent">${percent}%</div>
      </div>
    `;
  });
  
  html += '</div>';
  container.innerHTML = html;
}

/**
 * Update trends chart
 */
function updateTrendsChart() {
  const container = document.getElementById('trendsChart');
  if (!container) return;
  
  const rangeSelect = document.getElementById('trendsRange');
  const range = rangeSelect ? parseInt(rangeSelect.value) : 7;
  
  // Get days
  const days = [];
  for (let i = range - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = date.toISOString().split('T')[0];
    const dayName = range <= 7 
      ? date.toLocaleDateString('en-US', { weekday: 'short' })
      : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    days.push({
      key,
      label: dayName,
      data: dailyStats[key] || { total: 0, ads: 0, trackers: 0 }
    });
  }
  
  const maxValue = Math.max(...days.map(d => d.data.total), 1);
  const totalBlocks = days.reduce((sum, d) => sum + d.data.total, 0);
  const avgBlocks = Math.round(totalBlocks / days.length);
  
  let html = `
    <div class="trends-summary">
      <div class="trend-stat">
        <span class="trend-stat-value">${formatNumber(totalBlocks)}</span>
        <span class="trend-stat-label">Total (${range} days)</span>
      </div>
      <div class="trend-stat">
        <span class="trend-stat-value">${formatNumber(avgBlocks)}</span>
        <span class="trend-stat-label">Daily Average</span>
      </div>
    </div>
    <div class="line-chart">
      <div class="chart-bars">
  `;
  
  days.forEach(day => {
    const height = day.data.total > 0 ? Math.max((day.data.total / maxValue * 100), 8) : 5;
    const hasData = day.data.total > 0;
    html += `
      <div class="chart-bar-group" title="${day.key}: ${day.data.total} blocks">
        <div class="chart-bar ${hasData ? '' : 'empty'}" style="height: ${height}%">
          <span class="chart-bar-value">${day.data.total}</span>
        </div>
        <span class="chart-bar-label">${day.label}</span>
      </div>
    `;
  });
  
  html += '</div></div>';
  container.innerHTML = html;
}

/**
 * Update hourly activity chart
 */
function updateHourlyChart() {
  const container = document.getElementById('hourlyChart');
  if (!container) return;
  
  const hours = [];
  for (let i = 0; i < 24; i++) {
    hours.push({ hour: i, count: hourlyStats[i] || 0 });
  }
  
  const maxCount = Math.max(...hours.map(h => h.count), 1);
  const peakHour = hours.reduce((max, h) => h.count > max.count ? h : max, hours[0]);
  
  let html = `
    <div class="hourly-summary">
      <span class="peak-hour">Peak: ${formatHour(peakHour.hour)} (${peakHour.count} blocks)</span>
    </div>
    <div class="hourly-bars">
  `;
  
  hours.forEach(h => {
    const height = h.count > 0 ? Math.max((h.count / maxCount * 100), 3) : 2;
    const isPeak = h.hour === peakHour.hour && peakHour.count > 0;
    html += `
      <div class="hourly-bar ${isPeak ? 'peak' : ''}" 
           style="height: ${height}%" 
           title="${formatHour(h.hour)}: ${h.count} blocks">
      </div>
    `;
  });
  
  html += '</div><div class="hourly-labels"><span>12AM</span><span>6AM</span><span>12PM</span><span>6PM</span><span>11PM</span></div>';
  container.innerHTML = html;
}

/**
 * Update protection summary
 */
function updateProtectionSummary() {
  const container = document.getElementById('protectionSummary');
  if (!container) return;
  
  const total = statistics.totalBlocked || 0;
  const today = new Date().toISOString().split('T')[0];
  const todayBlocks = dailyStats[today]?.total || 0;
  
  const summaryItems = [
    { label: 'Total Threats Blocked', value: formatNumber(total), icon: '🛡️' },
    { label: 'Blocked Today', value: formatNumber(todayBlocks), icon: '📅' },
    { label: 'Sites Protected', value: formatNumber(Object.keys(siteStats).length), icon: '🌐' },
    { label: 'Data Saved', value: formatBytes(statistics.dataSaved || 0), icon: '💾' },
    { label: 'Time Saved', value: formatTime(statistics.timeSaved || 0), icon: '⚡' },
    { label: 'Active Days', value: formatNumber(Object.keys(dailyStats).length), icon: '📊' }
  ];
  
  let html = '<div class="summary-grid">';
  
  summaryItems.forEach(item => {
    html += `
      <div class="summary-item">
        <span class="summary-icon">${item.icon}</span>
        <div class="summary-content">
          <span class="summary-value">${item.value}</span>
          <span class="summary-label">${item.label}</span>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  container.innerHTML = html;
}

/**
 * Update recent blocks log
 */
function updateRecentBlocks() {
  const container = document.getElementById('recentBlocks');
  const badgeEl = document.getElementById('totalBlocksBadge');
  if (!container) return;
  
  if (badgeEl) badgeEl.textContent = `${blockLog.length} blocks`;
  
  if (blockLog.length === 0) {
    container.innerHTML = '<div class="no-data">No blocked requests yet.</div>';
    return;
  }
  
  const recent = blockLog.slice(0, 30);
  
  let html = '<div class="block-log">';
  
  recent.forEach(block => {
    const time = new Date(block.timestamp).toLocaleTimeString();
    const domain = extractDomain(block.url);
    const typeClass = block.type || 'unknown';
    const typeLabel = block.type ? block.type.charAt(0).toUpperCase() + block.type.slice(1) : 'Unknown';
    
    html += `
      <div class="log-item">
        <span class="log-type ${typeClass}">${typeLabel}</span>
        <span class="log-domain" title="${block.url}">${domain}</span>
        <span class="log-time">${time}</span>
      </div>
    `;
  });
  
  html += '</div>';
  container.innerHTML = html;
}

/**
 * Update top blocked domains
 */
function updateTopDomains() {
  const container = document.getElementById('topDomains');
  const badgeEl = document.getElementById('totalDomains');
  if (!container) return;
  
  const domainCounts = {};
  blockLog.forEach(block => {
    const domain = extractDomain(block.url);
    domainCounts[domain] = (domainCounts[domain] || 0) + 1;
  });
  
  const sorted = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  
  if (badgeEl) badgeEl.textContent = `${Object.keys(domainCounts).length} domains`;
  
  if (sorted.length === 0) {
    container.innerHTML = '<div class="no-data">No domains blocked yet.</div>';
    return;
  }
  
  const maxCount = sorted[0][1];
  
  let html = '<div class="domain-list">';
  
  sorted.forEach(([domain, count], index) => {
    const width = (count / maxCount * 100);
    html += `
      <div class="domain-item">
        <span class="domain-rank">${index + 1}</span>
        <div class="domain-info">
          <span class="domain-name">${domain}</span>
          <div class="domain-bar">
            <div class="domain-bar-fill" style="width: ${width}%"></div>
          </div>
        </div>
        <span class="domain-count">${count}</span>
      </div>
    `;
  });
  
  html += '</div>';
  container.innerHTML = html;
}

/**
 * Update top sites protected
 */
function updateTopSites() {
  const container = document.getElementById('topSites');
  if (!container) return;
  
  const sorted = Object.entries(siteStats)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10);
  
  if (sorted.length === 0) {
    container.innerHTML = '<div class="no-data">No site data yet.</div>';
    return;
  }
  
  let html = '<div class="site-list">';
  
  sorted.forEach(([site, stats], index) => {
    html += `
      <div class="site-item">
        <span class="site-rank">${index + 1}</span>
        <div class="site-info">
          <span class="site-name">${site}</span>
          <div class="site-breakdown">
            ${stats.ads > 0 ? `<span class="site-tag ad">${stats.ads} ads</span>` : ''}
            ${stats.trackers > 0 ? `<span class="site-tag tracker">${stats.trackers} trackers</span>` : ''}
            ${stats.miners > 0 ? `<span class="site-tag miner">${stats.miners} miners</span>` : ''}
          </div>
        </div>
        <span class="site-count">${stats.total}</span>
      </div>
    `;
  });
  
  html += '</div>';
  container.innerHTML = html;
}

/**
 * Update request types chart
 */
function updateRequestTypes() {
  const container = document.getElementById('requestTypesChart');
  if (!container) return;
  
  const types = Object.entries(requestTypes).sort((a, b) => b[1] - a[1]);
  
  if (types.length === 0) {
    container.innerHTML = '<div class="no-data">No request type data yet.</div>';
    return;
  }
  
  const total = types.reduce((sum, [, count]) => sum + count, 0);
  const typeColors = {
    'script': '#ef4444',
    'image': '#f59e0b',
    'xmlhttprequest': '#10b981',
    'sub_frame': '#6366f1',
    'stylesheet': '#8b5cf6',
    'font': '#ec4899',
    'media': '#14b8a6',
    'other': '#64748b'
  };
  
  let html = '<div class="request-types-grid">';
  
  types.forEach(([type, count]) => {
    const percent = ((count / total) * 100).toFixed(1);
    const color = typeColors[type] || typeColors.other;
    const label = formatRequestType(type);
    
    html += `
      <div class="request-type-item">
        <div class="request-type-bar" style="--bar-width: ${percent}%; --bar-color: ${color}">
          <span class="request-type-name">${label}</span>
          <span class="request-type-count">${formatNumber(count)} (${percent}%)</span>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  container.innerHTML = html;
}

/**
 * Update privacy score
 */
function updatePrivacyScore() {
  const scoreCircle = document.getElementById('scoreCircle');
  const scoreValue = document.getElementById('scoreValue');
  
  // Calculate scores based on blocking activity
  const hasActivity = (statistics.totalBlocked || 0) > 0;
  
  // Base score starts at 100, but we calculate protection effectiveness
  const adScore = hasActivity && (statistics.adsBlocked || 0) > 0 ? 95 : 70;
  const trackerScore = hasActivity && (statistics.trackersBlocked || 0) > 0 ? 98 : 75;
  const malwareScore = hasActivity ? 100 : 85;
  const miningScore = hasActivity && (statistics.minersBlocked || 0) > 0 ? 100 : 90;
  
  const overallScore = Math.round((adScore + trackerScore + malwareScore + miningScore) / 4);
  
  // Update circle
  if (scoreCircle) {
    const circumference = 2 * Math.PI * 45;
    const offset = circumference - (overallScore / 100) * circumference;
    scoreCircle.style.strokeDasharray = `${circumference}`;
    scoreCircle.style.strokeDashoffset = `${offset}`;
  }
  
  if (scoreValue) scoreValue.textContent = overallScore;
  
  // Update individual scores
  const updateScoreBar = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.style.width = `${value}%`;
  };
  
  updateScoreBar('adScore', adScore);
  updateScoreBar('trackerScore', trackerScore);
  updateScoreBar('malwareScore', malwareScore);
  updateScoreBar('miningScore', miningScore);
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Refresh button
  document.getElementById('refreshBtn')?.addEventListener('click', loadData);
  
  // Settings button
  document.getElementById('settingsBtn')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  
  // Reset stats button
  document.getElementById('resetStats')?.addEventListener('click', async () => {
    if (confirm('Are you sure you want to reset ALL statistics? This cannot be undone.')) {
      await chrome.runtime.sendMessage({ action: 'resetStatistics' });
      await loadData();
    }
  });
  
  // Clear log button
  document.getElementById('clearLogBtn')?.addEventListener('click', async () => {
    if (confirm('Clear the block log? Statistics will be preserved.')) {
      await chrome.storage.local.set({ blockLog: [] });
      blockLog = [];
      processBlockLog();
      updateUI();
    }
  });
  
  // Export data button
  document.getElementById('exportData')?.addEventListener('click', exportData);
  
  // Trends range selector
  document.getElementById('trendsRange')?.addEventListener('change', updateTrendsChart);
  
  // Category time range selector
  document.getElementById('categoryTimeRange')?.addEventListener('change', updateCategoryChart);
}

/**
 * Export statistics as JSON
 */
function exportData() {
  const data = {
    exportDate: new Date().toISOString(),
    statistics,
    dailyStats,
    hourlyStats,
    siteStats,
    requestTypes,
    recentBlocks: blockLog.slice(0, 100)
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `BlockForge-stats-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  
  URL.revokeObjectURL(url);
}

/**
 * Auto refresh
 */
function startAutoRefresh() {
  setInterval(() => {
    if (document.visibilityState === 'visible') {
      loadData();
    }
  }, 10000);
}

/**
 * Update footer timestamps
 */
function updateFooterTime() {
  const sessionEl = document.getElementById('sessionStart');
  if (sessionEl) {
    sessionEl.textContent = new Date(sessionStartTime).toLocaleTimeString();
  }
}

function updateLastUpdated() {
  const el = document.getElementById('lastUpdated');
  if (el) {
    el.textContent = new Date().toLocaleTimeString();
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatTime(ms) {
  if (ms < 1000) return ms + 'ms';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return seconds + 's';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm';
  const hours = Math.floor(minutes / 60);
  return hours + 'h ' + (minutes % 60) + 'm';
}

function formatHour(hour) {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  return `${h}${suffix}`;
}

function formatRequestType(type) {
  const labels = {
    'script': 'Scripts',
    'image': 'Images',
    'xmlhttprequest': 'XHR/Fetch',
    'sub_frame': 'iFrames',
    'stylesheet': 'Stylesheets',
    'font': 'Fonts',
    'media': 'Media',
    'websocket': 'WebSocket',
    'other': 'Other'
  };
  return labels[type] || type.charAt(0).toUpperCase() + type.slice(1);
}

function extractDomain(url) {
  if (!url || url === '' || url === 'undefined' || url === 'null') {
    return 'Unknown';
  }
  try {
    const urlObj = new URL(url);
    return urlObj.hostname || 'Unknown';
  } catch {
    // Fallback for malformed URLs
    const match = url.match(/(?:https?:\/\/)?([^\/\s]+)/);
    const domain = match ? match[1] : url.substring(0, 30);
    return domain || 'Unknown';
  }
}

