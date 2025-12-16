/**
 * ShieldGuard - Privacy Injection Script
 * 
 * Additional privacy protections injected into page context
 */

(function() {
  'use strict';
  
  if (window.__shieldguard_privacy_injected__) return;
  window.__shieldguard_privacy_injected__ = true;
  
  // ==========================================================================
  // WEBRTC LEAK PREVENTION
  // ==========================================================================
  
  const RTCPeerConnectionClass = window.RTCPeerConnection || 
                                  window.webkitRTCPeerConnection || 
                                  window.mozRTCPeerConnection;
  
  if (RTCPeerConnectionClass) {
    const NativeRTCPeerConnection = RTCPeerConnectionClass;
    
    window.RTCPeerConnection = function(config, constraints) {
      // Remove ICE servers to prevent IP leak
      if (config) {
        config = Object.assign({}, config);
        if (config.iceServers) {
          config.iceServers = config.iceServers.filter(server => {
            // Only allow TURN servers (which don't leak local IP)
            const urls = server.urls || server.url;
            if (Array.isArray(urls)) {
              return urls.every(url => url.startsWith('turn:'));
            }
            return urls && urls.startsWith('turn:');
          });
        }
      }
      
      const pc = new NativeRTCPeerConnection(config, constraints);
      
      // Wrap createOffer to modify SDP
      const originalCreateOffer = pc.createOffer.bind(pc);
      pc.createOffer = async function(options) {
        const offer = await originalCreateOffer(options);
        // Could modify SDP here to remove local candidates
        return offer;
      };
      
      return pc;
    };
    
    window.RTCPeerConnection.prototype = NativeRTCPeerConnection.prototype;
    
    // Update other references
    if (window.webkitRTCPeerConnection) {
      window.webkitRTCPeerConnection = window.RTCPeerConnection;
    }
    if (window.mozRTCPeerConnection) {
      window.mozRTCPeerConnection = window.RTCPeerConnection;
    }
  }
  
  // ==========================================================================
  // BEACON API MONITORING
  // ==========================================================================
  
  const originalSendBeacon = navigator.sendBeacon;
  
  if (originalSendBeacon) {
    navigator.sendBeacon = function(url, data) {
      // Log beacon requests for monitoring
      // Could block tracking beacons here
      const urlLower = url.toLowerCase();
      
      // Block known tracking endpoints
      const blockPatterns = [
        'google-analytics.com',
        'analytics.',
        'tracking.',
        'telemetry.',
        'metrics.',
        'pixel.',
        'beacon.'
      ];
      
      for (const pattern of blockPatterns) {
        if (urlLower.includes(pattern)) {
          console.log('[ShieldGuard] Blocked beacon:', url);
          return true; // Pretend it succeeded
        }
      }
      
      return originalSendBeacon.call(navigator, url, data);
    };
  }
  
  // ==========================================================================
  // FETCH/XHR MONITORING
  // ==========================================================================
  
  // Track requests for analysis (not blocking, just monitoring)
  const requestLog = [];
  
  const originalFetch = window.fetch;
  window.fetch = async function(resource, init) {
    const url = typeof resource === 'string' ? resource : resource.url;
    
    requestLog.push({
      type: 'fetch',
      url: url,
      timestamp: Date.now()
    });
    
    // Trim log to prevent memory issues
    if (requestLog.length > 100) {
      requestLog.shift();
    }
    
    return originalFetch.apply(this, arguments);
  };
  
  // ==========================================================================
  // STORAGE PROTECTION
  // ==========================================================================
  
  // Wrap localStorage to detect fingerprinting attempts
  const originalSetItem = localStorage.setItem;
  const originalGetItem = localStorage.getItem;
  
  const suspiciousKeys = [
    'fingerprint', 'fp_', 'device_id', 'visitor_id', 'tracking',
    'uid', 'uuid', 'client_id', 'session_id'
  ];
  
  localStorage.setItem = function(key, value) {
    const keyLower = key.toLowerCase();
    
    for (const pattern of suspiciousKeys) {
      if (keyLower.includes(pattern)) {
        console.log('[ShieldGuard] Suspicious storage:', key);
        // Could block or modify here
      }
    }
    
    return originalSetItem.call(this, key, value);
  };
  
  // ==========================================================================
  // VISIBILITY API PROTECTION
  // ==========================================================================
  
  // Some sites track tab visibility for fingerprinting
  // We don't block this but could spoof it
  
  // ==========================================================================
  // NOTIFICATION
  // ==========================================================================
  
  console.log('%c[ShieldGuard]%c Privacy injection active', 
    'color: #8b5cf6; font-weight: bold;', 
    'color: inherit;'
  );
  
})();
