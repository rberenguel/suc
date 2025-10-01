import { drawSwimlaneChart } from "./swimlane.js";

const fileLoader = document.getElementById("file-loader");
const mainHeader = document.getElementById("main-header");

fileLoader.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target.result;
    parseAndRender(content);
  };
  reader.readAsText(file);
});

function renderDurations(totals, colorMap) {
  const container = document.getElementById("duration-summary");

  const parseTimeToMinutes = (timeStr) => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const filteredTotals = totals.filter(
    (total) => parseTimeToMinutes(total.time) > 15,
  );

  if (!filteredTotals || filteredTotals.length === 0) {
    container.innerHTML =
      "<p>No themes with more than 15 minutes of activity.</p>";
    return;
  }

  container.innerHTML = filteredTotals
    .map(({ time, theme }) => {
      const color = colorMap[theme] || "#2aa198"; // Default color
      return `<div class="duration-item"><span class="duration-item-theme" style="color: ${color}">${theme}:</span> ${time}</div>`;
    })
    .join("");
}

async function parseAndRender(content) {
  const lines = content.split("\n");
  const themes = {};
  const activityLines = [];
  const totals = [];

  // Find and set the page header from the file's title
  const headerLine = lines.find((line) => line.startsWith("# "));
  if (headerLine) {
    mainHeader.textContent = headerLine.substring(2).trim();
  } else {
    mainHeader.textContent = "Swimlane Viewer"; // Reset to default
  }

  for (const line of lines) {
    // Matches lines like "- [total] 01:23 Theme Name"
    const totalMatch = line.match(/^- \[total\] (\d{2}:\d{2}) (.*)/);
    if (totalMatch) {
      const [, time, theme] = totalMatch;
      totals.push({ time, theme: theme.trim() });
      continue;
    }

    // Matches lines like "- theme https://url.com"
    const themeMatch = line.match(/^- (\S+) (.+)/);
    if (themeMatch) {
      const [, theme, url] = themeMatch;
      themes[url.trim()] = theme;
      continue;
    }

    // Matches lines starting with a timestamp
    const activityMatch = line.match(/^\d{8}@\d{2}:\d{2}/);
    if (activityMatch) {
      activityLines.push(line);
      continue;
    }
  }

  const activityData = activityLines.join("\n");
  const colorMap = await drawSwimlaneChart(
    "#chart-container",
    activityData,
    true,
    {},
    themes,
  );

  renderDurations(totals, colorMap);
}