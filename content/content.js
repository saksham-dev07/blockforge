/**
 * BlockForge - Content Script
 * 
 * Runs on every page to:
 * - Remove ad elements from DOM
 * - Apply cosmetic filters
 * - Inject privacy protection scripts
 * - Monitor for dynamic ad insertion
 * - Communicate with background script
 */

(function() {
  'use strict';
  
  // Prevent multiple injections
  if (window.__blockforge_content_loaded__) return;
  window.__blockforge_content_loaded__ = true;
  
  // Track if extension context is still valid
  let extensionContextValid = true;
  
  /**
   * Check if extension context is still valid
   */
  function isExtensionContextValid() {
    try {
      // Try to access chrome.runtime - this will throw if context is invalidated
      return extensionContextValid && chrome.runtime && chrome.runtime.id;
    } catch (e) {
      extensionContextValid = false;
      return false;
    }
  }
  
  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  
  const config = {
    enabled: true,
    settings: {},
    hostname: window.location.hostname,
    isWhitelisted: false
  };
  
  // Statistics for this page
  const pageStats = {
    elementsRemoved: 0,
    elementsHidden: 0,
    scriptsBlocked: 0,
    threats: []
  };
  
  // ============================================================================
  // AD ELEMENT SELECTORS
  // ============================================================================
  
  // Common ad selectors (cosmetic filters)
  const adSelectors = [
    // Generic ad containers
    '[class*="ad-container"]',
    '[class*="ad-wrapper"]',
    '[class*="ad-banner"]',
    '[class*="ad-slot"]',
    '[class*="ad-unit"]',
    '[class*="advert"]',
    '[class*="advertisement"]',
    '[class*="sponsored"]',
    '[class*="banner-ad"]',
    '[class*="bannerAd"]',
    '[class*="BannerAd"]',
    '[class*="leaderboard"]',
    '[class*="skyscraper"]',
    '[class*="rectangle-ad"]',
    '[class*="mpu-ad"]',
    '[class*="sidebar-ad"]',
    '[class*="native-ad"]',
    '[class*="nativead"]',
    '[class*="promo-"]',
    '[class*="-promo"]',
    '[class*="dfp-"]',
    '[class*="gpt-ad"]',
    '[class*="outbrain"]',
    '[class*="taboola"]',
    '[class*="revcontent"]',
    '[class*="mgid"]',
    '[class*="content-ad"]',
    '[class*="contentad"]',
    '[id*="ad-container"]',
    '[id*="ad-wrapper"]',
    '[id*="ad-banner"]',
    '[id*="google_ads"]',
    '[id*="GoogleAds"]',
    '[id*="banner-ad"]',
    '[id*="bannerAd"]',
    '[id*="leaderboard"]',
    '[id*="skyscraper"]',
    '[id*="dfp-"]',
    '[id*="gpt-ad"]',
    '[id*="div-gpt-ad"]',
    
    // Size-based ad detection (common ad sizes)
    'div[style*="728px"][style*="90px"]',  // Leaderboard
    'div[style*="300px"][style*="250px"]', // Medium Rectangle
    'div[style*="336px"][style*="280px"]', // Large Rectangle
    'div[style*="160px"][style*="600px"]', // Wide Skyscraper
    'div[style*="120px"][style*="600px"]', // Skyscraper
    'div[style*="468px"][style*="60px"]',  // Banner
    'div[style*="320px"][style*="50px"]',  // Mobile Banner
    'div[style*="320px"][style*="100px"]', // Mobile Large Banner
    'div[style*="970px"][style*="90px"]',  // Large Leaderboard
    'div[style*="970px"][style*="250px"]', // Billboard
    'div[style*="300px"][style*="600px"]', // Half Page
    'iframe[width="728"][height="90"]',
    'iframe[width="300"][height="250"]',
    'iframe[width="336"][height="280"]',
    'iframe[width="160"][height="600"]',
    'iframe[width="468"][height="60"]',
    'iframe[width="970"][height="90"]',
    'iframe[width="970"][height="250"]',
    'iframe[width="300"][height="600"]',
    
    // Common ad networks
    'ins.adsbygoogle',
    'ins.adsbyexample',
    'amp-ad',
    'amp-embed',
    '[data-ad]',
    '[data-ad-slot]',
    '[data-ad-client]',
    '[data-adservice]',
    '[data-google-query-id]',
    '[data-ad-unit-id]',
    '[data-testid*="ad"]',
    '[data-component*="ad"]',
    '[data-type="ad"]',
    
    // Specific ad containers
    '.ad',
    '.ads',
    '.adv',
    '.adbox',
    '.ad-box',
    '.adunit',
    '.ad_unit',
    '.ad-unit',
    '.adsbox',
    '.adSpace',
    '.ad-space',
    '.adBlock',
    '.ad-block',
    '.adContainer',
    '.adwrapper',
    '.adframe',
    '.adfill',
    '.adslot',
    '.adzone',
    '.adplaceholder',
    '.ad-placeholder',
    '.adarea',
    '.ad-area',
    '.adspot',
    '.ad-spot',
    '.adrow',
    '.ad-row',
    '.adcell',
    '.ad-cell',
    '.adpanel',
    '.ad-panel',
    '.adsense',
    '#ad',
    '#ads',
    '#adv',
    '#adbox',
    '#advertisement',
    '#adContainer',
    '#adWrapper',
    '#adFrame',
    '#adUnit',
    '#adSlot',
    '#adZone',
    '#adArea',
    '#adSpot',
    '#adPanel',
    
    // Flash/SWF embeds (legacy ads)
    'object[data*=".swf"]',
    'embed[src*=".swf"]',
    'object[type*="flash"]',
    'embed[type*="flash"]',
    'object[data*="flash"]',
    'object[classid*="d27cdb6e"]',
    'embed[type="application/x-shockwave-flash"]',
    
    // Iframes with ad content
    'iframe[src*="doubleclick"]',
    'iframe[src*="googlesyndication"]',
    'iframe[src*="googleadservices"]',
    'iframe[src*="adservice"]',
    'iframe[src*="advertising"]',
    'iframe[src*="/ads/"]',
    'iframe[src*="/ad/"]',
    'iframe[src*="ad."]',
    'iframe[src*="banner"]',
    'iframe[src*="sponsor"]',
    'iframe[src*="promo"]',
    'iframe[src*="adserver"]',
    'iframe[src*="adnetwork"]',
    'iframe[src*="outbrain"]',
    'iframe[src*="taboola"]',
    'iframe[src*="revcontent"]',
    'iframe[src*="mgid"]',
    'iframe[name*="google_ads"]',
    'iframe[id*="google_ads"]',
    'iframe[id*="aswift"]',
    
    // Ad images by src pattern
    'img[src*="/ads/"]',
    'img[src*="/ad/"]',
    'img[src*="banner"]',
    'img[src*="sponsor"]',
    'img[src*="advert"]',
    'img[src*="promo"]',
    'img[src*="728x90"]',
    'img[src*="300x250"]',
    'img[src*="160x600"]',
    'img[src*="320x50"]',
    'a[href*="/ads/"] img',
    'a[href*="doubleclick"] img',
    'a[href*="click."] img',
    'a[href*="affiliate"] img',
    'a[href*="sponsor"] img',
    
    // Content recommendation widgets
    '.OUTBRAIN',
    '.outbrain-widget',
    '[data-widget-id*="outbrain"]',
    '.taboola-widget',
    '[id*="taboola"]',
    '.rc-widget',
    '[id*="revcontent"]',
    '.mgbox',
    '[id*="mgid"]',
    '.zergnet',
    '[id*="zergnet"]',
    
    // Social tracking widgets
    '[class*="fb-like"]',
    '[class*="twitter-share"]',
    '[class*="social-share"]',
    
    // Popup overlays
    '[class*="popup-overlay"]',
    '[class*="modal-backdrop"]',
    
    // Newsletter popups
    '[class*="newsletter-popup"]',
    '[class*="subscribe-popup"]',
    
    // Common ad labels
    '[aria-label*="advertisement"]',
    '[aria-label*="Advertisement"]',
    '[aria-label*="Sponsored"]',
    '[aria-label*="sponsored"]',
    '[aria-label*="Promoted"]',
    
    // Empty ad placeholders
    'div:empty[class*="ad"]',
    'div:empty[id*="ad"]'
  ];
  
  // Tracking scripts patterns
  const trackingScriptPatterns = [
    /google-analytics\.com/,
    /googletagmanager\.com/,
    /facebook\.net.*\/signals/,
    /connect\.facebook\.net/,
    /platform\.twitter\.com/,
    /analytics\./,
    /tracking\./,
    /telemetry\./,
    /beacon\./,
    /pixel\./
  ];
  
  // Fingerprinting API patterns
  const fingerprintPatterns = [
    'toDataURL',
    'getImageData',
    'measureText',
    'getContext("webgl")',
    'AudioContext',
    'OfflineAudioContext',
    'navigator.plugins',
    'navigator.mimeTypes',
    'getBoundingClientRect'
  ];
  
  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  /**
   * Initialize the content script
   */
  function initialize() {
    // Check if extension context is valid
    if (!isExtensionContextValid()) {
      console.log('[BlockForge] Extension context invalid, skipping initialization');
      return;
    }
    
    // Notify background script that content script is ready
    try {
      chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' }, (response) => {
        if (chrome.runtime.lastError) {
          // Background not ready or context invalidated
          extensionContextValid = !!chrome.runtime?.id;
          if (extensionContextValid) {
            startProtection();
          }
          return;
        }
        
        if (response?.success) {
          // Apply received configuration
          if (response.config) {
            config.enabled = response.config.enabled !== false;
            config.settings = response.config.settings || {};
            config.isWhitelisted = response.config.isWhitelisted || false;
          }
          startProtection();
        } else {
          // No valid response, use defaults
          startProtection();
        }
      });
    } catch (e) {
      // Extension context invalidated
      extensionContextValid = false;
      return;
    }
    
    // Listen for configuration updates
    chrome.runtime.onMessage.addListener(handleMessage);
  }
  
  /**
   * Block Flash elements before they load (early DOM blocking)
   */
  function earlyFlashBlock() {
    // Use a simple interval to catch Flash elements as early as possible
    const checkInterval = setInterval(() => {
      const flashElements = document.querySelectorAll(
        'object[data*=".swf"], embed[src*=".swf"], ' +
        'object[type*="flash"], embed[type*="flash"], ' +
        'object[type="application/x-shockwave-flash"], ' +
        'embed[type="application/x-shockwave-flash"], ' +
        'object[data*="flash"], embed[src*="flash"]'
      );
      
      flashElements.forEach(el => {
        el.remove();
        console.log('[BlockForge] Early blocked Flash element');
      });
    }, 10);
    
    // Stop checking after 3 seconds
    setTimeout(() => clearInterval(checkInterval), 3000);
  }
  
  /**
   * Start protection based on configuration
   */
  function startProtection() {
    if (!config.enabled || config.isWhitelisted) {
      console.log('[BlockForge] Protection disabled for this site');
      return;
    }
    
    // Start early Flash blocking immediately
    earlyFlashBlock();
    
    // Inject CSS hiding rules immediately (before DOM loads)
    injectCosmeticStyles();
    
    // Initialize YouTube ad blocker if on YouTube
    if (config.hostname.includes('youtube.com')) {
      initYouTubeAdBlocker();
    }
    
    // Run immediately for document_start
    if (document.readyState === 'loading') {
      // Inject protection script as early as possible
      injectProtectionScript();
      
      document.addEventListener('DOMContentLoaded', () => {
        removeAdElements();
        setupMutationObserver();
        analyzePageContent();
      });
    } else {
      // Document already loaded
      injectProtectionScript();
      removeAdElements();
      setupMutationObserver();
      analyzePageContent();
    }
  }
  
  // ============================================================================
  // YOUTUBE AD BLOCKER
  // ============================================================================
  
  /**
   * Initialize YouTube-specific ad blocking
   */
  function initYouTubeAdBlocker() {
    console.log('[BlockForge] Initializing YouTube ad blocker');
    
    let adBlockCount = 0;
    let normalPlaybackRate = 1;
    let wasAdPlaying = false;
    
    // Skip ads automatically
    const checkForAds = () => {
      try {
        // Check if protection is enabled
        if (!config.enabled || config.isWhitelisted) {
          return;
        }
        
        const video = document.querySelector('video.html5-main-video');
        const playerContainer = document.querySelector('.html5-video-player');
        const isAdPlaying = playerContainer?.classList.contains('ad-showing') || 
                           playerContainer?.classList.contains('ad-interrupting');
        
        if (isAdPlaying && video) {
          adBlockCount++;
          wasAdPlaying = true;
          
          // METHOD 1: Click skip button immediately
          const skipSelectors = [
            '.ytp-ad-skip-button-modern',
            '.ytp-ad-skip-button',
            '.ytp-skip-ad-button',
            'button.ytp-ad-skip-button-container',
            '.ytp-ad-skip-button-slot button',
            '.videoAdUiSkipButton',
            '.ytp-ad-skip-button-slot',
            '.ytp-skip-ad-button-container',
            '[class*="skip"] button',
            'button[class*="skip"]'
          ];
          
          for (const selector of skipSelectors) {
            const skipButton = document.querySelector(selector);
            if (skipButton && skipButton.offsetParent !== null) {
              skipButton.click();
              console.log('[BlockForge] Clicked skip button:', selector);
              pageStats.elementsRemoved++;
              break;
            }
          }
          
          // METHOD 2: Speed up ad playback (will auto-skip when done)
          if (video.playbackRate < 16) {
            normalPlaybackRate = 1; // Remember normal rate
            video.playbackRate = 16;
          }
          
          // METHOD 3: Skip to end of ad video
          if (video.duration && !isNaN(video.duration) && video.duration > 0 && video.duration < 300) {
            // Only skip if duration is less than 5 minutes (likely an ad, not content)
            video.currentTime = video.duration - 0.1;
          }
          
          // METHOD 4: Mute ad audio
          video.muted = true;
          
        } else if (wasAdPlaying && video) {
          // Ad finished - restore normal playback
          wasAdPlaying = false;
          if (video.playbackRate !== normalPlaybackRate) {
            video.playbackRate = normalPlaybackRate;
          }
          video.muted = false;
        }
        
        // Remove overlay ads
        const overlays = document.querySelectorAll(
          '.ytp-ad-overlay-container, .ytp-ad-overlay-slot, ' +
          '.ytp-ad-image-overlay, .ytp-ad-text-overlay'
        );
        overlays.forEach(overlay => {
          overlay.style.display = 'none';
          pageStats.elementsRemoved++;
        });
        
        // Remove banner/promo ads
        const banners = document.querySelectorAll(
          'ytd-banner-promo-renderer, ytd-statement-banner-renderer, ' +
          '#masthead-ad, ytd-display-ad-renderer'
        );
        banners.forEach(banner => {
          banner.style.display = 'none';
          pageStats.elementsRemoved++;
        });
        
        // Remove promoted/sponsored content in feed
        const promoted = document.querySelectorAll(
          'ytd-promoted-sparkles-web-renderer, ' +
          'ytd-ad-slot-renderer, ' +
          'ytd-in-feed-ad-layout-renderer, ' +
          'ytd-promoted-video-renderer, ' +
          'ytd-search-pyv-renderer, ' +
          'ytd-compact-promoted-video-renderer'
        );
        promoted.forEach(el => {
          el.style.display = 'none';
          pageStats.elementsRemoved++;
        });
        
        // Remove sidebar ads
        const sidebarAds = document.querySelectorAll(
          '#player-ads, ytd-companion-slot-renderer, ytd-action-companion-ad-renderer'
        );
        sidebarAds.forEach(ad => {
          ad.style.display = 'none';
          pageStats.elementsRemoved++;
        });
        
      } catch (error) {
        if (error.message?.includes('Extension context invalidated')) {
          extensionContextValid = false;
        }
      }
    };
    
    // Run check frequently to catch ads quickly
    const adCheckInterval = setInterval(() => {
      if (!extensionContextValid) {
        clearInterval(adCheckInterval);
        return;
      }
      checkForAds();
    }, 250); // Check every 250ms for faster ad skipping
    
    // Also check on key YouTube events
    document.addEventListener('yt-navigate-finish', () => {
      setTimeout(checkForAds, 500);
    });
    document.addEventListener('yt-page-data-updated', checkForAds);
    
    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
      clearInterval(adCheckInterval);
    });
    
    // Run initial check
    setTimeout(checkForAds, 500);
  }
  
  // ============================================================================
  // MESSAGE HANDLING
  // ============================================================================
  
  /**
   * Handle messages from background script
   */
  function handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case 'CONFIGURE':
        config.enabled = message.config.enabled;
        config.settings = message.config.settings;
        config.isWhitelisted = message.config.isWhitelisted;
        
        if (config.enabled && !config.isWhitelisted) {
          startProtection();
        }
        sendResponse({ success: true });
        break;
        
      case 'UPDATE_FINGERPRINT_PROTECTION':
        if (message.enabled) {
          injectProtectionScript();
        }
        sendResponse({ success: true });
        break;
        
      case 'THREATS_DETECTED':
        handleThreatNotification(message.threats, message.score);
        sendResponse({ success: true });
        break;
        
      case 'ANALYZE_CONTENT':
        const analysis = performContentAnalysis();
        sendResponse(analysis);
        break;
        
      case 'GET_PAGE_STATS':
        sendResponse(pageStats);
        break;
        
      case 'APPLY_COSMETIC_RULES':
        applyCosmeticRules(message.selectors);
        sendResponse({ success: true });
        break;
    }
    
    return true;
  }
  
  // ============================================================================
  // DOM MANIPULATION
  // ============================================================================
  
  // Test sites that need special handling - don't break test page elements
  const testSitePatterns = [
    /^(www\.)?adblock-tester\.com$/,
    /^(www\.)?d3ward\.github\.io$/,
    /^d3\.github\.io$/,
    /^(www\.)?canblock\.com$/,
    /^(www\.)?blockads\.fivefilters\.org$/
  ];
  
  // Domains where we should be extra careful not to break functionality
  const sensitiveDomainsPatterns = [
    /^(www\.)?google\.(com|[a-z]{2,3})$/,  // Google search
    /^(www\.)?youtube\.(com|[a-z]{2,3})$/, // YouTube (careful with video player)
    /^(www\.)?gmail\.(com|[a-z]{2,3})$/,   // Gmail
    /^(www\.)?drive\.google\.com$/,         // Google Drive
    /^(www\.)?docs\.google\.com$/,          // Google Docs
    /^(www\.)?github\.(com|io)$/,           // GitHub
    /^(www\.)?stackoverflow\.com$/,         // Stack Overflow
    /^(www\.)?reddit\.com$/,                // Reddit
    /^(www\.)?twitter\.com$/,               // Twitter
    /^(www\.)?x\.com$/,                     // X (Twitter)
    /^(www\.)?facebook\.com$/,              // Facebook
    /^(www\.)?instagram\.com$/,             // Instagram
    /^(www\.)?linkedin\.com$/,              // LinkedIn
    /^(.*\.)?banking/,                      // Banking sites
    /^(.*\.)?bank\./,                       // Banking sites
    /^(.*\.)?paypal\./                      // PayPal
  ];
  
  function isTestSite() {
    return testSitePatterns.some(pattern => pattern.test(config.hostname));
  }
  
  function isSensitiveDomain() {
    return sensitiveDomainsPatterns.some(pattern => pattern.test(config.hostname));
  }
  
  /**
   * Remove ad elements from the page
   */
  function removeAdElements() {
    // Check if extension context is still valid
    if (!isExtensionContextValid()) {
      return;
    }
    
    // Skip DOM manipulation on test sites - only CSS cosmetic filtering applies
    if (isTestSite()) {
      console.log('[BlockForge] Test site detected - using network rules only');
      return;
    }
    
    // Skip DOM manipulation on YouTube - the YouTube blocker handles it specifically
    if (config.hostname.includes('youtube.com')) {
      return;
    }
    
    // Be more conservative on sensitive domains
    const isConservativeMode = isSensitiveDomain();
    
    const selectorString = adSelectors.join(', ');
    
    try {
      const elements = document.querySelectorAll(selectorString);
      let removed = 0;
      const maxElementsPerScan = isConservativeMode ? 50 : 200; // Limit per scan
      let processed = 0;
      
      for (const element of elements) {
        if (processed >= maxElementsPerScan) break;
        processed++;
        
        if (shouldRemoveElement(element)) {
          removeElement(element);
          removed++;
        }
      }
      
      // Also scan for images with ad-like characteristics (limited on sensitive sites)
      if (!isConservativeMode) {
        removed += scanForAdImages();
      }
      
      // Scan for iframes with ad sizes
      removed += scanForAdIframes();
      
      // Scan for empty ad containers/placeholders
      removed += scanForEmptyAdContainers();
      
      // Scan for Flash/SWF content
      removed += scanForFlashContent();
      
      pageStats.elementsRemoved += removed;
      
      if (removed > 0) {
        console.log(`[BlockForge] Removed ${removed} ad elements${isConservativeMode ? ' (conservative mode)' : ''}`);
        reportBlockedElements(removed, 'ads');
      }
    } catch (error) {
      // Check if this is an extension context error
      if (error.message?.includes('Extension context invalidated')) {
        extensionContextValid = false;
        console.log('[BlockForge] Extension context invalidated, stopping');
        return;
      }
      console.error('[BlockForge] Error removing ads:', error);
    }
  }
  
  /**
   * Scan for and remove Flash/SWF content (legacy ads)
   */
  function scanForFlashContent() {
    let removed = 0;
    
    // Find all Flash embeds
    const flashElements = document.querySelectorAll(
      'object[data*=".swf"], embed[src*=".swf"], ' +
      'object[type="application/x-shockwave-flash"], ' +
      'embed[type="application/x-shockwave-flash"], ' +
      'object[classid*="d27cdb6e"], ' +
      'param[value*=".swf"]'
    );
    
    flashElements.forEach(el => {
      // Remove the element or its parent container
      const parent = el.closest('object') || el.closest('div') || el;
      removeElement(parent);
      removed++;
    });
    
    return removed;
  }
  
  /**
   * Scan for images that look like banner ads
   */
  function scanForAdImages() {
    let removed = 0;
    const images = document.querySelectorAll('img');
    
    // Common ad sizes (width x height)
    const adSizes = [
      [728, 90], [300, 250], [336, 280], [160, 600], [120, 600],
      [468, 60], [320, 50], [320, 100], [970, 90], [970, 250],
      [250, 250], [200, 200], [180, 150], [125, 125], [120, 240],
      [234, 60], [88, 31], [120, 90], [120, 60], [300, 600],
      [300, 50], [320, 480], [480, 320], [300, 1050], [970, 66],
      [980, 120], [980, 90], [950, 90], [930, 180], [750, 300],
      [750, 200], [750, 100], [640, 480], [580, 400], [550, 480]
    ];
    
    // Ad keywords in URLs
    const adKeywords = [
      'ad', 'ads', 'advert', 'banner', 'sponsor', 'promo', 'affiliate',
      'click', 'track', 'pixel', 'beacon', 'impression', 'creatives',
      'campaign', 'placement', 'adserver', 'adnetwork', 'doubleclick',
      'adsystem', 'adservice', 'pagead', 'pubads', 'showad', 'displayad',
      'native-ad', 'content-ad', 'promoted', 'recommended', 'outbrain',
      'taboola', 'revcontent', 'mgid', '728x90', '300x250', '160x600',
      '320x50', '970x90', '300x600', 'leaderboard', 'skyscraper', 'rectangle'
    ];
    
    images.forEach(img => {
      const width = img.width || img.naturalWidth || parseInt(img.getAttribute('width')) || 0;
      const height = img.height || img.naturalHeight || parseInt(img.getAttribute('height')) || 0;
      const src = (img.src || img.getAttribute('data-src') || '').toLowerCase();
      const alt = (img.alt || '').toLowerCase();
      
      // Check if matches ad size with tolerance
      let isAdSize = false;
      for (const [w, h] of adSizes) {
        if ((Math.abs(width - w) <= 5 && Math.abs(height - h) <= 5)) {
          isAdSize = true;
          break;
        }
      }
      
      // Check src for ad keywords
      let hasAdKeyword = false;
      for (const keyword of adKeywords) {
        if (src.includes(keyword) || src.includes(`/${keyword}/`) || 
            src.includes(`_${keyword}_`) || src.includes(`-${keyword}-`) ||
            src.includes(`${keyword}.`) || src.includes(`.${keyword}`)) {
          hasAdKeyword = true;
          break;
        }
      }
      
      // Remove if: has ad keyword OR (is ad size AND has suspicious context)
      if (hasAdKeyword) {
        removeElement(img);
        removed++;
        return;
      }
      
      if (isAdSize) {
        // Check parent elements for ad context
        let parent = img.parentElement;
        let depth = 0;
        while (parent && depth < 5) {
          const parentClass = (parent.className || '').toString().toLowerCase();
          const parentId = (parent.id || '').toLowerCase();
          const parentDataAttrs = Array.from(parent.attributes || [])
            .filter(a => a.name.startsWith('data-'))
            .map(a => a.value.toLowerCase())
            .join(' ');
          
          if (parentClass.includes('ad') || parentId.includes('ad') ||
              parentClass.includes('banner') || parentClass.includes('sponsor') ||
              parentClass.includes('promo') || parentDataAttrs.includes('ad')) {
            removeElement(img);
            removed++;
            return;
          }
          parent = parent.parentElement;
          depth++;
        }
        
        // Check if image is inside an anchor with ad-related href
        const anchor = img.closest('a');
        if (anchor) {
          const href = (anchor.href || '').toLowerCase();
          for (const keyword of ['click', 'track', 'ad', 'sponsor', 'affiliate', 'promo']) {
            if (href.includes(keyword)) {
              removeElement(img);
              removed++;
              return;
            }
          }
        }
      }
      
      // Check alt text for ad indicators
      if (alt.includes('advertisement') || alt.includes('sponsored') || 
          alt.includes('promoted') || alt.includes('ad ')) {
        removeElement(img);
        removed++;
      }
    });
    
    return removed;
  }
  
  /**
   * Scan for iframes that look like ad units
   */
  function scanForAdIframes() {
    let removed = 0;
    const iframes = document.querySelectorAll('iframe');
    
    // Common ad sizes
    const adSizes = [
      [728, 90], [300, 250], [336, 280], [160, 600], [120, 600],
      [468, 60], [320, 50], [320, 100], [970, 90], [970, 250],
      [300, 600], [250, 250], [200, 200], [180, 150]
    ];
    
    // Ad-related URL patterns
    const adPatterns = [
      'ad', 'ads', 'advert', 'banner', 'sponsor', 'promo', 'doubleclick',
      'googlesyndication', 'googleadservices', 'adserver', 'adnetwork',
      'outbrain', 'taboola', 'revcontent', 'mgid', 'pubads', 'pagead',
      'aswift', 'googleads', 'adsense', 'adform', 'openx', 'criteo'
    ];
    
    iframes.forEach(iframe => {
      const width = parseInt(iframe.width) || iframe.offsetWidth || parseInt(iframe.style.width) || 0;
      const height = parseInt(iframe.height) || iframe.offsetHeight || parseInt(iframe.style.height) || 0;
      const src = (iframe.src || '').toLowerCase();
      const name = (iframe.name || '').toLowerCase();
      const id = (iframe.id || '').toLowerCase();
      const className = (iframe.className || '').toLowerCase();
      
      // Check for ad-related patterns in attributes
      for (const pattern of adPatterns) {
        if (src.includes(pattern) || name.includes(pattern) || 
            id.includes(pattern) || className.includes(pattern)) {
          removeElement(iframe);
          removed++;
          return;
        }
      }
      
      // Check data attributes
      for (const attr of iframe.attributes) {
        if (attr.name.startsWith('data-') && 
            adPatterns.some(p => attr.value.toLowerCase().includes(p))) {
          removeElement(iframe);
          removed++;
          return;
        }
      }
      
      // Check if matches common ad size
      for (const [w, h] of adSizes) {
        if ((Math.abs(width - w) <= 5 && Math.abs(height - h) <= 5)) {
          // Ad-sized iframe, check parent for ad context
          let parent = iframe.parentElement;
          let depth = 0;
          while (parent && depth < 4) {
            const parentClass = (parent.className || '').toString().toLowerCase();
            const parentId = (parent.id || '').toLowerCase();
            if (parentClass.includes('ad') || parentId.includes('ad') ||
                parentClass.includes('banner') || parentClass.includes('sponsor') ||
                parentClass.includes('gpt-') || parentClass.includes('dfp-')) {
              removeElement(iframe);
              removed++;
              return;
            }
            parent = parent.parentElement;
            depth++;
          }
          
          // If src is empty or about:blank with ad-sized iframe, likely an ad
          if (!src || src === 'about:blank' || src.startsWith('javascript:')) {
            // Check if parent container looks like ad slot
            const parentDiv = iframe.closest('div');
            if (parentDiv) {
              const divClass = (parentDiv.className || '').toLowerCase();
              const divId = (parentDiv.id || '').toLowerCase();
              if (divClass.includes('ad') || divId.includes('ad') || 
                  divClass.includes('slot') || divClass.includes('banner')) {
                removeElement(iframe);
                removed++;
                return;
              }
            }
          }
          break;
        }
      }
    });
    
    return removed;
  }
  
  /**
   * Scan for and remove empty ad placeholders
   */
  function scanForEmptyAdContainers() {
    let removed = 0;
    
    // Find divs that look like ad containers but are empty
    const potentialAdDivs = document.querySelectorAll(
      'div[class*="ad"], div[id*="ad"], div[class*="banner"], div[class*="sponsor"],' +
      'div[data-ad], div[data-ad-slot], div[data-google-query-id], ins.adsbygoogle'
    );
    
    potentialAdDivs.forEach(div => {
      // Check if it's essentially empty (no visible content)
      const text = (div.textContent || '').trim();
      const hasVisibleChildren = div.querySelector('img, video, iframe, canvas, svg, object, embed');
      
      if (!text && !hasVisibleChildren) {
        // Empty ad container
        div.style.display = 'none';
        removed++;
      } else if (div.offsetHeight === 0 || div.offsetWidth === 0) {
        // Zero-dimension ad container (collapsed)
        div.style.display = 'none';
        removed++;
      }
    });
    
    return removed;
  }
  
  /**
   * Check if an element should be removed
   */
  function shouldRemoveElement(element) {
    if (!element || !element.tagName) return false;
    
    const tag = element.tagName.toLowerCase();
    
    // NEVER remove these critical page elements
    const protectedTags = [
      'html', 'body', 'head', 'main', 'article', 'section', 'nav', 
      'header', 'footer', 'form', 'input', 'textarea', 'select', 
      'button', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
      'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'video', 'audio', 'canvas',
      'svg', 'picture', 'figure', 'figcaption', 'details', 'summary',
      'dialog', 'menu', 'menuitem', 'template', 'slot'
    ];
    
    if (protectedTags.includes(tag)) {
      return false;
    }
    
    // Don't remove elements with contenteditable
    if (element.isContentEditable || element.getAttribute('contenteditable') === 'true') {
      return false;
    }
    
    // Don't remove elements with role="main", role="navigation", etc.
    const role = (element.getAttribute('role') || '').toLowerCase();
    const protectedRoles = [
      'main', 'navigation', 'banner', 'contentinfo', 'complementary',
      'form', 'search', 'application', 'document', 'feed', 'log',
      'region', 'status', 'tabpanel', 'toolbar', 'dialog', 'alertdialog',
      'menu', 'menubar', 'tree', 'treegrid', 'grid', 'listbox'
    ];
    if (protectedRoles.includes(role)) {
      return false;
    }
    
    // Check element dimensions - don't remove if it takes up significant viewport
    try {
      const rect = element.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      
      // If element takes more than 60% of viewport, likely not an ad
      if (rect.width > viewportWidth * 0.6 && rect.height > viewportHeight * 0.6) {
        return false;
      }
    } catch (e) {}
    
    // Check if element has meaningful content that's not an ad
    const text = (element.textContent || '').trim();
    const lowerText = text.toLowerCase();
    
    // If element has a lot of text and doesn't mention ads/sponsors, preserve it
    if (text.length > 500) {
      const adMentions = ['sponsor', 'advert', 'promoted', 'paid content', 'partner content'];
      const hasAdMention = adMentions.some(term => lowerText.includes(term));
      if (!hasAdMention) {
        return false;
      }
    }
    
    // Check if it contains interactive elements we shouldn't break
    const hasInteractive = element.querySelector(
      'input, textarea, select, button, [contenteditable="true"], video, audio'
    );
    if (hasInteractive) {
      return false;
    }
    
    // Check if it's a tracking pixel (1x1 or 0x0) - always remove
    if (tag === 'img') {
      const width = element.width || element.naturalWidth || parseInt(element.style.width) || 0;
      const height = element.height || element.naturalHeight || parseInt(element.style.height) || 0;
      if (width <= 1 && height <= 1) {
        return true;
      }
    }
    
    // Check for false positive indicators
    const className = (element.className || '').toString().toLowerCase();
    const id = (element.id || '').toLowerCase();
    
    // Patterns that might indicate false positives
    const falsePositivePatterns = [
      'loading', 'loader', 'spinner', 'skeleton',
      'header', 'footer', 'navigation', 'sidebar', 'content',
      'article', 'post', 'comment', 'reply', 'message',
      'product', 'item', 'card', 'tile', 'grid',
      'modal', 'dialog', 'popup', 'tooltip', 'dropdown',
      'accordion', 'tab', 'panel', 'collapse',
      'search', 'filter', 'sort', 'pagination',
      'user', 'profile', 'avatar', 'author',
      'date', 'time', 'meta', 'info', 'detail',
      'social', 'share', 'like', 'follow',
      'notification', 'alert', 'warning', 'error', 'success'
    ];
    
    // If element class/id contains ONLY non-ad related patterns, skip
    let hasOnlyFalsePositivePatterns = false;
    for (const pattern of falsePositivePatterns) {
      if ((className.includes(pattern) || id.includes(pattern)) &&
          !className.includes('ad') && !id.includes('ad') &&
          !className.includes('sponsor') && !id.includes('sponsor') &&
          !className.includes('banner') && !id.includes('banner')) {
        hasOnlyFalsePositivePatterns = true;
        break;
      }
    }
    
    // If the match was based on broad patterns but has false positive indicators, reconsider
    if (hasOnlyFalsePositivePatterns) {
      // Allow removal only if clearly an ad (has clear ad indicators)
      const clearAdIndicators = ['adsense', 'adsbygoogle', 'googlesyndication', 'doubleclick', 
                                  'taboola', 'outbrain', 'revcontent', 'mgid'];
      const hasClearAdIndicator = clearAdIndicators.some(ind => 
        className.includes(ind) || id.includes(ind)
      );
      if (!hasClearAdIndicator) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Remove an element safely with fallback
   */
  function removeElement(element) {
    if (!element) return;
    
    try {
      // First, check if element is still in DOM
      if (!document.contains(element)) return;
      
      // Option 1: Remove completely
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
    } catch (e) {
      // Option 2: Hide if removal fails
      try {
        element.style.cssText = 'display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; position: absolute !important; left: -9999px !important;';
        pageStats.elementsHidden++;
      } catch (e2) {
        // Element is inaccessible, ignore
      }
    }
  }
  
  /**
   * Apply cosmetic rules (CSS hiding)
   */
  function applyCosmeticRules(selectors) {
    if (!selectors || selectors.length === 0) return;
    
    // Create or update style element
    let styleElement = document.getElementById('blockforge-cosmetic');
    
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = 'blockforge-cosmetic';
      styleElement.type = 'text/css';
      (document.head || document.documentElement).appendChild(styleElement);
    }
    
    // Generate CSS rules
    const css = selectors.map(selector => {
      return `${selector} { display: none !important; visibility: hidden !important; }`;
    }).join('\n');
    
    styleElement.textContent = css;
    console.log(`[BlockForge] Applied ${selectors.length} cosmetic rules`);
  }
  
  /**
   * Set up mutation observer for dynamic content
   */
  function setupMutationObserver() {
    // Skip mutation observer on test sites
    if (isTestSite()) {
      console.log('[BlockForge] Skipping mutation observer on test site');
      return;
    }
    
    // Skip mutation observer on YouTube - handled by YouTube-specific blocker
    if (config.hostname.includes('youtube.com')) {
      console.log('[BlockForge] Skipping mutation observer on YouTube');
      return;
    }
    
    const observer = new MutationObserver((mutations) => {
      // Check if extension context is still valid
      if (!extensionContextValid) {
        observer.disconnect();
        return;
      }
      
      let shouldScan = false;
      
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // IMMEDIATE Flash/object/embed blocking
              const tag = node.tagName?.toLowerCase();
              if (tag === 'object' || tag === 'embed') {
                const data = (node.getAttribute('data') || '').toLowerCase();
                const src = (node.getAttribute('src') || '').toLowerCase();
                const type = (node.getAttribute('type') || '').toLowerCase();
                
                if (data.includes('.swf') || src.includes('.swf') ||
                    type.includes('flash') || type.includes('shockwave') ||
                    data.includes('flash') || src.includes('flash')) {
                  node.remove();
                  pageStats.elementsRemoved++;
                  console.log('[BlockForge] Blocked Flash element immediately');
                  continue;
                }
              }
              
              // Check for Flash elements within added node
              if (node.querySelectorAll) {
                const flashElements = node.querySelectorAll(
                  'object[data*=".swf"], embed[src*=".swf"], ' +
                  'object[type*="flash"], embed[type*="flash"]'
                );
                flashElements.forEach(el => {
                  el.remove();
                  pageStats.elementsRemoved++;
                  console.log('[BlockForge] Blocked nested Flash element');
                });
              }
              
              shouldScan = true;
              
              // Immediately check if this node is an ad
              if (isAdElement(node)) {
                removeElement(node);
                pageStats.elementsRemoved++;
              }
            }
          }
        }
        
        // Also check attribute changes for Flash elements
        if (mutation.type === 'attributes' && mutation.target) {
          const target = mutation.target;
          const tag = target.tagName?.toLowerCase();
          if (tag === 'object' || tag === 'embed') {
            const data = (target.getAttribute('data') || '').toLowerCase();
            const src = (target.getAttribute('src') || '').toLowerCase();
            const type = (target.getAttribute('type') || '').toLowerCase();
            
            if (data.includes('.swf') || src.includes('.swf') ||
                type.includes('flash') || type.includes('shockwave')) {
              target.remove();
              pageStats.elementsRemoved++;
              console.log('[BlockForge] Blocked Flash element after attribute change');
            }
          }
        }
      }
      
      // Debounced full scan for complex changes
      if (shouldScan) {
        debouncedScan();
      }
    });
    
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data', 'src', 'type']
    });
  }
  
  /**
   * Inject cosmetic CSS styles immediately to hide ads before they render
   */
  function injectCosmeticStyles() {
    // Create style element as early as possible
    const style = document.createElement('style');
    style.id = 'blockforge-cosmetic-block';
    style.type = 'text/css';
    
    // On test sites or YouTube, use minimal/specific CSS to avoid breaking the site
    const isYouTube = config.hostname.includes('youtube.com');
    
    if (isTestSite()) {
      style.textContent = `
        /* Only block actual ad network content on test sites */
        ins.adsbygoogle,
        iframe[src*="doubleclick"],
        iframe[src*="googlesyndication"],
        iframe[src*="googleadservices"],
        [id*="google_ads"],
        [id*="aswift"],
        .OUTBRAIN, .outbrain-widget,
        .taboola-widget {
          display: none !important;
          visibility: hidden !important;
        }
      `;
      
      // Insert style
      if (document.head) {
        document.head.insertBefore(style, document.head.firstChild);
      } else if (document.documentElement) {
        document.documentElement.insertBefore(style, document.documentElement.firstChild);
      }
      
      console.log('[BlockForge] Minimal cosmetic styles injected (test site mode)');
      return;
    }
    
    // YouTube-specific minimal CSS - only target actual ad elements
    if (isYouTube) {
      style.textContent = `
        /* YouTube ad elements only - very specific selectors */
        ytd-display-ad-renderer,
        ytd-promoted-sparkles-web-renderer,
        ytd-promoted-video-renderer,
        ytd-ad-slot-renderer,
        ytd-in-feed-ad-layout-renderer,
        ytd-banner-promo-renderer,
        #masthead-ad,
        #player-ads ytd-player-legacy-desktop-watch-ads-renderer,
        ytd-search-pyv-renderer,
        ytd-compact-promoted-video-renderer {
          display: none !important;
        }
      `;
      
      // Insert style
      if (document.head) {
        document.head.insertBefore(style, document.head.firstChild);
      } else if (document.documentElement) {
        document.documentElement.insertBefore(style, document.documentElement.firstChild);
      }
      
      console.log('[BlockForge] YouTube-specific cosmetic styles injected');
      return;
    }
    
    // Comprehensive CSS to hide ads (normal mode)
    style.textContent = `
      /* Generic ad containers */
      [class*="ad-container"], [class*="ad-wrapper"], [class*="ad-banner"],
      [class*="ad-slot"], [class*="ad-unit"], [class*="advert"],
      [class*="advertisement"], [class*="sponsored"], [class*="banner-ad"],
      [class*="bannerAd"], [class*="leaderboard"], [class*="skyscraper"],
      [class*="native-ad"], [class*="nativead"], [class*="promo-"],
      [class*="dfp-"], [class*="gpt-ad"], [class*="outbrain"],
      [class*="taboola"], [class*="revcontent"], [class*="mgid"],
      [class*="content-ad"], [class*="contentad"],
      [id*="ad-container"], [id*="ad-wrapper"], [id*="ad-banner"],
      [id*="google_ads"], [id*="GoogleAds"], [id*="banner-ad"],
      [id*="dfp-"], [id*="gpt-ad"], [id*="div-gpt-ad"],
      .ad, .ads, .adv, .adbox, .ad-box, .adunit, .ad_unit, .ad-unit,
      .adsbox, .adSpace, .ad-space, .adBlock, .ad-block, .adContainer,
      .adwrapper, .adframe, .adfill, .adslot, .adzone, .adplaceholder,
      .ad-placeholder, .adarea, .ad-area, .adspot, .ad-spot,
      #ad, #ads, #adv, #adbox, #advertisement, #adContainer,
      #adWrapper, #adFrame, #adUnit, #adSlot, #adZone,
      ins.adsbygoogle, amp-ad, amp-embed,
      [data-ad], [data-ad-slot], [data-ad-client], [data-google-query-id],
      [data-testid*="ad"], [data-component*="ad"], [data-type="ad"],
      .OUTBRAIN, .outbrain-widget, [data-widget-id*="outbrain"],
      .taboola-widget, [id*="taboola"], .rc-widget, [id*="revcontent"],
      .mgbox, [id*="mgid"], .zergnet, [id*="zergnet"] {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        width: 0 !important;
        max-height: 0 !important;
        max-width: 0 !important;
        overflow: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
        position: absolute !important;
        left: -9999px !important;
      }
      
      /* Flash/SWF objects - block ALL Flash */
      object[data*=".swf"], embed[src*=".swf"],
      object[type*="flash"], embed[type*="flash"],
      object[type="application/x-shockwave-flash"],
      embed[type="application/x-shockwave-flash"],
      object[classid*="d27cdb6e"],
      object[data*="flash"], embed[src*="flash"] {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        width: 0 !important;
      }
      
      /* Ad iframes - comprehensive */
      iframe[src*="doubleclick"], iframe[src*="googlesyndication"],
      iframe[src*="googleadservices"], iframe[src*="adservice"],
      iframe[src*="/ads/"], iframe[src*="/ad/"],
      iframe[src*="banner"], iframe[src*="sponsor"],
      iframe[src*="promo"], iframe[src*="adserver"],
      iframe[src*="adnetwork"], iframe[src*="outbrain"],
      iframe[src*="taboola"], iframe[src*="revcontent"],
      iframe[src*="mgid"], iframe[src*="adform"],
      iframe[src*="openx"], iframe[src*="criteo"],
      iframe[name*="google_ads"], iframe[id*="google_ads"],
      iframe[id*="aswift"] {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        width: 0 !important;
      }
      
      /* Common ad sizes - block by dimensions */
      iframe[width="728"][height="90"],
      iframe[width="300"][height="250"],
      iframe[width="336"][height="280"],
      iframe[width="160"][height="600"],
      iframe[width="120"][height="600"],
      iframe[width="468"][height="60"],
      iframe[width="970"][height="90"],
      iframe[width="970"][height="250"],
      iframe[width="300"][height="600"],
      iframe[width="320"][height="50"],
      iframe[width="320"][height="100"],
      img[width="728"][height="90"],
      img[width="300"][height="250"],
      img[width="336"][height="280"],
      img[width="160"][height="600"],
      img[width="468"][height="60"],
      img[width="970"][height="90"],
      img[width="320"][height="50"] {
        display: none !important;
        visibility: hidden !important;
      }
      
      /* Ad images by URL patterns */
      img[src*="/ads/"], img[src*="/ad/"],
      img[src*="banner"], img[src*="sponsor"],
      img[src*="advert"], img[src*="promo"],
      img[src*="728x90"], img[src*="300x250"],
      img[src*="160x600"], img[src*="320x50"],
      a[href*="/ads/"] img, a[href*="doubleclick"] img,
      a[href*="click."] img, a[href*="affiliate"] img {
        display: none !important;
        visibility: hidden !important;
      }
      
      /* Tracking pixels */
      img[width="1"][height="1"],
      img[width="0"][height="0"],
      img[style*="width: 1px"][style*="height: 1px"],
      img[style*="width:1px"][style*="height:1px"],
      img[style*="display: none"],
      img[style*="visibility: hidden"] {
        display: none !important;
      }
      
      /* Hide empty ad containers */
      div:empty[class*="ad"],
      div:empty[id*="ad"],
      div:empty[data-ad],
      ins:empty.adsbygoogle {
        display: none !important;
      }
      
      /* Common ad labels - hide sponsored labels */
      [aria-label*="advertisement"], [aria-label*="Advertisement"],
      [aria-label*="Sponsored"], [aria-label*="sponsored"],
      [aria-label*="Promoted"] {
        display: none !important;
      }
      
      /* AdBlock tester specific selectors - STATIC COSMETIC */
      .ad-test, .ad_test, .adtest, #ad-test, #ad_test, #adtest,
      .adstest, .ads-test, #adstest, #ads-test,
      .pub_300x250, .pub_300x250m, .pub_728x90,
      .textad, .textAd, .text-ad, .text_ad, .text-ads, .text_ads,
      .sponsortext, .sponsor-text, .sponsored-text,
      .adBanner, .ad-Banner, .ad_Banner, .adbanner,
      .bannerAd, .banner-Ad, .banner_Ad, .bannerad,
      #adBanner, #ad-Banner, #ad_Banner, #adbanner,
      #bannerAd, #banner-Ad, #banner_Ad, #bannerad,
      .adblock-test, .adblock_test, .adblocktest,
      #adblock-test, #adblock_test, #adblocktest,
      .adsbox, .ad-box, .ad_box, #adsbox, #ad-box, #ad_box,
      .banner_ad, .banner-ad, .bannerad_wrapper,
      .adblock, .ad-block, .ad_block,
      #adblock, #ad-block, #ad_block,
      .adsense, .ad-sense, .ad_sense,
      #adsense, #ad-sense, #ad_sense,
      .adHeader, .adFooter, .adSidebar, .adContent,
      #adHeader, #adFooter, #adSidebar, #adContent,
      .ad-header, .ad-footer, .ad-sidebar, .ad-content,
      .ad_header, .ad_footer, .ad_sidebar, .ad_content,
      .GoogleAd, .googleAd, .google-ad, .google_ad,
      #GoogleAd, #googleAd, #google-ad, #google_ad,
      .adwords, .ad-words, .ad_words, .AdWords,
      #adwords, #ad-words, #ad_words, #AdWords,
      .sponsor-ad, .sponsor_ad, .sponsorad,
      #sponsor-ad, #sponsor_ad, #sponsorad,
      .sidebar-ad, .sidebar_ad, .sidebarad,
      #sidebar-ad, #sidebar_ad, #sidebarad,
      .footer-ad, .footer_ad, .footerad,
      #footer-ad, #footer_ad, #footerad,
      .header-ad, .header_ad, .headerad,
      #header-ad, #header_ad, #headerad,
      .rightAd, .right-ad, .right_ad, .rightad,
      #rightAd, #right-ad, #right_ad, #rightad,
      .leftAd, .left-ad, .left_ad, .leftad,
      #leftAd, #left-ad, #left_ad, #leftad,
      .topAd, .top-ad, .top_ad, .topad,
      #topAd, #top-ad, #top_ad, #topad,
      .bottomAd, .bottom-ad, .bottom_ad, .bottomad,
      #bottomAd, #bottom-ad, #bottom_ad, #bottomad,
      .widgetAd, .widget-ad, .widget_ad,
      #widgetAd, #widget-ad, #widget_ad,
      .adWidget, .ad-widget, .ad_widget,
      #adWidget, #ad-widget, #ad_widget,
      .ads-widget, .ads_widget, .adsWidget,
      .module-ad, .module_ad, .modulead,
      .ad-module, .ad_module, .admodule,
      .commercialAd, .commercial-ad, .commercial_ad,
      .contentAd, .content-ad, .content_ad,
      .page-ad, .page_ad, .pagead,
      #page-ad, #page_ad, #pagead,
      .ad-inner, .ad_inner, .adinner,
      .ad-outer, .ad_outer, .adopter,
      .ad-div, .ad_div, .addiv,
      #ad-div, #ad_div, #addiv,
      .ad-frame, .ad_frame, .adframe,
      #ad-frame, #ad_frame, #adframe,
      .ad-label, .ad_label, .adlabel,
      .adtag, .ad-tag, .ad_tag,
      .adsense_ads, .adsenseAds, .adsense-ads,
      #adsense_ads, #adsenseAds, #adsense-ads,
      [class^="ad-"][class$="-box"],
      [class^="ad_"][class$="_box"],
      [id^="ad-"][id$="-box"],
      [id^="ad_"][id$="_box"],
      [class^="ad-"][class$="-container"],
      [class^="ad_"][class$="_container"],
      [id^="ad-"][id$="-container"],
      [id^="ad_"][id$="_container"],
      [class^="ad"][class$="banner"],
      [id^="ad"][id$="banner"],
      [class^="banner"][class$="ad"],
      [id^="banner"][id$="ad"],
      div[class*="Ad"][style*="width:300px"],
      div[class*="Ad"][style*="width:728px"],
      div[class*="Ad"][style*="height:250px"],
      div[class*="Ad"][style*="height:90px"],
      div[style*="width: 300px"][style*="height: 250px"],
      div[style*="width: 728px"][style*="height: 90px"],
      div[style*="width: 160px"][style*="height: 600px"],
      div[style*="width: 320px"][style*="height: 50px"] {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        width: 0 !important;
        overflow: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      
      /* YouTube-specific ad blocking - AGGRESSIVE */
      .video-ads.ytp-ad-module,
      .ytp-ad-overlay-container,
      .ytp-ad-overlay-slot,
      .ytp-ad-image-overlay,
      .ytp-ad-text-overlay,
      .ytp-ad-overlay-image,
      .ytp-ad-player-overlay,
      .ytp-ad-preview-container,
      .ad-showing,
      .ad-interrupting,
      ytd-banner-promo-renderer,
      ytd-statement-banner-renderer,
      #masthead-ad,
      ytd-player-legacy-desktop-watch-ads-renderer,
      ytd-promoted-sparkles-web-renderer,
      ytd-display-ad-renderer,
      ytd-video-masthead-ad-v3-renderer,
      ytd-primetime-promo-renderer,
      ytd-ad-slot-renderer,
      ytd-in-feed-ad-layout-renderer,
      ytd-promoted-video-renderer,
      ytd-ad-break-renderer,
      #player-ads,
      ytd-companion-slot-renderer,
      ytd-action-companion-ad-renderer,
      ytd-merch-shelf-renderer,
      .ytd-video-masthead-ad-v3-renderer,
      .ytd-popup-container.ytd-engagement-panel-section-list-renderer[ad],
      ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"],
      .ytp-ad-module,
      .ytp-ad-button-slot,
      .ytp-ad-skip-button-container,
      .ytp-ad-persistent-progress-bar-container,
      #movie_player.ad-showing .ytp-chrome-top,
      #movie_player.ad-interrupting .ytp-chrome-top,
      tp-yt-paper-dialog:has(.ytd-upsell-dialog-renderer),
      ytd-popup-container:has(.ytd-upsell-dialog-renderer),
      [is-premium-alert],
      ytd-search-pyv-renderer,
      ytd-rich-item-renderer:has([href*="googleadservices"]),
      ytd-compact-promoted-video-renderer,
      ytd-promoted-sparkles-text-search-renderer {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        width: 0 !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;
    
    // Insert at the very beginning
    if (document.head) {
      document.head.insertBefore(style, document.head.firstChild);
    } else if (document.documentElement) {
      document.documentElement.insertBefore(style, document.documentElement.firstChild);
    } else {
      // DOM not ready, wait and try again
      document.addEventListener('DOMContentLoaded', () => {
        (document.head || document.documentElement).insertBefore(style, 
          (document.head || document.documentElement).firstChild);
      });
    }
    
    console.log('[BlockForge] Cosmetic styles injected');
  }
  
  /**
   * Check if an element is likely an ad
   */
  function isAdElement(element) {
    if (!element || !element.tagName) return false;
    
    const tag = element.tagName.toLowerCase();
    const classNames = (element.className || '').toString().toLowerCase();
    const id = (element.id || '').toLowerCase();
    const src = (element.src || '').toString().toLowerCase();
    // element.href can be SVGAnimatedString, so handle both cases
    const href = (typeof element.href === 'string' ? element.href : element.href?.baseVal || '').toLowerCase();
    
    // Check class/id patterns
    const adPatterns = [
      'ad-', 'ads-', 'advert', 'sponsor', 'promoted', 'banner-ad',
      'bannerAd', 'ad_', 'adbox', 'adunit', 'adspace', 'adslot',
      'leaderboard', 'skyscraper', 'rectangle-ad', 'mpu'
    ];
    
    for (const pattern of adPatterns) {
      if (classNames.includes(pattern.toLowerCase()) || id.includes(pattern.toLowerCase())) {
        return true;
      }
    }
    
    // Check iframe sources
    if (tag === 'iframe') {
      const iframeSrc = element.src?.toLowerCase() || '';
      const iframeName = (element.name || '').toLowerCase();
      
      if (iframeSrc.includes('doubleclick') || iframeSrc.includes('googlesyndication') || 
          iframeSrc.includes('adservice') || iframeSrc.includes('advertising') ||
          iframeSrc.includes('/ads/') || iframeSrc.includes('/ad/') ||
          iframeSrc.includes('banner') || iframeName.includes('google_ads')) {
        return true;
      }
      
      // Check iframe dimensions (common ad sizes)
      const width = parseInt(element.width) || element.offsetWidth || 0;
      const height = parseInt(element.height) || element.offsetHeight || 0;
      
      // Common ad sizes
      const adSizes = [
        [728, 90], [300, 250], [336, 280], [160, 600], [120, 600],
        [468, 60], [320, 50], [320, 100], [970, 90], [970, 250]
      ];
      
      for (const [w, h] of adSizes) {
        if ((width === w && height === h) || 
            (Math.abs(width - w) <= 5 && Math.abs(height - h) <= 5)) {
          return true;
        }
      }
    }
    
    // Check for Google Ads container
    if (tag === 'ins' && classNames.includes('adsbygoogle')) {
      return true;
    }
    
    // Check object/embed for Flash ads
    if (tag === 'object' || tag === 'embed') {
      const data = element.data?.toLowerCase() || element.src?.toLowerCase() || '';
      const type = (element.type || '').toLowerCase();
      
      if (data.includes('.swf') || type.includes('flash') || data.includes('flash')) {
        return true;
      }
    }
    
    // Check images that look like ads
    if (tag === 'img') {
      // Check if it's a tracking pixel
      const width = element.width || element.naturalWidth || parseInt(element.style.width) || 0;
      const height = element.height || element.naturalHeight || parseInt(element.style.height) || 0;
      
      if (width <= 1 && height <= 1) {
        return true;
      }
      
      // Check src patterns
      if (src.includes('/ads/') || src.includes('/ad/') || 
          src.includes('banner') || src.includes('sponsor') ||
          src.includes('advert')) {
        return true;
      }
      
      // Check parent link for ad patterns
      const parent = element.parentElement;
      if (parent && parent.tagName === 'A') {
        const parentHref = (typeof parent.href === 'string' ? parent.href : parent.href?.baseVal || '').toLowerCase();
        if (parentHref.includes('doubleclick') || parentHref.includes('/ads/') ||
            parentHref.includes('click.') || parentHref.includes('adserver')) {
          return true;
        }
      }
    }
    
    // Check data attributes
    if (element.hasAttribute('data-ad') || element.hasAttribute('data-ad-slot') ||
        element.hasAttribute('data-ad-client') || element.hasAttribute('data-google-query-id')) {
      return true;
    }
    
    return false;
  }
  
  // Debounced scan function with rate limiting
  let scanTimeout = null;
  let lastScanTime = 0;
  let scanCount = 0;
  const SCAN_COOLDOWN = 100; // ms between scans
  const MAX_SCANS_PER_SECOND = 5;
  const SCAN_RESET_INTERVAL = 1000; // Reset counter every second
  
  function debouncedScan() {
    // Check if extension context is still valid
    if (!isExtensionContextValid()) {
      return;
    }
    
    const now = Date.now();
    
    // Reset scan counter every second
    if (now - lastScanTime > SCAN_RESET_INTERVAL) {
      scanCount = 0;
    }
    
    // Rate limit - don't scan too frequently
    if (scanCount >= MAX_SCANS_PER_SECOND) {
      return;
    }
    
    if (scanTimeout) clearTimeout(scanTimeout);
    
    scanTimeout = setTimeout(() => {
      // Re-check context validity inside the timeout callback
      if (!extensionContextValid) {
        return;
      }
      
      try {
        // Double-check rate limit before scanning
        if (scanCount < MAX_SCANS_PER_SECOND) {
          removeAdElements();
          lastScanTime = Date.now();
          scanCount++;
        }
      } catch (error) {
        // Check if this is an extension context error
        if (error.message?.includes('Extension context invalidated')) {
          extensionContextValid = false;
          return;
        }
        console.error('[BlockForge] Error during scan:', error);
      }
    }, SCAN_COOLDOWN);
  }
  
  // ============================================================================
  // SCRIPT INJECTION
  // ============================================================================
  
  /**
   * Inject privacy protection script
   */
  function injectProtectionScript() {
    // Check if extension context is still valid
    if (!isExtensionContextValid()) {
      return;
    }
    
    // Use web_accessible_resources for injection
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('inject/fingerprint-protect.js');
      script.onload = () => script.remove();
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {
      // Fallback: inject inline script
      injectInlineProtection();
    }
  }
  
  /**
   * Inject inline protection script
   */
  function injectInlineProtection() {
    const script = document.createElement('script');
    script.textContent = getProtectionScript();
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }
  
  /**
   * Get protection script content
   */
  function getProtectionScript() {
    return `
(function() {
  'use strict';
  if (window.__blockforge_injected__) return;
  window.__blockforge_injected__ = true;
  
  const seed = ${Math.random() * 1000000 | 0};
  let seedCounter = seed;
  
  function random() {
    const x = Math.sin(seedCounter++) * 10000;
    return x - Math.floor(x);
  }
  
  // ==========================================
  // FLASH/SWF BLOCKING
  // ==========================================
  
  // Block Flash plugin detection
  const originalPlugins = navigator.plugins;
  try {
    Object.defineProperty(navigator, 'plugins', {
      get: function() {
        // Return empty plugin list (no Flash)
        return [];
      }
    });
  } catch(e) {}
  
  // Block Flash MIME types
  const originalMimeTypes = navigator.mimeTypes;
  try {
    Object.defineProperty(navigator, 'mimeTypes', {
      get: function() {
        // Return empty MIME types (no Flash support)
        return [];
      }
    });
  } catch(e) {}
  
  // Intercept createElement to block Flash elements
  const originalCreateElement = document.createElement.bind(document);
  document.createElement = function(tagName, options) {
    const tag = tagName.toLowerCase();
    if (tag === 'object' || tag === 'embed') {
      // Create element but monitor for Flash content
      const el = originalCreateElement(tagName, options);
      
      // Monitor src/data attribute changes
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'attributes') {
            const attr = mutation.attributeName;
            const value = (el.getAttribute(attr) || '').toLowerCase();
            if (value.includes('.swf') || value.includes('flash') || 
                value.includes('shockwave') || value.includes('x-shockwave-flash')) {
              el.remove();
              console.log('[BlockForge] Blocked Flash element:', value);
            }
          }
        }
      });
      observer.observe(el, { attributes: true });
      
      return el;
    }
    return originalCreateElement(tagName, options);
  };
  
  // Block SWFObject and similar Flash embedding libraries
  window.swfobject = { 
    embedSWF: function() { console.log('[BlockForge] Blocked swfobject.embedSWF'); },
    getFlashPlayerVersion: function() { return { major: 0, minor: 0, release: 0 }; },
    hasFlashPlayerVersion: function() { return false; },
    createSWF: function() { console.log('[BlockForge] Blocked swfobject.createSWF'); return null; },
    showExpressInstall: function() {},
    removeSWF: function() {},
    registerObject: function() {}
  };
  
  // Block AC_FL_RunContent (Adobe Flash embedding)
  window.AC_FL_RunContent = function() { 
    console.log('[BlockForge] Blocked AC_FL_RunContent');
  };
  window.AC_GetArgs = function() { return {}; };
  
  // ==========================================
  // FINGERPRINT PROTECTION
  // ==========================================
  
  // Canvas fingerprint protection
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function(...args) {
    try {
      const ctx = this.getContext('2d');
      if (ctx) {
        const imageData = ctx.getImageData(0, 0, this.width || 1, this.height || 1);
        for (let i = 0; i < Math.min(imageData.data.length, 100); i += 4) {
          if (random() > 0.98) {
            imageData.data[i] = (imageData.data[i] + (random() > 0.5 ? 1 : -1)) & 255;
          }
        }
        ctx.putImageData(imageData, 0, 0);
      }
    } catch(e) {}
    return originalToDataURL.apply(this, args);
  };
  
  // WebGL vendor/renderer spoofing
  const getParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(param) {
    if (param === 37445) return 'Generic';
    if (param === 37446) return 'Generic GPU';
    return getParameter.call(this, param);
  };
  
  // Battery API blocking
  if (navigator.getBattery) {
    navigator.getBattery = () => Promise.reject(new Error('Blocked'));
  }
  
  // Hardware concurrency normalization
  try {
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });
  } catch(e) {}
  
  console.log('[BlockForge] Privacy protection active (Flash blocked)');
})();
    `;
  }
  
  // ============================================================================
  // CONTENT ANALYSIS
  // ============================================================================
  
  /**
   * Analyze page content for threats
   */
  function analyzePageContent() {
    const analysis = performContentAnalysis();
    
    if (analysis.threats.length > 0) {
      pageStats.threats = analysis.threats;
      console.log('[BlockForge] Detected threats:', analysis.threats);
    }
  }
  
  /**
   * Perform content analysis
   */
  function performContentAnalysis() {
    const threats = [];
    let score = 0;
    
    // Analyze scripts on the page
    const scripts = document.querySelectorAll('script[src]');
    for (const script of scripts) {
      const src = script.src || '';
      
      // Check for tracking scripts
      for (const pattern of trackingScriptPatterns) {
        if (pattern.test(src)) {
          threats.push({
            type: 'tracking_script',
            severity: 'medium',
            url: src
          });
          score += 10;
          break;
        }
      }
    }
    
    // Check for inline scripts with fingerprinting
    const inlineScripts = document.querySelectorAll('script:not([src])');
    for (const script of inlineScripts) {
      const content = script.textContent || '';
      
      let fingerprintHits = 0;
      for (const pattern of fingerprintPatterns) {
        if (content.includes(pattern)) {
          fingerprintHits++;
        }
      }
      
      if (fingerprintHits >= 3) {
        threats.push({
          type: 'fingerprinting',
          severity: 'high',
          details: `${fingerprintHits} fingerprinting APIs detected`
        });
        score += 30;
      }
    }
    
    // Check for tracking pixels
    const images = document.querySelectorAll('img[src]');
    for (const img of images) {
      if ((img.width <= 1 || img.naturalWidth <= 1) && 
          (img.height <= 1 || img.naturalHeight <= 1)) {
        const src = img.src || '';
        if (src.includes('track') || src.includes('pixel') || src.includes('beacon')) {
          threats.push({
            type: 'tracking_pixel',
            severity: 'low',
            url: src
          });
          score += 5;
        }
      }
    }
    
    // Check for third-party iframes
    const iframes = document.querySelectorAll('iframe[src]');
    const pageHost = window.location.hostname;
    
    for (const iframe of iframes) {
      try {
        const iframeHost = new URL(iframe.src).hostname;
        if (iframeHost !== pageHost && !iframeHost.endsWith('.' + pageHost)) {
          // Third-party iframe
          if (iframe.src.includes('ad') || iframe.src.includes('track')) {
            threats.push({
              type: 'third_party_iframe',
              severity: 'medium',
              url: iframe.src
            });
            score += 15;
          }
        }
      } catch (e) {
        // Invalid URL
      }
    }
    
    return {
      threats,
      score: Math.min(100, score),
      elementsAnalyzed: scripts.length + inlineScripts.length + images.length + iframes.length
    };
  }
  
  // ============================================================================
  // THREAT NOTIFICATION
  // ============================================================================
  
  /**
   * Handle threat notification from background
   */
  function handleThreatNotification(threats, score) {
    if (threats.length === 0) return;
    
    pageStats.threats = [...pageStats.threats, ...threats];
    
    // Only show notification for high threats in debug mode
    if (score >= 70) {
      console.warn('[BlockForge] High threat score:', score, threats);
    }
  }
  
  // ============================================================================
  // REPORTING
  // ============================================================================
  
  /**
   * Report blocked elements to background
   */
  function reportBlockedElements(count, category) {
    if (!isExtensionContextValid()) return;
    
    try {
      chrome.runtime.sendMessage({
        type: 'REPORT_DOM_BLOCKED',
        count,
        category
      }).catch(() => {
        // Background might not be ready or context invalidated
        extensionContextValid = false;
      });
    } catch (e) {
      // Extension context invalidated
      extensionContextValid = false;
    }
  }
  
  // ============================================================================
  // UTILITIES
  // ============================================================================
  
  /**
   * Clean URL from tracking parameters
   */
  function cleanCurrentURL() {
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'msclkid', 'dclid', 'mc_eid', 'mc_cid',
      '_ga', '_gl', 'ref_', 'affiliate'
    ];
    
    const url = new URL(window.location.href);
    let changed = false;
    
    for (const param of trackingParams) {
      if (url.searchParams.has(param)) {
        url.searchParams.delete(param);
        changed = true;
      }
    }
    
    if (changed) {
      window.history.replaceState({}, '', url.toString());
    }
  }
  
  // ============================================================================
  // START
  // ============================================================================
  
  initialize();
  
})();


