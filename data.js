import { drawSwimlaneChart } from "./swimlane.js";

const dateSelector = document.getElementById("date-selector");
const productivityDataTextarea = document.getElementById("productivity-data");
const exportDayButton = document.getElementById("exportDay");
//const deleteDayButton = document.getElementById("deleteDay");
const exportAllButton = document.getElementById("exportAll");
//const deleteAllButton = document.getElementById("deleteAll");
const toggleDataButton = document.getElementById("toggleData");
const dataContainer = document.getElementById("data-container");
const saveDataButton = document.getElementById("saveData");
const statusNotice = document.getElementById("status-notice");

let productivityData = {};
let settings = {}; // To hold settings from storage

function loadInitialData() {
  // Fetch settings first
  chrome.storage.sync.get({ groupedUrls: [] }, (items) => {
    settings.groupedUrls = items.groupedUrls;
    // Then fetch the productivity data
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
      //deleteDayButton.disabled = false;
    } else {
      displayDataForDate(null); // Clear textarea and chart if no data
      exportDayButton.disabled = true;
      //deleteDayButton.disabled = true;
    }
    exportAllButton.disabled = dates.length === 0;
    //deleteAllButton.disabled = dates.length === 0;
  });
}

function displayDataForDate(date) {
  const dataForDay = date ? productivityData[date]?.join("\n") || "" : "";
  productivityDataTextarea.value = dataForDay;
  // Pass the fetched settings to the chart
  drawSwimlaneChart("#chart-container", dataForDay, true, settings);
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
    const updatedData = productivityDataTextarea.value.split("\n");
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
      productivityData[selectedDate].join("\n"),
    );
  }
});

/*deleteDayButton.addEventListener("click", () => {
  const selectedDate = dateSelector.value;
  if (
    selectedDate &&
    confirm(`Are you sure you want to delete all data for ${selectedDate}?`)
  ) {
    chrome.storage.local.remove(selectedDate, () => {
      loadProductivityData();
    });
  }
});*/

exportAllButton.addEventListener("click", () => {
  const allData = Object.keys(productivityData)
    .sort()
    .map((date) => productivityData[date].join("\n"))
    .join("\n\n");
  if (allData) {
    download("suc-data-all.md", allData);
  }
});

/*deleteAllButton.addEventListener("click", () => {
  if (confirm("Are you sure you want to delete ALL productivity data?")) {
    chrome.storage.local.clear(() => {
      loadProductivityData();
    });
  }
});*/

dateSelector.addEventListener("change", (e) =>
  displayDataForDate(e.target.value),
);

window.addEventListener("resize", () => {
  if (productivityDataTextarea.value) {
    // Pass settings on resize as well
    drawSwimlaneChart(
      "#chart-container",
      productivityDataTextarea.value,
      false,
      settings,
    );
  }
});

document.addEventListener("DOMContentLoaded", loadInitialData);
