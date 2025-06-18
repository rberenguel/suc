(() => {
    const BLOCKER_ID = 'suc-distraction-blocker';
    if (document.getElementById(BLOCKER_ID)) return;

    let clickCount = 0;
    let clickTimer = null;
    let scoreUpdateInterval = null;

    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=Sixtyfour&display=swap');

            @keyframes sucGradientShift {
                0% { background-position: 0% 50%; }
                100% { background-position: -200% 50%; }
            }

            #suc-score-display {
                position: absolute;
                top: 40px;
                right: 40px;
                font-family: 'Sixtyfour', monospace;
                font-size: 5rem;
                background-image: linear-gradient(to right, #c60, #cc0, #0cc, #06c, #0cc, #cc0, #c60);
                -webkit-background-clip: text;
                background-clip: text;
                color: transparent;
                background-size: 400%;
                animation: sucGradientShift 10s linear infinite;
            }
        `;
        document.head.appendChild(style);
    }

    function removeBlocker() {
        if (scoreUpdateInterval) clearInterval(scoreUpdateInterval);
        const blocker = document.getElementById(BLOCKER_ID);
        if (blocker) blocker.remove();
    }

    function handleBlockerClick() {
        clickCount++;
        if (clickCount >= 3) {
            removeBlocker();
            chrome.runtime.sendMessage({ type: "BYPASS_BLOCKER" });
            return;
        }
        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = setTimeout(() => { clickCount = 0; }, 500);
    }

    function updateScoreDisplay(scoreData) {
        const scoreDisplay = document.getElementById('suc-score-display');
        if (scoreDisplay && scoreData) {
            const score = Math.floor(scoreData.currentScore);
            const isHighScore = scoreData.currentScore > scoreData.maxScore && scoreData.maxScore > 0;
            scoreDisplay.textContent = score + (isHighScore ? ' ⭐' : '');
        }
    }

    function startScorePolling() {
        if (scoreUpdateInterval) clearInterval(scoreUpdateInterval);
        // Poll every 5 seconds, which is less frequent and more efficient
        scoreUpdateInterval = setInterval(() => {
            chrome.runtime.sendMessage({ type: 'GET_SCORE' }, (response) => {
                if (chrome.runtime.lastError) {
                    clearInterval(scoreUpdateInterval);
                    return;
                }
                updateScoreDisplay(response);
            });
        }, 5000);
    }

    function createBlocker() {
        injectStyles();
        const blockerDiv = document.createElement('div');
        blockerDiv.id = BLOCKER_ID;
        blockerDiv.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background-color: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px);
            z-index: 2147483647; cursor: not-allowed;
        `;
        const scoreDiv = document.createElement('div');
        scoreDiv.id = 'suc-score-display';
        blockerDiv.appendChild(scoreDiv);
        blockerDiv.addEventListener('click', handleBlockerClick);
        document.body.appendChild(blockerDiv);

        startScorePolling();
    }

    if (document.readyState === 'complete') {
        createBlocker();
    } else {
        window.addEventListener('load', createBlocker, { once: true });
    }
})();