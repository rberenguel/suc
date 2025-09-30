const urlsTextarea = document.getElementById("urls");
const groupedUrlsTextarea = document.getElementById("groupedUrls");
const saveButton = document.getElementById("save");
const resetButton = document.getElementById("resetScore");
const statusDiv = document.getElementById("status");

function saveOptions() {
  const urls = urlsTextarea.value
    .split("\n")
    .filter((line) => line.trim() !== "");

  const groupedUrls = groupedUrlsTextarea.value
    .split("\n")
    .filter((line) => line.trim() !== "");

  // Saves both settings at the same time
  chrome.storage.sync.set(
    { blockedUrls: urls, groupedUrls: groupedUrls },
    () => {
      statusDiv.textContent = "Options saved.";
      setTimeout(() => {
        statusDiv.textContent = "";
      }, 1500);
    },
  );
}

function restoreOptions() {
  // Restores both settings when the page loads
  chrome.storage.sync.get({ blockedUrls: [], groupedUrls: [] }, (items) => {
    urlsTextarea.value = items.blockedUrls.join("\n");
    groupedUrlsTextarea.value = items.groupedUrls.join("\n");
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
