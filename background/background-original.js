/**
 * ShieldGuard - Background Service Worker
 * 
 * This is the core of the extension that handles:
 * - Network request monitoring and blocking
 * - DeclarativeNetRequest rule management
 * - Statistics tracking and storage
 * - Communication with content scripts
 * - Filter list updates
 * - AI-powered threat detection coordination
 * 
 * @version 1.0.0
 */

// ============================================================================
// IMPORTS AND INITIALIZATION
// ============================================================================

import { FilterEngine } from './modules/filter-engine.js';
import { AIDetector } from './modules/ai-detector.js';
import { PrivacyEngine } from './modules/privacy-engine.js';
import { Analytics } from './modules/analytics.js';
import { StorageManager } from './modules/storage-manager.js';
import { RuleManager } from './modules/rule-manager.js';

// ============================================================================
// GLOBAL STATE
// ============================================================================

const state = {
  isEnabled: true,
  settings: null,
  statistics: null,
  whitelist: new Set(),
  blacklist: new Set(),
  tabData: new Map(),
  lastUpdate: null
};

// Module instances
let filterEngine = null;
let aiDetector = null;
let privacyEngine = null;
let analytics = null;
let storageManager = null;
let ruleManager = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the extension on startup
 */
async function initialize() {
  console.log('[ShieldGuard] Initializing extension...');
  
  try {
    // Initialize storage manager first
    storageManager = new StorageManager();
    await storageManager.initialize();
    
    // Load settings and state
    state.settings = await storageManager.getSettings();
    state.statistics = await storageManager.getStatistics();
    state.whitelist = new Set(state.settings.whitelist || []);
    state.blacklist = new Set(state.settings.blacklist || []);
    state.isEnabled = state.settings.enabled !== false;
    
    // Initialize other modules
    filterEngine = new FilterEngine();
    await filterEngine.initialize();
    
    aiDetector = new AIDetector();
    await aiDetector.initialize();
    
    privacyEngine = new PrivacyEngine();
    await privacyEngine.initialize(state.settings);
    
    analytics = new Analytics(storageManager);
    await analytics.initialize();
    
    ruleManager = new RuleManager();
    await ruleManager.initialize();
    
    // Set up listeners
    setupRequestListeners();
    setupMessageListeners();
    setupTabListeners();
    setupAlarms();
    
    // Update badge
    updateBadge();
    
    console.log('[ShieldGuard] Extension initialized successfully');
  } catch (error) {
    console.error('[ShieldGuard] Initialization error:', error);
  }
}

// ============================================================================
// REQUEST HANDLING
// ============================================================================

/**
 * Set up request monitoring listeners
 */
function setupRequestListeners() {
  // Listen for declarativeNetRequest matched rules
  if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
    chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
      handleBlockedRequest(info);
    });
  }
  
  // Web navigation listener for page stats
  chrome.webNavigation.onCompleted.addListener((details) => {
    if (details.frameId === 0) {
      handlePageLoad(details);
    }
  });
  
  chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId === 0) {
      initializeTabData(details.tabId, details.url);
    }
  });
}

/**
 * Handle a blocked request
 * @param {Object} info - Rule match info
 */
function handleBlockedRequest(info) {
  if (!state.isEnabled) return;
  
  const { request, rule } = info;
  const tabId = request.tabId;
  const url = request.url;
  
  // Categorize the blocked request
  const category = categorizeBlockedRequest(url, rule);
  
  // Update tab-specific stats
  if (tabId > 0) {
    updateTabStats(tabId, category, url);
  }
  
  // Update global stats
  analytics.recordBlocked(category, url, estimateRequestSize(request));
  
  // AI learning
  aiDetector.learnFromBlocked(url, category);
  
  // Update badge
  updateBadgeForTab(tabId);
}

/**
 * Categorize a blocked request
 * @param {string} url - The blocked URL
 * @param {Object} rule - The matched rule
 * @returns {string} Category name
 */
function categorizeBlockedRequest(url, rule) {
  const urlLower = url.toLowerCase();
  
  // Check rule ID ranges for category
  const ruleId = rule.ruleId;
  
  if (ruleId >= 1 && ruleId < 10000) return 'ads';
  if (ruleId >= 10000 && ruleId < 20000) return 'trackers';
  if (ruleId >= 20000 && ruleId < 30000) return 'social';
  if (ruleId >= 30000 && ruleId < 40000) return 'cryptominers';
  if (ruleId >= 40000 && ruleId < 50000) return 'malware';
  
  // Fallback to URL-based detection
  if (isCryptominer(urlLower)) return 'cryptominers';
  if (isSocialTracker(urlLower)) return 'social';
  if (isAnalytics(urlLower)) return 'trackers';
  if (isAd(urlLower)) return 'ads';
  
  return 'other';
}

/**
 * Check if URL is a cryptominer
 */
function isCryptominer(url) {
  const minerPatterns = [
    'coinhive', 'cryptoloot', 'coin-hive', 'jsecoin', 'cryptonight',
    'minero', 'webminer', 'crypto-loot', 'miner.js', 'deepminer'
  ];
  return minerPatterns.some(p => url.includes(p));
}

/**
 * Check if URL is a social tracker
 */
function isSocialTracker(url) {
  const socialPatterns = [
    'facebook.com/tr', 'facebook.net/signals', 'connect.facebook',
    'twitter.com/i/jot', 'linkedin.com/px', 'pinterest.com/ct',
    'platform.twitter', 'syndication.twitter'
  ];
  return socialPatterns.some(p => url.includes(p));
}

/**
 * Check if URL is analytics
 */
function isAnalytics(url) {
  const analyticsPatterns = [
    'google-analytics', 'googletagmanager', 'analytics.js', 'gtag/js',
    'hotjar', 'mixpanel', 'segment.com', 'amplitude', 'heap.io',
    'fullstory', 'mouseflow', 'crazyegg', 'luckyorange'
  ];
  return analyticsPatterns.some(p => url.includes(p));
}

/**
 * Check if URL is an ad
 */
function isAd(url) {
  const adPatterns = [
    'doubleclick', 'googlesyndication', 'googleadservices',
    'adservice', 'adsense', 'adnxs', 'advertising', 'adtech',
    'openx', 'pubmatic', 'rubiconproject', 'criteo'
  ];
  return adPatterns.some(p => url.includes(p));
}

/**
 * Estimate the size of a blocked request
 */
function estimateRequestSize(request) {
  // Estimate based on request type
  const sizeEstimates = {
    'script': 50000,      // 50KB average
    'image': 100000,      // 100KB average
    'stylesheet': 20000,  // 20KB average
    'xmlhttprequest': 5000,
    'sub_frame': 150000,  // 150KB for iframes
    'other': 10000
  };
  
  return sizeEstimates[request.type] || 10000;
}

// ============================================================================
// TAB DATA MANAGEMENT
// ============================================================================

/**
 * Initialize data tracking for a tab
 */
function initializeTabData(tabId, url) {
  const hostname = new URL(url).hostname;
  
  state.tabData.set(tabId, {
    url: url,
    hostname: hostname,
    blocked: {
      ads: 0,
      trackers: 0,
      social: 0,
      cryptominers: 0,
      malware: 0,
      other: 0
    },
    dataSaved: 0,
    threats: [],
    startTime: Date.now()
  });
}

/**
 * Update statistics for a specific tab
 */
function updateTabStats(tabId, category, url) {
  let tabData = state.tabData.get(tabId);
  
  if (!tabData) {
    tabData = {
      blocked: { ads: 0, trackers: 0, social: 0, cryptominers: 0, malware: 0, other: 0 },
      dataSaved: 0,
      threats: [],
      startTime: Date.now()
    };
    state.tabData.set(tabId, tabData);
  }
  
  if (tabData.blocked[category] !== undefined) {
    tabData.blocked[category]++;
  }
  
  // Track unique threats
  if (!tabData.threats.includes(url)) {
    tabData.threats.push(url);
  }
}

/**
 * Handle page load completion
 */
async function handlePageLoad(details) {
  const tabId = details.tabId;
  const url = details.url;
  
  // Skip chrome:// and extension pages
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
    return;
  }
  
  const hostname = new URL(url).hostname;
  
  // Check if site is whitelisted
  if (isWhitelisted(hostname)) {
    chrome.action.setBadgeText({ text: '✓', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981', tabId });
    return;
  }
  
  // Perform AI threat analysis
  const threatAnalysis = await aiDetector.analyzePage(tabId, url);
  
  if (threatAnalysis.threats.length > 0) {
    // Notify content script about detected threats
    try {
      chrome.tabs.sendMessage(tabId, {
        type: 'THREATS_DETECTED',
        threats: threatAnalysis.threats,
        score: threatAnalysis.score
      });
    } catch (e) {
      // Tab might not have content script
    }
  }
  
  // Update tab data with threat analysis
  const tabData = state.tabData.get(tabId);
  if (tabData) {
    tabData.threatScore = threatAnalysis.score;
    tabData.detectedThreats = threatAnalysis.threats;
  }
}

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

/**
 * Set up message listeners for communication with popup and content scripts
 */
function setupMessageListeners() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender, sendResponse);
    return true; // Keep channel open for async response
  });
}

/**
 * Handle incoming messages
 */
async function handleMessage(message, sender, sendResponse) {
  try {
    switch (message.type) {
      case 'GET_STATUS':
        sendResponse(await getStatus(sender.tab?.id));
        break;
        
      case 'GET_TAB_STATS':
        sendResponse(getTabStats(message.tabId || sender.tab?.id));
        break;
        
      case 'GET_GLOBAL_STATS':
        sendResponse(await analytics.getGlobalStats());
        break;
        
      case 'TOGGLE_PROTECTION':
        state.isEnabled = message.enabled;
        await storageManager.updateSettings({ enabled: message.enabled });
        await ruleManager.setEnabled(message.enabled);
        updateBadge();
        sendResponse({ success: true, enabled: state.isEnabled });
        break;
        
      case 'TOGGLE_SETTING':
        await handleSettingToggle(message.setting, message.value);
        sendResponse({ success: true });
        break;
        
      case 'WHITELIST_SITE':
        await handleWhitelist(message.hostname, message.add);
        sendResponse({ success: true });
        break;
        
      case 'BLACKLIST_SITE':
        await handleBlacklist(message.hostname, message.add);
        sendResponse({ success: true });
        break;
        
      case 'GET_SETTINGS':
        sendResponse(state.settings);
        break;
        
      case 'UPDATE_SETTINGS':
        await storageManager.updateSettings(message.settings);
        state.settings = { ...state.settings, ...message.settings };
        sendResponse({ success: true });
        break;
        
      case 'GET_FILTER_LISTS':
        sendResponse(await filterEngine.getFilterLists());
        break;
        
      case 'UPDATE_FILTER_LISTS':
        await filterEngine.updateFilterLists();
        sendResponse({ success: true });
        break;
        
      case 'ADD_CUSTOM_RULE':
        await filterEngine.addCustomRule(message.rule);
        sendResponse({ success: true });
        break;
        
      case 'REMOVE_CUSTOM_RULE':
        await filterEngine.removeCustomRule(message.ruleId);
        sendResponse({ success: true });
        break;
        
      case 'GET_CUSTOM_RULES':
        sendResponse(await filterEngine.getCustomRules());
        break;
        
      case 'EXPORT_SETTINGS':
        sendResponse(await exportSettings());
        break;
        
      case 'IMPORT_SETTINGS':
        await importSettings(message.data);
        sendResponse({ success: true });
        break;
        
      case 'CONTENT_SCRIPT_READY':
        handleContentScriptReady(sender.tab);
        sendResponse({ success: true });
        break;
        
      case 'REPORT_DOM_BLOCKED':
        analytics.recordDOMBlocked(message.count, message.category);
        sendResponse({ success: true });
        break;
        
      case 'GET_PRIVACY_SETTINGS':
        sendResponse(privacyEngine.getSettings());
        break;
        
      case 'UPDATE_PRIVACY_SETTINGS':
        await privacyEngine.updateSettings(message.settings);
        sendResponse({ success: true });
        break;
        
      case 'AI_ANALYSIS_REQUEST':
        const analysis = await aiDetector.analyzeURL(message.url);
        sendResponse(analysis);
        break;
        
      case 'GET_DASHBOARD_DATA':
        sendResponse(await getDashboardData(message.period));
        break;
        
      default:
        sendResponse({ error: 'Unknown message type' });
    }
  } catch (error) {
    console.error('[ShieldGuard] Message handling error:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * Get current status for popup
 */
async function getStatus(tabId) {
  const tabData = tabId ? state.tabData.get(tabId) : null;
  const globalStats = await analytics.getGlobalStats();
  
  return {
    enabled: state.isEnabled,
    settings: state.settings,
    tabStats: tabData ? {
      blocked: tabData.blocked,
      total: Object.values(tabData.blocked).reduce((a, b) => a + b, 0),
      dataSaved: tabData.dataSaved,
      threatScore: tabData.threatScore || 0,
      threats: tabData.detectedThreats || [],
      isWhitelisted: tabData.hostname ? isWhitelisted(tabData.hostname) : false,
      hostname: tabData.hostname
    } : null,
    globalStats: globalStats
  };
}

/**
 * Get statistics for a specific tab
 */
function getTabStats(tabId) {
  const tabData = state.tabData.get(tabId);
  
  if (!tabData) {
    return {
      blocked: { ads: 0, trackers: 0, social: 0, cryptominers: 0, malware: 0, other: 0 },
      total: 0,
      dataSaved: 0,
      threatScore: 0,
      threats: []
    };
  }
  
  return {
    blocked: tabData.blocked,
    total: Object.values(tabData.blocked).reduce((a, b) => a + b, 0),
    dataSaved: tabData.dataSaved,
    threatScore: tabData.threatScore || 0,
    threats: tabData.detectedThreats || [],
    isWhitelisted: tabData.hostname ? isWhitelisted(tabData.hostname) : false,
    hostname: tabData.hostname
  };
}

/**
 * Handle setting toggle
 */
async function handleSettingToggle(setting, value) {
  state.settings[setting] = value;
  await storageManager.updateSettings({ [setting]: value });
  
  // Apply setting-specific changes
  switch (setting) {
    case 'antiFingerprint':
      await privacyEngine.setAntiFingerprint(value);
      break;
    case 'cookieAutoDelete':
      await privacyEngine.setCookieAutoDelete(value);
      break;
    case 'aiDetection':
      aiDetector.setEnabled(value);
      break;
    case 'blockingLevel':
      await ruleManager.setBlockingLevel(value);
      break;
  }
}

/**
 * Handle whitelist changes
 */
async function handleWhitelist(hostname, add) {
  if (add) {
    state.whitelist.add(hostname);
  } else {
    state.whitelist.delete(hostname);
  }
  
  await storageManager.updateSettings({ whitelist: Array.from(state.whitelist) });
  await ruleManager.updateWhitelist(state.whitelist);
}

/**
 * Handle blacklist changes
 */
async function handleBlacklist(hostname, add) {
  if (add) {
    state.blacklist.add(hostname);
  } else {
    state.blacklist.delete(hostname);
  }
  
  await storageManager.updateSettings({ blacklist: Array.from(state.blacklist) });
  await ruleManager.updateBlacklist(state.blacklist);
}

/**
 * Check if a hostname is whitelisted
 */
function isWhitelisted(hostname) {
  if (state.whitelist.has(hostname)) return true;
  
  // Check parent domains
  const parts = hostname.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join('.');
    if (state.whitelist.has(parent)) return true;
  }
  
  return false;
}

/**
 * Handle content script ready
 */
async function handleContentScriptReady(tab) {
  if (!tab) return;
  
  const hostname = new URL(tab.url).hostname;
  const isWhite = isWhitelisted(hostname);
  
  // Send configuration to content script
  try {
    chrome.tabs.sendMessage(tab.id, {
      type: 'CONFIGURE',
      config: {
        enabled: state.isEnabled && !isWhite,
        settings: state.settings,
        hostname: hostname
      }
    });
  } catch (e) {
    // Content script not ready
  }
}

/**
 * Export settings and data
 */
async function exportSettings() {
  return {
    version: '1.0.0',
    settings: state.settings,
    whitelist: Array.from(state.whitelist),
    blacklist: Array.from(state.blacklist),
    customRules: await filterEngine.getCustomRules(),
    exportDate: new Date().toISOString()
  };
}

/**
 * Import settings and data
 */
async function importSettings(data) {
  if (data.settings) {
    await storageManager.updateSettings(data.settings);
    state.settings = { ...state.settings, ...data.settings };
  }
  
  if (data.whitelist) {
    state.whitelist = new Set(data.whitelist);
    await storageManager.updateSettings({ whitelist: data.whitelist });
  }
  
  if (data.blacklist) {
    state.blacklist = new Set(data.blacklist);
    await storageManager.updateSettings({ blacklist: data.blacklist });
  }
  
  if (data.customRules) {
    await filterEngine.importCustomRules(data.customRules);
  }
}

/**
 * Get dashboard data
 */
async function getDashboardData(period = 'week') {
  const stats = await analytics.getHistoricalStats(period);
  const topDomains = await analytics.getTopBlockedDomains(20);
  const categoryBreakdown = await analytics.getCategoryBreakdown();
  
  return {
    period: period,
    stats: stats,
    topDomains: topDomains,
    categories: categoryBreakdown,
    totalBlocked: state.statistics?.totalBlocked || 0,
    dataSaved: state.statistics?.dataSaved || 0,
    timeSaved: state.statistics?.timeSaved || 0
  };
}

// ============================================================================
// TAB MANAGEMENT
// ============================================================================

/**
 * Set up tab listeners
 */
function setupTabListeners() {
  chrome.tabs.onRemoved.addListener((tabId) => {
    state.tabData.delete(tabId);
  });
  
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading' && changeInfo.url) {
      initializeTabData(tabId, changeInfo.url);
    }
  });
}

// ============================================================================
// BADGE MANAGEMENT
// ============================================================================

/**
 * Update extension badge
 */
function updateBadge() {
  if (!state.isEnabled) {
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

/**
 * Update badge for a specific tab
 */
function updateBadgeForTab(tabId) {
  if (tabId < 0 || !state.isEnabled) return;
  
  const tabData = state.tabData.get(tabId);
  if (!tabData) return;
  
  const total = Object.values(tabData.blocked).reduce((a, b) => a + b, 0);
  
  if (total > 0) {
    const text = total > 999 ? '999+' : String(total);
    chrome.action.setBadgeText({ text, tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId });
  }
}

// ============================================================================
// ALARMS AND SCHEDULED TASKS
// ============================================================================

/**
 * Set up alarms for scheduled tasks
 */
function setupAlarms() {
  // Filter list update alarm (every 6 hours)
  chrome.alarms.create('updateFilters', { periodInMinutes: 360 });
  
  // Statistics sync alarm (every hour)
  chrome.alarms.create('syncStats', { periodInMinutes: 60 });
  
  // Cookie cleanup alarm (every 30 minutes)
  chrome.alarms.create('cleanCookies', { periodInMinutes: 30 });
  
  chrome.alarms.onAlarm.addListener((alarm) => {
    switch (alarm.name) {
      case 'updateFilters':
        handleFilterUpdate();
        break;
      case 'syncStats':
        handleStatsSync();
        break;
      case 'cleanCookies':
        handleCookieCleanup();
        break;
    }
  });
}

/**
 * Handle filter list update
 */
async function handleFilterUpdate() {
  console.log('[ShieldGuard] Updating filter lists...');
  try {
    await filterEngine.updateFilterLists();
    state.lastUpdate = Date.now();
    console.log('[ShieldGuard] Filter lists updated successfully');
  } catch (error) {
    console.error('[ShieldGuard] Filter update error:', error);
  }
}

/**
 * Handle statistics sync
 */
async function handleStatsSync() {
  try {
    await analytics.persistStats();
  } catch (error) {
    console.error('[ShieldGuard] Stats sync error:', error);
  }
}

/**
 * Handle cookie cleanup
 */
async function handleCookieCleanup() {
  if (state.settings?.cookieAutoDelete) {
    try {
      await privacyEngine.cleanupCookies();
    } catch (error) {
      console.error('[ShieldGuard] Cookie cleanup error:', error);
    }
  }
}

// ============================================================================
// STARTUP
// ============================================================================

// Initialize when service worker starts
initialize();

// Handle extension install/update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[ShieldGuard] Extension installed');
    // Open welcome page
    chrome.tabs.create({ url: 'welcome/welcome.html' });
  } else if (details.reason === 'update') {
    console.log('[ShieldGuard] Extension updated to version', chrome.runtime.getManifest().version);
  }
});

// Export for module access
export { state, filterEngine, aiDetector, privacyEngine, analytics };
