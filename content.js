// Content script - runs on YouTube Shorts pages to detect and track shorts

let currentShortId = null;
let shortStartTime = null;
let urlCheckInterval = null;
let timeTrackingInterval = null;

// Extract short ID from URL
function getShortId() {
  const match = window.location.pathname.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// Find the video element
function getVideoElement() {
  return document.querySelector('ytd-shorts #movie_player video') || 
         document.querySelector('#movie_player video') ||
         document.querySelector('video');
}

// Notify background when a short starts
function notifyShortStart(shortId) {
  try {
    chrome.runtime.sendMessage({ action: 'shortStarted', shortId });
  } catch (error) {
    console.warn('Extension context invalidated, cannot notify short start:', error);
  }
}

// Notify background when a short ends
function notifyShortEnd(shortId, durationMs) {
  try {
    chrome.runtime.sendMessage({ action: 'shortEnded', shortId, durationMs });
  } catch (error) {
    console.warn('Extension context invalidated, cannot notify short end:', error);
  }
}

// Check if user can watch (not in cool-down)
async function checkCanWatch() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'checkLimit' });
    return response.canWatch;
  } catch (error) {
    console.warn('Extension context invalidated, defaulting to can watch:', error);
    return true;
  }
}

// Redirect to YouTube home when limit is reached
function redirectToYouTubeHome() {
  window.location.href = 'https://www.youtube.com';
}

// Remove cool-down overlay (no longer needed)
function removeCoolDownOverlay() {
  // No-op since we're using redirects instead
}

// End current short tracking
function endCurrentShort() {
  if (currentShortId && shortStartTime) {
    const durationMs = Date.now() - shortStartTime;
    notifyShortEnd(currentShortId, durationMs);
    shortStartTime = null;
    currentShortId = null;
  }
}

// Start tracking a new short
async function startNewShort(shortId) {
  if (!shortId) return;
  
  // End previous short if tracking
  endCurrentShort();
  
  // Check if can watch
  const canWatch = await checkCanWatch();
  if (!canWatch) {
    redirectToYouTubeHome();
    return;
  }
  
  currentShortId = shortId;
  shortStartTime = Date.now();
  notifyShortStart(shortId);
}

// Monitor URL changes using multiple methods
function setupUrlMonitoring() {
  let lastUrl = location.href;
  let lastShortId = getShortId();
  
  // Method 1: popstate event (for back/forward navigation)
  window.addEventListener('popstate', handleUrlChange);
  
  // Method 2: Check URL periodically (for SPA navigation)
  urlCheckInterval = setInterval(() => {
    const currentUrl = location.href;
    const currentShortId = getShortId();
    
    if (currentUrl !== lastUrl || currentShortId !== lastShortId) {
      lastUrl = currentUrl;
      lastShortId = currentShortId;
      handleUrlChange();
    }
  }, 500);
  
  function handleUrlChange() {
    const newShortId = getShortId();
    if (newShortId) {
      startNewShort(newShortId);
    } else {
      // User navigated away from shorts
      endCurrentShort();
    }
  }
}

// Continuous time tracking - periodically update time if watching
function setupTimeTracking() {
  timeTrackingInterval = setInterval(() => {
    if (currentShortId && shortStartTime) {
      // Check if video is actually playing
      const video = getVideoElement();
      if (video && !video.paused && !video.ended) {
        // Video is playing, time is being tracked
        // We don't need to send updates continuously, just ensure tracking is active
      } else {
        // Video is paused or ended, end the tracking
        endCurrentShort();
      }
    }
  }, 1000);
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'coolDownStarted') {
    endCurrentShort();
    redirectToYouTubeHome();
  }
  return true;
});

// Handle extension context invalidation
if (chrome.runtime && chrome.runtime.onConnect) {
  chrome.runtime.onConnect.addListener(() => {
    // Extension reconnected, can resume normal operation
  });
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  endCurrentShort();
  if (urlCheckInterval) clearInterval(urlCheckInterval);
  if (timeTrackingInterval) clearInterval(timeTrackingInterval);
});

// Cleanup on visibility change (tab switch)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Tab hidden, end current tracking
    endCurrentShort();
  } else {
    // Tab visible again, check if on shorts
    const shortId = getShortId();
    if (shortId) {
      startNewShort(shortId);
    }
  }
});

// Initialize
async function init() {
  const shortId = getShortId();
  
  if (shortId) {
    // Check if we can watch
    const canWatch = await checkCanWatch();
    
    if (canWatch) {
      setupUrlMonitoring();
      setupTimeTracking();
      startNewShort(shortId);
    } else {
      redirectToYouTubeHome();
    }
  } else {
    // Not on shorts page, just set up monitoring
    setupUrlMonitoring();
  }
}

// Wait for page to load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
