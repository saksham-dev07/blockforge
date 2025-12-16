/**
 * ShieldGuard - Storage Manager Module
 * 
 * Handles all data persistence using Chrome Storage API
 * - Settings storage
 * - Statistics storage
 * - Filter list caching
 * - Historical data management
 */

export class StorageManager {
  constructor() {
    this.defaultSettings = {
      enabled: true,
      blockingLevel: 'moderate', // minimal, moderate, aggressive
      antiFingerprint: true,
      cookieAutoDelete: false,
      aiDetection: true,
      removeTrackingParams: true,
      blockWebRTC: false,
      whitelist: ['github.com', 'raw.githubusercontent.com', 'gist.github.com'],
      blacklist: [],
      filterLists: {
        easylist: true,
        easyprivacy: true,
        malware: true,
        social: true,
        annoyances: false
      },
      notifications: true,
      showBadge: true,
      theme: 'auto'
    };
    
    this.defaultStats = {
      totalBlocked: 0,
      dataSaved: 0,
      timeSaved: 0,
      categories: {
        ads: 0,
        trackers: 0,
        social: 0,
        cryptominers: 0,
        malware: 0,
        other: 0
      },
      daily: {},
      domains: {},
      firstRun: null,
      lastReset: null
    };
  }
  
  /**
   * Initialize storage with defaults if needed
   */
  async initialize() {
    const stored = await chrome.storage.local.get(['settings', 'statistics']);
    
    if (!stored.settings) {
      await this.setSettings(this.defaultSettings);
    }
    
    if (!stored.statistics) {
      const stats = { ...this.defaultStats, firstRun: Date.now() };
      await this.setStatistics(stats);
    }
  }
  
  /**
   * Get all settings
   */
  async getSettings() {
    const { settings } = await chrome.storage.local.get('settings');
    return { ...this.defaultSettings, ...settings };
  }
  
  /**
   * Set all settings
   */
  async setSettings(settings) {
    await chrome.storage.local.set({ settings });
  }
  
  /**
   * Update specific settings
   */
  async updateSettings(updates) {
    const current = await this.getSettings();
    const merged = { ...current, ...updates };
    await this.setSettings(merged);
    return merged;
  }
  
  /**
   * Get all statistics
   */
  async getStatistics() {
    const { statistics } = await chrome.storage.local.get('statistics');
    return { ...this.defaultStats, ...statistics };
  }
  
  /**
   * Set all statistics
   */
  async setStatistics(statistics) {
    await chrome.storage.local.set({ statistics });
  }
  
  /**
   * Update specific statistics
   */
  async updateStatistics(updates) {
    const current = await this.getStatistics();
    const merged = this.deepMerge(current, updates);
    await this.setStatistics(merged);
    return merged;
  }
  
  /**
   * Increment a blocked count
   */
  async incrementBlocked(category, bytes = 0) {
    const stats = await this.getStatistics();
    const today = this.getDateKey();
    
    stats.totalBlocked++;
    stats.dataSaved += bytes;
    stats.timeSaved += this.estimateTimeSaved(bytes);
    
    if (stats.categories[category] !== undefined) {
      stats.categories[category]++;
    }
    
    // Update daily stats
    if (!stats.daily[today]) {
      stats.daily[today] = { blocked: 0, dataSaved: 0, categories: {} };
    }
    stats.daily[today].blocked++;
    stats.daily[today].dataSaved += bytes;
    
    if (!stats.daily[today].categories[category]) {
      stats.daily[today].categories[category] = 0;
    }
    stats.daily[today].categories[category]++;
    
    // Cleanup old daily data (keep 90 days)
    this.cleanupOldData(stats);
    
    await this.setStatistics(stats);
    return stats;
  }
  
  /**
   * Track a blocked domain
   */
  async trackDomain(domain, category) {
    const stats = await this.getStatistics();
    
    if (!stats.domains[domain]) {
      stats.domains[domain] = { count: 0, categories: {} };
    }
    
    stats.domains[domain].count++;
    
    if (!stats.domains[domain].categories[category]) {
      stats.domains[domain].categories[category] = 0;
    }
    stats.domains[domain].categories[category]++;
    
    await this.setStatistics(stats);
  }
  
  /**
   * Get historical stats for a period
   */
  async getHistoricalStats(period) {
    const stats = await this.getStatistics();
    const days = period === 'week' ? 7 : period === 'month' ? 30 : 1;
    const result = [];
    
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = this.getDateKey(date);
      
      result.push({
        date: key,
        ...stats.daily[key] || { blocked: 0, dataSaved: 0, categories: {} }
      });
    }
    
    return result.reverse();
  }
  
  /**
   * Get top blocked domains
   */
  async getTopDomains(limit = 10) {
    const stats = await this.getStatistics();
    const domains = Object.entries(stats.domains || {})
      .map(([domain, data]) => ({ domain, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
    
    return domains;
  }
  
  /**
   * Store filter list data
   */
  async storeFilterList(id, data) {
    await chrome.storage.local.set({ [`filter_${id}`]: data });
  }
  
  /**
   * Get filter list data
   */
  async getFilterList(id) {
    const result = await chrome.storage.local.get(`filter_${id}`);
    return result[`filter_${id}`];
  }
  
  /**
   * Store custom rules
   */
  async storeCustomRules(rules) {
    await chrome.storage.local.set({ customRules: rules });
  }
  
  /**
   * Get custom rules
   */
  async getCustomRules() {
    const { customRules } = await chrome.storage.local.get('customRules');
    return customRules || [];
  }
  
  /**
   * Store AI learning data
   */
  async storeAIData(data) {
    await chrome.storage.local.set({ aiData: data });
  }
  
  /**
   * Get AI learning data
   */
  async getAIData() {
    const { aiData } = await chrome.storage.local.get('aiData');
    return aiData || { patterns: [], scores: {}, version: 1 };
  }
  
  /**
   * Reset statistics
   */
  async resetStatistics() {
    const stats = { ...this.defaultStats, firstRun: Date.now(), lastReset: Date.now() };
    await this.setStatistics(stats);
    return stats;
  }
  
  /**
   * Get storage usage
   */
  async getStorageUsage() {
    const bytesInUse = await chrome.storage.local.getBytesInUse();
    return {
      used: bytesInUse,
      quota: chrome.storage.local.QUOTA_BYTES,
      percentage: (bytesInUse / chrome.storage.local.QUOTA_BYTES) * 100
    };
  }
  
  /**
   * Clear all data
   */
  async clearAll() {
    await chrome.storage.local.clear();
    await this.initialize();
  }
  
  // Helper methods
  
  getDateKey(date = new Date()) {
    return date.toISOString().split('T')[0];
  }
  
  estimateTimeSaved(bytes) {
    // Estimate ~50ms saved per 10KB not loaded
    return Math.round((bytes / 10000) * 50);
  }
  
  deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] instanceof Object && key in target) {
        result[key] = this.deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }
  
  cleanupOldData(stats) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffKey = this.getDateKey(cutoff);
    
    for (const key in stats.daily) {
      if (key < cutoffKey) {
        delete stats.daily[key];
      }
    }
    
    // Limit domains to top 1000
    const domainEntries = Object.entries(stats.domains);
    if (domainEntries.length > 1000) {
      const sorted = domainEntries.sort((a, b) => b[1].count - a[1].count);
      stats.domains = Object.fromEntries(sorted.slice(0, 1000));
    }
  }
}
