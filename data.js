import { drawSwimlaneChart } from "./swimlane.js";

const dateSelector = document.getElementById("date-selector");
const productivityDataTextarea = document.getElementById("productivity-data");
const exportDayButton = document.getElementById("exportDay");
const exportAllButton = document.getElementById("exportAll");
const toggleDataButton = document.getElementById("toggleData");
const dataContainer = document.getElementById("data-container");
const saveDataButton = document.getElementById("saveData");
const statusNotice = document.getElementById("status-notice");

let productivityData = {};
let settings = {}; // To hold settings from storage

/**
 * Compacts consecutive data entries with the same content.
 * For any block of more than two identical consecutive entries, it keeps
 * only the first and the last entry.
 * @param {string[]} lines - An array of productivity data strings.
 * @returns {string[]} The compacted array of data strings.
 */
function compactData(lines) {
  if (!lines || lines.length < 2) {
    return lines;
  }

  const compacted = [];
  let i = 0;
  while (i < lines.length) {
    const startLine = lines[i];
    const startContent = startLine.substring(15); // Content for comparison

    let j = i + 1;
    while (j < lines.length && lines[j].substring(15) === startContent) {
      j++;
    }

    const blockEndIndex = j - 1;
    compacted.push(startLine); // Always add the first line of a block

    if (blockEndIndex > i) {
      // If block has more than one line, add the last one.
      // This compacts blocks of 3+ into 2, and leaves blocks of 2 as is.
      compacted.push(lines[blockEndIndex]);
    }

    i = j; // Move to the start of the next block
  }
  return compacted;
}

function loadInitialData() {
  chrome.storage.sync.get({ groupedUrls: [] }, (items) => {
    settings.groupedUrls = items.groupedUrls;
    loadProductivityData();
  });
}

function loadProductivityData() {
  chrome.storage.local.get(null, (items) => {
    productivityData = items;
    const dates = Object.keys(productivityData).sort().reverse();
    dateSelector.innerHTML =
      dates
        .map((date) => `<option value="${date}">${date}</option>`)
        .join("") || `<option>No data available</option>`;

    if (dates.length > 0) {
      displayDataForDate(dates[0]);
      exportDayButton.disabled = false;
    } else {
      displayDataForDate(null);
      exportDayButton.disabled = true;
    }
    exportAllButton.disabled = dates.length === 0;
  });
}

function displayDataForDate(date) {
  const rawDataForDay = date ? productivityData[date] || [] : [];
  const compactedDataForDay = compactData(rawDataForDay);
  const dataString = compactedDataForDay.join("\n");

  productivityDataTextarea.value = dataString;
  drawSwimlaneChart("#chart-container", dataString, true, settings);
}

function download(filename, text) {
  const element = document.createElement("a");
  element.setAttribute(
    "href",
    "data:text/plain;charset=utf-8," + encodeURIComponent(text),
  );
  element.setAttribute("download", filename);
  element.style.display = "none";
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}

toggleDataButton.addEventListener("click", () => {
  const isHidden = dataContainer.style.display === "none";
  dataContainer.style.display = isHidden ? "block" : "none";
  saveDataButton.style.display = isHidden ? "inline-block" : "none";
  toggleDataButton.textContent = isHidden ? "Hide Raw Data" : "Show Raw Data";
});

saveDataButton.addEventListener("click", () => {
  const selectedDate = dateSelector.value;
  if (selectedDate) {
    const updatedData = productivityDataTextarea.value
      .split("\n")
      .filter((line) => line.trim() !== "");
    chrome.storage.local.set({ [selectedDate]: updatedData }, () => {
      statusNotice.textContent = "Data saved!";
      setTimeout(() => {
        statusNotice.textContent = "";
      }, 2000);
      loadProductivityData();
    });
  }
});

exportDayButton.addEventListener("click", () => {
  const selectedDate = dateSelector.value;
  if (selectedDate && productivityData[selectedDate]) {
    download(
      `suc-data-${selectedDate}.md`,
      productivityDataTextarea.value, // Export the compacted view
    );
  }
});

exportAllButton.addEventListener("click", () => {
  const allData = Object.keys(productivityData)
    .sort()
    .map((date) => compactData(productivityData[date]).join("\n")) // Compact each day
    .join("\n\n");
  if (allData) {
    download("suc-data-all.md", allData);
  }
});

dateSelector.addEventListener("change", (e) =>
  displayDataForDate(e.target.value),
);

window.addEventListener("resize", () => {
  if (productivityDataTextarea.value) {
    drawSwimlaneChart(
      "#chart-container",
      productivityDataTextarea.value,
      false,
      settings,
    );
  }
});

document.addEventListener("DOMContentLoaded", loadInitialData);