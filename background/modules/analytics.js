/**
 * BlockForge - Analytics Module
 * 
 * Tracks and reports blocking statistics:
 * - Total requests blocked
 * - Data saved calculations
 * - Time saved estimates
 * - Category breakdowns
 * - Historical data
 * - Per-site statistics
 */

export class Analytics {
  constructor(storageManager) {
    this.storageManager = storageManager;
    this.sessionStats = {
      blocked: 0,
      dataSaved: 0,
      categories: {
        ads: 0,
        trackers: 0,
        social: 0,
        cryptominers: 0,
        malware: 0,
        other: 0
      },
      domains: new Map(),
      startTime: Date.now()
    };
    
    // Average sizes for different content types (in bytes)
    this.contentSizes = {
      ads: 150000,        // 150KB average for ad scripts/images
      trackers: 30000,    // 30KB for tracking pixels/scripts
      social: 50000,      // 50KB for social widgets
      cryptominers: 200000, // 200KB for mining scripts
      malware: 100000,    // 100KB
      other: 25000        // 25KB default
    };
    
    // Time estimates (in ms) for different request types
    this.timeEstimates = {
      ads: 500,           // 500ms average load time
      trackers: 200,      // 200ms
      social: 400,        // 400ms
      cryptominers: 1000, // 1000ms (heavy scripts)
      malware: 300,
      other: 150
    };
  }
  
  /**
   * Initialize analytics
   */
  async initialize() {
    console.log('[Analytics] Initialized');
  }
  
  /**
   * Record a blocked request
   */
  async recordBlocked(category, url, estimatedBytes = null) {
    // Update session stats
    this.sessionStats.blocked++;
    
    if (this.sessionStats.categories[category] !== undefined) {
      this.sessionStats.categories[category]++;
    }
    
    // Calculate data saved
    const bytes = estimatedBytes || this.contentSizes[category] || this.contentSizes.other;
    this.sessionStats.dataSaved += bytes;
    
    // Track domain
    try {
      const domain = new URL(url).hostname;
      const domainCount = this.sessionStats.domains.get(domain) || 0;
      this.sessionStats.domains.set(domain, domainCount + 1);
    } catch {
      // Invalid URL
    }
    
    // Persist to storage (debounced)
    this.schedulePersist();
    
    // Update storage manager stats
    await this.storageManager.incrementBlocked(category, bytes);
    
    try {
      const domain = new URL(url).hostname;
      await this.storageManager.trackDomain(domain, category);
    } catch {
      // Invalid URL
    }
  }
  
  /**
   * Record DOM element blocked
   */
  recordDOMBlocked(count, category = 'ads') {
    this.sessionStats.blocked += count;
    
    if (this.sessionStats.categories[category] !== undefined) {
      this.sessionStats.categories[category] += count;
    }
    
    // DOM elements typically save less data but still count
    this.sessionStats.dataSaved += count * 5000; // 5KB estimate per element
    
    this.schedulePersist();
  }
  
  /**
   * Get global statistics
   */
  async getGlobalStats() {
    const stored = await this.storageManager.getStatistics();
    
    // Combine with session stats for real-time data
    return {
      totalBlocked: stored.totalBlocked,
      dataSaved: stored.dataSaved,
      timeSaved: stored.timeSaved,
      categories: stored.categories,
      sessionBlocked: this.sessionStats.blocked,
      sessionDataSaved: this.sessionStats.dataSaved,
      sessionDuration: Date.now() - this.sessionStats.startTime,
      firstRun: stored.firstRun
    };
  }
  
  /**
   * Get historical statistics
   */
  async getHistoricalStats(period = 'week') {
    return await this.storageManager.getHistoricalStats(period);
  }
  
  /**
   * Get top blocked domains
   */
  async getTopBlockedDomains(limit = 10) {
    return await this.storageManager.getTopDomains(limit);
  }
  
  /**
   * Get category breakdown
   */
  async getCategoryBreakdown() {
    const stats = await this.storageManager.getStatistics();
    const total = Object.values(stats.categories).reduce((a, b) => a + b, 0);
    
    if (total === 0) {
      return Object.keys(stats.categories).map(cat => ({
        category: cat,
        count: 0,
        percentage: 0
      }));
    }
    
    return Object.entries(stats.categories).map(([category, count]) => ({
      category,
      count,
      percentage: Math.round((count / total) * 100)
    })).sort((a, b) => b.count - a.count);
  }
  
  /**
   * Calculate time saved
   */
  calculateTimeSaved(categories) {
    let totalMs = 0;
    
    for (const [category, count] of Object.entries(categories)) {
      const timePerRequest = this.timeEstimates[category] || this.timeEstimates.other;
      totalMs += count * timePerRequest;
    }
    
    return totalMs;
  }
  
  /**
   * Format bytes to human readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
  }
  
  /**
   * Format time to human readable
   */
  formatTime(ms) {
    if (ms < 1000) return ms + 'ms';
    if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
    if (ms < 3600000) return (ms / 60000).toFixed(1) + ' min';
    if (ms < 86400000) return (ms / 3600000).toFixed(1) + ' hours';
    return (ms / 86400000).toFixed(1) + ' days';
  }
  
  /**
   * Get formatted statistics
   */
  async getFormattedStats() {
    const stats = await this.getGlobalStats();
    
    return {
      totalBlocked: this.formatNumber(stats.totalBlocked),
      dataSaved: this.formatBytes(stats.dataSaved),
      timeSaved: this.formatTime(stats.timeSaved),
      categories: Object.entries(stats.categories).map(([name, count]) => ({
        name,
        count: this.formatNumber(count),
        rawCount: count
      })),
      protectionDays: Math.floor((Date.now() - stats.firstRun) / 86400000)
    };
  }
  
  /**
   * Format number with abbreviation
   */
  formatNumber(num) {
    if (num < 1000) return String(num);
    if (num < 1000000) return (num / 1000).toFixed(1) + 'K';
    if (num < 1000000000) return (num / 1000000).toFixed(1) + 'M';
    return (num / 1000000000).toFixed(1) + 'B';
  }
  
  /**
   * Get chart data for dashboard
   */
  async getChartData(period = 'week') {
    const historical = await this.getHistoricalStats(period);
    
    return {
      labels: historical.map(d => this.formatDateLabel(d.date)),
      datasets: [
        {
          label: 'Total Blocked',
          data: historical.map(d => d.blocked),
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)'
        },
        {
          label: 'Ads',
          data: historical.map(d => d.categories?.ads || 0),
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.1)'
        },
        {
          label: 'Trackers',
          data: historical.map(d => d.categories?.trackers || 0),
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139, 92, 246, 0.1)'
        }
      ]
    };
  }
  
  /**
   * Format date for chart labels
   */
  formatDateLabel(dateStr) {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (dateStr === today.toISOString().split('T')[0]) {
      return 'Today';
    }
    if (dateStr === yesterday.toISOString().split('T')[0]) {
      return 'Yesterday';
    }
    
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  
  /**
   * Get privacy score
   */
  async getPrivacyScore() {
    const stats = await this.getGlobalStats();
    
    // Calculate score based on various factors
    let score = 50; // Base score
    
    // Add points for blocking
    if (stats.totalBlocked > 100) score += 10;
    if (stats.totalBlocked > 1000) score += 10;
    if (stats.totalBlocked > 10000) score += 10;
    
    // Bonus for active protection
    if (stats.sessionBlocked > 0) score += 5;
    
    // Bonus for diverse category blocking
    const activeCategories = Object.values(stats.categories).filter(c => c > 0).length;
    score += activeCategories * 3;
    
    return Math.min(100, Math.max(0, score));
  }
  
  /**
   * Schedule stats persistence (debounced)
   */
  schedulePersist() {
    if (this.persistTimeout) {
      clearTimeout(this.persistTimeout);
    }
    
    this.persistTimeout = setTimeout(() => {
      this.persistStats();
    }, 5000);
  }
  
  /**
   * Persist session stats to storage
   */
  async persistStats() {
    // Session stats are already being updated in recordBlocked
    // This is for any additional cleanup/sync
    console.log('[Analytics] Session stats synced');
  }
  
  /**
   * Reset all statistics
   */
  async resetStats() {
    this.sessionStats = {
      blocked: 0,
      dataSaved: 0,
      categories: {
        ads: 0,
        trackers: 0,
        social: 0,
        cryptominers: 0,
        malware: 0,
        other: 0
      },
      domains: new Map(),
      startTime: Date.now()
    };
    
    await this.storageManager.resetStatistics();
  }
  
  /**
   * Export statistics
   */
  async exportStats() {
    const stats = await this.storageManager.getStatistics();
    const topDomains = await this.getTopBlockedDomains(100);
    const historical = await this.getHistoricalStats('month');
    
    return {
      exportDate: new Date().toISOString(),
      summary: {
        totalBlocked: stats.totalBlocked,
        dataSaved: this.formatBytes(stats.dataSaved),
        timeSaved: this.formatTime(stats.timeSaved),
        protectionDays: Math.floor((Date.now() - stats.firstRun) / 86400000)
      },
      categories: stats.categories,
      topDomains,
      historical
    };
  }
  
  /**
   * Get real-time stats update for popup
   */
  getRealTimeStats() {
    return {
      sessionBlocked: this.sessionStats.blocked,
      sessionDataSaved: this.sessionStats.dataSaved,
      sessionCategories: this.sessionStats.categories,
      sessionDuration: Date.now() - this.sessionStats.startTime
    };
  }
}
