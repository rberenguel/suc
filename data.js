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
const durationSummaryContainer = document.getElementById("duration-summary");

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

function processDailyData(rawDataString, themesForDay, globalSettings) {
  const parseLine = (line) => {
    const match = line.match(/^(\d{8}@\d{2}:\d{2})\s\[(.*?)\](?:\((.*?)\))?$/);
    if (!match) return null;
    const [_, datetimeStr, title, url = ""] = match;
    const year = parseInt(datetimeStr.substring(0, 4), 10);
    const month = parseInt(datetimeStr.substring(4, 6), 10) - 1;
    const day = parseInt(datetimeStr.substring(6, 8), 10);
    const hour = parseInt(datetimeStr.substring(9, 11), 10);
    const minute = parseInt(datetimeStr.substring(12, 14), 10);
    return {
      time: new Date(year, month, day, hour, minute),
      title: title.trim(),
      url: url,
    };
  };

  const data = (rawDataString || "")
    .trim()
    .split("\n")
    .map(parseLine)
    .filter(Boolean);

  return data.map((entry) => {
    const theme = themesForDay[entry.url] || null;
    if (
      !entry.url ||
      !globalSettings.groupedUrls ||
      globalSettings.groupedUrls.length === 0
    ) {
      return { ...entry, theme };
    }
    const matchingPrefix = globalSettings.groupedUrls.find((prefix) =>
      entry.url.startsWith(prefix),
    );
    if (matchingPrefix) {
      try {
        const hostname = new URL(matchingPrefix).hostname;
        return { ...entry, title: hostname, theme };
      } catch (e) {
        return { ...entry, title: matchingPrefix, theme };
      }
    }
    return { ...entry, theme };
  });
}

function calculateDurations(processedData) {
  const durations = new Map();
  if (processedData.length < 2) {
    // If there's only one entry, we can't calculate a duration from it.
    // We can either assume 1 minute or 0. Let's assume 1 to be consistent
    // with the old behavior in this edge case.
    if (processedData.length === 1) {
        const key = processedData[0].theme || processedData[0].title;
        durations.set(key, 1);
    }
    return Object.fromEntries(durations);
  }

  for (let i = 0; i < processedData.length - 1; i++) {
    const currentEntry = processedData[i];
    const nextEntry = processedData[i + 1];
    const key = currentEntry.theme || currentEntry.title;
    
    // Calculate the difference in minutes between the current and next log entry
    const durationMinutes = (nextEntry.time - currentEntry.time) / (1000 * 60);

    // If the duration is very long (e.g., overnight), it's a real duration.
    // If it's 0, it means two events happened in the same minute, we can count it as 1 minute of the first event.
    const effectiveDuration = durationMinutes > 0 ? durationMinutes : 1;

    durations.set(key, (durations.get(key) || 0) + effectiveDuration);
  }

  return Object.fromEntries(durations);
}

function renderDurations(durations, colorMap) {
  const sortedDurations = Object.entries(durations)
    .filter(([_, minutes]) => minutes > 15)
    .sort(([, a], [, b]) => b - a);

  if (sortedDurations.length === 0) {
    durationSummaryContainer.innerHTML =
      "<p>No themes used for more than 15 minutes today.</p>";
    return;
  }

  durationSummaryContainer.innerHTML = sortedDurations
    .map(([theme, minutes]) => {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      const formattedTime = `${String(hours).padStart(2, "0")}:${String(
        mins,
      ).padStart(2, "0")}`;
      const color = colorMap[theme] || "#2aa198"; // Default color if not found
      return `<div class="duration-item"><span class="duration-item-theme" style="color: ${color}">${theme}:</span> ${formattedTime}</div>`;
    })
    .join("");
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
  const titlesByUrl = dataForDay.reduce((acc, line) => {
    let [_, ...mdLink] = line.split(" ");
    mdLink = mdLink.join(" ");
    let [title, ...url] = mdLink.split("]");
    title = title.slice(1);
    url = url[0].slice(1, -1);
    const urlMatch = line.match(/\((.*?)\)$/);
    const titleMatch = line.match(/\[(.*?)\]/);
    if (urlMatch && titleMatch && urlMatch[1]) {
      if (!acc[url]) acc[url] = new Set();
      acc[url].add(title);
    }
    return acc;
  }, {});
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
        </div>`;
    })
    .join("");
}

async function displayDataForDate(date) {
  const rawDataForDay = date ? productivityData[date] || [] : [];
  const compactedDataForDay = compactData(rawDataForDay);
  const dataString = compactedDataForDay.join("\n");
  const dayThemes = themes[`themes_${date}`] || {};

  const processedData = processDailyData(dataString, dayThemes, settings);
  const durations = calculateDurations(processedData);

  // Draw chart first to get the colorMap
  const colorMap = await drawSwimlaneChart(
    "#chart-container",
    dataString,
    true,
    settings,
    dayThemes,
  );
  renderDurations(durations, colorMap);

  productivityDataTextarea.value = dataString;
  renderThemeEditor(date);
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
    if (url && theme) newDayThemes[url] = theme;
  });

  const key = `themes_${selectedDate}`;
  chrome.storage.local.set({ [key]: newDayThemes }, () => {
    themes[key] = newDayThemes;
    themeStatus.textContent = "Saved!";
    setTimeout(() => (themeStatus.textContent = ""), 2000);
    displayDataForDate(selectedDate);
  });
});

exportDayButton.addEventListener("click", () => {
  const selectedDate = dateSelector.value;
  if (!selectedDate || !productivityData[selectedDate]) return;

  const dayThemes = themes[`themes_${selectedDate}`] || {};
  const dataString = productivityDataTextarea.value;
  const processedData = processDailyData(dataString, dayThemes, settings);
  const durations = calculateDurations(processedData);

  const sortedDurations = Object.entries(durations).sort(
    ([, a], [, b]) => b - a,
  );
  const totalsPreamble = sortedDurations
    .map(([theme, minutes]) => {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      const formattedTime = `${String(hours).padStart(2, "0")}:${String(
        mins,
      ).padStart(2, "0")}`;
      return `- [total] ${formattedTime} ${theme}`;
    })
    .join("\n");

  const themePreamble =
    Object.keys(dayThemes).length > 0
      ? Object.entries(dayThemes)
          .sort((a, b) => a[1].localeCompare(b[1]))
          .map(([url, theme]) => `- ${theme} ${url}`)
          .join("\n")
      : "";

  const content =
    `# ${selectedDate}\n\n` +
    `${totalsPreamble ? totalsPreamble + "\n\n" : ""}` +
    `${themePreamble ? themePreamble + "\n\n" : ""}` +
    dataString;

  download(`suc-data-${selectedDate}.md`, content);
});

dateSelector.addEventListener("change", (e) =>
  displayDataForDate(e.target.value),
);
document.addEventListener("DOMContentLoaded", loadInitialData);

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
