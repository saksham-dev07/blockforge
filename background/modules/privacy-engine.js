/**
 * ShieldGuard - Privacy Engine Module
 * 
 * Provides comprehensive privacy protection:
 * - Anti-fingerprinting injection
 * - Cookie management and auto-delete
 * - Tracking parameter removal
 * - WebRTC leak prevention
 * - Battery API blocking
 */

export class PrivacyEngine {
  constructor() {
    this.settings = {
      antiFingerprint: true,
      cookieAutoDelete: false,
      removeTrackingParams: true,
      blockWebRTC: false,
      blockBatteryAPI: true,
      spoofTimezone: false,
      spoofLanguage: false
    };
    
    this.cookieWhitelist = new Set();
    this.activeTabHosts = new Map();
    
    // Tracking parameters to remove from URLs
    this.trackingParams = [
      // Google
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'utm_id', 'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic',
      'gclid', 'gclsrc', 'dclid',
      // Facebook
      'fbclid', 'fb_action_ids', 'fb_action_types', 'fb_source', 'fb_ref',
      'fbc', 'fbp', 'fb_beacon',
      // Microsoft
      'msclkid', 'mc_cid', 'mc_eid',
      // Twitter
      'twclid', 'twgclid',
      // LinkedIn
      'li_fat_id', 'li_langcode',
      // Mailchimp
      'mc_cid', 'mc_eid',
      // HubSpot
      '_hsenc', '_hsmi', '__hstc', '__hsfp', 'hsCtaTracking',
      // Yandex
      'yclid', 'ymclid', '_ym_uid', '_ym_visorc',
      // Adobe
      'adobe_mc', 'adobe_mc_sdid', 'adobe_mc_ref',
      // Generic
      'trk', 'ref_', 'ref', 'affiliate', 'affiliate_id',
      'campaign', 'source', 'partner', 'placement',
      'zanpid', 'igshid', 's_kwcid', 'cmp', 'cmpid',
      // Analytics
      '_ga', '_gl', '_ke', 'mtm_campaign', 'mtm_cid',
      'pk_campaign', 'pk_cid', 'pk_content', 'pk_medium', 'pk_source'
    ];
  }
  
  /**
   * Initialize the privacy engine
   */
  async initialize(settings) {
    if (settings) {
      this.settings = { ...this.settings, ...settings };
    }
    
    // Load cookie whitelist
    const { cookieWhitelist } = await chrome.storage.local.get('cookieWhitelist');
    if (cookieWhitelist) {
      this.cookieWhitelist = new Set(cookieWhitelist);
    }
    
    // Set up navigation listener for URL cleaning
    if (this.settings.removeTrackingParams) {
      this.setupURLCleaner();
    }
    
    console.log('[PrivacyEngine] Initialized');
  }
  
  /**
   * Get current settings
   */
  getSettings() {
    return this.settings;
  }
  
  /**
   * Update settings
   */
  async updateSettings(updates) {
    this.settings = { ...this.settings, ...updates };
    await chrome.storage.local.set({ privacySettings: this.settings });
    
    // Apply changes
    if (updates.removeTrackingParams !== undefined) {
      if (updates.removeTrackingParams) {
        this.setupURLCleaner();
      }
    }
  }
  
  /**
   * Set anti-fingerprint protection
   */
  async setAntiFingerprint(enabled) {
    this.settings.antiFingerprint = enabled;
    
    // Notify all tabs to update protection
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        chrome.tabs.sendMessage(tab.id, {
          type: 'UPDATE_FINGERPRINT_PROTECTION',
          enabled
        });
      } catch (e) {
        // Tab might not have content script
      }
    }
  }
  
  /**
   * Set cookie auto-delete
   */
  async setCookieAutoDelete(enabled) {
    this.settings.cookieAutoDelete = enabled;
  }
  
  /**
   * Set up URL cleaner for tracking parameters
   */
  setupURLCleaner() {
    // Use declarativeNetRequest to redirect URLs
    this.setupTrackingParamRules();
  }
  
  /**
   * Create declarativeNetRequest rules for tracking parameter removal
   */
  async setupTrackingParamRules() {
    try {
      // Build regex for tracking parameters
      const paramPattern = this.trackingParams.map(p => 
        p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      ).join('|');
      
      // We'll use a transform rule to remove these parameters
      const rule = {
        id: 999999,
        priority: 1,
        action: {
          type: 'redirect',
          redirect: {
            transform: {
              queryTransform: {
                removeParams: this.trackingParams
              }
            }
          }
        },
        condition: {
          regexFilter: `[?&](${paramPattern})=`,
          resourceTypes: ['main_frame']
        }
      };
      
      // Remove existing rule if present
      try {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: [999999]
        });
      } catch (e) {
        // Rule might not exist
      }
      
      // Add new rule
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: [rule]
      });
      
    } catch (error) {
      console.error('[PrivacyEngine] Failed to setup tracking param rules:', error);
    }
  }
  
  /**
   * Clean tracking parameters from a URL
   */
  cleanURL(url) {
    try {
      const urlObj = new URL(url);
      let changed = false;
      
      for (const param of this.trackingParams) {
        if (urlObj.searchParams.has(param)) {
          urlObj.searchParams.delete(param);
          changed = true;
        }
      }
      
      return changed ? urlObj.toString() : url;
    } catch {
      return url;
    }
  }
  
  /**
   * Cleanup cookies based on settings
   */
  async cleanupCookies() {
    if (!this.settings.cookieAutoDelete) return;
    
    try {
      // Get all cookies
      const cookies = await chrome.cookies.getAll({});
      
      // Get active tabs to preserve their cookies
      const tabs = await chrome.tabs.query({ active: true });
      const activeHosts = new Set(
        tabs.map(tab => {
          try {
            return new URL(tab.url).hostname;
          } catch {
            return null;
          }
        }).filter(h => h)
      );
      
      // Count deleted cookies
      let deleted = 0;
      
      for (const cookie of cookies) {
        const domain = cookie.domain.replace(/^\./, '');
        
        // Skip whitelisted cookies
        if (this.cookieWhitelist.has(domain)) continue;
        
        // Skip cookies from active tabs
        if (activeHosts.has(domain)) continue;
        
        // Skip first-party cookies (domain matches current tab)
        if (this.isFirstPartyCookie(cookie, activeHosts)) continue;
        
        // Skip session cookies if setting allows
        if (!cookie.expirationDate) continue;
        
        // Delete third-party cookie
        const url = `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`;
        
        try {
          await chrome.cookies.remove({
            url,
            name: cookie.name
          });
          deleted++;
        } catch (e) {
          // Cookie might already be deleted
        }
      }
      
      if (deleted > 0) {
        console.log(`[PrivacyEngine] Deleted ${deleted} third-party cookies`);
      }
      
      return deleted;
      
    } catch (error) {
      console.error('[PrivacyEngine] Cookie cleanup error:', error);
      return 0;
    }
  }
  
  /**
   * Check if cookie is first-party
   */
  isFirstPartyCookie(cookie, activeHosts) {
    const domain = cookie.domain.replace(/^\./, '');
    
    for (const host of activeHosts) {
      if (host === domain || host.endsWith('.' + domain)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Add domain to cookie whitelist
   */
  async addToCookieWhitelist(domain) {
    this.cookieWhitelist.add(domain);
    await chrome.storage.local.set({ 
      cookieWhitelist: Array.from(this.cookieWhitelist) 
    });
  }
  
  /**
   * Remove domain from cookie whitelist
   */
  async removeFromCookieWhitelist(domain) {
    this.cookieWhitelist.delete(domain);
    await chrome.storage.local.set({ 
      cookieWhitelist: Array.from(this.cookieWhitelist) 
    });
  }
  
  /**
   * Get cookie whitelist
   */
  getCookieWhitelist() {
    return Array.from(this.cookieWhitelist);
  }
  
  /**
   * Get fingerprint protection injection script
   */
  getFingerprintProtectionScript() {
    return `
(function() {
  'use strict';
  
  // Only run once
  if (window.__shieldguard_fp_protected__) return;
  window.__shieldguard_fp_protected__ = true;
  
  const config = {
    // Random seed based on session (consistent for same session)
    seed: ${Math.random() * 1000000 | 0},
    
    // Canvas fingerprint protection
    canvasNoise: ${this.settings.antiFingerprint},
    
    // WebGL protection
    webglNoise: ${this.settings.antiFingerprint},
    
    // Audio fingerprint protection
    audioNoise: ${this.settings.antiFingerprint},
    
    // Block battery API
    blockBattery: ${this.settings.blockBatteryAPI}
  };
  
  // Seeded random number generator
  function seededRandom(seed) {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  }
  
  let seedCounter = config.seed;
  function random() {
    return seededRandom(seedCounter++);
  }
  
  // ========== Canvas Protection ==========
  if (config.canvasNoise) {
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    
    // Add subtle noise to canvas
    function addCanvasNoise(canvas) {
      try {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        const imageData = originalGetImageData.call(ctx, 0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Add minimal noise that's consistent for this session
        for (let i = 0; i < data.length; i += 4) {
          // Modify only a small subset of pixels
          if (random() > 0.99) {
            data[i] = Math.max(0, Math.min(255, data[i] + (random() * 2 - 1) | 0));
          }
        }
        
        ctx.putImageData(imageData, 0, 0);
      } catch (e) {
        // Ignore errors
      }
    }
    
    HTMLCanvasElement.prototype.toDataURL = function(...args) {
      addCanvasNoise(this);
      return originalToDataURL.apply(this, args);
    };
    
    HTMLCanvasElement.prototype.toBlob = function(callback, ...args) {
      addCanvasNoise(this);
      return originalToBlob.call(this, callback, ...args);
    };
    
    CanvasRenderingContext2D.prototype.getImageData = function(...args) {
      const result = originalGetImageData.apply(this, args);
      
      // Add noise to returned data
      for (let i = 0; i < result.data.length; i += 4) {
        if (random() > 0.995) {
          result.data[i] = Math.max(0, Math.min(255, result.data[i] + (random() * 2 - 1) | 0));
        }
      }
      
      return result;
    };
  }
  
  // ========== WebGL Protection ==========
  if (config.webglNoise) {
    const getParameterOriginal = WebGLRenderingContext.prototype.getParameter;
    
    WebGLRenderingContext.prototype.getParameter = function(param) {
      // Spoof certain parameters
      switch (param) {
        case 37445: // UNMASKED_VENDOR_WEBGL
          return 'Generic Vendor';
        case 37446: // UNMASKED_RENDERER_WEBGL
          return 'Generic Renderer';
        default:
          return getParameterOriginal.call(this, param);
      }
    };
    
    // Also protect WebGL2 if available
    if (typeof WebGL2RenderingContext !== 'undefined') {
      const getParameter2Original = WebGL2RenderingContext.prototype.getParameter;
      
      WebGL2RenderingContext.prototype.getParameter = function(param) {
        switch (param) {
          case 37445:
            return 'Generic Vendor';
          case 37446:
            return 'Generic Renderer';
          default:
            return getParameter2Original.call(this, param);
        }
      };
    }
  }
  
  // ========== Audio Fingerprint Protection ==========
  if (config.audioNoise) {
    const originalCreateAnalyser = AudioContext.prototype.createAnalyser;
    const originalGetFloatFrequencyData = AnalyserNode.prototype.getFloatFrequencyData;
    
    AnalyserNode.prototype.getFloatFrequencyData = function(array) {
      originalGetFloatFrequencyData.call(this, array);
      
      // Add minimal noise
      for (let i = 0; i < array.length; i++) {
        if (random() > 0.9) {
          array[i] += random() * 0.0001 - 0.00005;
        }
      }
    };
  }
  
  // ========== Battery API Blocking ==========
  if (config.blockBattery) {
    if (navigator.getBattery) {
      Object.defineProperty(navigator, 'getBattery', {
        value: () => Promise.reject(new Error('Battery API blocked'))
      });
    }
    
    if (navigator.battery) {
      Object.defineProperty(navigator, 'battery', {
        value: undefined
      });
    }
  }
  
  // ========== Plugin/MimeType Spoofing ==========
  try {
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        return {
          length: 5,
          item: (i) => ({ name: 'Plugin ' + i }),
          namedItem: () => null,
          refresh: () => {}
        };
      }
    });
  } catch (e) {}
  
  // ========== Hardware Concurrency Normalization ==========
  try {
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 4 // Standard value
    });
  } catch (e) {}
  
  // ========== Device Memory Normalization ==========
  try {
    if (navigator.deviceMemory) {
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8 // Standard value
      });
    }
  } catch (e) {}
  
  console.log('[ShieldGuard] Fingerprint protection active');
})();
    `.trim();
  }
  
  /**
   * Get WebRTC protection script
   */
  getWebRTCProtectionScript() {
    if (!this.settings.blockWebRTC) {
      return '';
    }
    
    return `
(function() {
  'use strict';
  
  // Block WebRTC IP leak
  const rtcPeerConnection = window.RTCPeerConnection || 
                            window.webkitRTCPeerConnection || 
                            window.mozRTCPeerConnection;
  
  if (rtcPeerConnection) {
    const NativeRTCPeerConnection = rtcPeerConnection;
    
    window.RTCPeerConnection = function(config, constraints) {
      // Remove stun/turn servers that could leak IP
      if (config && config.iceServers) {
        config.iceServers = [];
      }
      
      return new NativeRTCPeerConnection(config, constraints);
    };
    
    window.RTCPeerConnection.prototype = NativeRTCPeerConnection.prototype;
    
    if (window.webkitRTCPeerConnection) {
      window.webkitRTCPeerConnection = window.RTCPeerConnection;
    }
    if (window.mozRTCPeerConnection) {
      window.mozRTCPeerConnection = window.RTCPeerConnection;
    }
  }
  
  console.log('[ShieldGuard] WebRTC protection active');
})();
    `.trim();
  }
  
  /**
   * Get combined protection script
   */
  getProtectionScript() {
    let script = '';
    
    if (this.settings.antiFingerprint || this.settings.blockBatteryAPI) {
      script += this.getFingerprintProtectionScript() + '\n';
    }
    
    if (this.settings.blockWebRTC) {
      script += this.getWebRTCProtectionScript() + '\n';
    }
    
    return script;
  }
  
  /**
   * Get statistics about privacy protection
   */
  async getPrivacyStats() {
    const { privacyStats } = await chrome.storage.local.get('privacyStats');
    
    return {
      trackingParamsRemoved: privacyStats?.trackingParamsRemoved || 0,
      cookiesDeleted: privacyStats?.cookiesDeleted || 0,
      fingerprintAttemptsBlocked: privacyStats?.fingerprintAttemptsBlocked || 0,
      webrtcLeaksPrevented: privacyStats?.webrtcLeaksPrevented || 0
    };
  }
  
  /**
   * Record a tracking parameter removal
   */
  async recordTrackingParamRemoval(count = 1) {
    const { privacyStats = {} } = await chrome.storage.local.get('privacyStats');
    privacyStats.trackingParamsRemoved = (privacyStats.trackingParamsRemoved || 0) + count;
    await chrome.storage.local.set({ privacyStats });
  }
  
  /**
   * Record a fingerprint attempt block
   */
  async recordFingerprintBlock() {
    const { privacyStats = {} } = await chrome.storage.local.get('privacyStats');
    privacyStats.fingerprintAttemptsBlocked = (privacyStats.fingerprintAttemptsBlocked || 0) + 1;
    await chrome.storage.local.set({ privacyStats });
  }
}
