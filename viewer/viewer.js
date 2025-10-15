import { drawSwimlaneChart } from "../swimlane.js";

const fileLoader = document.getElementById("file-loader");
const mainHeader = document.getElementById("main-header");
const dayNavigation = document.getElementById("day-navigation");
const daySelector = document.getElementById("day-selector");
const prevDayButton = document.getElementById("prev-day");
const nextDayButton = document.getElementById("next-day");

let allDaysData = {};
let availableDates = [];

fileLoader.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target.result;
    parseMultiDayFile(content);
    if (availableDates.length > 0) {
      dayNavigation.style.display = "block";
      populateDaySelector();
      renderDay(availableDates[0]);
    }
  };
  reader.readAsText(file);
});

daySelector.addEventListener("change", () => {
  renderDay(daySelector.value);
});

prevDayButton.addEventListener("click", () => {
  const currentIndex = availableDates.indexOf(daySelector.value);
  if (currentIndex > 0) {
    renderDay(availableDates[currentIndex - 1]);
  }
});

nextDayButton.addEventListener("click", () => {
  const currentIndex = availableDates.indexOf(daySelector.value);
  if (currentIndex < availableDates.length - 1) {
    renderDay(availableDates[currentIndex + 1]);
  }
});

function parseMultiDayFile(content) {
  allDaysData = {};
  availableDates = [];
  const daySections = content.split(/#\s/);

  daySections.forEach((section) => {
    if (section.trim() === "") return;

    const lines = section.split("\n");
    const date = lines[0].trim();
    allDaysData[date] = {
      content: section,
      themes: {},
      totals: [],
      activityLines: [],
    };
    availableDates.push(date);

    for (const line of lines) {
      const totalMatch = line.match(/^- \[total\] (\d{2}:\d{2}) (.*)/);
      if (totalMatch) {
        const [, time, theme] = totalMatch;
        allDaysData[date].totals.push({ time, theme: theme.trim() });
        continue;
      }

      const themeMatch = line.match(/^- (\S+) (.+)/);
      if (themeMatch) {
        const [, theme, url] = themeMatch;
        allDaysData[date].themes[url.trim()] = theme;
        continue;
      }

      const activityMatch = line.match(/^\d{8}@\d{2}:\d{2}/);
      if (activityMatch) {
        allDaysData[date].activityLines.push(line);
      }
    }
  });
}

function populateDaySelector() {
  daySelector.innerHTML = "";
  availableDates.forEach((date) => {
    const option = document.createElement("option");
    option.value = date;
    option.textContent = date;
    daySelector.appendChild(option);
  });
}

async function renderDay(date) {
  if (!allDaysData[date]) return;

  daySelector.value = date;
  mainHeader.textContent = date;

  const dayData = allDaysData[date];
  const activityData = dayData.activityLines.join("\n");

  const colorMap = await drawSwimlaneChart(
    "#chart-container",
    activityData,
    true,
    {},
    dayData.themes,
  );

  renderDurations(dayData.totals, colorMap);
}

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
