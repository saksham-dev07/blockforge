/**
 * BlockForge - Rule Manager Module
 * 
 * Manages declarativeNetRequest rules:
 * - Static rule sets
 * - Dynamic rules
 * - Whitelist/blacklist handling
 * - Blocking level presets
 */

export class RuleManager {
  constructor() {
    this.isEnabled = true;
    this.blockingLevel = 'moderate';
    this.whitelist = new Set();
    this.blacklist = new Set();
    
    // Rule ID ranges for different categories
    this.ruleRanges = {
      ads: { start: 1, end: 9999 },
      trackers: { start: 10000, end: 19999 },
      social: { start: 20000, end: 29999 },
      cryptominers: { start: 30000, end: 39999 },
      malware: { start: 40000, end: 49999 },
      whitelist: { start: 50000, end: 59999 },
      blacklist: { start: 60000, end: 69999 },
      custom: { start: 100000, end: 199999 }
    };
    
    // Blocking level configurations
    this.levelConfigs = {
      minimal: {
        enableAds: true,
        enableTrackers: false,
        enableSocial: false,
        enableMining: true,
        enableMalware: true
      },
      moderate: {
        enableAds: true,
        enableTrackers: true,
        enableSocial: true,
        enableMining: true,
        enableMalware: true
      },
      aggressive: {
        enableAds: true,
        enableTrackers: true,
        enableSocial: true,
        enableMining: true,
        enableMalware: true,
        blockFirstParty: true,
        blockCookies: true
      }
    };
  }
  
  /**
   * Initialize the rule manager
   */
  async initialize() {
    // Load saved state
    const { ruleManagerState } = await chrome.storage.local.get('ruleManagerState');
    
    if (ruleManagerState) {
      this.isEnabled = ruleManagerState.isEnabled !== false;
      this.blockingLevel = ruleManagerState.blockingLevel || 'moderate';
      this.whitelist = new Set(ruleManagerState.whitelist || []);
      this.blacklist = new Set(ruleManagerState.blacklist || []);
    }
    
    // Apply current state
    await this.applyState();
    
    console.log('[RuleManager] Initialized with level:', this.blockingLevel);
  }
  
  /**
   * Apply current state to rules
   */
  async applyState() {
    if (!this.isEnabled) {
      await this.disableAllRules();
    } else {
      await this.enableRulesForLevel(this.blockingLevel);
      await this.applyWhitelistRules();
      await this.applyBlacklistRules();
    }
  }
  
  /**
   * Set enabled state
   */
  async setEnabled(enabled) {
    this.isEnabled = enabled;
    await this.saveState();
    
    if (enabled) {
      await this.enableRulesForLevel(this.blockingLevel);
    } else {
      await this.disableAllRules();
    }
  }
  
  /**
   * Set blocking level
   */
  async setBlockingLevel(level) {
    if (!this.levelConfigs[level]) {
      console.warn('[RuleManager] Unknown level:', level);
      return;
    }
    
    this.blockingLevel = level;
    await this.saveState();
    
    if (this.isEnabled) {
      await this.enableRulesForLevel(level);
    }
  }
  
  /**
   * Enable rules for a specific blocking level
   */
  async enableRulesForLevel(level) {
    const config = this.levelConfigs[level];
    if (!config) return;
    
    try {
      // Enable/disable static rulesets based on level
      const rulesetIds = [];
      const disabledIds = [];
      
      if (config.enableAds) rulesetIds.push('default_rules');
      else disabledIds.push('default_rules');
      
      if (config.enableTrackers) rulesetIds.push('tracking_rules');
      else disabledIds.push('tracking_rules');
      
      if (config.enableSocial) rulesetIds.push('social_rules');
      else disabledIds.push('social_rules');
      
      if (config.enableMining) rulesetIds.push('mining_rules');
      else disabledIds.push('mining_rules');
      
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: rulesetIds,
        disableRulesetIds: disabledIds
      });
      
      console.log('[RuleManager] Enabled rulesets:', rulesetIds);
    } catch (error) {
      console.error('[RuleManager] Failed to update rulesets:', error);
    }
  }
  
  /**
   * Disable all rules
   */
  async disableAllRules() {
    try {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: ['default_rules', 'tracking_rules', 'social_rules', 'mining_rules']
      });
      
      console.log('[RuleManager] All rulesets disabled');
    } catch (error) {
      console.error('[RuleManager] Failed to disable rulesets:', error);
    }
  }
  
  /**
   * Update whitelist
   */
  async updateWhitelist(whitelist) {
    this.whitelist = whitelist instanceof Set ? whitelist : new Set(whitelist);
    await this.saveState();
    await this.applyWhitelistRules();
  }
  
  /**
   * Apply whitelist as allow rules
   */
  async applyWhitelistRules() {
    try {
      // Get existing whitelist rules
      const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
      const whitelistRuleIds = existingRules
        .filter(r => r.id >= this.ruleRanges.whitelist.start && r.id < this.ruleRanges.whitelist.end)
        .map(r => r.id);
      
      // Remove existing whitelist rules
      if (whitelistRuleIds.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: whitelistRuleIds
        });
      }
      
      // Create new whitelist rules
      const rules = [];
      let ruleId = this.ruleRanges.whitelist.start;
      
      for (const domain of this.whitelist) {
        rules.push({
          id: ruleId++,
          priority: 10, // Higher priority than block rules
          action: { type: 'allow' },
          condition: {
            initiatorDomains: [domain],
            resourceTypes: ['main_frame', 'sub_frame', 'script', 'image', 'stylesheet', 'xmlhttprequest', 'media', 'font', 'other']
          }
        });
        
        // Also allow requests TO the whitelisted domain
        rules.push({
          id: ruleId++,
          priority: 10,
          action: { type: 'allow' },
          condition: {
            requestDomains: [domain],
            resourceTypes: ['main_frame', 'sub_frame', 'script', 'image', 'stylesheet', 'xmlhttprequest', 'media', 'font', 'other']
          }
        });
      }
      
      if (rules.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({
          addRules: rules
        });
      }
      
      console.log('[RuleManager] Applied', rules.length, 'whitelist rules');
    } catch (error) {
      console.error('[RuleManager] Failed to apply whitelist rules:', error);
    }
  }
  
  /**
   * Update blacklist
   */
  async updateBlacklist(blacklist) {
    this.blacklist = blacklist instanceof Set ? blacklist : new Set(blacklist);
    await this.saveState();
    await this.applyBlacklistRules();
  }
  
  /**
   * Apply blacklist as block rules
   */
  async applyBlacklistRules() {
    try {
      // Get existing blacklist rules
      const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
      const blacklistRuleIds = existingRules
        .filter(r => r.id >= this.ruleRanges.blacklist.start && r.id < this.ruleRanges.blacklist.end)
        .map(r => r.id);
      
      // Remove existing blacklist rules
      if (blacklistRuleIds.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: blacklistRuleIds
        });
      }
      
      // Create new blacklist rules
      const rules = [];
      let ruleId = this.ruleRanges.blacklist.start;
      
      for (const domain of this.blacklist) {
        rules.push({
          id: ruleId++,
          priority: 5,
          action: { type: 'block' },
          condition: {
            requestDomains: [domain],
            resourceTypes: ['main_frame', 'sub_frame', 'script', 'image', 'stylesheet', 'xmlhttprequest', 'media', 'font', 'other']
          }
        });
      }
      
      if (rules.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({
          addRules: rules
        });
      }
      
      console.log('[RuleManager] Applied', rules.length, 'blacklist rules');
    } catch (error) {
      console.error('[RuleManager] Failed to apply blacklist rules:', error);
    }
  }
  
  /**
   * Add a custom block rule
   */
  async addCustomBlockRule(pattern, options = {}) {
    try {
      const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
      const customRuleIds = existingRules
        .filter(r => r.id >= this.ruleRanges.custom.start && r.id < this.ruleRanges.custom.end)
        .map(r => r.id);
      
      const newId = customRuleIds.length > 0 
        ? Math.max(...customRuleIds) + 1 
        : this.ruleRanges.custom.start;
      
      const rule = {
        id: newId,
        priority: options.priority || 2,
        action: { type: options.action || 'block' },
        condition: {
          urlFilter: pattern,
          resourceTypes: options.resourceTypes || ['script', 'image', 'xmlhttprequest', 'sub_frame']
        }
      };
      
      if (options.domains) {
        rule.condition.initiatorDomains = options.domains;
      }
      
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: [rule]
      });
      
      return newId;
    } catch (error) {
      console.error('[RuleManager] Failed to add custom rule:', error);
      throw error;
    }
  }
  
  /**
   * Remove a custom rule
   */
  async removeCustomRule(ruleId) {
    try {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [ruleId]
      });
    } catch (error) {
      console.error('[RuleManager] Failed to remove custom rule:', error);
    }
  }
  
  /**
   * Get rule statistics
   */
  async getRuleStats() {
    try {
      const dynamicRules = await chrome.declarativeNetRequest.getDynamicRules();
      const enabledRulesets = await chrome.declarativeNetRequest.getEnabledRulesets();
      
      return {
        dynamicRulesCount: dynamicRules.length,
        enabledRulesets: enabledRulesets,
        whitelistCount: this.whitelist.size,
        blacklistCount: this.blacklist.size,
        blockingLevel: this.blockingLevel,
        isEnabled: this.isEnabled
      };
    } catch (error) {
      console.error('[RuleManager] Failed to get rule stats:', error);
      return null;
    }
  }
  
  /**
   * Save state to storage
   */
  async saveState() {
    await chrome.storage.local.set({
      ruleManagerState: {
        isEnabled: this.isEnabled,
        blockingLevel: this.blockingLevel,
        whitelist: Array.from(this.whitelist),
        blacklist: Array.from(this.blacklist)
      }
    });
  }
  
  /**
   * Get available rules count
   */
  async getAvailableRulesCount() {
    try {
      const dynamicRules = await chrome.declarativeNetRequest.getDynamicRules();
      const max = chrome.declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_RULES || 30000;
      
      return {
        used: dynamicRules.length,
        max: max,
        available: max - dynamicRules.length
      };
    } catch (error) {
      return { used: 0, max: 30000, available: 30000 };
    }
  }
}
