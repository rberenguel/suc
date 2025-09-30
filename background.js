let scoreUpdateInterval = null;

const state = {
  enabled: true,
  blockedUrls: [],
  currentScore: 0,
  maxScore: 0,
  lastOffTimestamp: null,
  productivityTrackerEnabled: false,
};

const PRODUCTIVITY_TRACKER_ALARM = "productivityTracker";

// --- Utility function to schedule the next alarm precisely ---
function scheduleNextProductivityAlarm() {
  // Schedule the alarm to trigger at the start of the next minute
  const now = new Date();
  const nextMinute = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours(),
    now.getMinutes() + 1,
    1,
    0,
  ); // Target 1 second into the next minute
  chrome.alarms.create(PRODUCTIVITY_TRACKER_ALARM, {
    when: nextMinute.getTime(),
  });
}

async function loadState() {
  const items = await chrome.storage.sync.get({
    enabled: true,
    blockedUrls: [],
    currentScore: 0,
    maxScore: 0,
    lastOffTimestamp: null,
    productivityTrackerEnabled: false,
  });
  Object.assign(state, items);
  handleInitialState();
  handleProductivityTrackerState();
}

function handleInitialState() {
  if (state.enabled) {
    if (state.lastOffTimestamp) {
      const oneHour = 60 * 60 * 1000;
      if (Date.now() - state.lastOffTimestamp > oneHour) {
        state.currentScore = 0;
      }
      state.lastOffTimestamp = null;
    }
    startScoreInterval();
  } else {
    stopScoreInterval();
  }
  updateIconAndBadge();
}

function handleProductivityTrackerState() {
  if (state.productivityTrackerEnabled) {
    // When enabling, check if an alarm exists. If not, schedule one.
    chrome.alarms.get(PRODUCTIVITY_TRACKER_ALARM, (alarm) => {
      if (!alarm) {
        scheduleNextProductivityAlarm();
      }
    });
  } else {
    // When disabling, clear any scheduled alarm.
    chrome.alarms.clear(PRODUCTIVITY_TRACKER_ALARM);
  }
  updateIconAndBadge();
}

function updateIconAndBadge() {
  const isActive = state.enabled || state.productivityTrackerEnabled;
  const iconPaths = {
    128: isActive ? "media/icon.png" : "media/icon-off.png",
  };
  chrome.action.setIcon({ path: iconPaths });

  chrome.action.setBadgeText({ text: "" });
  const isHighScore = state.currentScore > state.maxScore && state.maxScore > 0;
  if (state.enabled && isHighScore) {
    chrome.action.setBadgeText({ text: "⭐" });
    chrome.action.setBadgeBackgroundColor({ color: "#f9ca24" });
  }
}

function startScoreInterval() {
  if (scoreUpdateInterval || !state.enabled) return;
  scoreUpdateInterval = setInterval(() => {
    state.currentScore += 10;
    if (state.currentScore > state.maxScore) {
      state.maxScore = state.currentScore;
    }
    updateIconAndBadge();
    chrome.storage.sync.set({
      currentScore: state.currentScore,
      maxScore: state.maxScore,
    });
  }, 10000);
}

function stopScoreInterval() {
  if (scoreUpdateInterval) {
    clearInterval(scoreUpdateInterval);
    scoreUpdateInterval = null;
  }
  state.lastOffTimestamp = Date.now();
  chrome.storage.sync.set({ lastOffTimestamp: state.lastOffTimestamp });
}

function isUrlBlocked(url) {
  if (!state.enabled || !state.blockedUrls || !url) return false;
  return state.blockedUrls.some((pattern) => {
    try {
      return new RegExp(pattern).test(url);
    } catch (e) {
      return false;
    }
  });
}

function applyBlocking(tabId, url) {
  if (isUrlBlocked(url)) {
    chrome.scripting
      .executeScript({
        target: { tabId },
        files: ["blocker.js"],
      })
      .catch((err) => console.log(`Apply blocking error: ${err.message}`));
  }
}

async function removeBlockerFromAllTabs() {
  const data = await chrome.storage.sync.get({ blockedUrls: [] });
  if (!data.blockedUrls || data.blockedUrls.length === 0) return;
  const blockedUrlsPatterns = data.blockedUrls
    .map((p) => {
      try {
        return new RegExp(p);
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean);
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  for (const tab of tabs) {
    const isPotentiallyBlocked = blockedUrlsPatterns.some((regex) =>
      regex.test(tab.url),
    );
    if (isPotentiallyBlocked && tab.id) {
      chrome.scripting
        .executeScript({
          target: { tabId: tab.id },
          func: () => {
            const blocker = document.getElementById("suc-distraction-blocker");
            if (blocker) blocker.remove();
          },
        })
        .catch((e) =>
          console.log(
            `Could not remove blocker from tab ${tab.id}: ${e.message}`,
          ),
        );
    }
  }
}

// --- Listeners ---
chrome.runtime.onStartup.addListener(loadState);

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.sync.set({
      enabled: true,
      blockedUrls: ["twitter.com", "reddit.com", "facebook.com", "youtube.com"],
      currentScore: 0,
      maxScore: 0,
      lastOffTimestamp: null,
      productivityTrackerEnabled: false,
    });
  }
  loadState();
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "sync") {
    let stateChanged = false;
    for (let [key, { newValue }] of Object.entries(changes)) {
      if (state.hasOwnProperty(key)) {
        state[key] = newValue;
        stateChanged = true;
      }
    }

    if (changes.enabled !== undefined) {
      handleInitialState();
      if (!changes.enabled.newValue) {
        removeBlockerFromAllTabs();
      }
    }
    if (changes.productivityTrackerEnabled !== undefined) {
      handleProductivityTrackerState();
    }
    if (stateChanged) {
      updateIconAndBadge();
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "BYPASS_BLOCKER") {
    stopScoreInterval();
  } else if (message.type === "GET_SCORE") {
    sendResponse({
      currentScore: state.currentScore,
      maxScore: state.maxScore,
    });
  }
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    applyBlocking(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab && tab.url) {
      applyBlocking(tab.id, tab.url);
    }
  });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === PRODUCTIVITY_TRACKER_ALARM) {
    scheduleNextProductivityAlarm();

    const tabs = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });

    if (tabs.length === 0) return;

    const tab = tabs[0];
    const win = await chrome.windows.get(tab.windowId);

    const date = new Date();
    const yyyymmdd = `${date.getFullYear()}${(date.getMonth() + 1)
      .toString()
      .padStart(2, "0")}${date.getDate().toString().padStart(2, "0")}`;
    const hhmm = `${date.getHours().toString().padStart(2, "0")}:${date
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;

    let entry;
    if (win.focused && tab.url && tab.title) {
      // If the window is focused, log the tab's URL and title
      const title = tab.title.replace(/[[\]]/g, "{}");
      entry = `${yyyymmdd}@${hhmm} [${title}](${tab.url})`;
    } else {
      // If the window is NOT focused, log a generic "Out of Chrome" message
      entry = `${yyyymmdd}@${hhmm} [Out of Chrome]`;
    }

    const data = await chrome.storage.local.get(yyyymmdd);
    const dayData = data[yyyymmdd] || [];

    // Optional: Prevent logging consecutive duplicate "Out of Chrome" entries
    if (entry !== dayData[dayData.length - 1]) {
      dayData.push(entry);
      await chrome.storage.local.set({ [yyyymmdd]: dayData });
    }
  }
});

loadState();
