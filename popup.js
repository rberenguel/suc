const enabledToggle = document.getElementById("enabled");
const productivityToggle = document.getElementById(
  "productivityTrackerEnabled",
);

// Restore state
chrome.storage.sync.get(
  { enabled: true, productivityTrackerEnabled: false },
  (items) => {
    enabledToggle.checked = items.enabled;
    productivityToggle.checked = items.productivityTrackerEnabled;
  },
);

// Save state on change
enabledToggle.addEventListener("change", (e) => {
  chrome.storage.sync.set({ enabled: e.target.checked });
});

productivityToggle.addEventListener("change", (e) => {
  chrome.storage.sync.set({ productivityTrackerEnabled: e.target.checked });
});
