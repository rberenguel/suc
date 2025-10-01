let currentProcessedData = [];
let currentContainerSelector = "";
let foldedLanes = new Set(); // Kept for logic simplicity, but will remain empty.
let currentSettings = {};

function wrap(text, width) {
  text.each(function () {
    const textNode = d3.select(this);
    const words = textNode.text().split(/\s+/).reverse();
    let word,
      line = [];
    const lineHeight = 1.1;
    const x = textNode.attr("x");
    const y = textNode.attr("y");
    let tspan = textNode.text(null).append("tspan").attr("x", x).attr("y", y);
    while ((word = words.pop())) {
      line.push(word);
      tspan.text(line.join(" "));
      if (tspan.node().getComputedTextLength() > width && line.length > 1) {
        line.pop();
        tspan.text(line.join(" "));
        line = [word];
        tspan = textNode
          .append("tspan")
          .attr("x", x)
          .attr("dy", `${lineHeight}em`)
          .text(word);
      }
    }
  });
}

function render() {
  const container = d3.select(currentContainerSelector);
  container.html("");

  if (!currentProcessedData || currentProcessedData.length === 0) {
    container
      .append("p")
      .style("text-align", "center")
      .style("padding", "2rem")
      .text("No data to display for this day.");
    return;
  }

  const groupedByLane = d3.group(
    currentProcessedData,
    (d) => d.theme || d.title,
  );

  const laneData = Array.from(groupedByLane, ([laneName, entries]) => {
    const subGroups = entries.reduce((acc, currentEvent, index) => {
      if (index === 0) {
        acc.push({ title: currentEvent.title, events: [currentEvent] });
        return acc;
      }
      const prevEvent = entries[index - 1];
      const lastGroup = acc[acc.length - 1];
      const timeDiffMinutes =
        (currentEvent.time - prevEvent.time) / (1000 * 60);

      if (
        currentEvent.title === lastGroup.title.trim() &&
        timeDiffMinutes <= 1.5
      ) {
        lastGroup.events.push(currentEvent);
      } else {
        acc.push({ title: currentEvent.title, events: [currentEvent] });
      }
      return acc;
    }, []);

    return {
      laneName,
      subGroups,
      startTime: d3.min(entries, (d) => d.time),
      endTime: d3.max(entries, (d) => d.time),
    };
  }).sort((a, b) => a.startTime - b.startTime);

  const PIXELS_PER_MINUTE = 15;
  const GAP_MINUTES = 2;

  // Simplified layout logic: everything is always unfolded.
  const layoutItems = laneData.flatMap((lane) =>
    lane.subGroups.map((sg) => ({
      startTime: sg.events[0].time,
      endTime: sg.events[sg.events.length - 1].time,
    })),
  );
  layoutItems.sort((a, b) => a.startTime - b.startTime);

  const timelineMap = [];
  let cumulativeVisibleMinutes = 0;
  let lastItemEndTime = d3.min(currentProcessedData, (d) => d.time);

  if (lastItemEndTime) {
    timelineMap.push({ time: lastItemEndTime, visibleMinutes: 0 });
  }

  layoutItems.forEach((item) => {
    const gapMinutes = (item.startTime - lastItemEndTime) / (1000 * 60);
    if (gapMinutes > 1) {
      cumulativeVisibleMinutes += GAP_MINUTES;
    }
    timelineMap.push({
      time: item.startTime,
      visibleMinutes: cumulativeVisibleMinutes,
    });
    let itemDurationMinutes = (item.endTime - item.startTime) / (1000 * 60);
    itemDurationMinutes = Math.max(0.5, itemDurationMinutes);
    cumulativeVisibleMinutes += itemDurationMinutes;
    timelineMap.push({
      time: item.endTime,
      visibleMinutes: cumulativeVisibleMinutes,
    });
    lastItemEndTime = new Date(Math.max(lastItemEndTime, item.endTime));
  });

  const finalTimelineMap = Array.from(
    d3.group(timelineMap, (d) => d.time.getTime()).values(),
    (v) => v[v.length - 1],
  );
  finalTimelineMap.sort((a, b) => a.time - b.time);

  const height = cumulativeVisibleMinutes * PIXELS_PER_MINUTE;
  const yScale = d3
    .scaleLinear()
    .domain(finalTimelineMap.map((d) => d.time.getTime()))
    .range(finalTimelineMap.map((d) => d.visibleMinutes * PIXELS_PER_MINUTE));

  const margin = { top: 60, right: 20, bottom: 20, left: 100 };
  const lanes = laneData.map((d) => d.laneName);
  const width = lanes.length * 120;

  const svg = container
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom);

  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

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

  g.append("g")
    .attr("class", "axis")
    .call(
      d3
        .axisLeft(yScale)
        .tickValues(finalTimelineMap.map((d) => d.time.getTime()))
        .tickFormat((d) => d3.timeFormat("%H:%M")(new Date(d))),
    );

  const themeLanes = g
    .selectAll(".theme-lane")
    .data(laneData)
    .enter()
    .append("g")
    .attr("class", "theme-lane");

  // Draw activity segments
  themeLanes
    .selectAll(".timeline-path")
    .data((d) => d.subGroups.map((sg) => ({ ...sg, laneName: d.laneName })))
    .enter()
    .append("line")
    .attr("class", "timeline-path")
    .attr("stroke", (d) => colorScale(d.laneName))
    .attr("x1", (d) => xScale(d.laneName))
    .attr("y1", (d) => yScale(d.events[0].time.getTime()))
    .attr("x2", (d) => xScale(d.laneName))
    .attr("y2", (d) => yScale(d.events[d.events.length - 1].time.getTime()))
    .style("cursor", "pointer")
    .on("mouseover", (event, d) => {
      // NEW: Tooltip on hover
      const tooltip = d3.select("#tooltip");
      const startTime = d.events[0].time.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      const endTime = d.events[d.events.length - 1].time.toLocaleTimeString(
        [],
        { hour: "2-digit", minute: "2-digit" },
      );
      const url = d.events[0].url || "";

      tooltip
        .style("opacity", 0.95)
        .html(
          `<b>${d.title}</b><br>${startTime} - ${endTime}<br><small style="word-break: break-all;">${url}</small>`,
        )
        .style("left", `${event.pageX + 15}px`)
        .style("top", `${event.pageY - 28}px`);
    })
    .on("mouseout", () => {
      d3.select("#tooltip").style("opacity", 0);
    });

  // Draw main lane title once at the top
  themeLanes
    .append("text")
    .attr("class", "lane-label")
    .attr("x", (d) => xScale(d.laneName))
    .attr("y", (d) => yScale(d.startTime.getTime()) - 25)
    .text((d) => d.laneName)
    .style("font-weight", "bold")
    .call(wrap, 100);

  // Add zoom and pan
  const zoom = d3.zoom().on("zoom", (event) => {
    g.attr("transform", event.transform);
  });
  svg.call(zoom);
}

export function drawSwimlaneChart(
  containerSelector,
  rawData,
  resetState = false,
  settings = {},
  themes = {},
) {
  currentContainerSelector = containerSelector;
  currentSettings = settings;

  if (resetState) {
    foldedLanes = new Set();
  }

  const parseLine = (line) => {
    const match = line.match(/^(\d{8}@\d{2}:\d{2})\s\[(.*?)\](?:\((.*?)\))?$/);
    if (!match) return null;
    const [_, datetimeStr, title, url = ""] = match;
    const year = parseInt(datetimeStr.substring(0, 4), 10),
      month = parseInt(datetimeStr.substring(4, 6), 10) - 1,
      day = parseInt(datetimeStr.substring(6, 8), 10),
      hour = parseInt(datetimeStr.substring(9, 11), 10),
      minute = parseInt(datetimeStr.substring(12, 14), 10);
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
    .filter(Boolean);

  const processedData = data
    .map((entry) => {
      const theme = themes[entry.url] || null;
      if (
        !entry.url ||
        !settings.groupedUrls ||
        settings.groupedUrls.length === 0
      ) {
        return { ...entry, theme };
      }
      const matchingPrefix = settings.groupedUrls.find((prefix) =>
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
    })
    .sort((a, b) => a.time - b.time);

  currentProcessedData = processedData;

  render();
}