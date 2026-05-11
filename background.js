// Background service worker - manages session state and limits

const DEFAULT_SETTINGS = {
  timeLimitMinutes: 30,
  countLimit: 50,
  coolDownMinutes: 5,
  timeLimitEnabled: true,
  countLimitEnabled: true
};

let sessionState = {
  shortsWatched: 0,
  timeWatchedMs: 0,
  isInCoolDown: false,
  coolDownEndTime: null,
  lastShortStartTime: null,
  currentShortId: null,
  settings: { ...DEFAULT_SETTINGS }
};

// Save session state to local storage
function saveSessionState() {
  const stateToSave = {
    shortsWatched: sessionState.shortsWatched,
    timeWatchedMs: sessionState.timeWatchedMs,
    isInCoolDown: sessionState.isInCoolDown,
    coolDownEndTime: sessionState.coolDownEndTime
  };
  chrome.storage.local.set({ sessionState: stateToSave });
}

// Load session state from local storage
function loadSessionState() {
  chrome.storage.local.get(['sessionState'], (result) => {
    if (result.sessionState) {
      sessionState.shortsWatched = result.sessionState.shortsWatched || 0;
      sessionState.timeWatchedMs = result.sessionState.timeWatchedMs || 0;
      sessionState.isInCoolDown = result.sessionState.isInCoolDown || false;
      sessionState.coolDownEndTime = result.sessionState.coolDownEndTime || null;
    }
  });
}

// Initialize settings from storage
chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
  sessionState.settings = { ...DEFAULT_SETTINGS, ...result };
});

// Load session state on startup
loadSessionState();

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    for (let key in changes) {
      if (key in sessionState.settings) {
        sessionState.settings[key] = changes[key].newValue;
      }
    }
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'shortStarted') {
    handleShortStarted(request.shortId);
  } else if (request.action === 'shortEnded') {
    handleShortEnded(request.shortId, request.durationMs);
  } else if (request.action === 'checkLimit') {
    const canWatch = checkCanWatch();
    sendResponse({ canWatch, isInCoolDown: sessionState.isInCoolDown });
  } else if (request.action === 'getState') {
    sendResponse({ ...sessionState });
  } else if (request.action === 'updateSettings') {
    sessionState.settings = { ...sessionState.settings, ...request.settings };
    chrome.storage.sync.set(request.settings);
  } else if (request.action === 'resetSession') {
    resetSession();
    sendResponse({ success: true });
  }
  return true; // Keep message channel open for async response
});

function handleShortStarted(shortId) {
  if (sessionState.isInCoolDown) {
    return;
  }
  
  sessionState.currentShortId = shortId;
  sessionState.lastShortStartTime = Date.now();
}

function handleShortEnded(shortId, durationMs) {
  if (sessionState.isInCoolDown || !sessionState.lastShortStartTime) {
    return;
  }

  sessionState.shortsWatched++;
  sessionState.timeWatchedMs += durationMs;
  sessionState.lastShortStartTime = null;
  sessionState.currentShortId = null;

  saveSessionState();
  checkLimits();
}

function checkCanWatch() {
  if (sessionState.isInCoolDown) {
    const now = Date.now();
    if (now >= sessionState.coolDownEndTime) {
      sessionState.isInCoolDown = false;
      sessionState.coolDownEndTime = null;
      saveSessionState();
    } else {
      return false;
    }
  }

  const timeLimitMs = sessionState.settings.timeLimitMinutes * 60 * 1000;
  const timeExceeded = sessionState.settings.timeLimitEnabled && sessionState.timeWatchedMs >= timeLimitMs;
  const countExceeded = sessionState.settings.countLimitEnabled && sessionState.shortsWatched >= sessionState.settings.countLimit;

  return !(timeExceeded || countExceeded);
}

function checkLimits() {
  const timeLimitMs = sessionState.settings.timeLimitMinutes * 60 * 1000;
  const timeExceeded = sessionState.settings.timeLimitEnabled && sessionState.timeWatchedMs >= timeLimitMs;
  const countExceeded = sessionState.settings.countLimitEnabled && sessionState.shortsWatched >= sessionState.settings.countLimit;

  if (timeExceeded || countExceeded) {
    startCoolDown();
  }
}

function startCoolDown() {
  sessionState.isInCoolDown = true;
  sessionState.coolDownEndTime = Date.now() + (sessionState.settings.coolDownMinutes * 60 * 1000);
  saveSessionState();
  
  // Notify all shorts tabs to redirect to YouTube home
  chrome.tabs.query({ url: '*://www.youtube.com/shorts*' }, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { action: 'coolDownStarted' });
    });
  });
}

function resetSession() {
  sessionState.shortsWatched = 0;
  sessionState.timeWatchedMs = 0;
  sessionState.isInCoolDown = false;
  sessionState.coolDownEndTime = null;
  sessionState.lastShortStartTime = null;
  sessionState.currentShortId = null;
  saveSessionState();
}

// Clear session when browser closes (session-based reset)
chrome.runtime.onSuspend.addListener(() => {
  chrome.storage.local.remove(['sessionState']);
});
