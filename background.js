let scoreUpdateInterval = null;

const state = {
    enabled: true,
    blockedUrls: [],
    currentScore: 0,
    maxScore: 0,
    lastOffTimestamp: null,
};

async function loadState() {
    const items = await chrome.storage.sync.get({
        enabled: true,
        blockedUrls: [],
        currentScore: 0,
        maxScore: 0,
        lastOffTimestamp: null,
    });
    Object.assign(state, items);
    handleInitialState();
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
    }
    updateIconAndBadge();
}

function saveState() {
    chrome.storage.sync.set(state);
}

function updateIconAndBadge() {
    chrome.action.setBadgeText({ text: "" });
    const isHighScore = state.currentScore > state.maxScore && state.maxScore > 0;
    if (state.enabled && isHighScore) {
        chrome.action.setBadgeText({ text: '⭐' });
        chrome.action.setBadgeBackgroundColor({ color: '#f9ca24' });
    }
    const iconPaths = {
        128: state.enabled ? "media/icon.png" : "media/icon-off.png",
    };
    chrome.action.setIcon({ path: iconPaths });
}

function startScoreInterval() {
    if (scoreUpdateInterval || !state.enabled) return;
    // Update score every 10 seconds
    scoreUpdateInterval = setInterval(() => {
        state.currentScore += 10; // Add 10 points
        if (state.currentScore > state.maxScore) {
            state.maxScore = state.currentScore;
        }
        updateIconAndBadge();
        saveState(); // Save the new score
    }, 10000);
}

function stopScoreInterval() {
    if (scoreUpdateInterval) {
        clearInterval(scoreUpdateInterval);
        scoreUpdateInterval = null;
    }
    state.lastOffTimestamp = Date.now();
    saveState();
}

function isUrlBlocked(url) {
    if (!state.enabled || !state.blockedUrls || !url) return false;
    return state.blockedUrls.some(pattern => {
        try { return new RegExp(pattern).test(url); } catch (e) { return false; }
    });
}

function applyBlocking(tabId, url) {
    if (isUrlBlocked(url)) {
        chrome.scripting.executeScript({
            target: { tabId },
            files: ['blocker.js']
        }).catch(err => console.log(`Apply blocking error: ${err.message}`));
    }
}

async function removeBlockerFromAllTabs() {
    const data = await chrome.storage.sync.get({ blockedUrls: [] });
    if (!data.blockedUrls || data.blockedUrls.length === 0) return;
    const blockedUrlsPatterns = data.blockedUrls.map(p => {
        try { return new RegExp(p); } catch (e) { return null; }
    }).filter(Boolean);
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
    for (const tab of tabs) {
        const isPotentiallyBlocked = blockedUrlsPatterns.some(regex => regex.test(tab.url));
        if (isPotentiallyBlocked && tab.id) {
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const blocker = document.getElementById('suc-distraction-blocker');
                    if (blocker) blocker.remove();
                }
            }).catch(e => console.log(`Could not remove blocker from tab ${tab.id}: ${e.message}`));
        }
    }
}

// --- Listeners ---
chrome.runtime.onStartup.addListener(loadState);

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        chrome.storage.sync.set({
            enabled: true,
            blockedUrls: ["twitter.com", "reddit.com", "facebook.com", "youtube.com"],
            currentScore: 0,
            maxScore: 0,
            lastOffTimestamp: null,
        });
    }
});

chrome.action.onClicked.addListener(async (tab) => {
    state.enabled = !state.enabled;
    if (state.enabled) {
        handleInitialState();
    } else {
        stopScoreInterval();
        await removeBlockerFromAllTabs();
    }
    updateIconAndBadge();
    saveState();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'BYPASS_BLOCKER') {
        stopScoreInterval();
    } else if (message.type === 'GET_SCORE') {
        sendResponse({
            currentScore: state.currentScore,
            maxScore: state.maxScore,
        });
    }
    return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        applyBlocking(tabId, tab.url);
    }
});

chrome.tabs.onActivated.addListener(activeInfo => {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (tab && tab.url) {
            applyBlocking(tab.id, tab.url);
        }
    });
});

loadState();