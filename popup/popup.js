/**
 * BlockForge - Enhanced Popup Script
 * Shows per-site stats and allows unblocking specific items
 */

// State
let currentTab = null;
let currentHostname = '';
let isEnabled = true;
let siteBlocked = [];
let siteExceptions = [];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await initialize();
  setupEventListeners();
  setupTabs();
});

/**
 * Initialize popup
 */
async function initialize() {
  try {
    // Get current tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tabs[0];
    
    // Get hostname
    if (currentTab?.url) {
      try {
        const url = new URL(currentTab.url);
        currentHostname = url.hostname;
        document.getElementById('hostname').textContent = currentHostname || 'New Tab';
      } catch {
        document.getElementById('hostname').textContent = 'Browser Page';
      }
    }
    
    // Load all data
    await loadStatus();
    await loadSiteData();
    await loadBlockedItems();
    
  } catch (error) {
    console.error('Init error:', error);
  }
}

/**
 * Load global status
 */
async function loadStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getStatus' });
    
    if (response) {
      isEnabled = response.isEnabled !== false;
      updatePowerButton();
      updateGlobalStats(response.statistics || {});
    }
  } catch (error) {
    console.error('Status error:', error);
  }
}

/**
 * Load site-specific data
 */
async function loadSiteData() {
  try {
    // Check if site is whitelisted
    const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
    const settings = response?.settings || {};
    const whitelist = settings.whitelist || [];
    
    const isWhitelisted = whitelist.includes(currentHostname);
    updateSiteStatus(isWhitelisted);
    
    // Load site exceptions
    const exceptionsKey = `exceptions_${currentHostname}`;
    const data = await chrome.storage.local.get([exceptionsKey]);
    siteExceptions = data[exceptionsKey] || [];
    updateExceptionsList();
    
  } catch (error) {
    console.error('Site data error:', error);
  }
}

/**
 * Load blocked items for current site
 */
async function loadBlockedItems() {
  try {
    // Get blocked items from background using tab ID for accuracy
    const response = await chrome.runtime.sendMessage({ 
      action: 'getTabBlocked',
      tabId: currentTab?.id,
      hostname: currentHostname
    });
    
    if (response?.blockedItems) {
      siteBlocked = response.blockedItems;
      siteExceptions = response.exceptions || [];
    } else {
      // Fallback: get from statistics and filter
      const statsResponse = await chrome.runtime.sendMessage({ action: 'getStatistics' });
      const blockLog = statsResponse?.blockLog || [];
      
      // Filter for current tab or hostname
      siteBlocked = blockLog.filter(item => {
        if (currentTab?.id && item.tabId === currentTab.id) {
          return true;
        }
        try {
          const url = new URL(item.url);
          return url.hostname.includes(currentHostname) || 
                 item.url.includes(currentHostname);
        } catch {
          return false;
        }
      });
    }
    
    // Update page stats
    updatePageStats();
    
    // Update blocked list
    updateBlockedList();
    
    // Update count in tab
    document.getElementById('blockedCount').textContent = siteBlocked.length;
    
  } catch (error) {
    console.error('Blocked items error:', error);
  }
}

/**
 * Update power button state
 */
function updatePowerButton() {
  const powerBtn = document.getElementById('powerBtn');
  if (isEnabled) {
    powerBtn.classList.remove('disabled');
  } else {
    powerBtn.classList.add('disabled');
  }
}

/**
 * Update site status display
 */
function updateSiteStatus(isWhitelisted) {
  const statusDot = document.querySelector('.site-status .status-dot');
  const statusText = document.querySelector('.site-status .status-text');
  const toggleIcon = document.getElementById('siteToggleIcon');
  const toggleBtn = document.getElementById('siteToggleBtn');
  
  if (isWhitelisted) {
    statusDot.className = 'status-dot inactive';
    statusText.textContent = 'Not Protected (Whitelisted)';
    toggleIcon.textContent = '✗';
    toggleBtn.classList.add('whitelisted');
  } else {
    statusDot.className = 'status-dot active';
    statusText.textContent = 'Protected';
    toggleIcon.textContent = '✓';
    toggleBtn.classList.remove('whitelisted');
  }
}

/**
 * Update global statistics
 */
function updateGlobalStats(stats) {
  document.getElementById('totalBlocked').textContent = formatNumber(stats.totalBlocked || 0);
  document.getElementById('totalAds').textContent = formatNumber(stats.adsBlocked || 0);
  document.getElementById('totalTrackers').textContent = formatNumber(stats.trackersBlocked || 0);
  document.getElementById('dataSaved').textContent = formatBytes(stats.dataSaved || 0);
}

/**
 * Update page-specific stats
 */
function updatePageStats() {
  const total = siteBlocked.length;
  const ads = siteBlocked.filter(i => i.type === 'ad').length;
  const trackers = siteBlocked.filter(i => i.type === 'tracker').length;
  const other = total - ads - trackers;
  
  document.getElementById('pageTotal').textContent = total;
  document.getElementById('pageAds').textContent = ads;
  document.getElementById('pageTrackers').textContent = trackers;
  document.getElementById('pageOther').textContent = other;
}

/**
 * Update blocked items list
 */
function updateBlockedList(filter = 'all') {
  const container = document.getElementById('blockedList');
  
  let items = siteBlocked;
  if (filter !== 'all') {
    items = items.filter(i => i.type === filter);
  }
  
  if (items.length === 0) {
    container.innerHTML = '<div class="empty-state">No items blocked yet on this page</div>';
    return;
  }
  
  // Show last 50 items
  const recent = items.slice(0, 50);
  
  let html = '';
  recent.forEach((item, index) => {
    const domain = extractDomain(item.url);
    const typeClass = item.type || 'unknown';
    const typeLabel = (item.type || 'unknown').charAt(0).toUpperCase() + (item.type || 'unknown').slice(1);
    const shortUrl = item.url.length > 60 ? item.url.substring(0, 60) + '...' : item.url;
    
    html += `
      <div class="blocked-item" data-index="${index}">
        <div class="blocked-item-header">
          <span class="blocked-type ${typeClass}">${typeLabel}</span>
          <span class="blocked-domain">${domain}</span>
          <button class="unblock-btn" data-url="${encodeURIComponent(item.url)}" title="Allow this">✓</button>
        </div>
        <div class="blocked-url" title="${item.url}">${shortUrl}</div>
      </div>
    `;
  });
  
  container.innerHTML = html;
  
  // Add unblock handlers
  container.querySelectorAll('.unblock-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = decodeURIComponent(btn.dataset.url);
      addException(url);
    });
  });
}

/**
 * Update exceptions list
 */
function updateExceptionsList() {
  const container = document.getElementById('unblockedList');
  
  if (siteExceptions.length === 0) {
    container.innerHTML = '<div class="empty-state">No custom exceptions</div>';
    return;
  }
  
  let html = '';
  siteExceptions.forEach((exception, index) => {
    const shortUrl = exception.length > 50 ? exception.substring(0, 50) + '...' : exception;
    html += `
      <div class="exception-item">
        <span class="exception-url" title="${exception}">${shortUrl}</span>
        <button class="remove-exception-btn" data-index="${index}" title="Remove">✗</button>
      </div>
    `;
  });
  
  container.innerHTML = html;
  
  // Add remove handlers
  container.querySelectorAll('.remove-exception-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      removeException(parseInt(btn.dataset.index));
    });
  });
}

/**
 * Add exception for a URL
 */
async function addException(url) {
  try {
    // Send to background to create dynamic allow rule
    const response = await chrome.runtime.sendMessage({
      action: 'addException',
      hostname: currentHostname,
      url: url
    });
    
    if (response?.success) {
      siteExceptions = response.exceptions || [];
      updateExceptionsList();
      
      // Also update local storage backup
      const key = `exceptions_${currentHostname}`;
      await chrome.storage.local.set({ [key]: siteExceptions });
      
      showToast('✓ Exception added! Reload page to apply.');
    }
  } catch (error) {
    console.error('Add exception error:', error);
    showToast('Failed to add exception');
  }
}

/**
 * Remove exception
 */
async function removeException(index) {
  try {
    const url = siteExceptions[index];
    
    // Send to background to remove dynamic allow rule
    const response = await chrome.runtime.sendMessage({
      action: 'removeException',
      hostname: currentHostname,
      url: url
    });
    
    if (response?.success) {
      siteExceptions = response.exceptions || [];
      updateExceptionsList();
      
      // Also update local storage backup
      const key = `exceptions_${currentHostname}`;
      await chrome.storage.local.set({ [key]: siteExceptions });
      
      showToast('✓ Exception removed! Reload page to apply.');
    }
  } catch (error) {
    console.error('Remove exception error:', error);
    showToast('Failed to remove exception');
  }
}

/**
 * Extract pattern from URL
 */
function extractPattern(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname + parsed.pathname.split('?')[0];
  } catch {
    return url;
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Power button
  document.getElementById('powerBtn').addEventListener('click', async () => {
    const response = await chrome.runtime.sendMessage({ action: 'toggleProtection' });
    if (response) {
      isEnabled = response.isEnabled;
      updatePowerButton();
      
      // Show toast
      showToast(isEnabled ? 'Protection enabled' : 'Protection disabled');
      
      // Reload current tab to apply changes
      if (currentTab?.id) {
        chrome.tabs.reload(currentTab.id);
      }
    }
  });
  
  // Site toggle (whitelist)
  document.getElementById('siteToggleBtn').addEventListener('click', async () => {
    const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
    const settings = response?.settings || {};
    const whitelist = settings.whitelist || [];
    const isWhitelisted = whitelist.includes(currentHostname);
    
    if (isWhitelisted) {
      await chrome.runtime.sendMessage({ 
        action: 'removeFromWhitelist', 
        domain: currentHostname 
      });
    } else {
      await chrome.runtime.sendMessage({ 
        action: 'addToWhitelist', 
        domain: currentHostname 
      });
    }
    
    updateSiteStatus(!isWhitelisted);
    showToast(isWhitelisted ? 'Site protection enabled' : 'Site whitelisted');
    
    // Reload tab
    if (currentTab?.id) {
      chrome.tabs.reload(currentTab.id);
    }
  });
  
  // Blocked filter
  document.getElementById('blockedFilter').addEventListener('change', (e) => {
    updateBlockedList(e.target.value);
  });
  
  // Refresh blocked
  document.getElementById('refreshBlockedBtn').addEventListener('click', loadBlockedItems);
  
  // Add exception manually
  document.getElementById('addExceptionBtn').addEventListener('click', () => {
    const input = document.getElementById('exceptionInput');
    const value = input.value.trim();
    if (value) {
      addException(value);
      input.value = '';
    }
  });
  
  document.getElementById('exceptionInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('addExceptionBtn').click();
    }
  });
  
  // Settings toggles
  ['Ads', 'Trackers', 'Miners', 'Fingerprint'].forEach(setting => {
    const toggle = document.getElementById(`toggle${setting}`);
    if (toggle) {
      toggle.addEventListener('change', async (e) => {
        const key = setting === 'Fingerprint' ? 'antiFingerprint' : `block${setting}`;
        await chrome.runtime.sendMessage({
          action: 'updateSettings',
          settings: { [key]: e.target.checked }
        });
      });
    }
  });
  
  // Action buttons
  document.getElementById('openDashboard').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  });
  
  document.getElementById('openSettings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  
  document.getElementById('resetStats').addEventListener('click', async () => {
    if (confirm('Reset all statistics?')) {
      await chrome.runtime.sendMessage({ action: 'resetStatistics' });
      await loadStatus();
      await loadBlockedItems();
      showToast('Statistics reset');
    }
  });
}

/**
 * Setup tabs
 */
function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      
      // Update buttons
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Update content
      tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === `tab-${tabId}`) {
          content.classList.add('active');
        }
      });
    });
  });
}

/**
 * Show toast message
 */
function showToast(message) {
  // Remove existing toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// Utility functions
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

function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    const match = url.match(/(?:https?:\/\/)?([^\/]+)/);
    return match ? match[1] : url.substring(0, 30);
  }
}

// Auto-refresh every 5 seconds
setInterval(() => {
  if (document.visibilityState === 'visible') {
    loadBlockedItems();
  }
}, 5000);

