/**
 * BlockForge - AI Detector Module
 * 
 * Provides AI-powered threat detection:
 * - Pattern analysis for new trackers
 * - Threat scoring based on multiple indicators
 * - Learning from blocked patterns
 * - Fingerprinting attempt detection
 * - Cryptomining detection
 */

export class AIDetector {
  constructor() {
    this.enabled = true;
    this.patterns = new Map();
    this.threatScores = new Map();
    this.learningData = {
      blockedPatterns: [],
      threatIndicators: [],
      version: 1
    };
    
    // Known threat indicators
    this.threatIndicators = {
      fingerprinting: [
        'canvas.toDataURL', 'getImageData', 'measureText',
        'getContext("webgl")', 'getContext("2d")',
        'AudioContext', 'OfflineAudioContext',
        'navigator.plugins', 'navigator.mimeTypes',
        'screen.colorDepth', 'screen.pixelDepth',
        'getTimezoneOffset', 'getBoundingClientRect',
        'fonts.check', 'fonts.ready'
      ],
      cryptomining: [
        'CoinHive', 'Coinhive', 'coinhive',
        'crypto-loot', 'cryptonight', 'cryptoloot',
        'minero.cc', 'jsecoin', 'webminer',
        'deepMiner', 'coinhave', 'ppoi.org',
        'projectpoi.com', 'monerominer', 'load.jsecoin.com'
      ],
      tracking: [
        'beacon', 'pixel', 'tracking', 'analytics',
        'telemetry', 'metrics', 'collect', 'pageview',
        'conversion', 'event_log', 'user_tracking'
      ],
      malware: [
        'eval(', 'document.write(', 'innerHTML=',
        'fromCharCode', 'atob(', 'unescape(',
        'WebSocket', 'postMessage', 'opener.location'
      ]
    };
    
    // URL patterns that indicate tracking
    this.trackingURLPatterns = [
      /[?&](utm_|fbclid|gclid|msclkid|mc_|_ga|_gl)/i,
      /\/pixel\.(gif|png|jpg)/i,
      /\/beacon\./i,
      /\/collect\?/i,
      /\/analytics[/.]?/i,
      /\/track(ing)?[/.]?/i,
      /\/telemetry[/.]?/i,
      /__utm\.gif/i,
      /\/clear\.gif/i,
      /\/spacer\.gif/i
    ];
    
    // Domain patterns for known threats
    this.threatDomains = {
      high: [
        /^.+\.click$/,
        /^.+\.xyz$/,
        /track(ing)?\..*\.(com|net|org)$/,
        /analytics\..*\.(com|net|org)$/,
        /pixel\..*\.(com|net|org)$/,
        /beacon\..*\.(com|net|org)$/,
        /telemetry\..*\.(com|net|org)$/
      ],
      medium: [
        /ads?\..*\.(com|net|org)$/,
        /adserver\..*$/,
        /doubleclick\./,
        /googlesyndication\./
      ]
    };
  }
  
  /**
   * Initialize the AI detector
   */
  async initialize() {
    await this.loadLearningData();
    console.log('[AIDetector] Initialized');
  }
  
  /**
   * Load learning data from storage
   */
  async loadLearningData() {
    const { aiData } = await chrome.storage.local.get('aiData');
    if (aiData) {
      this.learningData = aiData;
      
      // Rebuild patterns from learning data
      for (const pattern of this.learningData.blockedPatterns) {
        this.patterns.set(pattern.pattern, pattern);
      }
    }
  }
  
  /**
   * Save learning data to storage
   */
  async saveLearningData() {
    await chrome.storage.local.set({ aiData: this.learningData });
  }
  
  /**
   * Set enabled state
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }
  
  /**
   * Analyze a page for threats
   */
  async analyzePage(tabId, url) {
    if (!this.enabled) {
      return { score: 0, threats: [] };
    }
    
    const threats = [];
    let score = 0;
    
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      
      // Analyze URL for tracking parameters
      const trackingParams = this.detectTrackingParams(url);
      if (trackingParams.length > 0) {
        threats.push({
          type: 'tracking_params',
          severity: 'low',
          details: `Found tracking parameters: ${trackingParams.join(', ')}`
        });
        score += 5 * trackingParams.length;
      }
      
      // Check domain against known threat patterns
      const domainThreat = this.analyzeDomain(hostname);
      if (domainThreat) {
        threats.push(domainThreat);
        score += domainThreat.severity === 'high' ? 30 : 15;
      }
      
      // Analyze page content via content script
      try {
        const contentAnalysis = await this.requestContentAnalysis(tabId);
        if (contentAnalysis) {
          threats.push(...contentAnalysis.threats);
          score += contentAnalysis.score;
        }
      } catch (e) {
        // Content script might not be ready
      }
      
      // Apply learned patterns
      const learnedThreats = this.checkLearnedPatterns(url);
      threats.push(...learnedThreats);
      score += learnedThreats.length * 10;
      
      // Normalize score to 0-100
      score = Math.min(100, score);
      
      // Store threat score for domain
      this.threatScores.set(hostname, { score, threats, timestamp: Date.now() });
      
    } catch (error) {
      console.error('[AIDetector] Analysis error:', error);
    }
    
    return { score, threats };
  }
  
  /**
   * Analyze a URL for threats (quick analysis)
   */
  analyzeURL(url) {
    const threats = [];
    let score = 0;
    
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const fullUrl = url.toLowerCase();
      
      // Check for cryptominer patterns
      for (const pattern of this.threatIndicators.cryptomining) {
        if (fullUrl.includes(pattern.toLowerCase())) {
          threats.push({
            type: 'cryptominer',
            severity: 'high',
            details: `Cryptominer pattern detected: ${pattern}`
          });
          score += 50;
          break;
        }
      }
      
      // Check for tracking patterns
      for (const pattern of this.trackingURLPatterns) {
        if (pattern.test(url)) {
          threats.push({
            type: 'tracking',
            severity: 'medium',
            details: 'URL matches tracking pattern'
          });
          score += 15;
          break;
        }
      }
      
      // Check domain reputation
      const domainThreat = this.analyzeDomain(hostname);
      if (domainThreat) {
        threats.push(domainThreat);
        score += domainThreat.severity === 'high' ? 30 : 15;
      }
      
      // Check learned patterns
      const learnedThreats = this.checkLearnedPatterns(url);
      threats.push(...learnedThreats);
      score += learnedThreats.length * 10;
      
    } catch (error) {
      console.error('[AIDetector] URL analysis error:', error);
    }
    
    return {
      score: Math.min(100, score),
      threats,
      recommendation: this.getRecommendation(score)
    };
  }
  
  /**
   * Detect tracking parameters in URL
   */
  detectTrackingParams(url) {
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'msclkid', 'dclid', 'twclid',
      'mc_eid', 'mc_cid', '_ga', '_gl', '_hsenc', '_hsmi',
      'yclid', 'zanpid', 'igshid', 'ref_', 'source',
      'trk', 'affiliate', 'partner', 'campaign'
    ];
    
    try {
      const urlObj = new URL(url);
      const found = [];
      
      for (const param of trackingParams) {
        if (urlObj.searchParams.has(param)) {
          found.push(param);
        }
      }
      
      return found;
    } catch {
      return [];
    }
  }
  
  /**
   * Analyze domain for threat indicators
   */
  analyzeDomain(hostname) {
    // Check high-threat patterns
    for (const pattern of this.threatDomains.high) {
      if (pattern.test(hostname)) {
        return {
          type: 'suspicious_domain',
          severity: 'high',
          details: `Domain matches high-risk pattern`
        };
      }
    }
    
    // Check medium-threat patterns
    for (const pattern of this.threatDomains.medium) {
      if (pattern.test(hostname)) {
        return {
          type: 'ad_domain',
          severity: 'medium',
          details: `Domain matches advertising pattern`
        };
      }
    }
    
    // Check subdomain depth (many trackers use deep subdomains)
    const parts = hostname.split('.');
    if (parts.length > 4) {
      return {
        type: 'suspicious_subdomain',
        severity: 'low',
        details: `Unusually deep subdomain structure`
      };
    }
    
    return null;
  }
  
  /**
   * Request content analysis from content script
   */
  async requestContentAnalysis(tabId) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { type: 'ANALYZE_CONTENT' }, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
        } else {
          resolve(response);
        }
      });
    });
  }
  
  /**
   * Check URL against learned patterns
   */
  checkLearnedPatterns(url) {
    const threats = [];
    
    for (const [pattern, data] of this.patterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(url)) {
          threats.push({
            type: 'learned_pattern',
            severity: data.severity || 'medium',
            details: `Matches learned pattern (confidence: ${data.confidence}%)`
          });
        }
      } catch {
        // Invalid regex, skip
      }
    }
    
    return threats;
  }
  
  /**
   * Learn from a blocked request
   */
  learnFromBlocked(url, category) {
    if (!this.enabled) return;
    
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const pathname = urlObj.pathname;
      
      // Extract potential patterns
      const patterns = this.extractPatterns(hostname, pathname);
      
      for (const pattern of patterns) {
        if (this.patterns.has(pattern)) {
          // Increase confidence for existing pattern
          const data = this.patterns.get(pattern);
          data.confidence = Math.min(100, data.confidence + 1);
          data.seenCount++;
          data.lastSeen = Date.now();
        } else {
          // New pattern
          this.patterns.set(pattern, {
            pattern,
            category,
            confidence: 10,
            seenCount: 1,
            firstSeen: Date.now(),
            lastSeen: Date.now()
          });
        }
      }
      
      // Periodically save learning data
      this.scheduleDataSave();
      
    } catch (error) {
      // Invalid URL, skip learning
    }
  }
  
  /**
   * Extract potential patterns from URL
   */
  extractPatterns(hostname, pathname) {
    const patterns = [];
    
    // Domain-based pattern
    const domainParts = hostname.split('.');
    if (domainParts.length >= 2) {
      const baseDomain = domainParts.slice(-2).join('.');
      patterns.push(baseDomain.replace(/\./g, '\\.'));
    }
    
    // Path-based patterns
    const pathParts = pathname.split('/').filter(p => p);
    if (pathParts.length > 0) {
      // First path segment often indicates purpose (e.g., /track, /pixel)
      const firstPart = pathParts[0];
      if (firstPart.length > 2 && firstPart.length < 20) {
        patterns.push(`/${firstPart}`);
      }
    }
    
    // File extension pattern
    const extMatch = pathname.match(/\.(gif|png|js|json)$/i);
    if (extMatch) {
      const fileName = pathname.split('/').pop();
      if (fileName && fileName.length < 30) {
        patterns.push(fileName.replace(/\./g, '\\.'));
      }
    }
    
    return patterns;
  }
  
  /**
   * Schedule learning data save (debounced)
   */
  scheduleDataSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    
    this.saveTimeout = setTimeout(() => {
      this.saveLearningDataInternal();
    }, 30000); // Save every 30 seconds if there are changes
  }
  
  /**
   * Internal save function
   */
  async saveLearningDataInternal() {
    // Convert patterns map to array for storage
    this.learningData.blockedPatterns = Array.from(this.patterns.values())
      .filter(p => p.confidence >= 20) // Only save patterns with decent confidence
      .slice(0, 1000); // Limit to 1000 patterns
    
    await this.saveLearningData();
  }
  
  /**
   * Analyze script content for threats
   */
  analyzeScript(scriptContent) {
    const threats = [];
    let score = 0;
    
    const contentLower = scriptContent.toLowerCase();
    
    // Check for fingerprinting code
    const fingerprintingHits = this.threatIndicators.fingerprinting.filter(
      indicator => contentLower.includes(indicator.toLowerCase())
    );
    
    if (fingerprintingHits.length >= 3) {
      threats.push({
        type: 'fingerprinting',
        severity: 'high',
        details: `Multiple fingerprinting APIs detected: ${fingerprintingHits.slice(0, 3).join(', ')}`
      });
      score += 40;
    } else if (fingerprintingHits.length > 0) {
      threats.push({
        type: 'fingerprinting_attempt',
        severity: 'medium',
        details: `Potential fingerprinting: ${fingerprintingHits.join(', ')}`
      });
      score += 15;
    }
    
    // Check for cryptomining
    const miningHits = this.threatIndicators.cryptomining.filter(
      indicator => contentLower.includes(indicator.toLowerCase())
    );
    
    if (miningHits.length > 0) {
      threats.push({
        type: 'cryptominer',
        severity: 'high',
        details: `Cryptomining script detected: ${miningHits[0]}`
      });
      score += 50;
    }
    
    // Check for obfuscation (common in malicious scripts)
    const obfuscationScore = this.detectObfuscation(scriptContent);
    if (obfuscationScore > 0.7) {
      threats.push({
        type: 'obfuscated_code',
        severity: 'medium',
        details: 'Highly obfuscated JavaScript detected'
      });
      score += 25;
    }
    
    // Check for malware patterns
    const malwareHits = this.threatIndicators.malware.filter(
      indicator => contentLower.includes(indicator.toLowerCase())
    );
    
    if (malwareHits.length >= 3) {
      threats.push({
        type: 'suspicious_code',
        severity: 'medium',
        details: 'Multiple suspicious code patterns detected'
      });
      score += 20;
    }
    
    return { threats, score: Math.min(100, score) };
  }
  
  /**
   * Detect obfuscated code
   */
  detectObfuscation(code) {
    const indicators = {
      // High ratio of hex/unicode escapes
      hexEscapes: (code.match(/\\x[0-9a-f]{2}/gi) || []).length,
      unicodeEscapes: (code.match(/\\u[0-9a-f]{4}/gi) || []).length,
      // Long strings of seemingly random characters
      longStrings: (code.match(/["'][^"']{100,}["']/g) || []).length,
      // eval usage
      evalUsage: (code.match(/eval\s*\(/gi) || []).length,
      // Array-based obfuscation
      arrayAccess: (code.match(/\[\s*['"][^'"]+['"]\s*\]/g) || []).length,
      // Function constructor
      functionConstructor: (code.match(/Function\s*\(/gi) || []).length
    };
    
    const codeLength = code.length;
    
    // Calculate obfuscation score
    let score = 0;
    score += (indicators.hexEscapes / codeLength) * 1000;
    score += (indicators.unicodeEscapes / codeLength) * 1000;
    score += indicators.longStrings * 0.1;
    score += indicators.evalUsage * 0.2;
    score += (indicators.arrayAccess / codeLength) * 100;
    score += indicators.functionConstructor * 0.3;
    
    return Math.min(1, score);
  }
  
  /**
   * Get recommendation based on threat score
   */
  getRecommendation(score) {
    if (score >= 70) {
      return {
        level: 'danger',
        action: 'block',
        message: 'High threat detected. This request should be blocked.'
      };
    } else if (score >= 40) {
      return {
        level: 'warning',
        action: 'caution',
        message: 'Moderate threat detected. Proceed with caution.'
      };
    } else if (score >= 20) {
      return {
        level: 'info',
        action: 'monitor',
        message: 'Minor concerns detected. Monitoring recommended.'
      };
    }
    
    return {
      level: 'safe',
      action: 'allow',
      message: 'No significant threats detected.'
    };
  }
  
  /**
   * Get threat score for a domain
   */
  getDomainThreatScore(hostname) {
    const cached = this.threatScores.get(hostname);
    
    if (cached && Date.now() - cached.timestamp < 300000) { // 5 min cache
      return cached;
    }
    
    return null;
  }
  
  /**
   * Clear learning data
   */
  async clearLearningData() {
    this.patterns.clear();
    this.threatScores.clear();
    this.learningData = {
      blockedPatterns: [],
      threatIndicators: [],
      version: 1
    };
    await this.saveLearningData();
  }
  
  /**
   * Export learning data
   */
  exportLearningData() {
    return {
      patterns: Array.from(this.patterns.values()),
      version: this.learningData.version
    };
  }
  
  /**
   * Import learning data
   */
  async importLearningData(data) {
    if (data.patterns) {
      for (const pattern of data.patterns) {
        this.patterns.set(pattern.pattern, pattern);
      }
      await this.saveLearningDataInternal();
    }
  }
}
