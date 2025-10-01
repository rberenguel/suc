import { drawSwimlaneChart } from "./swimlane.js";

const dateSelector = document.getElementById("date-selector");
const productivityDataTextarea = document.getElementById("productivity-data");
const exportDayButton = document.getElementById("exportDay");
const exportAllButton = document.getElementById("exportAll");
const toggleDataButton = document.getElementById("toggleData");
const dataContainer = document.getElementById("data-container");
const saveDataButton = document.getElementById("saveData");
const statusNotice = document.getElementById("status-notice");
const themeList = document.getElementById("theme-list");
const themeSuggestions = document.getElementById("theme-suggestions");
const saveThemesButton = document.getElementById("saveThemes");
const themeStatus = document.getElementById("theme-status");
const exportPdfButton = document.getElementById("exportPdf");

let productivityData = {};
let settings = {};
let themes = {};

function compactData(lines) {
  if (!lines || lines.length < 2) return lines;
  const compacted = [];
  let i = 0;
  while (i < lines.length) {
    const startLine = lines[i];
    const startContent = startLine.substring(15);
    let j = i + 1;
    while (j < lines.length && lines[j].substring(15) === startContent) j++;
    const blockEndIndex = j - 1;
    compacted.push(startLine);
    if (blockEndIndex > i) compacted.push(lines[blockEndIndex]);
    i = j;
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
    productivityData = {};
    themes = {};
    for (const key in items) {
      if (key.startsWith("themes_")) {
        themes[key] = items[key];
      } else {
        productivityData[key] = items[key];
      }
    }

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

function renderThemeEditor(date) {
  const dayThemes = themes[`themes_${date}`] || {};
  const dataForDay = productivityData[date] || [];
  //console.log(dataForDay)
  // MODIFIED: This logic now groups all titles by URL to show every combination.
  //console.log(dataForDay)
  const titlesByUrl = dataForDay.reduce((acc, line) => {
    let [_, ...mdLink] = line.split(" ");
    mdLink = mdLink.join(" ");
    let [title, ...url] = mdLink.split("]");
    title = title.slice(1);
    url = url[0].slice(1, -1);
    const urlMatch = line.match(/\((.*?)\)$/);
    const titleMatch = line.match(/\[(.*?)\]/);
    if (urlMatch && titleMatch && urlMatch[1]) {
      if (!acc[url]) {
        acc[url] = new Set();
      }
      acc[url].add(title);
    }
    return acc;
  }, {});
  console.log(titlesByUrl);
  const uniqueThemeNames = [
    ...new Set(Object.values(dayThemes).filter(Boolean)),
  ];

  themeSuggestions.innerHTML = uniqueThemeNames
    .map((name) => `<option value="${name}"></option>`)
    .join("");

  themeList.innerHTML = Object.entries(titlesByUrl)
    .map(([url, titlesSet]) => {
      const allTitles = Array.from(titlesSet);
      const titlesHtml = allTitles.join("<br>");
      const titlesTooltip = allTitles.join("\n");

      return `
        <div class="theme-entry">
          <input type="text" list="theme-suggestions" data-url="${url}" value="${dayThemes[url] || ""}">
          <span class="theme-entry-details" title="${url}\n${titlesTooltip}">
            <strong><a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a></strong>
            <br><small>${titlesHtml}</small>
          </span>
        </div>
      `;
    })
    .join("");
}

function displayDataForDate(date) {
  const rawDataForDay = date ? productivityData[date] || [] : [];
  const compactedDataForDay = compactData(rawDataForDay);
  const dataString = compactedDataForDay.join("\n");
  const dayThemes = themes[`themes_${date}`] || {};

  productivityDataTextarea.value = dataString;
  renderThemeEditor(date);
  drawSwimlaneChart("#chart-container", dataString, true, settings, dayThemes);
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

saveThemesButton.addEventListener("click", () => {
  const selectedDate = dateSelector.value;
  if (!selectedDate) return;

  const newDayThemes = {};
  themeList.querySelectorAll("input[data-url]").forEach((input) => {
    const url = input.dataset.url;
    const theme = input.value.trim();
    if (url && theme) {
      newDayThemes[url] = theme;
    }
  });

  const key = `themes_${selectedDate}`;
  chrome.storage.local.set({ [key]: newDayThemes }, () => {
    themes[key] = newDayThemes;
    themeStatus.textContent = "Saved!";
    setTimeout(() => (themeStatus.textContent = ""), 2000);
    displayDataForDate(selectedDate); // Redraw chart with new themes
  });
});

exportDayButton.addEventListener("click", () => {
  const selectedDate = dateSelector.value;
  if (!selectedDate || !productivityData[selectedDate]) return;

  const dayThemes = themes[`themes_${selectedDate}`] || {};
  let preamble = `# ${selectedDate}\n\n`;
  if (Object.keys(dayThemes).length > 0) {
    preamble +=
      Object.entries(dayThemes)
        .map(([url, theme]) => `- ${theme} ${url}`)
        .join("\n") + "\n\n";
  }
  const content = preamble + productivityDataTextarea.value;
  download(`suc-data-${selectedDate}.md`, content);
});

exportPdfButton.addEventListener("click", async () => {
  const { jsPDF } = window.jspdf;
  const svgElement = document.querySelector("#chart-container svg");
  if (!svgElement) {
    alert("No chart to export!");
    return;
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const svgXML = new XMLSerializer().serializeToString(svgElement);

  const v = await window.Canvg.fromString(ctx, svgXML);
  await v.render();

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({
    orientation: "landscape",
  });

  const selectedDate = dateSelector.value;
  pdf.text(`Activity Swimlane for ${selectedDate}`, 10, 10);
  pdf.addImage(imgData, "PNG", 10, 20, 280, 150);
  pdf.save(`suc-swimlane-${selectedDate}.pdf`);
});

dateSelector.addEventListener("change", (e) =>
  displayDataForDate(e.target.value),
);
document.addEventListener("DOMContentLoaded", loadInitialData);

// Unchanged event listeners below this line
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
      setTimeout(() => (statusNotice.textContent = ""), 2000);
      loadProductivityData();
    });
  }
});
exportAllButton.addEventListener("click", () => {
  const allData = Object.keys(productivityData)
    .sort()
    .map((date) => {
      const dayThemes = themes[`themes_${date}`] || {};
      let preamble = "";
      if (Object.keys(dayThemes).length > 0) {
        preamble =
          Object.entries(dayThemes)
            .map(([url, theme]) => `- ${theme} ${url}`)
            .join("\n") + "\n\n";
      }
      return preamble + compactData(productivityData[date]).join("\n");
    })
    .join("\n\n---\n\n");
  if (allData) download("suc-data-all.md", allData);
});
window.addEventListener("resize", () => {
  if (productivityDataTextarea.value) {
    const selectedDate = dateSelector.value;
    const dayThemes = themes[`themes_${selectedDate}`] || {};
    drawSwimlaneChart(
      "#chart-container",
      productivityDataTextarea.value,
      false,
      settings,
      dayThemes,
    );
  }
});