let currentProcessedData = [];
let currentContainerSelector = "";
let foldedLanes = new Set();
let currentSettings = {};
/**
 * A helper function to wrap SVG text nodes and adjust their vertical position.
 * @param {d3.Selection} text - The d3 selection of text elements to wrap.
 * @param {number} width - The maximum width of each line.
 */
function wrap(text, width) {
  const lineHeight = 1.1; // ems
  const emSize = 11; // Corresponds to font-size in pixels

  text.each(function () {
    var text = d3.select(this),
      words = text.text().split(/\s+/).reverse(),
      word,
      line = [],
      x = text.attr("x"),
      y = text.attr("y"),
      tspan = text.text(null).append("tspan").attr("x", x).attr("y", y);

    while ((word = words.pop())) {
      line.push(word);
      tspan.text(line.join(" "));
      if (tspan.node().getComputedTextLength() > width && line.length > 1) {
        line.pop();
        tspan.text(line.join(" "));
        line = [word];
        tspan = text
          .append("tspan")
          .attr("x", x)
          .attr("dy", lineHeight + "em")
          .text(word);
      }
    }
    const numLines = text.selectAll("tspan").size();
    const additionalShift = Math.floor(numLines / 2) * emSize;
    if (additionalShift > 0) {
      const newY = parseFloat(y) - additionalShift;
      text.select("tspan").attr("y", newY);
    }
  });
}

function render() {
  const container = d3.select(currentContainerSelector);
  container.html("");

  // FIX: Check the length of the array, not .trim() on a string
  if (!currentProcessedData || currentProcessedData.length === 0) {
    container
      .append("p")
      .style("text-align", "center")
      .style("padding", "2rem")
      .text("No data to display for this day.");
    return;
  }

  const processedData = currentProcessedData; // Use the module-level variable

  const margin = { top: 40, right: 20, bottom: 20, left: 100 };
  const lanes = [...new Set(processedData.map((d) => d.title))].sort();
  const width = lanes.length * 90;
  const timeDomain = d3.extent(processedData, (d) => d.time);

  const groupedData = [];
  if (processedData.length > 0) {
    let currentGroup = {
      title: processedData[0].title,
      events: [processedData[0]],
    };
    for (let i = 1; i < processedData.length; i++) {
      if (processedData[i].title === currentGroup.title) {
        currentGroup.events.push(processedData[i]);
      } else {
        groupedData.push(currentGroup);
        currentGroup = {
          title: processedData[i].title,
          events: [processedData[i]],
        };
      }
    }
    groupedData.push(currentGroup);
  }

  const PIXELS_PER_MINUTE = 15;
  const FOLDED_SEGMENT_MINUTES = 1;
  let cumulativeVisibleMinutes = 0;

  const timelineMap = [{ time: timeDomain[0], visibleMinutes: 0 }];
  groupedData.forEach((group) => {
    const startTime = group.events[0].time;
    const endTime = group.events[group.events.length - 1].time;
    const durationMinutes = (endTime - startTime) / (1000 * 60);

    if (foldedLanes.has(group.title)) {
      cumulativeVisibleMinutes += FOLDED_SEGMENT_MINUTES;
    } else {
      cumulativeVisibleMinutes += durationMinutes;
    }
    timelineMap.push({
      time: endTime,
      visibleMinutes: cumulativeVisibleMinutes,
    });
  });

  const height = cumulativeVisibleMinutes * PIXELS_PER_MINUTE;
  const svg = container
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const yScale = d3
    .scaleLinear()
    .domain(timelineMap.map((d) => d.time.getTime()))
    .range(timelineMap.map((d) => d.visibleMinutes * PIXELS_PER_MINUTE));

  const solarizedColors = [
    "#b58900",
    "#cb4b16",
    "#dc322f",
    "#d33682",
    "#6c71c4",
    "#268bd2",
    "#2aa198",
    "#859900",
  ];
  const colorScale = d3.scaleOrdinal(solarizedColors).domain(lanes);
  const xScale = d3.scalePoint().domain(lanes).range([0, width]).padding(0.5);

  const tickValues = timelineMap
    .map((d) => d.time.getTime())
    .filter((d, i, arr) => i === 0 || d !== arr[i - 1]);

  svg
    .append("g")
    .attr("class", "axis")
    .call(
      d3
        .axisLeft(yScale)
        .tickValues(tickValues)
        .tickFormat((d) => d3.timeFormat("%H:%M")(new Date(d))),
    );

  const tooltip = d3.select("#tooltip");
  svg
    .selectAll(".interactive-point")
    .data(processedData)
    .enter()
    .append("circle")
    .attr("cx", (d) => xScale(d.title))
    .attr("cy", (d) => yScale(d.time.getTime()))
    .attr("r", 6)
    .attr("fill", "transparent")
    .on("mouseover", (event, d) => {
      tooltip
        .style("opacity", 0.95)
        .html(
          `<b>${d.title}</b><br>${d.time.toLocaleString()}<br><small style="word-break: break-all;">${d.url}</small>`,
        )
        .style("left", event.pageX + 15 + "px")
        .style("top", event.pageY - 28 + "px");
    })
    .on("mouseout", () => {
      tooltip.style("opacity", 0);
    });

  svg
    .selectAll(".branch-line")
    .data(groupedData)
    .enter()
    .append("line")
    .attr("class", "timeline-path")
    .attr("stroke", (d) => colorScale(d.title))
    .attr("x1", (d) => xScale(d.title))
    .attr("y1", (d) => yScale(d.events[0].time.getTime()))
    .attr("x2", (d) => xScale(d.title))
    .attr("y2", (d) => yScale(d.events[d.events.length - 1].time.getTime()))
    .style("cursor", "pointer")
    .on("click", (event, d) => {
      if (foldedLanes.has(d.title)) {
        foldedLanes.delete(d.title);
      } else {
        foldedLanes.add(d.title);
      }
      render();
    });

  const segmentEndpoints = [];
  groupedData.forEach((group) => {
    segmentEndpoints.push(group.events[0]);
    if (group.events.length > 1 && !foldedLanes.has(group.title)) {
      segmentEndpoints.push(group.events[group.events.length - 1]);
    }
  });

  svg
    .selectAll(".data-point")
    .data(segmentEndpoints)
    .enter()
    .append("circle")
    .attr("class", "data-point")
    .attr("cx", (d) => xScale(d.title))
    .attr("cy", (d) => yScale(d.time.getTime()))
    .attr("r", 6)
    .attr("fill", (d) => colorScale(d.title))
    .style("pointer-events", "none");

  const firstEvents = [];
  const seenLanes = new Set();
  processedData.forEach((d) => {
    if (!seenLanes.has(d.title)) {
      seenLanes.add(d.title);
      firstEvents.push(d);
    }
  });

  const labels = svg
    .selectAll(".lane-label")
    .data(firstEvents)
    .enter()
    .append("text")
    .attr("class", "lane-label")
    .attr("x", (d) => xScale(d.title))
    .attr("y", (d) => yScale(d.time.getTime()) - 20)
    .text((d) =>
      d.title.length > 50 ? d.title.substring(0, 47) + "..." : d.title,
    )
    .call(wrap, 85);

  labels
    .filter((d) => d.url && d.url.startsWith("http"))
    .style("cursor", "pointer")
    .on("click", (event, d) => window.open(d.url, "_blank"));
}

export function drawSwimlaneChart(
  containerSelector,
  rawData,
  resetState = false,
  settings = {},
) {
  currentContainerSelector = containerSelector;
  currentSettings = settings;

  const parseLine = (line) => {
    const match = line.match(/^(\d{8}@\d{2}:\d{2})\s\[(.*?)\](?:\((.*?)\))?$/);
    if (!match) return null;
    const [_, datetimeStr, title, url = ""] = match;
    const year = datetimeStr.substring(0, 4),
      month = datetimeStr.substring(4, 6) - 1,
      day = datetimeStr.substring(6, 8),
      hour = datetimeStr.substring(9, 11),
      minute = datetimeStr.substring(12, 14);
    return {
      time: new Date(year, month, day, hour, minute),
      title: title.trim(),
      url: url,
    };
  };
  const data = (rawData || "")
    .trim()
    .split("\n")
    .map(parseLine)
    .filter((d) => d);

  const processedData = data
    .map((entry) => {
      if (
        !entry.url ||
        !settings.groupedUrls ||
        settings.groupedUrls.length === 0
      ) {
        return entry;
      }
      const matchingPrefix = settings.groupedUrls.find((prefix) =>
        entry.url.startsWith(prefix),
      );
      if (matchingPrefix) {
        try {
          const hostname = new URL(matchingPrefix).hostname;
          return { ...entry, title: hostname };
        } catch (e) {
          return { ...entry, title: matchingPrefix };
        }
      }
      return entry;
    })
    .sort((a, b) => a.time - b.time);

  // FIX: Assign the processed array to the correctly named variable
  currentProcessedData = processedData;

  if (resetState) {
    const allLanes = [...new Set(processedData.map((d) => d.title))];
    foldedLanes = new Set(allLanes);
  }

  render();
}
