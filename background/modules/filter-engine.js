/**
 * ShieldGuard - Filter Engine Module
 * 
 * Handles filter list management:
 * - Parsing EasyList, hosts files, and other formats
 * - Filter matching and rule compilation
 * - Custom user rules
 * - Auto-updating from remote sources
 */

export class FilterEngine {
  constructor() {
    this.filterLists = new Map();
    this.customRules = [];
    this.compiledRules = [];
    this.lastUpdate = null;
    
    // Filter list sources
    this.sources = {
      easylist: {
        name: 'EasyList',
        url: 'https://easylist.to/easylist/easylist.txt',
        enabled: true,
        category: 'ads'
      },
      easyprivacy: {
        name: 'EasyPrivacy',
        url: 'https://easylist.to/easylist/easyprivacy.txt',
        enabled: true,
        category: 'trackers'
      },
      malware: {
        name: 'Malware Domains',
        url: 'https://malware-filter.gitlab.io/malware-filter/urlhaus-filter-online.txt',
        enabled: true,
        category: 'malware'
      },
      social: {
        name: 'Fanboy Social',
        url: 'https://easylist.to/easylist/fanboy-social.txt',
        enabled: true,
        category: 'social'
      },
      annoyances: {
        name: 'Fanboy Annoyances',
        url: 'https://easylist.to/easylist/fanboy-annoyance.txt',
        enabled: false,
        category: 'annoyances'
      },
      stevenblack: {
        name: 'StevenBlack Hosts',
        url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts',
        enabled: true,
        category: 'unified',
        format: 'hosts'
      }
    };
  }
  
  /**
   * Initialize the filter engine
   */
  async initialize() {
    // Load cached filter lists
    await this.loadCachedFilters();
    
    // Load custom rules
    await this.loadCustomRules();
    
    console.log('[FilterEngine] Initialized with', this.filterLists.size, 'lists');
  }
  
  /**
   * Load cached filter lists from storage
   */
  async loadCachedFilters() {
    const { filterCache } = await chrome.storage.local.get('filterCache');
    
    if (filterCache) {
      for (const [id, data] of Object.entries(filterCache)) {
        this.filterLists.set(id, data);
      }
    }
  }
  
  /**
   * Load custom rules from storage
   */
  async loadCustomRules() {
    const { customRules } = await chrome.storage.local.get('customRules');
    this.customRules = customRules || [];
  }
  
  /**
   * Get all filter lists with status
   */
  getFilterLists() {
    const lists = [];
    
    for (const [id, source] of Object.entries(this.sources)) {
      const cached = this.filterLists.get(id);
      lists.push({
        id,
        name: source.name,
        url: source.url,
        enabled: source.enabled,
        category: source.category,
        rulesCount: cached?.rules?.length || 0,
        lastUpdated: cached?.lastUpdated || null
      });
    }
    
    return lists;
  }
  
  /**
   * Update all enabled filter lists
   */
  async updateFilterLists() {
    const updates = [];
    
    for (const [id, source] of Object.entries(this.sources)) {
      if (source.enabled) {
        updates.push(this.updateFilterList(id));
      }
    }
    
    await Promise.all(updates);
    
    // Compile rules for declarativeNetRequest
    await this.compileRules();
    
    this.lastUpdate = Date.now();
  }
  
  /**
   * Update a single filter list
   */
  async updateFilterList(id) {
    const source = this.sources[id];
    if (!source) return;
    
    try {
      console.log(`[FilterEngine] Updating ${source.name}...`);
      
      const response = await fetch(source.url, {
        cache: 'no-cache',
        headers: { 'Accept': 'text/plain' }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const text = await response.text();
      const rules = this.parseFilterList(text, source.format || 'adblock');
      
      const filterData = {
        id,
        name: source.name,
        rules,
        rulesCount: rules.length,
        lastUpdated: Date.now(),
        category: source.category
      };
      
      this.filterLists.set(id, filterData);
      
      // Cache to storage
      await this.cacheFilterList(id, filterData);
      
      console.log(`[FilterEngine] Updated ${source.name} with ${rules.length} rules`);
      
      return filterData;
    } catch (error) {
      console.error(`[FilterEngine] Failed to update ${source.name}:`, error);
    }
  }
  
  /**
   * Parse a filter list based on format
   */
  parseFilterList(text, format) {
    if (format === 'hosts') {
      return this.parseHostsFile(text);
    }
    return this.parseAdblockList(text);
  }
  
  /**
   * Parse AdBlock format filter list
   */
  parseAdblockList(text) {
    const rules = [];
    const lines = text.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('[')) {
        continue;
      }
      
      const parsed = this.parseAdblockRule(trimmed);
      if (parsed) {
        rules.push(parsed);
      }
    }
    
    return rules;
  }
  
  /**
   * Parse a single AdBlock rule
   */
  parseAdblockRule(rule) {
    // Element hiding rules (##)
    if (rule.includes('##') || rule.includes('#@#')) {
      return this.parseElementHidingRule(rule);
    }
    
    // Scriptlet rules (#%#)
    if (rule.includes('#%#') || rule.includes('#@%#')) {
      return this.parseScriptletRule(rule);
    }
    
    // Network rules
    return this.parseNetworkRule(rule);
  }
  
  /**
   * Parse element hiding rule
   */
  parseElementHidingRule(rule) {
    const exceptionMatch = rule.match(/^(.+?)#@#(.+)$/);
    if (exceptionMatch) {
      return {
        type: 'element-exception',
        domains: exceptionMatch[1].split(',').filter(d => d),
        selector: exceptionMatch[2]
      };
    }
    
    const match = rule.match(/^(.+?)##(.+)$/);
    if (match) {
      return {
        type: 'element-hide',
        domains: match[1].split(',').filter(d => d),
        selector: match[2]
      };
    }
    
    // Global element hiding
    if (rule.startsWith('##')) {
      return {
        type: 'element-hide',
        domains: [],
        selector: rule.slice(2)
      };
    }
    
    return null;
  }
  
  /**
   * Parse scriptlet rule
   */
  parseScriptletRule(rule) {
    const match = rule.match(/^(.+?)#%#(.+)$/);
    if (match) {
      return {
        type: 'scriptlet',
        domains: match[1].split(',').filter(d => d),
        script: match[2]
      };
    }
    return null;
  }
  
  /**
   * Parse network blocking rule
   */
  parseNetworkRule(rule) {
    let isException = false;
    let ruleText = rule;
    
    // Exception rules start with @@
    if (rule.startsWith('@@')) {
      isException = true;
      ruleText = rule.slice(2);
    }
    
    // Parse options
    let options = {};
    const optionMatch = ruleText.match(/^(.+?)\$(.+)$/);
    
    if (optionMatch) {
      ruleText = optionMatch[1];
      options = this.parseRuleOptions(optionMatch[2]);
    }
    
    // Convert to regex pattern
    const pattern = this.ruleToRegex(ruleText);
    
    return {
      type: isException ? 'network-exception' : 'network-block',
      pattern,
      originalRule: rule,
      options
    };
  }
  
  /**
   * Parse rule options (after $)
   */
  parseRuleOptions(optionString) {
    const options = {};
    const parts = optionString.split(',');
    
    for (const part of parts) {
      const [key, value] = part.split('=');
      
      switch (key) {
        case 'domain':
          options.domains = value ? value.split('|') : [];
          break;
        case 'third-party':
        case '3p':
          options.thirdParty = true;
          break;
        case '~third-party':
        case '1p':
          options.firstParty = true;
          break;
        case 'script':
          options.resourceTypes = options.resourceTypes || [];
          options.resourceTypes.push('script');
          break;
        case 'image':
          options.resourceTypes = options.resourceTypes || [];
          options.resourceTypes.push('image');
          break;
        case 'stylesheet':
        case 'css':
          options.resourceTypes = options.resourceTypes || [];
          options.resourceTypes.push('stylesheet');
          break;
        case 'xmlhttprequest':
        case 'xhr':
          options.resourceTypes = options.resourceTypes || [];
          options.resourceTypes.push('xmlhttprequest');
          break;
        case 'subdocument':
        case 'frame':
          options.resourceTypes = options.resourceTypes || [];
          options.resourceTypes.push('sub_frame');
          break;
        case 'important':
          options.important = true;
          break;
      }
    }
    
    return options;
  }
  
  /**
   * Convert AdBlock rule pattern to regex
   */
  ruleToRegex(pattern) {
    // Handle special patterns
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      return pattern.slice(1, -1); // Already a regex
    }
    
    let regex = pattern
      // Escape special regex chars
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      // Convert AdBlock wildcards
      .replace(/\*/g, '.*')
      // ^ matches separator
      .replace(/\^/g, '([^a-zA-Z0-9_.%-]|$)')
      // || matches start of domain
      .replace(/^\\\|\\\|/, '^https?://([a-z0-9-]+\\.)*')
      // | at start/end matches string boundary
      .replace(/^\\\|/, '^')
      .replace(/\\\|$/, '$');
    
    return regex;
  }
  
  /**
   * Parse hosts file format
   */
  parseHostsFile(text) {
    const rules = [];
    const lines = text.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      
      // Parse hosts entry: 0.0.0.0 domain.com or 127.0.0.1 domain.com
      const match = trimmed.match(/^(?:0\.0\.0\.0|127\.0\.0\.1)\s+(.+)$/);
      if (match) {
        const domain = match[1].split('#')[0].trim(); // Remove inline comments
        if (domain && domain !== 'localhost') {
          rules.push({
            type: 'network-block',
            pattern: `^https?://([a-z0-9-]+\\.)*${this.escapeRegex(domain)}(/|$)`,
            originalRule: trimmed
          });
        }
      }
    }
    
    return rules;
  }
  
  /**
   * Escape regex special characters
   */
  escapeRegex(str) {
    return str.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  
  /**
   * Cache filter list to storage
   */
  async cacheFilterList(id, data) {
    const { filterCache = {} } = await chrome.storage.local.get('filterCache');
    filterCache[id] = data;
    await chrome.storage.local.set({ filterCache });
  }
  
  /**
   * Compile rules for declarativeNetRequest
   */
  async compileRules() {
    const compiledRules = [];
    let ruleId = 100000; // Start high to avoid conflicts with static rules
    
    for (const [listId, listData] of this.filterLists) {
      if (!listData.rules) continue;
      
      for (const rule of listData.rules) {
        if (rule.type === 'network-block') {
          const dnrRule = this.compileToDNR(rule, ruleId++);
          if (dnrRule) {
            compiledRules.push(dnrRule);
          }
        }
      }
      
      // Limit to prevent hitting rule limits
      if (compiledRules.length >= 30000) break;
    }
    
    // Add custom rules
    for (const rule of this.customRules) {
      const dnrRule = this.compileCustomToDNR(rule, ruleId++);
      if (dnrRule) {
        compiledRules.push(dnrRule);
      }
    }
    
    this.compiledRules = compiledRules;
    
    // Update dynamic rules
    await this.updateDynamicRules(compiledRules);
  }
  
  /**
   * Compile a filter rule to declarativeNetRequest format
   */
  compileToDNR(rule, id) {
    try {
      const dnrRule = {
        id,
        priority: 1,
        action: { type: 'block' },
        condition: {
          regexFilter: rule.pattern,
          resourceTypes: rule.options?.resourceTypes || [
            'script', 'image', 'stylesheet', 'sub_frame',
            'xmlhttprequest', 'media', 'font', 'other'
          ]
        }
      };
      
      if (rule.options?.domains) {
        const includeDomains = [];
        const excludeDomains = [];
        
        for (const domain of rule.options.domains) {
          if (domain.startsWith('~')) {
            excludeDomains.push(domain.slice(1));
          } else {
            includeDomains.push(domain);
          }
        }
        
        if (includeDomains.length > 0) {
          dnrRule.condition.initiatorDomains = includeDomains;
        }
        if (excludeDomains.length > 0) {
          dnrRule.condition.excludedInitiatorDomains = excludeDomains;
        }
      }
      
      if (rule.options?.thirdParty) {
        dnrRule.condition.domainType = 'thirdParty';
      } else if (rule.options?.firstParty) {
        dnrRule.condition.domainType = 'firstParty';
      }
      
      return dnrRule;
    } catch (error) {
      console.warn('[FilterEngine] Failed to compile rule:', rule.originalRule);
      return null;
    }
  }
  
  /**
   * Compile custom rule to DNR format
   */
  compileCustomToDNR(rule, id) {
    if (rule.type === 'block') {
      return {
        id,
        priority: 2, // Higher priority for custom rules
        action: { type: 'block' },
        condition: {
          urlFilter: rule.pattern,
          resourceTypes: rule.resourceTypes || ['main_frame', 'sub_frame', 'script', 'image', 'stylesheet', 'xmlhttprequest']
        }
      };
    }
    
    if (rule.type === 'allow') {
      return {
        id,
        priority: 3, // Even higher for allowlist
        action: { type: 'allow' },
        condition: {
          urlFilter: rule.pattern
        }
      };
    }
    
    return null;
  }
  
  /**
   * Update dynamic rules in declarativeNetRequest
   */
  async updateDynamicRules(rules) {
    try {
      // Get existing dynamic rules
      const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
      const existingIds = existingRules.map(r => r.id);
      
      // Remove all existing dynamic rules
      if (existingIds.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: existingIds
        });
      }
      
      // Add new rules in batches (Chrome has limits)
      const batchSize = 5000;
      for (let i = 0; i < rules.length; i += batchSize) {
        const batch = rules.slice(i, i + batchSize);
        await chrome.declarativeNetRequest.updateDynamicRules({
          addRules: batch
        });
      }
      
      console.log(`[FilterEngine] Updated ${rules.length} dynamic rules`);
    } catch (error) {
      console.error('[FilterEngine] Failed to update dynamic rules:', error);
    }
  }
  
  /**
   * Add a custom rule
   */
  async addCustomRule(rule) {
    const newRule = {
      id: Date.now(),
      ...rule,
      createdAt: Date.now()
    };
    
    this.customRules.push(newRule);
    await chrome.storage.local.set({ customRules: this.customRules });
    
    // Recompile rules
    await this.compileRules();
    
    return newRule;
  }
  
  /**
   * Remove a custom rule
   */
  async removeCustomRule(ruleId) {
    this.customRules = this.customRules.filter(r => r.id !== ruleId);
    await chrome.storage.local.set({ customRules: this.customRules });
    
    // Recompile rules
    await this.compileRules();
  }
  
  /**
   * Get custom rules
   */
  async getCustomRules() {
    return this.customRules;
  }
  
  /**
   * Import custom rules
   */
  async importCustomRules(rules) {
    this.customRules = rules;
    await chrome.storage.local.set({ customRules: this.customRules });
    await this.compileRules();
  }
  
  /**
   * Get element hiding rules for a domain
   */
  getElementHidingRules(domain) {
    const rules = [];
    
    for (const [, listData] of this.filterLists) {
      if (!listData.rules) continue;
      
      for (const rule of listData.rules) {
        if (rule.type === 'element-hide') {
          // Check if rule applies to this domain
          if (this.ruleApplies(rule, domain)) {
            rules.push(rule.selector);
          }
        }
      }
    }
    
    return [...new Set(rules)]; // Deduplicate
  }
  
  /**
   * Check if an element hiding rule applies to a domain
   */
  ruleApplies(rule, domain) {
    // Global rules apply everywhere
    if (!rule.domains || rule.domains.length === 0) {
      return true;
    }
    
    let applies = false;
    let excluded = false;
    
    for (const ruleDomain of rule.domains) {
      if (ruleDomain.startsWith('~')) {
        // Exclusion domain
        const excludedDomain = ruleDomain.slice(1);
        if (domain === excludedDomain || domain.endsWith('.' + excludedDomain)) {
          excluded = true;
        }
      } else {
        // Inclusion domain
        if (domain === ruleDomain || domain.endsWith('.' + ruleDomain)) {
          applies = true;
        }
      }
    }
    
    // If only exclusions are specified, rule applies by default
    if (!applies && rule.domains.every(d => d.startsWith('~'))) {
      applies = true;
    }
    
    return applies && !excluded;
  }
  
  /**
   * Toggle a filter list
   */
  async toggleFilterList(id, enabled) {
    if (this.sources[id]) {
      this.sources[id].enabled = enabled;
      
      if (enabled && !this.filterLists.has(id)) {
        await this.updateFilterList(id);
      }
      
      await this.compileRules();
    }
  }
  
  /**
   * Get cosmetic rules count
   */
  getCosmeticRulesCount() {
    let count = 0;
    
    for (const [, listData] of this.filterLists) {
      if (listData.rules) {
        count += listData.rules.filter(r => r.type === 'element-hide').length;
      }
    }
    
    return count;
  }
  
  /**
   * Get network rules count
   */
  getNetworkRulesCount() {
    let count = 0;
    
    for (const [, listData] of this.filterLists) {
      if (listData.rules) {
        count += listData.rules.filter(r => r.type === 'network-block').length;
      }
    }
    
    return count + this.customRules.length;
  }
}
