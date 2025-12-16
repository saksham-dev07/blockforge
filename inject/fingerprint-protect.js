/**
 * ShieldGuard - Fingerprint Protection Injection Script
 * 
 * This script is injected into the page context to protect against
 * browser fingerprinting techniques.
 */

(function() {
  'use strict';
  
  // Only run once
  if (window.__shieldguard_fp_protected__) return;
  window.__shieldguard_fp_protected__ = true;
  
  // Session-consistent random seed
  const sessionSeed = Date.now() ^ (Math.random() * 0xFFFFFFFF >>> 0);
  let seedCounter = sessionSeed;
  
  /**
   * Seeded pseudo-random number generator
   * Produces consistent results for same seed (session)
   */
  function seededRandom() {
    seedCounter = (seedCounter * 1103515245 + 12345) & 0x7FFFFFFF;
    return seedCounter / 0x7FFFFFFF;
  }
  
  // ==========================================================================
  // CANVAS FINGERPRINT PROTECTION
  // ==========================================================================
  
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  const originalToBlob = HTMLCanvasElement.prototype.toBlob;
  const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  
  /**
   * Add subtle noise to canvas that's consistent per session
   */
  function addCanvasNoise(canvas) {
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx || canvas.width === 0 || canvas.height === 0) return;
      
      const imageData = originalGetImageData.call(
        ctx, 0, 0, 
        Math.min(canvas.width, 100), 
        Math.min(canvas.height, 100)
      );
      
      const data = imageData.data;
      const noiseLevel = 2;
      
      for (let i = 0; i < data.length; i += 4) {
        if (seededRandom() > 0.99) {
          const noise = (seededRandom() - 0.5) * noiseLevel;
          data[i] = Math.max(0, Math.min(255, data[i] + noise | 0));
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
    } catch (e) {
      // Silently fail - canvas might be cross-origin
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
    
    // Add minimal noise to returned data
    const data = result.data;
    for (let i = 0; i < Math.min(data.length, 400); i += 4) {
      if (seededRandom() > 0.995) {
        data[i] = (data[i] + (seededRandom() > 0.5 ? 1 : -1)) & 255;
      }
    }
    
    return result;
  };
  
  // ==========================================================================
  // WEBGL FINGERPRINT PROTECTION
  // ==========================================================================
  
  const spoofedVendor = 'Generic GPU Vendor';
  const spoofedRenderer = 'Generic GPU Renderer';
  
  function wrapGetParameter(original) {
    return function(param) {
      // UNMASKED_VENDOR_WEBGL
      if (param === 37445) return spoofedVendor;
      // UNMASKED_RENDERER_WEBGL
      if (param === 37446) return spoofedRenderer;
      return original.call(this, param);
    };
  }
  
  if (typeof WebGLRenderingContext !== 'undefined') {
    const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = wrapGetParameter(originalGetParameter);
  }
  
  if (typeof WebGL2RenderingContext !== 'undefined') {
    const originalGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = wrapGetParameter(originalGetParameter2);
  }
  
  // Wrap getExtension to prevent extension fingerprinting
  if (typeof WebGLRenderingContext !== 'undefined') {
    const originalGetExtension = WebGLRenderingContext.prototype.getExtension;
    WebGLRenderingContext.prototype.getExtension = function(name) {
      // Allow common extensions but return null for debugging extensions
      if (name === 'WEBGL_debug_renderer_info') {
        return null;
      }
      return originalGetExtension.call(this, name);
    };
  }
  
  // ==========================================================================
  // AUDIO FINGERPRINT PROTECTION
  // ==========================================================================
  
  if (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined') {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    
    if (AudioContextClass) {
      const originalCreateAnalyser = AudioContextClass.prototype.createAnalyser;
      const originalCreateOscillator = AudioContextClass.prototype.createOscillator;
      
      // Add slight variation to analyser data
      if (AnalyserNode) {
        const originalGetFloatFrequencyData = AnalyserNode.prototype.getFloatFrequencyData;
        const originalGetByteFrequencyData = AnalyserNode.prototype.getByteFrequencyData;
        
        AnalyserNode.prototype.getFloatFrequencyData = function(array) {
          originalGetFloatFrequencyData.call(this, array);
          for (let i = 0; i < array.length; i += 10) {
            array[i] += (seededRandom() - 0.5) * 0.0001;
          }
        };
        
        AnalyserNode.prototype.getByteFrequencyData = function(array) {
          originalGetByteFrequencyData.call(this, array);
          for (let i = 0; i < array.length; i += 10) {
            if (seededRandom() > 0.95) {
              array[i] = Math.max(0, Math.min(255, array[i] + (seededRandom() > 0.5 ? 1 : -1)));
            }
          }
        };
      }
    }
  }
  
  // ==========================================================================
  // BATTERY API BLOCKING
  // ==========================================================================
  
  if (navigator.getBattery) {
    Object.defineProperty(navigator, 'getBattery', {
      value: function() {
        return Promise.reject(new DOMException('Battery API is disabled', 'NotAllowedError'));
      },
      writable: false,
      configurable: false
    });
  }
  
  // Legacy battery property
  if ('battery' in navigator) {
    Object.defineProperty(navigator, 'battery', {
      value: undefined,
      writable: false,
      configurable: false
    });
  }
  
  // ==========================================================================
  // NAVIGATOR PROPERTIES NORMALIZATION
  // ==========================================================================
  
  // Normalize hardware concurrency
  try {
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 4,
      configurable: false
    });
  } catch (e) {}
  
  // Normalize device memory
  try {
    if ('deviceMemory' in navigator) {
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8,
        configurable: false
      });
    }
  } catch (e) {}
  
  // Normalize plugins - REMOVE FLASH
  try {
    const fakePlugins = {
      length: 2,
      item: function(index) {
        if (index === 0) return { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' };
        if (index === 1) return { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' };
        return null;
      },
      namedItem: function(name) { 
        // Explicitly block Flash plugin detection
        if (name && (name.toLowerCase().includes('flash') || name.toLowerCase().includes('shockwave'))) {
          return null;
        }
        return null; 
      },
      refresh: function() {}
    };
    
    Object.defineProperty(navigator, 'plugins', {
      get: () => fakePlugins,
      configurable: false
    });
  } catch (e) {}
  
  // Normalize mimeTypes - REMOVE FLASH MIME TYPES
  try {
    const fakeMimeTypes = {
      length: 2,
      item: function(index) { 
        if (index === 0) return { type: 'application/pdf', suffixes: 'pdf' };
        if (index === 1) return { type: 'text/pdf', suffixes: 'pdf' };
        return null; 
      },
      namedItem: function(name) { 
        // Block Flash MIME types
        if (name && (
          name.includes('x-shockwave-flash') || 
          name.includes('futuresplash') ||
          name.includes('application/x-shockwave-flash')
        )) {
          return null;
        }
        return null; 
      }
    };
    
    Object.defineProperty(navigator, 'mimeTypes', {
      get: () => fakeMimeTypes,
      configurable: false
    });
  } catch (e) {}
  
  // ==========================================================================
  // FLASH/SWF BLOCKING
  // ==========================================================================
  
  // Intercept createElement to block Flash elements
  const originalCreateElement = document.createElement.bind(document);
  document.createElement = function(tagName, options) {
    const tag = (tagName || '').toLowerCase();
    
    if (tag === 'object' || tag === 'embed') {
      const el = originalCreateElement(tagName, options);
      
      // Override setAttribute to block Flash
      const originalSetAttribute = el.setAttribute.bind(el);
      el.setAttribute = function(name, value) {
        const valLower = (value || '').toLowerCase();
        if (valLower.includes('.swf') || 
            valLower.includes('flash') || 
            valLower.includes('shockwave') ||
            valLower.includes('x-shockwave-flash') ||
            valLower.includes('futuresplash')) {
          console.log('[ShieldGuard] Blocked Flash element attribute:', name, value);
          // Don't set Flash-related attributes
          el.style.display = 'none';
          el.remove();
          return;
        }
        return originalSetAttribute(name, value);
      };
      
      // Monitor for Flash content via MutationObserver
      setTimeout(() => {
        const data = el.getAttribute('data') || '';
        const src = el.getAttribute('src') || '';
        const type = el.getAttribute('type') || '';
        
        if (data.includes('.swf') || src.includes('.swf') || 
            type.includes('flash') || type.includes('shockwave')) {
          el.style.display = 'none';
          el.remove();
          console.log('[ShieldGuard] Removed Flash element');
        }
      }, 0);
      
      return el;
    }
    
    return originalCreateElement(tagName, options);
  };
  
  // Block common Flash embedding libraries
  Object.defineProperty(window, 'swfobject', {
    value: {
      embedSWF: function() { console.log('[ShieldGuard] Blocked swfobject.embedSWF'); return false; },
      getFlashPlayerVersion: function() { return { major: 0, minor: 0, release: 0 }; },
      hasFlashPlayerVersion: function() { return false; },
      createSWF: function() { console.log('[ShieldGuard] Blocked swfobject.createSWF'); return null; },
      showExpressInstall: function() {},
      removeSWF: function() {},
      registerObject: function() {},
      getObjectById: function() { return null; },
      addLoadEvent: function() {},
      addDomLoadEvent: function() {},
      ua: { w3: true, pv: [0, 0, 0], wk: 0, ie: false, win: true, mac: false }
    },
    writable: false,
    configurable: false
  });
  
  // Block Adobe Flash embedding functions
  Object.defineProperty(window, 'AC_FL_RunContent', {
    value: function() { console.log('[ShieldGuard] Blocked AC_FL_RunContent'); },
    writable: false,
    configurable: false
  });
  
  Object.defineProperty(window, 'AC_GetArgs', {
    value: function() { return {}; },
    writable: false,
    configurable: false
  });
  
  // ==========================================================================
  // SCREEN PROPERTIES NORMALIZATION
  // ==========================================================================
  
  try {
    // Normalize color depth
    Object.defineProperty(screen, 'colorDepth', {
      get: () => 24,
      configurable: false
    });
    
    Object.defineProperty(screen, 'pixelDepth', {
      get: () => 24,
      configurable: false
    });
  } catch (e) {}
  
  // ==========================================================================
  // DATE/TIMEZONE PROTECTION
  // ==========================================================================
  
  // Note: Full timezone spoofing is complex and can break sites
  // We only add slight noise to high-precision timing
  
  const originalDateNow = Date.now.bind(Date);
  const originalPerformanceNow = performance.now.bind(performance);
  
  // Reduce timing precision to prevent timing attacks
  Date.now = function() {
    return Math.floor(originalDateNow() / 100) * 100;
  };
  
  performance.now = function() {
    return Math.floor(originalPerformanceNow() * 10) / 10;
  };
  
  // ==========================================================================
  // FONT FINGERPRINT PROTECTION
  // ==========================================================================
  
  // Protect font enumeration through CSS
  try {
    if (document.fonts && document.fonts.check) {
      const originalCheck = document.fonts.check.bind(document.fonts);
      document.fonts.check = function(font, text) {
        // Return consistent results for common fonts
        const commonFonts = [
          'Arial', 'Helvetica', 'Times New Roman', 'Georgia',
          'Verdana', 'Courier New', 'Comic Sans MS'
        ];
        
        for (const cf of commonFonts) {
          if (font.includes(cf)) {
            return true;
          }
        }
        
        // Add randomness to less common fonts
        if (seededRandom() > 0.5) {
          return originalCheck(font, text);
        }
        return false;
      };
    }
  } catch (e) {}
  
  // ==========================================================================
  // RECT FINGERPRINT PROTECTION
  // ==========================================================================
  
  const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
  
  Element.prototype.getBoundingClientRect = function() {
    const rect = originalGetBoundingClientRect.call(this);
    
    // Add tiny noise that's session-consistent
    const noise = (seededRandom() - 0.5) * 0.00001;
    
    return new DOMRect(
      rect.x + noise,
      rect.y + noise,
      rect.width,
      rect.height
    );
  };
  
  // ==========================================================================
  // DONE
  // ==========================================================================
  
  console.log('%c[ShieldGuard]%c Fingerprint protection active', 
    'color: #10b981; font-weight: bold;', 
    'color: inherit;'
  );
  
})();
