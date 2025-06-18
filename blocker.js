(() => {
  const BLOCKER_ID = "suc-distraction-blocker";
  if (document.getElementById(BLOCKER_ID)) return;

  let clickCount = 0;
  let clickTimer = null;
  let scoreUpdateInterval = null;
  let lastDisplayedScore = -1; // Track the last score to trigger animation only on change

  function injectStyles() {
    const style = document.createElement("style");
    const fontURL = chrome.runtime.getURL("SixtyFour.woff2");

    style.textContent = `
        @font-face {
            font-family: 'Sixtyfour';
            src: url('${fontURL}') format('woff2');
            font-weight: normal;
            font-style: normal;
        }
            @keyframes sucGradientShift {
                0% { background-position: 0% 50%; }
                100% { background-position: -200% 50%; }
            }
            
            @keyframes score-update-bling {
                0%   { transform: scale(1); }
                20%  { transform: scale(0.92); }    /* Anticipation */
                45%  { transform: scale(1.11); }   /* Overshoot */
                60%  { transform: scale(0.97); }   /* Rebound 1 */
                75%  { transform: scale(1.03); }   /* Rebound 2 */
                90%  { transform: scale(0.98); }   /* Rebound 3 */
                100% { transform: scale(1); }      /* Settle */
            }

            #suc-score-display {
                position: absolute;
                top: 40px;
                right: 40px;
                font-family: 'Sixtyfour', monospace;
                font-size: 4rem;
                background-image: linear-gradient(to right, #c60, #cc0, #0cc, #06c, #0cc, #cc0, #c60);
                -webkit-background-clip: text;
                background-clip: text;
                color: transparent;
                background-size: 400%;
                /* Base animation is just the gradient */
                animation: sucGradientShift 10s linear infinite;
                user-select: none; 
            }

            /* When the bling class is added, run BOTH animations */
            #suc-score-display.score-bling-animate {
                animation: sucGradientShift 10s linear infinite, 
                           score-update-bling 0.8s ease-in-out;
            }
    `;
    document.head.appendChild(style);
  }

  function removeBlocker() {
    if (scoreUpdateInterval) clearInterval(scoreUpdateInterval);
    const blocker = document.getElementById(BLOCKER_ID);
    if (blocker) blocker.remove();
  }

  function handleBlockerClick(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    clickCount++;
    if (clickCount >= 3) {
      removeBlocker();
      chrome.runtime.sendMessage({ type: "BYPASS_BLOCKER" });
      return;
    }
    if (clickTimer) clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
      clickCount = 0;
    }, 500);
  }

  function updateScoreDisplay(scoreData) {
    const scoreDisplay = document.getElementById("suc-score-display");
    if (scoreDisplay && scoreData) {
      const score = Math.floor(scoreData.currentScore);
      const isHighScore =
        scoreData.currentScore > scoreData.maxScore && scoreData.maxScore > 0;
      scoreDisplay.textContent = score + (isHighScore ? " ⭐" : "");

      // Only trigger animation if the score has actually changed
      if (lastDisplayedScore !== score && lastDisplayedScore !== -1) {
        // Force animation replay by removing and re-adding the class
        scoreDisplay.classList.remove("score-bling-animate");
        void scoreDisplay.offsetWidth; // Trigger a browser reflow
        scoreDisplay.classList.add("score-bling-animate");
      }
      lastDisplayedScore = score;
    }
  }
  function fetchAndUpdateScore() {
    chrome.runtime.sendMessage({ type: "GET_SCORE" }, (response) => {
      if (chrome.runtime.lastError) {
        if (scoreUpdateInterval) clearInterval(scoreUpdateInterval);
        return;
      }
      updateScoreDisplay(response);
    });
  }

  function startScorePolling() {
    if (scoreUpdateInterval) clearInterval(scoreUpdateInterval);
    // The interval now just calls the reusable function
    scoreUpdateInterval = setInterval(fetchAndUpdateScore, 5000);
  }
  function createBlocker() {
    injectStyles();
    const blockerDiv = document.createElement("div");
    blockerDiv.id = BLOCKER_ID;
    blockerDiv.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background-color: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px);
            z-index: 2147483647; cursor: not-allowed;
        `;
    const scoreDiv = document.createElement("div");
    scoreDiv.id = "suc-score-display";
    blockerDiv.appendChild(scoreDiv);
    blockerDiv.addEventListener("click", handleBlockerClick);
    document.body.appendChild(blockerDiv);
    fetchAndUpdateScore();
    startScorePolling();
  }

  if (document.readyState === "complete") {
    createBlocker();
  } else {
    window.addEventListener("load", createBlocker, { once: true });
  }
})();
