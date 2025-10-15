import { drawSwimlaneChart, parseLine } from "./swimlane.js";

const dateSelector = document.getElementById("date-selector-options");
const dateSelectorButton = document.getElementById("date-selector-button");
const dailySummaryTitle = document.getElementById("summary-title");
const productivityDataTextarea = document.getElementById("productivity-data");
const exportDayButton = document.getElementById("exportDay");
const exportSelectedButton = document.getElementById("exportSelected");
const exportAllButton = document.getElementById("exportAll");
const exportAllDaysButton = document.getElementById("exportAllDays");
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
let currentDate = null;

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
    const durationMinutes = (nextEntry.time - currentEntry.time) / (1000 * 60);
    const effectiveDuration = durationMinutes > 0 ? durationMinutes : 1;
    durations.set(key, (durations.get(key) || 0) + effectiveDuration);
  }

  return Object.fromEntries(durations);
}

function renderDurations(durations, colorMap) {
  const sortedDurations = Object.entries(durations)
    .filter(([_, minutes]) => minutes > 15)
    .sort(([keyA, a], [keyB, b]) => {
      if (keyA === "Out of Chrome") return 1;
      if (keyB === "Out of Chrome") return -1;
      return b - a;
    });

  if (sortedDurations.length === 0) {
    durationSummaryContainer.innerHTML =
      "<p>No themes used for more than 15 minutes today.</p>";
    return;
  }

  durationSummaryContainer.innerHTML = sortedDurations
    .map(([theme, minutes]) => {
      const hours = Math.floor(minutes / 60);
      const mins = Math.round(minutes % 60);
      const formattedTime = `${String(hours).padStart(2, "0")}:${String(
        mins,
      ).padStart(2, "0")}`;
      const color = colorMap[theme] || "#2aa198";
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
      } else if (key !== "recentThemes") {
        productivityData[key] = items[key];
      }
    }
    const dates = Object.keys(productivityData).sort().reverse();
    dateSelector.innerHTML = "";

    if (dates.length > 0) {
      dates.forEach((date) => {
        const container = document.createElement("div");
        container.className = "date-item";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = date;
        checkbox.id = `date-${date}`;
        const label = document.createElement("label");
        label.htmlFor = `date-${date}`;
        label.textContent = date;
        label.style.cursor = "pointer";
        label.addEventListener("click", (e) => {
          e.preventDefault();
          displayDataForDate(date);
        });
        container.appendChild(checkbox);
        container.appendChild(label);
        dateSelector.appendChild(container);
      });
      displayDataForDate(dates[0]);
      exportDayButton.disabled = false;
      exportSelectedButton.disabled = false;
    } else {
      dateSelector.innerHTML = "<span>No data available</span>";
      displayDataForDate(null);
      exportDayButton.disabled = true;
      exportSelectedButton.disabled = true;
    }
    exportAllButton.disabled = dates.length === 0;
  });
}

dateSelectorButton.addEventListener("click", (e) => {
  e.stopPropagation();
  const options = document.getElementById("date-selector-options");
  options.style.display = options.style.display === "none" ? "block" : "none";
});

window.addEventListener("click", (e) => {
  const options = document.getElementById("date-selector-options");
  if (!document.getElementById("date-selector-container").contains(e.target)) {
    options.style.display = "none";
  }
});

function renderThemeEditor(date) {
  const dayThemes = themes[`themes_${date}`] || {};
  const dataForDay = productivityData[date] || [];
  const titlesByUrl = dataForDay.reduce((acc, line) => {
    const urlBlockIndex = line.indexOf(" [");
    if (urlBlockIndex === -1) return acc;

    const urlBlock = line.substring(urlBlockIndex + 1);
    const lastParenIndex = urlBlock.lastIndexOf("(");
    if (lastParenIndex === -1) return acc;

    const url = urlBlock.substring(lastParenIndex + 1, urlBlock.length - 1);
    const title = urlBlock.substring(1, lastParenIndex - 2).trim();

    if (url && title) {
      if (!acc[url]) acc[url] = new Set();
      acc[url].add(title);
    }
    return acc;
  }, {});

  chrome.storage.local.get({ recentThemes: [] }, (data) => {
    const recentThemes = data.recentThemes;
    const dayThemeNames = Object.values(dayThemes).filter(Boolean);
    const uniqueThemeNames = [...new Set([...dayThemeNames, ...recentThemes])];
    themeSuggestions.innerHTML = uniqueThemeNames
      .map((name) => `<option value="${name}"></option>`)
      .join("");
  });

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
  currentDate = date;
  const dateSpan = `<span class="date">${currentDate}</span>`;
  dailySummaryTitle.innerHTML = `Daily Summary (${dateSpan})`;
  const rawDataForDay = date ? productivityData[date] || [] : [];
  const compactedDataForDay = compactData(rawDataForDay);
  const dataString = compactedDataForDay.join("\n");
  const dayThemes = themes[`themes_${date}`] || {};

  const processedData = processDailyData(dataString, dayThemes, settings);
  const durations = calculateDurations(processedData);

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
  const selectedDate = currentDate;
  if (!selectedDate) return;

  const newDayThemes = {};
  const themesForRecents = new Set();
  themeList.querySelectorAll("input[data-url]").forEach((input) => {
    const url = input.dataset.url;
    const theme = input.value.trim();
    if (url && theme) {
      newDayThemes[url] = theme;
      themesForRecents.add(theme);
    }
  });

  chrome.storage.local.get({ recentThemes: [] }, (data) => {
    let recentThemes = [
      ...new Set([...Array.from(themesForRecents), ...data.recentThemes]),
    ];
    if (recentThemes.length > 10) {
      recentThemes.length = 10;
    }
    chrome.storage.local.set({ recentThemes });
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
  const selectedDate = currentDate;
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
      const mins = Math.round(minutes % 60);
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

document.addEventListener("DOMContentLoaded", loadInitialData);

toggleDataButton.addEventListener("click", () => {
  const isHidden = dataContainer.style.display === "none";
  dataContainer.style.display = isHidden ? "block" : "none";
  saveDataButton.style.display = isHidden ? "inline-block" : "none";
  toggleDataButton.textContent = isHidden ? "Hide Raw Data" : "Show Raw Data";
});

saveDataButton.addEventListener("click", () => {
  if (currentDate) {
    const updatedData = productivityDataTextarea.value
      .split("\n")
      .filter((line) => line.trim() !== "");
    chrome.storage.local.set({ [currentDate]: updatedData }, () => {
      statusNotice.textContent = "Data saved!";
      setTimeout(() => (statusNotice.textContent = ""), 2000);
      loadProductivityData();
    });
  }
});

function exportAllRawData() {
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
}

exportAllButton.addEventListener("click", exportAllRawData);
window.exportAllRawData = exportAllRawData;

exportSelectedButton.addEventListener("click", () => {
  const selectedDates = Array.from(
    document.querySelectorAll(
      "#date-selector-options input[type=checkbox]:checked",
    ),
  )
    .map((cb) => cb.value)
    .sort();

  if (selectedDates.length === 0) {
    alert("Please select at least one day to export.");
    return;
  }

  const firstDay = selectedDates[0];
  const lastDay = selectedDates[selectedDates.length - 1];
  const filename = `suc-data-${firstDay}-${lastDay}.md`;

  const content = selectedDates
    .map((date) => {
      const dayThemes = themes[`themes_${date}`] || {};
      const dataString = compactData(productivityData[date]).join("\n");
      const processedData = processDailyData(dataString, dayThemes, settings);
      const durations = calculateDurations(processedData);

      const sortedDurations = Object.entries(durations).sort(
        ([, a], [, b]) => b - a,
      );
      const totalsPreamble = sortedDurations
        .map(([theme, minutes]) => {
          const hours = Math.floor(minutes / 60);
          const mins = Math.round(minutes % 60);
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

      return (
        `# ${date}\n\n` +
        `${totalsPreamble ? totalsPreamble + "\n\n" : ""}` +
        `${themePreamble ? themePreamble + "\n\n" : ""}` +
        dataString
      );
    })
    .join("\n\n");

  download(filename, content);
});

exportAllDaysButton.addEventListener("click", () => {
  const allDates = Object.keys(productivityData).sort();
  if (allDates.length === 0) {
    alert("No data to export.");
    return;
  }

  const firstDay = allDates[0];
  const lastDay = allDates[allDates.length - 1];
  const filename = `suc-data-${firstDay}-${lastDay}.md`;

  const content = allDates
    .map((date) => {
      const dayThemes = themes[`themes_${date}`] || {};
      const dataString = compactData(productivityData[date]).join("\n");
      const processedData = processDailyData(dataString, dayThemes, settings);
      const durations = calculateDurations(processedData);

      const sortedDurations = Object.entries(durations).sort(
        ([, a], [, b]) => b - a,
      );
      const totalsPreamble = sortedDurations
        .map(([theme, minutes]) => {
          const hours = Math.floor(minutes / 60);
          const mins = Math.round(minutes % 60);
          const formattedTime = `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
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

      return (
        `# ${date}\n\n` +
        `${totalsPreamble ? totalsPreamble + "\n\n" : ""}` +
        `${themePreamble ? themePreamble + "\n\n" : ""}` +
        dataString
      );
    })
    .join("\n\n---\n\n");

  download(filename, content);
});

window.addEventListener("resize", () => {
  if (productivityDataTextarea.value) {
    const dayThemes = themes[`themes_${currentDate}`] || {};
    drawSwimlaneChart(
      "#chart-container",
      productivityDataTextarea.value,
      false,
      settings,
      dayThemes,
    );
  }
});
