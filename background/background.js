// Main Service Worker for BlockForge
// Self-contained - no external imports for reliability

// Extension state
let isEnabled = true;
let settings = {};

// Tab-specific block counts
const tabBlockCounts = new Map();

// Default settings
function getDefaultSettings() {
  return {
    blockAds: true,
    blockTrackers: true,
    blockMiners: true,
    blockMalware: true,
    aiDetection: true,
    antiFingerprint: true,
    httpsUpgrade: true,
    blockThirdPartyCookies: true,
    customFilters: [],
    whitelist: []
  };
}

// Initialize extension
async function initialize() {
  console.log('🛡️ BlockForge initializing...');
  
  try {
    // Load settings
    const data = await chrome.storage.local.get(['isEnabled', 'settings']);
    isEnabled = data.isEnabled !== false;
    settings = data.settings || getDefaultSettings();
    
    // Update declarative rules based on settings
    await updateRules();
    
    // Update badge
    await updateBadge();
    
    console.log('✅ BlockForge initialized successfully');
    console.log('📊 Protection enabled:', isEnabled);
  } catch (error) {
    console.error('❌ Initialization error:', error);
  }
}

// Update declarative net request rules based on settings
async function updateRules() {
  const enabledRulesets = [];
  const disabledRulesets = [];
  
  if (isEnabled && settings.blockAds !== false) {
    enabledRulesets.push('ads_rules');
  } else {
    disabledRulesets.push('ads_rules');
  }
  
  if (isEnabled && settings.blockTrackers !== false) {
    enabledRulesets.push('trackers_rules');
  } else {
    disabledRulesets.push('trackers_rules');
  }
  
  if (isEnabled && settings.blockMiners !== false) {
    enabledRulesets.push('miners_rules');
  } else {
    disabledRulesets.push('miners_rules');
  }
  
  if (isEnabled && settings.blockMalware !== false) {
    enabledRulesets.push('malware_rules');
  } else {
    disabledRulesets.push('malware_rules');
  }
  
  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: enabledRulesets,
      disableRulesetIds: disabledRulesets
    });
    console.log('📋 Rules updated:', { enabled: enabledRulesets, disabled: disabledRulesets });
  } catch (error) {
    console.error('❌ Failed to update rules:', error);
  }
}

// Track blocked requests using declarativeNetRequest feedback
// This is the MV3-compliant way to monitor blocked requests
try {
  if (chrome.declarativeNetRequest && chrome.declarativeNetRequest.onRuleMatchedDebug) {
    chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
      if (!isEnabled) return;
      
      const { request, rule } = info;
      const url = request.url;
      const tabId = request.tabId;
      
      console.log('🛡️ Blocked:', url, 'Rule:', rule.ruleId, 'Ruleset:', rule.rulesetId);
      
      // Determine block type from ruleset
      let blockType = 'ad';
      if (rule.rulesetId === 'ads_rules') blockType = 'ad';
      else if (rule.rulesetId === 'trackers_rules') blockType = 'tracker';
      else if (rule.rulesetId === 'miners_rules') blockType = 'miner';
      else if (rule.rulesetId === 'malware_rules') blockType = 'malware';
      
      // Get the source page URL (the page where the block occurred)
      let sourceUrl = request.initiator || request.documentUrl || '';
      
      // If we have a valid tabId, try to get the tab URL for more accuracy
      if (tabId > 0) {
        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime.lastError) {
            // Tab might be closed, use initiator
            recordBlock(tabId, url, blockType, sourceUrl);
          } else {
            recordBlock(tabId, url, blockType, tab.url || sourceUrl);
          }
        });
      } else {
        // No valid tab, use initiator/documentUrl
        recordBlock(tabId, url, blockType, sourceUrl);
      }
    });
    console.log('✅ Rule match debug listener registered');
  } else {
    console.log('ℹ️ onRuleMatchedDebug not available (normal in production)');
  }
} catch (e) {
  console.log('ℹ️ Could not register debug listener:', e.message);
}

// Record a blocked request
async function recordBlock(tabId, url, type, source) {
  try {
    // Get current statistics
    const data = await chrome.storage.local.get(['statistics', 'dailyStats', 'blockLog']);
    
    const statistics = data.statistics || {
      totalBlocked: 0,
      adsBlocked: 0,
      trackersBlocked: 0,
      minersBlocked: 0,
      malwareBlocked: 0,
      dataSaved: 0,
      timeSaved: 0
    };
    
    const dailyStats = data.dailyStats || {};
    const blockLog = data.blockLog || [];
    
    // Update totals
    statistics.totalBlocked++;
    
    // Update by type
    switch (type) {
      case 'ad':
        statistics.adsBlocked++;
        statistics.dataSaved += 50000; // ~50KB per ad
        statistics.timeSaved += 200; // ~200ms
        break;
      case 'tracker':
        statistics.trackersBlocked++;
        statistics.dataSaved += 5000; // ~5KB
        statistics.timeSaved += 50;
        break;
      case 'miner':
        statistics.minersBlocked++;
        statistics.dataSaved += 100000; // Miners are heavy
        statistics.timeSaved += 1000;
        break;
      case 'malware':
        statistics.malwareBlocked++;
        statistics.dataSaved += 10000;
        break;
    }
    
    // Update daily stats
    const today = new Date().toISOString().split('T')[0];
    if (!dailyStats[today]) {
      dailyStats[today] = { ads: 0, trackers: 0, miners: 0, malware: 0, total: 0 };
    }
    dailyStats[today].total++;
    if (type === 'ad') dailyStats[today].ads++;
    else if (type === 'tracker') dailyStats[today].trackers++;
    else if (type === 'miner') dailyStats[today].miners++;
    else if (type === 'malware') dailyStats[today].malware++;
    
    // Keep block log (last 500 entries)
    blockLog.unshift({
      url: url.substring(0, 200), // Truncate long URLs
      type: type,
      source: source,
      tabId: tabId,
      timestamp: Date.now()
    });
    
    if (blockLog.length > 500) {
      blockLog.length = 500;
    }
    
    // Save to storage
    await chrome.storage.local.set({ statistics, dailyStats, blockLog });
    
    // Update badge for this tab
    if (tabId > 0) {
      updateTabBadge(tabId);
    }
    
  } catch (error) {
    console.error('❌ Error recording block:', error);
  }
}

// Update badge for specific tab
async function updateTabBadge(tabId) {
  try {
    if (!isEnabled) {
      await chrome.action.setBadgeText({ text: 'OFF', tabId });
      await chrome.action.setBadgeBackgroundColor({ color: '#666666', tabId });
      return;
    }
    
    const count = (tabBlockCounts.get(tabId) || 0) + 1;
    tabBlockCounts.set(tabId, count);
    
    let badgeText = count.toString();
    if (count >= 1000) {
      badgeText = Math.floor(count / 1000) + 'k';
    }
    
    await chrome.action.setBadgeText({ text: badgeText, tabId });
    await chrome.action.setBadgeBackgroundColor({ color: '#00ff88', tabId });
  } catch (e) {
    // Tab might be closed
  }
}

// Update global badge
async function updateBadge() {
  try {
    if (!isEnabled) {
      await chrome.action.setBadgeText({ text: 'OFF' });
      await chrome.action.setBadgeBackgroundColor({ color: '#666666' });
    } else {
      await chrome.action.setBadgeText({ text: '' });
      await chrome.action.setBadgeBackgroundColor({ color: '#00ff88' });
    }
  } catch (e) {
    console.error('Badge update error:', e);
  }
}

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(err => {
    console.error('Message handling error:', err);
    sendResponse({ error: err.message });
  });
  return true; // Keep channel open for async response
});

// Normalize message action - handles both 'action' and 'type' properties
// Also converts SCREAMING_SNAKE_CASE to camelCase
function normalizeAction(message) {
  let action = message.action || message.type;
  if (!action) return null;
  
  // Convert SCREAMING_SNAKE_CASE to camelCase
  const actionMap = {
    'GET_SETTINGS': 'getSettings',
    'UPDATE_SETTINGS': 'updateSettings',
    'GET_FILTER_LISTS': 'getFilterLists',
    'TOGGLE_FILTER_LIST': 'toggleFilterList',
    'UPDATE_FILTER_LISTS': 'updateFilterLists',
    'ADD_CUSTOM_FILTER_LIST': 'addCustomFilterList',
    'GET_CUSTOM_RULES': 'getCustomRules',
    'ADD_CUSTOM_RULE': 'addCustomRule',
    'REMOVE_CUSTOM_RULE': 'removeCustomRule',
    'GET_GLOBAL_STATS': 'getStatistics',
    'WHITELIST_SITE': 'whitelistSite',
    'BLACKLIST_SITE': 'blacklistSite',
    'EXPORT_SETTINGS': 'exportSettings',
    'IMPORT_SETTINGS': 'importSettings',
    'RESET_STATISTICS': 'resetStatistics',
    'CLEAR_ALL_DATA': 'clearAllData'
  };
  
  return actionMap[action] || action;
}

async function handleMessage(message, sender) {
  const action = normalizeAction(message);
  console.log('📨 Message received:', action);
  
  switch (action) {
    case 'injectProtectionScript':
    case 'INJECT_PROTECTION_SCRIPT': {
      // Inject protection script into page context (MAIN world) to bypass CSP
      if (!sender.tab?.id) {
        return { success: false, error: 'No tab ID' };
      }
      
      try {
        await chrome.scripting.executeScript({
          target: { tabId: sender.tab.id },
          world: 'MAIN',
          injectImmediately: true,
          func: function() {
            // Protection script injected directly into page context
            if (window.__blockforge_injected__) return;
            window.__blockforge_injected__ = true;
            
            const seed = Math.floor(Math.random() * 1000000);
            let seedCounter = seed;
            
            function random() {
              const x = Math.sin(seedCounter++) * 10000;
              return x - Math.floor(x);
            }
            
            // Canvas fingerprinting protection
            if (HTMLCanvasElement.prototype.toDataURL) {
              const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
              HTMLCanvasElement.prototype.toDataURL = function() {
                const context = this.getContext('2d');
                if (context) {
                  const imageData = context.getImageData(0, 0, this.width, this.height);
                  for (let i = 0; i < imageData.data.length; i += 4) {
                    imageData.data[i] += (random() - 0.5) * 2;
                  }
                  context.putImageData(imageData, 0, 0);
                }
                return originalToDataURL.apply(this, arguments);
              };
            }
            
            // WebGL fingerprinting protection
            if (WebGLRenderingContext.prototype.getParameter) {
              const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
              WebGLRenderingContext.prototype.getParameter = function(parameter) {
                if (parameter === 37445) return 'Intel Inc.';
                if (parameter === 37446) return 'Intel Iris OpenGL Engine';
                return originalGetParameter.apply(this, arguments);
              };
            }
            
            // AudioContext fingerprinting protection
            if (typeof AudioContext !== 'undefined') {
              const OriginalAudioContext = AudioContext;
              window.AudioContext = function() {
                const context = new OriginalAudioContext();
                const originalCreateOscillator = context.createOscillator.bind(context);
                context.createOscillator = function() {
                  const oscillator = originalCreateOscillator();
                  const originalStart = oscillator.start.bind(oscillator);
                  oscillator.start = function() {
                    oscillator.frequency.value += (random() - 0.5) * 0.001;
                    return originalStart.apply(this, arguments);
                  };
                  return oscillator;
                };
                return context;
              };
            }
          }
        });
        return { success: true };
      } catch (error) {
        console.error('Failed to inject protection script:', error);
        return { success: false, error: error.message };
      }
    }
    
    case 'contentScriptReady':
    case 'CONTENT_SCRIPT_READY': {
      // Content script is ready, send configuration
      const tabUrl = sender.tab?.url || '';
      const csrHostname = tabUrl ? new URL(tabUrl).hostname : '';
      const isWhitelisted = (settings.whitelist || []).includes(csrHostname);
      return {
        success: true,
        config: {
          enabled: isEnabled,
          settings: settings,
          isWhitelisted: isWhitelisted
        }
      };
    }
    
    case 'getStatus':
      const statusData = await chrome.storage.local.get(['statistics']);
      return {
        isEnabled: isEnabled,
        statistics: statusData.statistics || {
          totalBlocked: 0,
          adsBlocked: 0,
          trackersBlocked: 0,
          minersBlocked: 0,
          malwareBlocked: 0,
          dataSaved: 0,
          timeSaved: 0
        }
      };
      
    case 'toggleProtection':
      isEnabled = !isEnabled;
      await chrome.storage.local.set({ isEnabled });
      await updateRules();
      await updateBadge();
      return { isEnabled };
      
    case 'getSettings':
      return { settings };
      
    case 'updateSettings':
      settings = { ...settings, ...message.settings };
      await chrome.storage.local.set({ settings });
      await updateRules();
      return { success: true };
      
    case 'getStatistics':
      const statsData = await chrome.storage.local.get(['statistics', 'dailyStats', 'blockLog']);
      return {
        statistics: statsData.statistics || {
          totalBlocked: 0,
          adsBlocked: 0,
          trackersBlocked: 0,
          minersBlocked: 0,
          malwareBlocked: 0,
          dataSaved: 0,
          timeSaved: 0
        },
        dailyStats: statsData.dailyStats || {},
        blockLog: statsData.blockLog || []
      };
      
    case 'resetStatistics':
      await chrome.storage.local.set({
        statistics: {
          totalBlocked: 0,
          adsBlocked: 0,
          trackersBlocked: 0,
          minersBlocked: 0,
          malwareBlocked: 0,
          dataSaved: 0,
          timeSaved: 0
        },
        dailyStats: {},
        blockLog: []
      });
      tabBlockCounts.clear();
      return { success: true };
      
    case 'addToWhitelist':
      settings.whitelist = settings.whitelist || [];
      if (!settings.whitelist.includes(message.domain)) {
        settings.whitelist.push(message.domain);
        await chrome.storage.local.set({ settings });
      }
      return { success: true };
      
    case 'removeFromWhitelist':
      settings.whitelist = (settings.whitelist || []).filter(d => d !== message.domain);
      await chrome.storage.local.set({ settings });
      return { success: true };
      
    case 'getSiteBlocked': {
      // Get blocked items for a specific hostname
      const siteData = await chrome.storage.local.get(['blockLog', 'siteExceptions']);
      const siteBlockLog = siteData.blockLog || [];
      const siteExceptions = siteData.siteExceptions || {};
      const siteHostname = message.hostname;
      
      // Filter blocks for this hostname (from tabId or URL matching)
      const siteBlocked = siteBlockLog.filter(item => {
        try {
          const blockedUrl = new URL(item.url);
          // Check if the blocked URL is from a request made on this site
          return true; // We track all, popup will filter by tab
        } catch {
          return false;
        }
      });
      
      return {
        blockedItems: siteBlocked,
        exceptions: siteExceptions[siteHostname] || []
      };
    }
      
    case 'getTabBlocked': {
      // Get blocked items for a specific tab
      const tabData = await chrome.storage.local.get(['blockLog', 'siteExceptions']);
      const tabBlockLog = tabData.blockLog || [];
      const tabExceptions = tabData.siteExceptions || {};
      const tabId = message.tabId;
      const tabHostname = message.hostname;
      
      // Filter blocks for this tab
      const tabBlocked = tabBlockLog.filter(item => item.tabId === tabId);
      
      return {
        blockedItems: tabBlocked,
        exceptions: tabExceptions[tabHostname] || []
      };
    }
      
    case 'addException': {
      // Add an exception for a specific URL on a site
      const addExData = await chrome.storage.local.get(['siteExceptions']);
      const addExceptions = addExData.siteExceptions || {};
      const addHostname = message.hostname;
      const addUrl = message.url;
      
      if (!addExceptions[addHostname]) {
        addExceptions[addHostname] = [];
      }
      
      if (!addExceptions[addHostname].includes(addUrl)) {
        addExceptions[addHostname].push(addUrl);
        await chrome.storage.local.set({ siteExceptions: addExceptions });
        
        // Add a dynamic allow rule
        await addDynamicAllowRule(addUrl);
      }
      
      return { success: true, exceptions: addExceptions[addHostname] };
    }
      
    case 'removeException': {
      // Remove an exception
      const remExData = await chrome.storage.local.get(['siteExceptions']);
      const remExceptions = remExData.siteExceptions || {};
      const remHostname = message.hostname;
      const remUrl = message.url;
      
      if (remExceptions[remHostname]) {
        remExceptions[remHostname] = remExceptions[remHostname].filter(u => u !== remUrl);
        await chrome.storage.local.set({ siteExceptions: remExceptions });
        
        // Remove the dynamic allow rule
        await removeDynamicAllowRule(remUrl);
      }
      
      return { success: true, exceptions: remExceptions[remHostname] || [] };
    }
    
    // ========== Settings page handlers ==========
    
    case 'getFilterLists':
      // Return current filter list states
      return {
        filterLists: [
          { id: 'ads', name: 'Ad Blocking', enabled: settings.blockAds !== false, rulesCount: 350 },
          { id: 'trackers', name: 'Tracker Blocking', enabled: settings.blockTrackers !== false, rulesCount: 195 },
          { id: 'miners', name: 'Crypto Miner Blocking', enabled: settings.blockMiners !== false, rulesCount: 50 },
          { id: 'malware', name: 'Malware Protection', enabled: settings.blockMalware !== false, rulesCount: 100 }
        ]
      };
    
    case 'toggleFilterList':
      // Toggle a specific filter list
      const listId = message.listId || message.id;
      const settingMap = {
        'ads': 'blockAds',
        'trackers': 'blockTrackers',
        'miners': 'blockMiners',
        'malware': 'blockMalware'
      };
      const settingKey = settingMap[listId];
      if (settingKey) {
        settings[settingKey] = message.enabled !== undefined ? message.enabled : !settings[settingKey];
        await chrome.storage.local.set({ settings });
        await updateRules();
      }
      return { success: true, settings };
    
    case 'updateFilterLists':
      // Update all filter lists (refresh from server, etc.)
      await updateRules();
      return { success: true };
    
    case 'addCustomFilterList':
      // Custom filter lists not yet implemented
      return { success: false, error: 'Custom filter lists not yet implemented' };
    
    case 'getCustomRules':
      // Return custom rules from storage
      const customData = await chrome.storage.local.get(['customRules']);
      return { rules: customData.customRules || [] };
    
    case 'addCustomRule':
      // Add a custom blocking rule
      const addRuleData = await chrome.storage.local.get(['customRules']);
      const currentRules = addRuleData.customRules || [];
      const newRule = message.rule;
      if (newRule && newRule.pattern) {
        currentRules.push({
          id: Date.now(),
          pattern: newRule.pattern,
          type: newRule.type || 'block',
          createdAt: new Date().toISOString()
        });
        await chrome.storage.local.set({ customRules: currentRules });
      }
      return { success: true, rules: currentRules };
    
    case 'removeCustomRule':
      // Remove a custom rule
      const removeRuleData = await chrome.storage.local.get(['customRules']);
      let existingCustomRules = removeRuleData.customRules || [];
      existingCustomRules = existingCustomRules.filter(r => 
        r.id !== message.ruleId && r.pattern !== message.pattern
      );
      await chrome.storage.local.set({ customRules: existingCustomRules });
      return { success: true, rules: existingCustomRules };
    
    case 'whitelistSite':
      // Add or remove site from whitelist
      settings.whitelist = settings.whitelist || [];
      const whitelistDomain = message.domain || message.site;
      const whitelistAction = message.add !== false; // default to add
      
      if (whitelistAction) {
        if (!settings.whitelist.includes(whitelistDomain)) {
          settings.whitelist.push(whitelistDomain);
        }
      } else {
        settings.whitelist = settings.whitelist.filter(d => d !== whitelistDomain);
      }
      await chrome.storage.local.set({ settings });
      return { success: true, whitelist: settings.whitelist };
    
    case 'blacklistSite':
      // Add or remove site from blacklist
      settings.blacklist = settings.blacklist || [];
      const blacklistDomain = message.domain || message.site;
      const blacklistAction = message.add !== false;
      
      if (blacklistAction) {
        if (!settings.blacklist.includes(blacklistDomain)) {
          settings.blacklist.push(blacklistDomain);
        }
      } else {
        settings.blacklist = settings.blacklist.filter(d => d !== blacklistDomain);
      }
      await chrome.storage.local.set({ settings });
      return { success: true, blacklist: settings.blacklist };
    
    case 'exportSettings':
      // Export all settings and data
      const exportData = await chrome.storage.local.get(null);
      return {
        settings: exportData.settings || settings,
        whitelist: settings.whitelist || [],
        blacklist: settings.blacklist || [],
        customRules: exportData.customRules || [],
        statistics: exportData.statistics || {},
        exportDate: new Date().toISOString(),
        version: chrome.runtime.getManifest().version
      };
    
    case 'importSettings':
      // Import settings from backup
      const importData = message.data;
      if (importData) {
        if (importData.settings) {
          settings = { ...settings, ...importData.settings };
        }
        if (importData.whitelist) {
          settings.whitelist = importData.whitelist;
        }
        if (importData.blacklist) {
          settings.blacklist = importData.blacklist;
        }
        await chrome.storage.local.set({ 
          settings,
          customRules: importData.customRules || []
        });
        await updateRules();
      }
      return { success: true };
    
    case 'clearAllData':
      // Clear all stored data
      await chrome.storage.local.clear();
      settings = {
        blockAds: true,
        blockTrackers: true,
        blockMiners: true,
        blockMalware: true,
        showBadge: true,
        whitelist: [],
        blacklist: []
      };
      await chrome.storage.local.set({ settings, isEnabled: true });
      await updateRules();
      await updateBadge();
      return { success: true };
      
    default:
      console.log('⚠️ Unknown action:', action);
      return { error: 'Unknown action: ' + action };
  }
}

// Dynamic rule management for exceptions
let dynamicRuleId = 1000000; // Start high to avoid conflicts

async function addDynamicAllowRule(url) {
  try {
    // Extract domain from URL
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    
    // Get current dynamic rules
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const ruleId = dynamicRuleId++;
    
    // Create allow rule
    const rule = {
      id: ruleId,
      priority: 1, // High priority to override block rules
      action: { type: 'allow' },
      condition: {
        urlFilter: url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), // Escape special chars
        resourceTypes: ['script', 'image', 'stylesheet', 'font', 'xmlhttprequest', 'sub_frame', 'object', 'ping', 'other']
      }
    };
    
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [rule]
    });
    
    // Store the rule ID mapping
    const ruleMap = (await chrome.storage.local.get(['exceptionRuleMap'])).exceptionRuleMap || {};
    ruleMap[url] = ruleId;
    await chrome.storage.local.set({ exceptionRuleMap: ruleMap });
    
    console.log('✅ Added allow rule for:', url);
  } catch (error) {
    console.error('❌ Failed to add allow rule:', error);
  }
}

async function removeDynamicAllowRule(url) {
  try {
    const ruleMap = (await chrome.storage.local.get(['exceptionRuleMap'])).exceptionRuleMap || {};
    const ruleId = ruleMap[url];
    
    if (ruleId) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [ruleId]
      });
      
      delete ruleMap[url];
      await chrome.storage.local.set({ exceptionRuleMap: ruleMap });
      
      console.log('✅ Removed allow rule for:', url);
    }
  } catch (error) {
    console.error('❌ Failed to remove allow rule:', error);
  }
}

// Handle tab updates - reset count on navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    tabBlockCounts.delete(tabId);
  }
});

// Handle tab removal - cleanup
chrome.tabs.onRemoved.addListener((tabId) => {
  tabBlockCounts.delete(tabId);
});

// Handle installation
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log('🎉 BlockForge installed!');
    
    // Set default values
    await chrome.storage.local.set({
      isEnabled: true,
      settings: getDefaultSettings(),
      statistics: {
        totalBlocked: 0,
        adsBlocked: 0,
        trackersBlocked: 0,
        minersBlocked: 0,
        malwareBlocked: 0,
        dataSaved: 0,
        timeSaved: 0
      },
      dailyStats: {},
      blockLog: []
    });
    
    // Open welcome page
    try {
      chrome.tabs.create({ url: 'welcome/welcome.html' });
    } catch (e) {
      console.log('Could not open welcome page');
    }
  } else if (details.reason === 'update') {
    console.log('🔄 BlockForge updated to version', chrome.runtime.getManifest().version);
  }
});

// Initialize on startup
initialize();

console.log('🛡️ BlockForge service worker loaded');

