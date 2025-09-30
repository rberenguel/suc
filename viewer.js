import { drawSwimlaneChart } from "./swimlane.js";

const fileLoader = document.getElementById("file-loader");

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

function parseAndRender(content) {
  const lines = content.split("\n");
  const themes = {};
  const activityLines = [];

  for (const line of lines) {
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
  // The 'settings' object is empty as we only rely on themes from the file.
  drawSwimlaneChart("#chart-container", activityData, true, {}, themes);
}
