const urlsTextarea = document.getElementById("urls");
const saveButton = document.getElementById("save");
const resetButton = document.getElementById("resetScore");
const statusDiv = document.getElementById("status");

function saveOptions() {
  const urls = urlsTextarea.value
    .split("\n")
    .filter((line) => line.trim() !== "");
  console.log(urls);
  chrome.storage.sync.set({ blockedUrls: urls }, () => {
    statusDiv.textContent = "Options saved.";
    setTimeout(() => {
      statusDiv.textContent = "";
    }, 1500);
  });
}

function restoreOptions() {
  chrome.storage.sync.get({ blockedUrls: [] }, (items) => {
    urlsTextarea.value = items.blockedUrls.join("\n");
  });
}

function resetScore() {
  chrome.storage.sync.set({ currentScore: 0, maxScore: 0 }, () => {
    statusDiv.textContent = "Score reset.";
    setTimeout(() => {
      statusDiv.textContent = "";
    }, 1500);
  });
}

document.addEventListener("DOMContentLoaded", restoreOptions);
saveButton.addEventListener("click", saveOptions);
resetButton.addEventListener("click", resetScore);
