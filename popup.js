// Popup logic - handles UI interactions and communicates with background script

let currentSettings = {
  timeLimitMinutes: 30,
  countLimit: 50,
  coolDownMinutes: 5,
  timeLimitEnabled: true,
  countLimitEnabled: true
};

// Format milliseconds to MM:SS
function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Update UI with current state
function updateUI(state) {
  document.getElementById('shorts-count').textContent = state.shortsWatched;
  document.getElementById('time-spent').textContent = formatTime(state.timeWatchedMs);
  
  const cooldownStatus = document.getElementById('cooldown-status');
  if (state.isInCoolDown) {
    cooldownStatus.classList.remove('hidden');
    const remainingMs = state.coolDownEndTime - Date.now();
    
    if (remainingMs > 0) {
      const timeStr = formatTime(remainingMs);
      document.getElementById('cooldown-timer').textContent = timeStr;
      document.getElementById('cooldown-label').textContent = 'remaining';
      document.getElementById('cooldown-message').textContent = 'Take a break! You\'ll be able to watch Shorts again soon.';
    } else {
      document.getElementById('cooldown-timer').textContent = '00:00';
      document.getElementById('cooldown-label').textContent = 'ending soon';
      document.getElementById('cooldown-message').textContent = 'Cool-down is ending! You can watch Shorts again in a moment.';
    }
  } else {
    cooldownStatus.classList.add('hidden');
  }
}

// Load settings from storage and update UI
function loadSettings() {
  chrome.storage.sync.get(currentSettings, (result) => {
    currentSettings = { ...currentSettings, ...result };
    
    document.getElementById('time-limit').value = currentSettings.timeLimitMinutes;
    document.getElementById('count-limit').value = currentSettings.countLimit;
    document.getElementById('cooldown-minutes').value = currentSettings.coolDownMinutes;
    document.getElementById('time-limit-enabled').checked = currentSettings.timeLimitEnabled;
    document.getElementById('count-limit-enabled').checked = currentSettings.countLimitEnabled;
  });
}

// Save settings
function saveSettings() {
  const newSettings = {
    timeLimitMinutes: parseInt(document.getElementById('time-limit').value),
    countLimit: parseInt(document.getElementById('count-limit').value),
    coolDownMinutes: parseInt(document.getElementById('cooldown-minutes').value),
    timeLimitEnabled: document.getElementById('time-limit-enabled').checked,
    countLimitEnabled: document.getElementById('count-limit-enabled').checked
  };
  
  // Validate
  if (newSettings.timeLimitMinutes < 1 || newSettings.timeLimitMinutes > 120) {
    alert('Time limit must be between 1 and 120 minutes');
    return;
  }
  if (newSettings.countLimit < 1 || newSettings.countLimit > 200) {
    alert('Count limit must be between 1 and 200');
    return;
  }
  if (newSettings.coolDownMinutes < 1 || newSettings.coolDownMinutes > 60) {
    alert('Cool-down must be between 1 and 60 minutes');
    return;
  }
  
  currentSettings = newSettings;
  chrome.storage.sync.set(newSettings);
  chrome.runtime.sendMessage({ action: 'updateSettings', settings: newSettings });
  
  // Show save confirmation
  const saveBtn = document.getElementById('save-btn');
  const originalText = saveBtn.textContent;
  saveBtn.textContent = 'Saved!';
  setTimeout(() => {
    saveBtn.textContent = originalText;
  }, 1500);
}

// Reset session
function resetSession() {
  if (confirm('Are you sure you want to reset the session? This will clear all current tracking data.')) {
    chrome.runtime.sendMessage({ action: 'resetSession' }, (response) => {
      if (response && response.success) {
        loadState();
      }
    });
  }
}

// Load current state from background
function loadState() {
  chrome.runtime.sendMessage({ action: 'getState' }, (state) => {
    if (state) {
      updateUI(state);
    }
  });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadState();
  
  // Set up event listeners
  document.getElementById('save-btn').addEventListener('click', saveSettings);
  document.getElementById('reset-btn').addEventListener('click', resetSession);
  
  // Update state every second (for cool-down timer)
  setInterval(loadState, 1000);
});
