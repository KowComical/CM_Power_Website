const ENERGY_TYPES = [
  "total", "coal", "gas", "oil", "nuclear", "hydro",
  "wind", "solar", "other", "fossil", "renewables"
];

const CONTINENTS = [
  "World", "Africa", "Asia", "Europe",
  "North America", "Oceania", "South America"
];

const STACKED_TYPES = ["Fossil", "Nuclear", "Renewables"];
const PAGE_TITLES = {
  overview: "Overview",
  line: "Daily Trends",
  stacked: "Generation Mix",
  scatter: "IEA Compare",
  map: "Global Map"
};

const MAP_DESKTOP_CHART_HEIGHT = 600;
const MAP_MOBILE_CHART_HEIGHT = 250;
const NON_MAP_COUNTRIES = new Set(["EU27&UK"]);
const MAP_SCALE_COLORS = [
  "#3158a5",
  "#2f7fc1",
  "#2da5bb",
  "#5dbc91",
  "#9dce68",
  "#d6d957",
  "#f1c54c",
  "#f2a543",
  "#ec733c",
  "#dc4537",
  "#b92732"
];
const MAP_NO_DATA_COLOR = "#d8d6ce";
const MAP_COUNTRY_NAME_BY_ISO3 = {
  USA: "United States",
  CZE: "Czech Republic",
  DOM: "Dominican Republic",
  BIH: "Bosnia & Herz"
};
// Centroids from the project's published GeoJSON for countries omitted at 110m resolution.
const MAP_POINT_COUNTRIES = [
  { name: "Singapore", coordinates: [103.8198, 1.3521] },
  { name: "Mauritius", coordinates: [57.5522, -20.3484] }
];
const MONTH_INDEX = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
};

const DAILY_TREND_LATEST_COLOR = "#d73027";
const DAILY_TREND_PURPLE_RAMP = ["#d9cbea", "#b79bcf", "#906db0", "#67488c"];
const DAILY_TREND_GREEN_RAMP = ["#b4dd9f", "#70c268", "#35994b", "#176f34"];
const DAILY_TREND_BLUE_RAMP = ["#b0d2ea", "#68a5d3", "#246fa8"];
const DAILY_TREND_PAPER = "#f5f3ee";
const DAILY_TREND_INK = "#1c1c1a";
const DAILY_TREND_MUTED = "#77746c";
const DAILY_TREND_GRID = "#dedbd3";
const DAILY_TREND_INACTIVE_COLOR = "#8c8981";
const DAILY_TREND_DRAW_DURATION = 1100;
const CONTINENT_SCATTER_COLORS = {
  Africa: "#756bb1",
  Asia: "#4f9a55",
  Europe: "#596579",
  "North America": "#d97b42",
  Oceania: "#3d91b4",
  "South America": "#c8a126",
  Other: "#a56a8b"
};
const SCATTER_CONTINENTS = [
  "Africa", "Asia", "Europe",
  "North America", "Oceania", "South America", "Other"
];
const SCATTER_TYPE_ORDER = [
  "total", "fossil", "renewables",
  "coal", "gas", "oil", "nuclear",
  "hydro", "wind", "solar", "other"
];
const SCATTER_LAYER_BASE = 10;
const SCATTER_REVEAL_DURATION = 1600;
const SCATTER_REVEAL_STAGGER = 100;
const SCATTER_REVEAL_EASING = "cubic-bezier(0.37, 0, 0.63, 1)";
const SCATTER_FILTER_FADE_DURATION = 380;
const SCATTER_REFLOW_FADE_DURATION = 540;
const SCATTER_FILTER_EASING = "cubic-bezier(0.37, 0, 0.63, 1)";

const state = {
  tab: "overview",
  energy: "total",
  continent: "World",
  stacked: "Fossil",
  details: false,
  mapDateIndex: null
};

const jsonCache = new Map();
const mapDataCache = new Map();
const charts = {};
const chartRenderState = {};
let scatterRecords = null;
let scatterMetadata = null;
let countryContinentMap = null;
let scatterRuntime = null;
let dailyTrendRuntime = null;
let worldMapGeoJson = null;
let mapRuntime = null;
let renderSerial = 0;
let mapUpdateSerial = 0;
let mapSliderFrame = null;
let scatterSelectedContinents = null;
let scatterRevealRequested = false;
let scatterSelectionTransitionActive = false;

const els = {
  status: document.getElementById("statusText"),
  title: document.getElementById("pageTitle"),
  energy: document.getElementById("energySelect"),
  continent: document.getElementById("continentSelect"),
  stacked: document.getElementById("stackedSelect"),
  details: document.getElementById("detailsToggle"),
  scorecard: document.getElementById("scorecardContainer"),
  lineChart: document.getElementById("lineChart"),
  stackedChart: document.getElementById("stackedChart"),
  scatterMeta: document.getElementById("scatterMeta"),
  scatterLegend: document.getElementById("scatterLegend"),
  scatterChart: document.getElementById("scatterChart"),
  mapChart: document.getElementById("mapChart"),
  mapDateSlider: document.getElementById("mapDateSlider"),
  mapDateLabel: document.getElementById("mapDateLabel"),
  mapDateValue: document.getElementById("mapDateValue"),
  mapDateStart: document.getElementById("mapDateStart"),
  mapDateEnd: document.getElementById("mapDateEnd"),
  mapEnergyLabel: document.getElementById("mapEnergyLabel"),
  mapCountryCount: document.getElementById("mapCountryCount"),
  mapTotalValue: document.getElementById("mapTotalValue"),
  mapCoverageNote: document.getElementById("mapCoverageNote"),
  mapTooltip: document.getElementById("mapTooltip"),
  mapTooltipCountry: document.getElementById("mapTooltipCountry"),
  mapTooltipDate: document.getElementById("mapTooltipDate"),
  mapTooltipMetric: document.getElementById("mapTooltipMetric"),
  mapTooltipValue: document.getElementById("mapTooltipValue")
};

function titleCase(value) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function fillSelect(select, values, formatter = titleCase) {
  select.innerHTML = "";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = formatter(value);
    select.appendChild(option);
  });
}

function setStatus(message) {
  els.status.textContent = message;
}

function showError(container, error) {
  container.replaceChildren();
  const errorBox = document.createElement("div");
  errorBox.className = "error-box";
  errorBox.append(
    "Failed to load this view. Start a local web server from the project root if you opened the file directly.",
    document.createElement("br"),
    error.message
  );
  container.appendChild(errorBox);
}

async function fetchText(path) {
  const response = await fetch(encodeURI(path));
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${path}`);
  }
  return response.text();
}

async function fetchJson(path) {
  if (!jsonCache.has(path)) {
    const request = fetchText(path)
      .then((text) => JSON.parse(text))
      .catch((error) => {
        jsonCache.delete(path);
        throw error;
      });
    jsonCache.set(path, request);
  }
  return jsonCache.get(path);
}

function cloneOption(option) {
  return JSON.parse(JSON.stringify(option));
}

function chartContainerWidth(container) {
  return Math.round(container.clientWidth || container.parentElement?.clientWidth || window.innerWidth);
}

function reuseRenderedChart(container, name, renderKey) {
  const chart = charts[name];
  const previous = chartRenderState[name];
  if (!chart || chart.isDisposed() || !previous || previous.key !== renderKey) {
    return false;
  }

  const width = chartContainerWidth(container);
  if (width > 0 && width !== previous.width) {
    chart.resize({ width, height: previous.height, silent: true });
    previous.width = width;
  }
  return true;
}

function updateVisibleControls() {
  setHidden('[data-filter="continent"]', !["overview", "line"].includes(state.tab));
  setHidden('[data-filter="details"]', state.tab !== "overview");
  setHidden('[data-filter="stacked"]', state.tab !== "stacked");
  els.energy.closest(".control-group").hidden = state.tab === "stacked" || state.tab === "scatter";
}

function setHidden(selector, hidden) {
  const element = document.querySelector(selector);
  if (element) {
    element.hidden = hidden;
  }
}

function activateTab(nextTab) {
  if (nextTab === "scatter") {
    scatterRevealRequested = true;
  }
  state.tab = nextTab;
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === nextTab);
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.panel === nextTab);
  });
  els.title.textContent = PAGE_TITLES[nextTab];
  updateVisibleControls();
  render();
}

function isCurrentRender(renderId) {
  return renderId === renderSerial;
}

async function renderOverview(renderId) {
  setStatus("Loading overview...");
  const detailName = state.details ? "none" : "visible";
  const path = `tools/data_description/${state.energy}_${state.continent}_${detailName}.html`;
  try {
    const html = await fetchText(path);
    if (!isCurrentRender(renderId)) {
      return;
    }
    els.scorecard.innerHTML = html;
    setStatus(`${titleCase(state.energy)} / ${state.continent}`);
  } catch (error) {
    if (!isCurrentRender(renderId)) {
      return;
    }
    showError(els.scorecard, error);
    setStatus("Overview failed");
  }
}

function chartHeight(config) {
  return Math.max(620, Math.round(config.PLOT_HEIGHT * config.ROWS_PER_GRID * 1.2));
}

function dailyTrendColumns(width, gridCount) {
  if (width < 620) {
    return 1;
  }
  if (width < 980) {
    return Math.min(2, gridCount);
  }
  if (width < 1320) {
    return Math.min(3, gridCount);
  }
  return Math.min(4, gridCount);
}

function dailyTrendLayout(option, containerWidth) {
  const gridCount = Math.max(1, Array.isArray(option.grid) ? option.grid.length : 1);
  const columns = dailyTrendColumns(containerWidth, gridCount);
  const rows = Math.max(1, Math.ceil(gridCount / columns));
  const rowHeight = columns === 1 ? 360 : columns === 2 ? 320 : columns === 3 ? 292 : 276;
  const rowGap = rows === 1 ? 0 : 30;
  const topBand = containerWidth < 330 ? 210 : containerWidth < 620 ? 176 : 112;
  const bottomBand = 34;
  const height = topBand + rows * rowHeight + Math.max(0, rows - 1) * rowGap + bottomBand;

  return {
    columns,
    rows,
    rowHeight,
    rowGap,
    topBand,
    bottomBand,
    height: Math.max(460, height),
    width: Math.max(320, containerWidth)
  };
}

function setChart(container, name, option, height, renderKey = null) {
  container.style.height = `${height}px`;
  if (charts[name]) {
    if (name === "line") {
      cancelDailyTrendDraw(false);
    }
    charts[name].dispose();
  }
  const revealScatter = name === "scatter" && scatterRevealRequested;
  if (revealScatter) {
    container.style.visibility = "hidden";
  }
  charts[name] = echarts.init(container, null, {
    renderer: "canvas",
    useDirtyRect: name !== "line"
  });
  const scatterRenderReady = revealScatter
    ? waitForScatterRender(charts[name])
    : Promise.resolve();
  optimizeChartOption(option, name);
  if (name === "line" && Array.isArray(option.series)) {
    option.series.forEach((series, index) => {
      series.id = `daily-line-${index}`;
    });
    prepareDailyTrendRuntime(charts[name], option);
  }
  charts[name].setOption(option, true);
  if (name === "line") {
    cacheDailyTrendLineSegments(charts[name]);
    bindDailyTrendTooltip(charts[name]);
  }
  if (revealScatter) {
    scatterRevealRequested = false;
    revealScatterLayers(charts[name], container, scatterRenderReady);
  } else if (name === "scatter") {
    syncScatterLayerVisibility(charts[name]);
  }
  chartRenderState[name] = {
    key: renderKey,
    width: chartContainerWidth(container),
    height
  };
  if (name === "line") {
    charts[name].on("legendselectchanged", (params) => {
      cacheDailyTrendLineSegments(charts[name], params.name, true);
      refreshDailyTrendYearStyles(charts[name], params.selected);
      refreshDailyTrendTooltipTargets(charts[name]);
      animateDailyTrendYear(
        charts[name],
        params.name,
        params.selected?.[params.name] !== false
      );
    });
  }
}

function optimizeChartOption(option, chartName) {
  option.animation = false;
  option.useUTC = true;
  if (chartName === "line") {
    applyDailyTrendTheme(option);
  }
  formatDailyTrendAxes(option, chartName);

  if (option.tooltip) {
    option.tooltip.transitionDuration = 0;
    option.tooltip.confine = true;
    option.tooltip.triggerOn = chartName === "line" ? "none" : "mousemove|click";
    option.tooltip.axisPointer = option.tooltip.axisPointer || {};
    option.tooltip.axisPointer.animation = false;
  }

  if (!Array.isArray(option.series)) {
    return;
  }

  option.series.forEach((series) => {
    series.animation = false;
    if (series.type === "scatter") {
      series.emphasis = {
        scale: 1.18,
        itemStyle: { opacity: 1, borderColor: "#3f4652", borderWidth: 1.4 }
      };
    } else if (series.type !== "map") {
      series.emphasis = { disabled: true };
    }
    series.select = { disabled: true };
    series.selectedMode = false;

    if (series.type === "line") {
      series.silent = chartName === "line";
      series.showSymbol = false;
      series.hoverAnimation = false;
      series.sampling = series.sampling || "lttb";
    }

    if (series.type === "scatter") {
      series.symbolSize = series.symbolSize || 4;
      series.large = series.large ?? true;
      series.largeThreshold = 600;
    }
  });

  if (chartName === "line") {
    styleDailyTrendSeries(option);
  }
}

function getDailyTrendLegend(option) {
  return Array.isArray(option.legend) ? option.legend[0] : option.legend;
}

function dailyTrendYearSelected(selected, year) {
  return !selected || selected[year] !== false;
}

function interpolateDailyTrendColor(start, end, amount) {
  const channels = [1, 3, 5].map((offset) => {
    const from = Number.parseInt(start.slice(offset, offset + 2), 16);
    const to = Number.parseInt(end.slice(offset, offset + 2), 16);
    return Math.round(from + (to - from) * amount).toString(16).padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

function sampleDailyTrendRamp(ramp, count) {
  if (count <= 0) {
    return [];
  }
  if (count === 1) {
    return [ramp[ramp.length - 1]];
  }
  return Array.from({ length: count }, (_, index) => {
    const position = index * (ramp.length - 1) / (count - 1);
    const left = Math.floor(position);
    const right = Math.min(ramp.length - 1, Math.ceil(position));
    return interpolateDailyTrendColor(ramp[left], ramp[right], position - left);
  });
}

function dailyTrendYearPalette(yearNames) {
  const years = [...new Set(yearNames.filter((name) => /^\d+$/.test(name)).map(String))]
    .sort((a, b) => Number(a) - Number(b));
  const palette = {};
  const latestYear = years.pop();
  if (!latestYear) {
    return palette;
  }

  const groupCount = years.length >= 9 ? 3 : Math.min(2, years.length);
  const ramps = groupCount === 3
    ? [DAILY_TREND_PURPLE_RAMP, DAILY_TREND_GREEN_RAMP, DAILY_TREND_BLUE_RAMP]
    : groupCount === 2
      ? [DAILY_TREND_GREEN_RAMP, DAILY_TREND_BLUE_RAMP]
      : [DAILY_TREND_BLUE_RAMP];
  let yearOffset = 0;
  ramps.forEach((ramp, groupIndex) => {
    const remainingYears = years.length - yearOffset;
    const remainingGroups = ramps.length - groupIndex;
    const groupSize = Math.ceil(remainingYears / remainingGroups);
    const groupYears = years.slice(yearOffset, yearOffset + groupSize);
    const groupColors = sampleDailyTrendRamp(ramp, groupYears.length);
    groupYears.forEach((year, index) => {
      palette[year] = groupColors[index];
    });
    yearOffset += groupSize;
  });
  palette[latestYear] = DAILY_TREND_LATEST_COLOR;
  return palette;
}

function setDailyTrendRecentYearsSelected(option, visibleCount = 4) {
  const legend = getDailyTrendLegend(option);
  if (!legend || !Array.isArray(legend.data)) {
    return;
  }

  const yearNames = legend.data
    .map((item) => (typeof item === "string" ? item : item.name))
    .filter((name) => /^\d+$/.test(name))
    .sort((a, b) => Number(a) - Number(b));
  const visibleYears = new Set(yearNames.slice(-visibleCount));

  legend.selected = legend.selected || {};
  legend.data.forEach((item) => {
    const name = typeof item === "string" ? item : item.name;
    if (name) {
      legend.selected[name] = !visibleYears.size || visibleYears.has(name);
    }
  });
}

function styleDailyTrendSeries(option) {
  if (!Array.isArray(option.series)) {
    return;
  }

  const yearNames = option.series.map((series) => series.name);
  const yearColors = dailyTrendYearPalette(yearNames);
  const latestYear = yearNames
    .filter((name) => /^\d+$/.test(name))
    .sort((a, b) => Number(b) - Number(a))[0];

  option.series.forEach((series) => {
    if (series.type !== "line") {
      return;
    }

    const color = yearColors[series.name] || DAILY_TREND_LATEST_COLOR;

    const isLatest = series.name === latestYear;
    series.z = isLatest ? 20 : 5;
    series.zlevel = 0;
    series.lineStyle = {
      ...(series.lineStyle || {}),
      color,
      width: isLatest ? 2.15 : 1.45,
      opacity: isLatest ? 1 : 0.9,
      cap: "round",
      join: "round"
    };
    series.itemStyle = {
      ...(series.itemStyle || {}),
      color,
      borderColor: DAILY_TREND_PAPER,
      borderWidth: 1,
      opacity: isLatest ? 1 : 0.9
    };
    series.sampling = isLatest ? false : "lttb";
    series.showSymbol = isLatest;
    series.showAllSymbol = isLatest;
    series.symbol = "circle";
    const monthlyAnchorIndexes = new Set(
      (option.xAxis?.[series.xAxisIndex]?.data || [])
        .map((label, index) => (/-01$/.test(label) ? index : -1))
        .filter((index) => index >= 0)
    );
    series.symbolSize = isLatest
      ? (value, params) => (monthlyAnchorIndexes.has(params.dataIndex) ? 4 : 0)
      : 0;
    delete series.markPoint;
  });
}

function styleDailyTrendLegendItems(option) {
  const legend = getDailyTrendLegend(option);
  if (!legend || !Array.isArray(legend.data)) {
    return;
  }

  const yearColors = dailyTrendYearPalette(
    legend.data.map((item) => (typeof item === "string" ? item : item.name))
  );
  legend.data = styledDailyTrendLegendItems(legend.data, legend.selected, yearColors);
}

function styledDailyTrendLegendItems(items) {
  return items.map((item) => {
    const name = typeof item === "string" ? item : item.name;
    return {
      ...(typeof item === "string" ? { name } : item),
      icon: "none"
    };
  });
}

function dailyTrendLegendSwatchToken(name) {
  return `dailySwatch${String(name).replace(/\W/g, "")}`;
}

function dailyTrendLegendYearToken(name) {
  return `dailyYear${String(name).replace(/\W/g, "")}`;
}

function dailyTrendLegendFormatter(name) {
  return `{${dailyTrendLegendSwatchToken(name)}| }{${dailyTrendLegendYearToken(name)}|${name}}`;
}

function dailyTrendLegendRichStyles(yearColors, selected = {}) {
  const styles = {};
  Object.entries(yearColors).forEach(([name, color]) => {
    const isSelected = dailyTrendYearSelected(selected, name);
    styles[dailyTrendLegendSwatchToken(name)] = {
      width: 24,
      height: isSelected ? 4 : 1,
      verticalAlign: "middle",
      backgroundColor: isSelected ? color : DAILY_TREND_INACTIVE_COLOR,
      borderRadius: isSelected ? 2 : 0
    };
    styles[dailyTrendLegendYearToken(name)] = {
      color: isSelected
        ? interpolateDailyTrendColor(color, DAILY_TREND_INK, 0.22)
        : DAILY_TREND_INACTIVE_COLOR,
      fontWeight: 600,
      padding: [2, 3, 2, 6]
    };
  });
  return styles;
}

function prepareDailyTrendRuntime(chart, option) {
  const legend = getDailyTrendLegend(option);
  dailyTrendRuntime = {
    chart,
    legendItems: Array.isArray(legend?.data)
      ? legend.data.map((item) => (typeof item === "string" ? item : { ...item }))
      : [],
    yearColors: dailyTrendYearPalette(option.series.map((series) => series.name)),
    latestYear: option.series
      .map((series) => series.name)
      .filter((name) => /^\d+$/.test(name))
      .sort((left, right) => Number(right) - Number(left))[0],
    axisData: (option.xAxis || []).map((axis) => axis.data || []),
    series: option.series.map((series) => ({
      id: series.id,
      name: series.name,
      xAxisIndex: series.xAxisIndex,
      data: series.data,
      lineStyle: { ...(series.lineStyle || {}) },
      drawSegments: null
    })),
    drawOverlay: null,
    drawTimer: null,
    drawToken: 0,
    drawingYear: null,
    drawingRevealsYear: false,
    drawingSeries: [],
    tooltipTargets: [],
    tooltipFrame: null,
    tooltipPoint: null,
    tooltipLastKey: null,
    tooltipVisible: false,
    tooltipElement: null
  };
}

function refreshDailyTrendYearStyles(chart, selected = {}) {
  if (!dailyTrendRuntime || dailyTrendRuntime.chart !== chart) {
    return;
  }

  chart.setOption({
    legend: {
      selected: { ...selected },
      data: styledDailyTrendLegendItems(
        dailyTrendRuntime.legendItems,
        selected,
        dailyTrendRuntime.yearColors
      ),
      formatter: dailyTrendLegendFormatter,
      textStyle: {
        rich: dailyTrendLegendRichStyles(dailyTrendRuntime.yearColors, selected)
      }
    }
  }, { notMerge: false, lazyUpdate: false, silent: true });
}

function refreshDailyTrendTooltipTargets(chart) {
  if (!dailyTrendRuntime || dailyTrendRuntime.chart !== chart) {
    return;
  }
  const selected = chart.getOption().legend?.[0]?.selected;
  const modelById = new Map(
    chart.getModel().getSeries().map((seriesModel) => [seriesModel.id, seriesModel])
  );
  const targetsByAxis = new Map();
  dailyTrendRuntime.series
    .filter((item) => dailyTrendYearSelected(selected, item.name))
    .sort((left, right) => Number(left.name) - Number(right.name))
    .forEach((item) => {
      const seriesModel = modelById.get(item.id);
      const xAxisIndex = item.xAxisIndex;
      if (!seriesModel) {
        return;
      }
      const coordinateSystem = seriesModel.coordinateSystem;
      const rect = coordinateSystem?.getArea?.() || coordinateSystem?.grid?.getRect?.();
      const dataCount = dailyTrendRuntime.axisData[xAxisIndex]?.length || 0;
      if (!rect || !dataCount) {
        return;
      }
      if (!targetsByAxis.has(xAxisIndex)) {
        targetsByAxis.set(xAxisIndex, {
          coordinateSystem,
          dataCount,
          labels: dailyTrendRuntime.axisData[xAxisIndex],
          series: [],
          xAxisIndex
        });
      }
      targetsByAxis.get(xAxisIndex).series.push(item);
    });
  dailyTrendRuntime.tooltipTargets = [...targetsByAxis.values()];
  dailyTrendRuntime.tooltipLastKey = null;
  hideDailyTrendTooltip(chart);
}

function hideDailyTrendTooltip(chart) {
  if (!dailyTrendRuntime || dailyTrendRuntime.chart !== chart) {
    return;
  }
  dailyTrendRuntime.tooltipLastKey = null;
  dailyTrendRuntime.tooltipPoint = null;
  if (dailyTrendRuntime.tooltipVisible) {
    dailyTrendRuntime.tooltipElement.hidden = true;
    dailyTrendRuntime.tooltipVisible = false;
  }
}

function renderDailyTrendTooltip(target, dataIndex) {
  const tooltip = dailyTrendRuntime.tooltipElement;
  const rows = target.series
    .map((item) => ({
      color: dailyTrendRuntime.yearColors[item.name],
      name: item.name,
      value: item.data?.[dataIndex]
    }))
    .filter((item) => item.value != null && item.value !== "-");
  if (!rows.length) {
    return false;
  }

  const header = document.createElement("div");
  header.className = "daily-trend-tooltip-date";
  header.textContent = target.labels[dataIndex] || "";
  tooltip.replaceChildren(header);
  rows.forEach((item) => {
    const row = document.createElement("div");
    row.className = "daily-trend-tooltip-row";
    const label = document.createElement("span");
    const marker = document.createElement("i");
    marker.className = "daily-trend-tooltip-marker";
    marker.style.backgroundColor = item.color;
    marker.setAttribute("aria-hidden", "true");
    label.append(marker, document.createTextNode(item.name));
    const value = document.createElement("strong");
    value.textContent = formatDailyTrendValue(item.value);
    row.append(label, value);
    tooltip.append(row);
  });
  return true;
}

function showDailyTrendTooltipAtPoint(chart, point) {
  if (!dailyTrendRuntime || dailyTrendRuntime.chart !== chart || chart.isDisposed()) {
    return;
  }
  const target = dailyTrendRuntime.tooltipTargets.find((item) => (
    item.coordinateSystem?.containPoint?.(point)
  ));
  if (!target) {
    hideDailyTrendTooltip(chart);
    return;
  }
  const rect = target.coordinateSystem.getArea?.() || target.coordinateSystem.grid?.getRect?.();
  if (!rect || rect.width <= 0) {
    hideDailyTrendTooltip(chart);
    return;
  }
  const ratio = Math.max(0, Math.min(1, (point[0] - rect.x) / rect.width));
  const dataIndex = Math.round(ratio * (target.dataCount - 1));
  const tooltipKey = `${target.xAxisIndex}:${dataIndex}`;
  if (tooltipKey === dailyTrendRuntime.tooltipLastKey) {
    return;
  }
  if (!renderDailyTrendTooltip(target, dataIndex)) {
    hideDailyTrendTooltip(chart);
    return;
  }
  dailyTrendRuntime.tooltipLastKey = tooltipKey;
  dailyTrendRuntime.tooltipVisible = true;
  const tooltip = dailyTrendRuntime.tooltipElement;
  tooltip.hidden = false;
  const offset = 12;
  let left = point[0] + offset;
  let top = point[1] + offset;
  if (left + tooltip.offsetWidth > chart.getWidth() - 8) {
    left = point[0] - tooltip.offsetWidth - offset;
  }
  if (top + tooltip.offsetHeight > rect.y + rect.height) {
    top = point[1] - tooltip.offsetHeight - offset;
  }
  tooltip.style.transform = `translate3d(${Math.max(8, left)}px, ${Math.max(8, top)}px, 0)`;
}

function bindDailyTrendTooltip(chart) {
  if (!dailyTrendRuntime || dailyTrendRuntime.chart !== chart) {
    return;
  }
  chart.getDom().querySelector(".daily-trend-tooltip")?.remove();
  const tooltip = document.createElement("div");
  tooltip.className = "daily-trend-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  chart.getDom().append(tooltip);
  dailyTrendRuntime.tooltipElement = tooltip;
  refreshDailyTrendTooltipTargets(chart);
  const queueTooltip = (event) => {
    if (!dailyTrendRuntime || dailyTrendRuntime.chart !== chart) {
      return;
    }
    dailyTrendRuntime.tooltipPoint = [event.offsetX, event.offsetY];
    if (dailyTrendRuntime.tooltipFrame != null) {
      return;
    }
    dailyTrendRuntime.tooltipFrame = requestAnimationFrame(() => {
      if (!dailyTrendRuntime || dailyTrendRuntime.chart !== chart) {
        return;
      }
      dailyTrendRuntime.tooltipFrame = null;
      if (dailyTrendRuntime.tooltipPoint) {
        showDailyTrendTooltipAtPoint(chart, dailyTrendRuntime.tooltipPoint);
      }
    });
  };
  chart.getZr().on("mousemove", queueTooltip);
  chart.getZr().on("click", queueTooltip);
  chart.getZr().on("globalout", () => hideDailyTrendTooltip(chart));
}

function dailyTrendLineSegments(seriesModel) {
  const data = seriesModel?.getData();
  if (!data) {
    return [];
  }
  const layoutPoints = data.getLayout("points");
  if (!layoutPoints || layoutPoints.length < 2) {
    return [];
  }
  const segments = [];
  let segment = [];
  for (let index = 0; index < data.count(); index += 1) {
    const point = [layoutPoints[index * 2], layoutPoints[index * 2 + 1]];
    if (Number.isFinite(point[0]) && Number.isFinite(point[1])) {
      segment.push(point);
    } else if (segment.length) {
      segments.push(segment);
      segment = [];
    }
  }
  if (segment.length) {
    segments.push(segment);
  }
  return segments;
}

function cacheDailyTrendLineSegments(chart, year = null, forceYear = false) {
  if (!dailyTrendRuntime || dailyTrendRuntime.chart !== chart) {
    return;
  }
  const modelById = new Map(
    chart.getModel().getSeries().map((seriesModel) => [seriesModel.id, seriesModel])
  );
  const selected = chart.getOption().legend?.[0]?.selected;
  dailyTrendRuntime.series.forEach((item) => {
    if (year && item.name !== year) {
      return;
    }
    if (
      !forceYear &&
      !dailyTrendYearSelected(selected, item.name) &&
      !item.drawSegments
    ) {
      return;
    }
    const segments = dailyTrendLineSegments(modelById.get(item.id));
    if (segments.length) {
      item.drawSegments = segments;
    }
  });
}

function dailyTrendSeriesInViewport(chart, yearSeries) {
  const chartBounds = chart.getDom().getBoundingClientRect();
  const viewportMargin = 80;
  const modelById = new Map(
    chart.getModel().getSeries().map((seriesModel) => [seriesModel.id, seriesModel])
  );
  return yearSeries.filter((item) => {
    const coordinateSystem = modelById.get(item.id)?.coordinateSystem;
    const rect = coordinateSystem?.getArea?.() || coordinateSystem?.grid?.getRect?.();
    if (!rect) {
      return false;
    }
    const top = chartBounds.top + rect.y;
    const bottom = top + rect.height;
    return bottom >= -viewportMargin && top <= window.innerHeight + viewportMargin;
  });
}

function appendDailyTrendOverlaySeries(
  overlay,
  item,
  modelById,
  clipPath = null,
  staysInFront = false
) {
  const currentSegments = dailyTrendLineSegments(modelById.get(item.id));
  if (currentSegments.length) {
    item.drawSegments = currentSegments;
  }
  const segments = currentSegments.length ? currentSegments : (item.drawSegments || []);
  const points = segments.flat();
  if (!points.length) {
    return null;
  }
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const left = Math.min(...xs) - 3;
  const right = Math.max(...xs) + 3;
  const top = Math.min(...ys) - 4;
  const bottom = Math.max(...ys) + 4;
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const clip = document.createElement("div");
  clip.className = staysInFront
    ? "daily-trend-draw-segment daily-trend-draw-front"
    : "daily-trend-draw-segment";
  clip.style.left = `${left}px`;
  clip.style.top = `${top}px`;
  clip.style.width = `${width}px`;
  clip.style.height = `${height}px`;
  if (clipPath) {
    clip.style.clipPath = clipPath;
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  segments.forEach((segment) => {
    if (segment.length < 2) {
      return;
    }
    const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    polyline.setAttribute(
      "points",
      segment.map((point) => `${point[0] - left},${point[1] - top}`).join(" ")
    );
    polyline.setAttribute("fill", "none");
    polyline.setAttribute("stroke", item.lineStyle.color);
    polyline.setAttribute("stroke-width", String(item.lineStyle.width));
    polyline.setAttribute("stroke-linecap", "round");
    polyline.setAttribute("stroke-linejoin", "round");
    polyline.setAttribute("opacity", String(item.lineStyle.opacity));
    svg.append(polyline);
  });
  clip.append(svg);
  overlay.append(clip);
  return clip;
}

function dailyTrendDrawOverlay(chart, yearSeries, startsVisible = false) {
  const modelById = new Map(
    chart.getModel().getSeries().map((seriesModel) => [seriesModel.id, seriesModel])
  );
  const overlay = document.createElement("div");
  overlay.className = "daily-trend-draw-overlay";
  overlay.setAttribute("aria-hidden", "true");
  const clipElements = [];
  let animatedGroupCount = 0;

  yearSeries.forEach((item) => {
    const clip = appendDailyTrendOverlaySeries(
      overlay,
      item,
      modelById,
      startsVisible ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)"
    );
    if (!clip) {
      return;
    }
    clipElements.push(clip);
    animatedGroupCount += 1;
  });

  if (!animatedGroupCount) {
    return null;
  }

  const latestYear = dailyTrendRuntime?.latestYear;
  const animatedYear = yearSeries[0]?.name;
  const selected = chart.getOption().legend?.[0]?.selected;
  if (
    latestYear && animatedYear !== latestYear &&
    dailyTrendYearSelected(selected, latestYear)
  ) {
    const animatedAxes = new Set(yearSeries.map((item) => item.xAxisIndex));
    dailyTrendRuntime.series
      .filter((item) => item.name === latestYear && animatedAxes.has(item.xAxisIndex))
      .forEach((item) => {
        appendDailyTrendOverlaySeries(overlay, item, modelById, null, true);
      });
  }
  chart.getDom().append(overlay);
  overlay.dailyTrendClipElements = clipElements;
  return overlay;
}

function removeDailyTrendDrawOverlay(chart, overlay) {
  if (!chart || chart.isDisposed() || !overlay) {
    return;
  }
  overlay.remove();
}

function setDailyTrendSeriesViewsVisible(chart, yearSeries, visible) {
  if (!chart || typeof chart.getViewOfSeriesModel !== "function") {
    return false;
  }
  const targetIds = new Set(yearSeries.map((item) => item.id));
  chart.getModel().getSeries().forEach((seriesModel) => {
    if (!targetIds.has(seriesModel.id)) {
      return;
    }
    const view = chart.getViewOfSeriesModel(seriesModel);
    if (view?.group) {
      view.group.attr({ ignore: !visible });
    }
  });
  chart.getZr().refresh();
  return true;
}

function cancelDailyTrendDraw(restoreView = true, year = null) {
  if (!dailyTrendRuntime) {
    return;
  }
  dailyTrendRuntime.drawToken += 1;
  if (dailyTrendRuntime.drawTimer != null) {
    clearTimeout(dailyTrendRuntime.drawTimer);
    dailyTrendRuntime.drawTimer = null;
  }
  if (dailyTrendRuntime.drawOverlay) {
    removeDailyTrendDrawOverlay(
      dailyTrendRuntime.chart,
      dailyTrendRuntime.drawOverlay
    );
    dailyTrendRuntime.drawOverlay = null;
  }
  const drawingYear = dailyTrendRuntime.drawingYear;
  const drawingRevealsYear = dailyTrendRuntime.drawingRevealsYear;
  const drawingSeries = dailyTrendRuntime.drawingSeries;
  dailyTrendRuntime.drawingYear = null;
  dailyTrendRuntime.drawingRevealsYear = false;
  dailyTrendRuntime.drawingSeries = [];
  if (
    !restoreView || !drawingRevealsYear || !drawingYear || !drawingSeries.length ||
    (year && drawingYear !== year) ||
    !dailyTrendRuntime.chart || dailyTrendRuntime.chart.isDisposed()
  ) {
    return;
  }
  setDailyTrendSeriesViewsVisible(
    dailyTrendRuntime.chart,
    drawingSeries,
    true
  );
}

function animateDailyTrendYear(chart, year, revealYear = true) {
  if (!dailyTrendRuntime || dailyTrendRuntime.chart !== chart || !/^\d+$/.test(year)) {
    return;
  }
  cancelDailyTrendDraw(true);
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  const yearSeries = dailyTrendRuntime.series.filter((item) => item.name === year);
  if (!yearSeries.length) {
    return;
  }
  const animatedYearSeries = dailyTrendSeriesInViewport(chart, yearSeries);
  if (!animatedYearSeries.length) {
    return;
  }

  const token = ++dailyTrendRuntime.drawToken;
  dailyTrendRuntime.drawingYear = year;
  dailyTrendRuntime.drawingRevealsYear = revealYear;
  dailyTrendRuntime.drawingSeries = animatedYearSeries;
  if (revealYear) {
    setDailyTrendSeriesViewsVisible(chart, animatedYearSeries, true);
  }
  const overlay = dailyTrendDrawOverlay(chart, animatedYearSeries, !revealYear);
  if (!overlay) {
    dailyTrendRuntime.drawingYear = null;
    dailyTrendRuntime.drawingRevealsYear = false;
    dailyTrendRuntime.drawingSeries = [];
    return;
  }
  dailyTrendRuntime.drawOverlay = overlay;
  setDailyTrendSeriesViewsVisible(chart, animatedYearSeries, false);
  chart.getZr().flush();
  overlay.getBoundingClientRect();
  requestAnimationFrame(() => {
    if (
      !dailyTrendRuntime || dailyTrendRuntime.chart !== chart ||
      dailyTrendRuntime.drawToken !== token || chart.isDisposed()
    ) {
      return;
    }
    overlay.dailyTrendClipElements.forEach((clip) => {
      clip.style.clipPath = revealYear
        ? "inset(0 0% 0 0)"
        : "inset(0 100% 0 0)";
    });
  });
  dailyTrendRuntime.drawTimer = setTimeout(() => {
    if (
      !dailyTrendRuntime || dailyTrendRuntime.chart !== chart ||
      dailyTrendRuntime.drawToken !== token || chart.isDisposed()
    ) {
      return;
    }
    if (revealYear) {
      setDailyTrendSeriesViewsVisible(chart, animatedYearSeries, true);
    }
    removeDailyTrendDrawOverlay(chart, overlay);
    dailyTrendRuntime.drawOverlay = null;
    dailyTrendRuntime.drawTimer = null;
    dailyTrendRuntime.drawingYear = null;
    dailyTrendRuntime.drawingRevealsYear = false;
    dailyTrendRuntime.drawingSeries = [];
  }, DAILY_TREND_DRAW_DURATION + 40);
}

function applyDailyTrendTheme(option) {
  option.backgroundColor = DAILY_TREND_PAPER;
  option.color = Object.values(dailyTrendYearPalette(option.series.map((series) => series.name)));
  const headerWidth = chartContainerWidth(els.lineChart);
  const compactHeader = headerWidth < 620;
  const narrowHeader = headerWidth < 380;

  const titles = Array.isArray(option.title) ? option.title : [option.title].filter(Boolean);
  titles.forEach((title, index) => {
    title.left = index === 0 ? "center" : title.left;
    title.top = index === 0 ? 16 : title.top;
    title.text = index === 0
      ? narrowHeader
        ? `${titleCase(state.energy)} Daily Trends (${state.continent})`
        : `${titleCase(state.energy)} Daily Generation Trends (${state.continent})`
      : title.text;
    delete title.subtext;
    delete title.subtextStyle;
    title.textStyle = {
      ...(title.textStyle || {}),
      align: index === 0 ? "center" : title.textStyle?.align,
      color: index === 0 ? DAILY_TREND_INK : "#393833",
      fontSize: index === 0 ? (narrowHeader ? 14 : compactHeader ? 15 : 18) : 13,
      fontWeight: 700
    };
  });

  if (option.legend) {
    setDailyTrendRecentYearsSelected(option);
    option.legend.left = "center";
    option.legend.top = 52;
    option.legend.icon = "roundRect";
    option.legend.itemWidth = 0;
    option.legend.itemHeight = 0;
    option.legend.itemGap = 14;
    option.legend.borderWidth = 0;
    option.legend.borderRadius = 0;
    option.legend.backgroundColor = "transparent";
    option.legend.padding = 0;
    option.legend.inactiveColor = DAILY_TREND_INACTIVE_COLOR;
    option.legend.inactiveBorderColor = DAILY_TREND_INACTIVE_COLOR;
    option.legend.textStyle = {
      ...(option.legend.textStyle || {}),
      color: DAILY_TREND_INK,
      fontSize: 11,
      fontWeight: 700,
      rich: dailyTrendLegendRichStyles(
        dailyTrendYearPalette(
          option.legend.data.map((item) => (typeof item === "string" ? item : item.name))
        ),
        option.legend.selected
      )
    };
    option.legend.formatter = dailyTrendLegendFormatter;

    styleDailyTrendLegendItems(option);
  }

  option.tooltip = {
    ...(option.tooltip || {}),
    show: false,
    trigger: "axis",
    order: "seriesDesc",
    backgroundColor: "rgba(245, 243, 238, 0.97)",
    borderColor: DAILY_TREND_INK,
    borderWidth: 1,
    padding: [9, 11],
    extraCssText: "box-shadow:0 10px 28px rgba(28,28,26,.14);border-radius:4px;",
    textStyle: {
      color: DAILY_TREND_INK,
      fontSize: 11,
      lineHeight: 18
    },
    axisPointer: {
      type: "none",
      snap: false
    },
    formatter: (params) => {
      const rows = params.filter((item) => item.value != null && item.value !== "-");
      if (!rows.length) {
        return "";
      }
      return [
        `<div style="font-weight:700;margin-bottom:3px">${rows[0].axisValueLabel || rows[0].axisValue}</div>`,
        ...rows.map((item) => `<div style="display:grid;grid-template-columns:auto auto;justify-content:start;column-gap:9px"><span>${item.marker}${item.seriesName}</span><strong>${formatDailyTrendValue(item.value)}</strong></div>`)
      ].join("");
    }
  };
}

function formatDailyTrendValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "–";
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(number);
}

function formatDailyTrendAxisValue(value) {
  const number = Number(value);
  const absolute = Math.abs(number);
  if (!Number.isFinite(number)) {
    return value;
  }
  if (absolute >= 1000000) {
    return `${(number / 1000000).toFixed(absolute >= 10000000 ? 0 : 1).replace(/\.0$/, "")}m`;
  }
  if (absolute >= 1000) {
    return `${(number / 1000).toFixed(absolute >= 10000 ? 0 : 1).replace(/\.0$/, "")}k`;
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(number);
}

function formatDailyTrendAxes(option, chartName) {
  if (chartName !== "line" || !Array.isArray(option.xAxis)) {
    return;
  }

  const quarterLabels = new Map([
    ["Jan-01", "Jan"], ["Apr-01", "Apr"],
    ["Jul-01", "Jul"], ["Oct-01", "Oct"]
  ]);

  option.xAxis.forEach((axis) => {
    axis.axisLabel = axis.axisLabel || {};
    axis.axisTick = axis.axisTick || {};
    axis.axisLabel.interval = (index, value) => quarterLabels.has(value);
    axis.axisLabel.formatter = (value) => quarterLabels.get(value) || "";
    axis.axisLabel.color = DAILY_TREND_MUTED;
    axis.axisLabel.fontSize = 10;
    axis.axisLabel.margin = 8;
    axis.axisTick.interval = (index, value) => /-01$/.test(value);
    axis.axisTick.length = 5;
    axis.axisTick.lineStyle = { color: "#bdb9b0", width: 0.8 };
    axis.axisLine = axis.axisLine || {};
    axis.axisLine.lineStyle = { color: "#aaa69d", width: 0.8 };
    axis.splitLine = { ...(axis.splitLine || {}), show: false };
  });

  if (Array.isArray(option.yAxis)) {
    option.yAxis.forEach((axis) => {
      axis.axisLabel = {
        ...(axis.axisLabel || {}),
        color: DAILY_TREND_MUTED,
        fontSize: 10,
        margin: 7,
        formatter: formatDailyTrendAxisValue
      };
      axis.axisTick = { ...(axis.axisTick || {}), show: false };
      axis.axisLine = { ...(axis.axisLine || {}), show: false };
      axis.splitLine = {
        ...(axis.splitLine || {}),
        show: true,
        lineStyle: {
          color: DAILY_TREND_GRID,
          width: 0.8,
          type: "dashed"
        }
      };
    });
  }
}

function reflowDailyTrendLayout(option, layout) {
  if (!Array.isArray(option.grid)) {
    return;
  }

  const { columns, rowHeight, rowGap, topBand, width } = layout;
  const sideGap = width < 620 ? 18 : 26;
  const columnGap = width < 760 ? 18 : 26;
  const availableWidth = Math.max(280, width - sideGap * 2 - columnGap * (columns - 1));
  const gridWidth = availableWidth / columns;
  const titleOffset = 0;
  const plotTopOffset = 30;
  const plotHeight = rowHeight - 58;

  option.grid.forEach((grid, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const left = sideGap + column * (gridWidth + columnGap);
    const top = topBand + row * (rowHeight + rowGap);

    grid.top = top + plotTopOffset;
    grid.left = left;
    grid.width = gridWidth;
    grid.height = plotHeight;
    grid.containLabel = true;
    grid.show = true;
    grid.backgroundColor = "rgba(255, 255, 255, 0.28)";
    grid.borderColor = "rgba(178, 172, 160, 0.42)";
    grid.borderWidth = 0.7;
    grid.shadowBlur = 8;
    grid.shadowColor = "rgba(44, 40, 32, 0.07)";
    grid.shadowOffsetY = 2;
  });

  if (Array.isArray(option.graphic)) {
    option.graphic.forEach((graphic, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const left = sideGap + column * (gridWidth + columnGap);
      const top = topBand + row * (rowHeight + rowGap);

      delete graphic.left;
      delete graphic.top;
      delete graphic.width;
      graphic.x = left + gridWidth / 2;
      graphic.y = top + titleOffset;
      graphic.style = {
        ...(graphic.style || {}),
        align: "center",
        textAlign: "center",
        textVerticalAlign: "top",
        fill: DAILY_TREND_INK,
        fontSize: 13,
        fontWeight: 700
      };
    });
  }
}

function filterDailyTrendOption(option, config) {
  const countries = config.countries || [];
  if (state.continent === "World" || !countries.length) {
    return 0;
  }

  const selectedIndexes = countries
    .map((country, index) => ({ ...country, index }))
    .filter((country) => country.continent === state.continent)
    .map((country) => country.index);
  const selectedSet = new Set(selectedIndexes);
  const indexMap = new Map(selectedIndexes.map((oldIndex, newIndex) => [oldIndex, newIndex]));

  option.grid = selectedIndexes.map((index) => option.grid[index]);
  option.xAxis = selectedIndexes.map((index, newIndex) => ({
    ...option.xAxis[index],
    gridIndex: newIndex
  }));
  option.yAxis = selectedIndexes.map((index, newIndex) => ({
    ...option.yAxis[index],
    gridIndex: newIndex
  }));
  option.graphic = selectedIndexes.map((index) => option.graphic[index]);
  option.series = option.series
    .filter((series) => selectedSet.has(series.xAxisIndex))
    .map((series) => {
      const nextIndex = indexMap.get(series.xAxisIndex);
      return {
        ...series,
        xAxisIndex: nextIndex,
        yAxisIndex: nextIndex
      };
    });

  return selectedIndexes.length;
}

async function renderLineChart(renderId) {
  const containerWidth = chartContainerWidth(els.lineChart);
  const layoutColumns = dailyTrendColumns(containerWidth, Number.MAX_SAFE_INTEGER);
  const renderKey = `${state.energy}|${state.continent}|${layoutColumns}`;
  if (reuseRenderedChart(els.lineChart, "line", renderKey)) {
    setStatus(chartRenderState.line.status || `${titleCase(state.energy)} trends / ${state.continent}`);
    return;
  }

  setStatus("Loading daily trends...");
  try {
    const config = await fetchJson(`tools/line_chart/${state.energy}.json`);
    if (!isCurrentRender(renderId)) {
      return;
    }
    const option = cloneOption(config.option);
    const selectedCountryCount = filterDailyTrendOption(option, config);
    const layout = dailyTrendLayout(option, containerWidth);
    reflowDailyTrendLayout(option, layout);
    const regionLabel = state.continent === "World" ? "World" : `${state.continent} (${selectedCountryCount})`;
    const status = `${titleCase(state.energy)} trends / ${regionLabel}`;
    setChart(els.lineChart, "line", option, layout.height, renderKey);
    chartRenderState.line.status = status;
    setStatus(status);
  } catch (error) {
    if (!isCurrentRender(renderId)) {
      return;
    }
    showError(els.lineChart, error);
    setStatus("Daily trends failed");
  }
}

async function renderStackedChart(renderId) {
  const renderKey = state.stacked;
  if (reuseRenderedChart(els.stackedChart, "stacked", renderKey)) {
    setStatus(`${state.stacked} share`);
    return;
  }

  setStatus("Loading generation mix...");
  try {
    const config = await fetchJson(`tools/stacked_area_chart/${state.stacked}.json`);
    if (!isCurrentRender(renderId)) {
      return;
    }
    setChart(els.stackedChart, "stacked", cloneOption(config.option), chartHeight(config), renderKey);
    setStatus(`${state.stacked} share`);
  } catch (error) {
    if (!isCurrentRender(renderId)) {
      return;
    }
    showError(els.stackedChart, error);
    setStatus("Source share failed");
  }
}

function dateFromYearDayLabel(year, dayLabel) {
  const [monthLabel, dayText] = dayLabel.split("-");
  const month = MONTH_INDEX[monthLabel];
  const day = Number(dayText);
  const numericYear = Number(year);
  if (month === undefined || !day || !numericYear) {
    return null;
  }

  const date = new Date(Date.UTC(numericYear, month, day));
  if (
    date.getUTCFullYear() !== numericYear ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function formatGwh(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }
  return `${Math.round(value).toLocaleString()} GWh`;
}

function applyMapScaleValues(data) {
  const maxRawValue = Math.max(...data.map((item) => item.rawValue));
  const maxLogValue = Math.log10(maxRawValue + 1);
  data.forEach((item) => {
    const score = maxLogValue > 0
      ? (Math.log10(item.rawValue + 1) / maxLogValue) * 100
      : 100;
    item.value = score;
    item.mapScale = score;
  });
}

async function ensureWorldMap() {
  if (worldMapGeoJson) {
    return worldMapGeoJson;
  }
  if (typeof d3 === "undefined" || typeof topojson === "undefined") {
    throw new Error("D3 map dependencies failed to load");
  }

  const atlasModule = await import("./vendor/world-countries-110m.mjs?v=1.0.0");
  const topology = atlasModule.default;
  const countries = topojson.feature(
    topology,
    topology.objects.features
  ).features.filter((feature) => feature.properties?.id !== "ATA");

  worldMapGeoJson = {
    type: "FeatureCollection",
    features: countries
  };
  return worldMapGeoJson;
}

async function loadMapData(energyType) {
  if (mapDataCache.has(energyType)) {
    return mapDataCache.get(energyType);
  }

  const config = await fetchJson(`tools/line_chart/${energyType}.json`);
  const countries = config.countries.map((country) => country.name);
  const dayLabels = config.option.xAxis[0].data;
  const seriesByCountryYear = new Map();

  config.option.series.forEach((series) => {
    const country = countries[series.xAxisIndex];
    if (country) {
      seriesByCountryYear.set(`${country}|${series.name}`, series.data);
    }
  });

  const dates = [];
  config.years.forEach((year) => {
    dayLabels.forEach((dayLabel, dayIndex) => {
      const date = dateFromYearDayLabel(year, dayLabel);
      if (!date) {
        return;
      }

      const data = [];
      let total = 0;

      countries.forEach((country) => {
        if (NON_MAP_COUNTRIES.has(country)) {
          return;
        }

        const values = seriesByCountryYear.get(`${country}|${year}`);
        const rawValue = values ? values[dayIndex] : null;
        if (!Number.isFinite(rawValue) || rawValue <= 0) {
          return;
        }

        data.push({
          name: country,
          value: 0,
          rawValue
        });
        total += rawValue;
      });

      if (data.length) {
        applyMapScaleValues(data);
        dates.push({
          date,
          data,
          countryCount: data.length,
          total
        });
      }
    });
  });

  const maxCountryCount = dates.length ? Math.max(...dates.map((entry) => entry.countryCount)) : 0;
  let latestCompleteCoverageDate = null;
  let latestCompleteCoverageIndex = dates.length - 1;
  for (let index = dates.length - 1; index >= 0; index -= 1) {
    if (dates[index].countryCount === maxCountryCount) {
      latestCompleteCoverageDate = dates[index].date;
      latestCompleteCoverageIndex = index;
      break;
    }
  }

  const mapData = {
    dates,
    defaultIndex: latestCompleteCoverageIndex,
    maxCountryCount,
    latestCompleteCoverageDate
  };
  mapDataCache.set(energyType, mapData);
  return mapData;
}

function formatMapTotal(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }
  if (value >= 1000) {
    return `${(value / 1000).toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    })} TWh`;
  }
  return formatGwh(value);
}

function mapCountryName(feature) {
  const properties = feature?.properties || {};
  return MAP_COUNTRY_NAME_BY_ISO3[properties.id] || properties.name || properties.name_long || "Unknown";
}

function mapChartHeight(width = chartContainerWidth(els.mapChart)) {
  if (width < 620) {
    return MAP_MOBILE_CHART_HEIGHT;
  }
  return Math.min(
    MAP_DESKTOP_CHART_HEIGHT,
    Math.max(470, Math.round(width * 0.54))
  );
}

function hideMapTooltip() {
  if (els.mapTooltip) {
    els.mapTooltip.hidden = true;
  }
}

function positionMapTooltip(event) {
  if (!els.mapTooltip || els.mapTooltip.hidden) {
    return;
  }
  const chartRect = els.mapChart.getBoundingClientRect();
  const tooltipRect = els.mapTooltip.getBoundingClientRect();
  const gap = 14;
  const inset = 8;
  const pointerX = event.clientX - chartRect.left;
  const pointerY = event.clientY - chartRect.top;
  let left = pointerX + gap;
  let top = pointerY - tooltipRect.height / 2;

  if (left + tooltipRect.width > chartRect.width - inset) {
    left = pointerX - tooltipRect.width - gap;
  }
  top = Math.max(inset, Math.min(top, chartRect.height - tooltipRect.height - inset));
  left = Math.max(inset, Math.min(left, chartRect.width - tooltipRect.width - inset));

  els.mapTooltip.style.left = `${left}px`;
  els.mapTooltip.style.top = `${top}px`;
}

function showMapTooltip(event, countryName) {
  if (!mapRuntime?.currentEntry || !els.mapTooltip) {
    return;
  }
  const countryData = mapRuntime.valueByCountry.get(countryName);
  els.mapTooltipCountry.textContent = countryName;
  els.mapTooltipDate.textContent = mapRuntime.currentEntry.date;
  els.mapTooltipMetric.textContent = countryData ? titleCase(state.energy) : "CM Power";
  els.mapTooltipValue.textContent = countryData
    ? formatGwh(countryData.rawValue)
    : "No data";
  els.mapTooltip.hidden = false;
  positionMapTooltip(event);
}

function mapColorScale() {
  const lastIndex = MAP_SCALE_COLORS.length - 1;
  return d3.scaleLinear()
    .domain(MAP_SCALE_COLORS.map((_, index) => (index / lastIndex) * 100))
    .range(MAP_SCALE_COLORS)
    .interpolate(d3.interpolateRgb.gamma(2.2))
    .clamp(true);
}

function bindMapHover(selection, nameAccessor) {
  selection
    .on("pointerenter", (event, datum) => {
      const target = event.currentTarget;
      if (mapRuntime?.hoveredElement && mapRuntime.hoveredElement !== target) {
        mapRuntime.hoveredElement.classList.remove("is-hovered");
      }
      if (mapRuntime) {
        mapRuntime.hoveredElement = target;
      }
      d3.select(target).classed("is-hovered", true);
      showMapTooltip(event, nameAccessor(datum));
    })
    .on("pointermove", (event) => positionMapTooltip(event))
    .on("pointerleave", (event) => {
      d3.select(event.currentTarget).classed("is-hovered", false);
      if (mapRuntime?.hoveredElement === event.currentTarget) {
        mapRuntime.hoveredElement = null;
      }
      hideMapTooltip();
    });
}

function createMapRuntime(geoJson, width, height) {
  d3.select(els.mapChart).selectAll("svg").remove();

  const projection = d3.geoEqualEarth()
    .fitExtent([[18, 14], [width - 18, height - 14]], { type: "Sphere" });
  const path = d3.geoPath(projection);
  const svg = d3.select(els.mapChart)
    .insert("svg", ":first-child")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("role", "img")
    .attr("aria-label", "World map of daily electricity generation by country");

  svg.append("title").text("Daily electricity generation by country");
  svg.append("desc").text("Drag or zoom the map, move over a country to see its value, and use the date slider to explore history.");

  const zoomLayer = svg.append("g").attr("class", "map-zoom-layer");
  zoomLayer.append("path")
    .attr("class", "map-sphere")
    .attr("d", path({ type: "Sphere" }));

  const countries = zoomLayer.append("g")
    .attr("class", "map-country-layer")
    .selectAll("path")
    .data(geoJson.features, (feature) => feature.properties?.id)
    .join("path")
    .attr("class", "map-country")
    .attr("d", path)
    .attr("fill", MAP_NO_DATA_COLOR);

  const markers = zoomLayer.append("g")
    .attr("class", "map-marker-layer")
    .selectAll("circle")
    .data(MAP_POINT_COUNTRIES, (country) => country.name)
    .join("circle")
    .attr("class", "map-country-marker")
    .attr("cx", (country) => projection(country.coordinates)?.[0] ?? -100)
    .attr("cy", (country) => projection(country.coordinates)?.[1] ?? -100)
    .attr("r", width < 620 ? 3.2 : 4)
    .attr("fill", MAP_NO_DATA_COLOR);

  bindMapHover(countries, mapCountryName);
  bindMapHover(markers, (country) => country.name);

  const zoom = d3.zoom()
    .scaleExtent([1, 6])
    .extent([[0, 0], [width, height]])
    .translateExtent([[0, 0], [width, height]])
    .on("start", () => {
      hideMapTooltip();
      svg.classed("is-dragging", true);
    })
    .on("zoom", (event) => {
      zoomLayer.attr("transform", event.transform);
    })
    .on("end", () => {
      svg.classed("is-dragging", false);
    });
  svg.call(zoom);

  mapRuntime = {
    width,
    height,
    svg,
    projection,
    countries,
    markers,
    colorScale: mapColorScale(),
    currentEntry: null,
    valueByCountry: new Map(),
    hoveredElement: null
  };
}

async function drawMapForDate(entry, forceLayout = false) {
  const geoJson = await ensureWorldMap();
  const width = Math.max(280, chartContainerWidth(els.mapChart));
  const height = mapChartHeight(width);
  els.mapChart.style.height = `${height}px`;

  const layoutChanged = !mapRuntime ||
    mapRuntime.width !== width ||
    mapRuntime.height !== height;
  if (forceLayout || layoutChanged) {
    createMapRuntime(geoJson, width, height);
  }

  const valueByCountry = new Map(entry.data.map((country) => [country.name, country]));
  mapRuntime.currentEntry = entry;
  mapRuntime.valueByCountry = valueByCountry;
  mapRuntime.svg.attr(
    "aria-label",
    `${titleCase(state.energy)} electricity generation by country on ${entry.date}`
  );
  mapRuntime.countries.attr("fill", (feature) => {
    const countryData = valueByCountry.get(mapCountryName(feature));
    return countryData ? mapRuntime.colorScale(countryData.mapScale) : MAP_NO_DATA_COLOR;
  });
  mapRuntime.markers.attr("fill", (country) => {
    const countryData = valueByCountry.get(country.name);
    return countryData ? mapRuntime.colorScale(countryData.mapScale) : MAP_NO_DATA_COLOR;
  });
  hideMapTooltip();
}

function updateMapStats(entry) {
  els.mapEnergyLabel.textContent = titleCase(state.energy);
  els.mapDateValue.textContent = entry.date;
  els.mapCountryCount.textContent = entry.countryCount.toLocaleString();
  els.mapTotalValue.textContent = formatMapTotal(entry.total);
  els.mapDateLabel.textContent = entry.date;
  const sliderMax = Math.max(1, Number(els.mapDateSlider.max));
  const progress = Math.max(0, Math.min(100, (state.mapDateIndex / sliderMax) * 100));
  els.mapDateSlider.style.setProperty("--map-progress", `${progress}%`);
}

async function updateMapForDate(forceLayout = false) {
  const updateId = ++mapUpdateSerial;
  const mapData = await loadMapData(state.energy);
  if (updateId !== mapUpdateSerial) {
    return;
  }
  const entry = mapData.dates[state.mapDateIndex];
  if (!entry) {
    return;
  }

  updateMapStats(entry);
  els.mapDateSlider.value = String(state.mapDateIndex);
  await drawMapForDate(entry, forceLayout);
  if (updateId !== mapUpdateSerial) {
    return;
  }
  setStatus(`${titleCase(state.energy)} map / ${entry.date}`);
}

async function renderMapChart(renderId) {
  setStatus("Loading global map...");
  try {
    await ensureWorldMap();
    const mapData = await loadMapData(state.energy);
    if (!isCurrentRender(renderId)) {
      return;
    }
    if (!mapData.dates.length) {
      throw new Error(`No map data for ${state.energy}`);
    }

    const latestIndex = mapData.dates.length - 1;
    if (state.mapDateIndex === null || state.mapDateIndex > latestIndex) {
      state.mapDateIndex = mapData.defaultIndex;
    }

    els.mapDateSlider.max = String(latestIndex);
    els.mapDateSlider.value = String(state.mapDateIndex);
    els.mapDateStart.textContent = mapData.dates[0]?.date || "-";
    els.mapDateEnd.textContent = mapData.dates[latestIndex]?.date || "-";
    const entry = mapData.dates[state.mapDateIndex];
    updateMapStats(entry);
    if (els.mapCoverageNote) {
      els.mapCoverageNote.textContent = `Log-scaled within each day · Gray means no data · Fullest coverage ${mapData.latestCompleteCoverageDate || "-"}`;
    }
    const status = `${titleCase(state.energy)} map / ${entry.date}`;
    await drawMapForDate(entry);
    if (!isCurrentRender(renderId)) {
      return;
    }
    setStatus(status);
  } catch (error) {
    if (!isCurrentRender(renderId)) {
      return;
    }
    mapRuntime = null;
    showError(els.mapChart, error);
    setStatus("Global map failed");
  }
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value !== "")) {
        rows.push(row);
      }
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value !== "")) {
    rows.push(row);
  }

  return rows;
}

function parseCsv(text, numericColumns = []) {
  const rows = parseCsvRows(text);
  const headers = rows.shift().map((header) => header.replace(/^\uFEFF/, ""));
  return rows.map((cells) => {
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    numericColumns.forEach((column) => {
      row[column] = Number(row[column]);
    });
    return row;
  });
}

async function loadScatterRecords() {
  if (!scatterRecords) {
    scatterRecords = parseCsv(
      await fetchText("data/data_for_scatter_plot.csv"),
      ["year", "month", "value", "iea"]
    );
  }
  return scatterRecords;
}

async function loadScatterMetadata() {
  if (!scatterMetadata) {
    scatterMetadata = fetchJson("data/iea_compare_metadata.json").catch(() => null);
  }
  return scatterMetadata;
}

async function loadCountryContinents() {
  if (!countryContinentMap) {
    const rows = parseCsv(await fetchText("data/data_description.csv"));
    countryContinentMap = new Map(rows.map((row) => [row.country, row.continent]));
  }
  return countryContinentMap;
}

function countryContinent(country, continentsByCountry) {
  return continentsByCountry.get(country) || "Other";
}

function scatterColumns(width) {
  if (width >= 1000) {
    return 4;
  }
  return width >= 620 ? 2 : 1;
}

function scatterLayout(width, gridCount) {
  const columns = scatterColumns(width);
  const topBand = 36;

  if (columns === 4) {
    const sidePadding = 22;
    const columnGap = 24;
    const firstRowColumns = 3;
    const firstCellWidth = (
      width - sidePadding * 2 - columnGap * (firstRowColumns - 1)
    ) / firstRowColumns;
    const lowerCellWidth = (
      width - sidePadding * 2 - columnGap * (columns - 1)
    ) / columns;
    const firstPlotSize = firstCellWidth - 52;
    const lowerPlotSize = lowerCellWidth - 52;
    const rowGapBand = 112;
    const lowerRows = Math.ceil(Math.max(0, gridCount - firstRowColumns) / columns);
    const lowerStart = topBand + firstPlotSize + rowGapBand;

    return {
      columns,
      height: lowerStart + lowerRows * (lowerPlotSize + rowGapBand) + 22,
      position(index) {
        const firstRow = index < firstRowColumns;
        const row = firstRow ? 0 : 1 + Math.floor((index - firstRowColumns) / columns);
        const column = firstRow ? index : (index - firstRowColumns) % columns;
        const cellWidth = firstRow ? firstCellWidth : lowerCellWidth;
        const plotSize = firstRow ? firstPlotSize : lowerPlotSize;
        const titleTop = firstRow
          ? topBand
          : lowerStart + (row - 1) * (lowerPlotSize + rowGapBand);
        const cellLeft = sidePadding + column * (cellWidth + columnGap);

        return {
          left: cellLeft + (cellWidth - plotSize) / 2,
          titleTop,
          gridTop: titleTop + 32,
          plotWidth: plotSize,
          plotHeight: plotSize
        };
      }
    };
  }

  const sidePadding = 20;
  const columnGap = columns === 1 ? 0 : 34;
  const cellWidth = (
    width - sidePadding * 2 - columnGap * (columns - 1)
  ) / columns;
  const plotSize = Math.max(160, Math.min(520, cellWidth - 96));
  const rowGapBand = 112;
  const rows = Math.ceil(gridCount / columns);

  return {
    columns,
    height: topBand + rows * (plotSize + rowGapBand) + 22,
    position(index) {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const cellLeft = sidePadding + column * (cellWidth + columnGap);
      const titleTop = topBand + row * (plotSize + rowGapBand);

      return {
        left: cellLeft + (cellWidth - plotSize) / 2,
        titleTop,
        gridTop: titleTop + 32,
        plotWidth: plotSize,
        plotHeight: plotSize
      };
    }
  };
}

function niceScatterAxis(maxValue, splitCount = 4) {
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    return { max: 1, interval: 0.25 };
  }

  const roughStep = maxValue / splitCount;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const bases = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

  for (const scale of [magnitude, magnitude * 10]) {
    for (const base of bases) {
      const interval = base * scale;
      const axisMax = interval * splitCount;
      if (axisMax >= maxValue) {
        return { max: axisMax, interval };
      }
    }
  }

  const fallbackInterval = 10 * magnitude;
  return { max: fallbackInterval * splitCount, interval: fallbackInterval };
}

function updateScatterMetadata(metadata) {
  if (!els.scatterMeta) {
    return;
  }

  if (!metadata) {
    els.scatterMeta.textContent = "";
    return;
  }

  const comparisonMonth = metadata.comparison_latest_month || metadata.iea_latest_month || "-";
  els.scatterMeta.textContent = `Monthly observations through ${comparisonMonth}`;
}

function scatterFitStats(rows) {
  const pairs = rows
    .map((row) => [row.value, row.iea])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const n = pairs.length;

  if (n < 2) {
    return { n, r2: null };
  }

  const meanX = pairs.reduce((sum, [x]) => sum + x, 0) / n;
  const meanY = pairs.reduce((sum, [, y]) => sum + y, 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;

  pairs.forEach(([x, y]) => {
    const dx = x - meanX;
    const dy = y - meanY;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  });

  if (!sxx || !syy) {
    return { n, r2: null };
  }

  return { n, r2: (sxy * sxy) / (sxx * syy) };
}

function summarizeScatterRows(rows) {
  return rows.reduce((summary, row) => {
    const x = row.value;
    const y = row.iea;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return summary;
    }
    summary.n += 1;
    summary.sumX += x;
    summary.sumY += y;
    summary.sumXX += x * x;
    summary.sumYY += y * y;
    summary.sumXY += x * y;
    summary.max = Math.max(summary.max, x, y);
    return summary;
  }, {
    n: 0,
    sumX: 0,
    sumY: 0,
    sumXX: 0,
    sumYY: 0,
    sumXY: 0,
    max: 0
  });
}

function combineScatterSummaries(summaries) {
  return summaries.reduce((combined, summary) => ({
    n: combined.n + summary.n,
    sumX: combined.sumX + summary.sumX,
    sumY: combined.sumY + summary.sumY,
    sumXX: combined.sumXX + summary.sumXX,
    sumYY: combined.sumYY + summary.sumYY,
    sumXY: combined.sumXY + summary.sumXY,
    max: Math.max(combined.max, summary.max)
  }), {
    n: 0,
    sumX: 0,
    sumY: 0,
    sumXX: 0,
    sumYY: 0,
    sumXY: 0,
    max: 0
  });
}

function scatterFitFromSummary(summary) {
  if (summary.n < 2) {
    return { n: summary.n, r2: null };
  }
  const sxx = summary.sumXX - (summary.sumX * summary.sumX) / summary.n;
  const syy = summary.sumYY - (summary.sumY * summary.sumY) / summary.n;
  const sxy = summary.sumXY - (summary.sumX * summary.sumY) / summary.n;
  if (!sxx || !syy) {
    return { n: summary.n, r2: null };
  }
  return { n: summary.n, r2: (sxy * sxy) / (sxx * syy) };
}

function formatR2(value) {
  return Number.isFinite(value) ? value.toFixed(3) : "n/a";
}

function scatterTooltip(params) {
  const value = params.value || params.data || [];
  if (
    scatterSelectedContinents?.[params.seriesName] === false ||
    !Array.isArray(value) || value.length < 6
  ) {
    return "";
  }

  const [cmPower, iea, country, year, month, typeTitle] = value;
  const monthLabel = String(month).padStart(2, "0");
  return [
    `<div style="font-weight:700;margin-bottom:1px">${typeTitle} · ${country}</div>`,
    `<div style="color:#77746c;margin-bottom:4px">${year}-${monthLabel} · ${params.seriesName}</div>`,
    `<div style="display:grid;grid-template-columns:auto auto;column-gap:12px;row-gap:1px">`,
    `<span>CM Power</span><strong>${Number(cmPower).toFixed(2)}</strong>`,
    `<span>IEA</span><strong>${Number(iea).toFixed(2)}</strong>`,
    `</div>`
  ].join("");
}

function scatterLayerZlevel(continent) {
  return SCATTER_LAYER_BASE + SCATTER_CONTINENTS.indexOf(continent);
}

function scatterLayerElement(chart, continent) {
  if (!chart || chart.isDisposed()) {
    return null;
  }
  const zlevel = scatterLayerZlevel(continent);
  if (zlevel < SCATTER_LAYER_BASE) {
    return null;
  }
  return chart.getZr()?.painter?.getLayer(zlevel)?.dom || null;
}

function animateLayerOpacity(
  element,
  targetOpacity,
  duration,
  delay = 0,
  easing = "cubic-bezier(0.22, 1, 0.36, 1)"
) {
  if (!element) {
    return Promise.resolve();
  }

  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const target = String(targetOpacity);
  if (reduceMotion || typeof element.animate !== "function") {
    element.style.opacity = target;
    return Promise.resolve();
  }

  element.getAnimations().forEach((animation) => animation.cancel());
  const currentOpacity = Number.parseFloat(window.getComputedStyle(element).opacity) || 0;
  element.style.willChange = "opacity";
  const animation = element.animate(
    [{ opacity: currentOpacity }, { opacity: targetOpacity }],
    {
      duration,
      delay,
      easing,
      fill: "forwards"
    }
  );

  return animation.finished
    .catch(() => undefined)
    .then(() => {
      element.style.opacity = target;
      element.style.willChange = "";
      animation.cancel();
    });
}

function nextAnimationFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(resolve));
}

function waitForScatterRender(chart, timeout = 2600) {
  return new Promise((resolve) => {
    let timeoutId = null;
    const finish = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      chart?.off("finished", finish);
      resolve();
    };
    chart.on("finished", finish);
    timeoutId = window.setTimeout(finish, timeout);
  });
}

async function revealScatterLayers(chart, container, renderReady = Promise.resolve()) {
  const continents = scatterRuntime?.continents || [];
  const selected = normalizedScatterSelection(scatterSelectedContinents || {});
  let layers = [];

  await renderReady;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await nextAnimationFrame();
    if (!chart || chart.isDisposed()) {
      container.style.visibility = "";
      return;
    }
    layers = continents.map((continent) => ({
      continent,
      element: scatterLayerElement(chart, continent)
    })).filter(({ element }) => Boolean(element));
    if (layers.length === continents.length) {
      break;
    }
  }

  layers.forEach(({ continent, element }) => {
    element.getAnimations().forEach((animation) => animation.cancel());
    element.style.opacity = "0";
    element.style.willChange = selected[continent] ? "opacity" : "";
  });
  container.style.visibility = "";

  await nextAnimationFrame();
  layers.forEach(({ continent, element }, index) => {
    if (selected[continent]) {
      animateLayerOpacity(
        element,
        1,
        SCATTER_REVEAL_DURATION,
        index * SCATTER_REVEAL_STAGGER,
        SCATTER_REVEAL_EASING
      );
    }
  });
}

function normalizedScatterSelection(selected = {}) {
  return Object.fromEntries((scatterRuntime?.continents || []).map((continent) => [
    continent,
    selected[continent] !== false
  ]));
}

function syncScatterLayerVisibility(chart) {
  const selected = normalizedScatterSelection(scatterSelectedContinents || {});
  (scatterRuntime?.continents || []).forEach((continent) => {
    const layer = scatterLayerElement(chart, continent);
    if (layer) {
      layer.style.opacity = selected[continent] ? "1" : "0";
    }
  });
}

function renderScatterLegend(continents) {
  if (!els.scatterLegend) {
    return;
  }

  const selected = Object.fromEntries(continents.map((continent) => [
    continent,
    scatterSelectedContinents?.[continent] !== false
  ]));
  scatterSelectedContinents = selected;
  els.scatterLegend.replaceChildren();

  continents.forEach((continent) => {
    const button = document.createElement("button");
    const dot = document.createElement("span");
    const label = document.createElement("span");
    button.type = "button";
    button.className = "scatter-legend-button";
    button.dataset.continent = continent;
    button.style.setProperty("--legend-color", CONTINENT_SCATTER_COLORS[continent]);
    button.style.setProperty(
      "--legend-text-color",
      interpolateDailyTrendColor(CONTINENT_SCATTER_COLORS[continent], DAILY_TREND_INK, 0.22)
    );
    button.setAttribute("aria-pressed", String(selected[continent]));
    button.setAttribute("aria-label", `Toggle ${continent}`);
    dot.className = "scatter-legend-dot";
    dot.setAttribute("aria-hidden", "true");
    label.textContent = continent;
    button.append(dot, label);
    button.addEventListener("click", () => transitionScatterContinent(continent, button));
    els.scatterLegend.append(button);
  });
}

function createScatterSnapshot(chart, selected) {
  const width = chart.getWidth();
  const height = chart.getHeight();
  const pixelRatio = height > 2000
    ? 1
    : Math.min(chart.getDevicePixelRatio(), 1.5);
  const snapshot = document.createElement("canvas");
  snapshot.className = "scatter-transition-snapshot";
  snapshot.width = Math.round(width * pixelRatio);
  snapshot.height = Math.round(height * pixelRatio);
  snapshot.style.width = `${width}px`;
  snapshot.style.height = `${height}px`;
  snapshot.setAttribute("aria-hidden", "true");

  const context = snapshot.getContext("2d");
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  const continentsByLayer = new Map((scatterRuntime?.continents || []).flatMap((continent) => {
    const layer = scatterLayerElement(chart, continent);
    return layer ? [[layer, continent]] : [];
  }));
  const sources = [...els.scatterChart.querySelectorAll("canvas")]
    .filter((canvas) => continentsByLayer.has(canvas));

  sources.forEach((source) => {
    const continent = continentsByLayer.get(source);
    context.globalAlpha = selected[continent] === false ? 0 : 1;
    context.drawImage(
      source,
      0,
      0,
      source.width,
      source.height,
      0,
      0,
      width,
      height
    );
  });
  context.globalAlpha = 1;
  return snapshot;
}

function removeScatterSnapshot(snapshot) {
  snapshot.remove();
  snapshot.width = 0;
  snapshot.height = 0;
}

async function transitionScatterContinent(continent, button) {
  const chart = charts.scatter;
  if (
    !chart || chart.isDisposed() || !scatterRuntime ||
    scatterSelectionTransitionActive
  ) {
    return;
  }

  scatterSelectionTransitionActive = true;
  const previousSelection = normalizedScatterSelection(scatterSelectedContinents || {});
  const nextSelected = !previousSelection[continent];
  const nextSelection = { ...previousSelection, [continent]: nextSelected };
  const previousSnapshot = createScatterSnapshot(chart, previousSelection);
  const selectedSnapshot = createScatterSnapshot(chart, nextSelection);
  els.scatterChart.append(selectedSnapshot, previousSnapshot);

  scatterSelectedContinents = nextSelection;
  button.setAttribute("aria-pressed", String(nextSelected));
  button.setAttribute("aria-busy", "true");
  els.scatterLegend?.setAttribute("aria-busy", "true");

  const liveLayers = (scatterRuntime?.continents || []).flatMap((layerContinent) => {
    const element = scatterLayerElement(chart, layerContinent);
    if (!element) {
      return [];
    }
    element.getAnimations().forEach((animation) => animation.cancel());
    element.style.opacity = "0";
    return [{ continent: layerContinent, element }];
  });
  const baseLayer = chart.getZr()?.painter?.getLayer(0)?.dom || null;

  const selectionTransition = animateLayerOpacity(
    previousSnapshot,
    0,
    SCATTER_FILTER_FADE_DURATION,
    0,
    SCATTER_FILTER_EASING
  );
  const baseFade = animateLayerOpacity(
    baseLayer,
    0.28,
    SCATTER_FILTER_FADE_DURATION,
    0,
    SCATTER_FILTER_EASING
  );

  await nextAnimationFrame();
  const renderReady = waitForScatterRender(chart);
  if (!chart.isDisposed()) {
    refreshScatterSelection(chart, nextSelection, true, continent);
  }
  await Promise.all([selectionTransition, baseFade, renderReady]);
  removeScatterSnapshot(previousSnapshot);

  if (!chart.isDisposed()) {
    const liveLayerReveals = liveLayers.map(({ continent: layerContinent, element }) => (
      nextSelection[layerContinent] === false
        ? Promise.resolve()
        : animateLayerOpacity(
          element,
          1,
          SCATTER_REFLOW_FADE_DURATION,
          0,
          SCATTER_FILTER_EASING
        )
    ));
    await Promise.all([
      animateLayerOpacity(
        selectedSnapshot,
        0,
        SCATTER_REFLOW_FADE_DURATION,
        0,
        SCATTER_FILTER_EASING
      ),
      animateLayerOpacity(
        baseLayer,
        1,
        SCATTER_REFLOW_FADE_DURATION,
        0,
        SCATTER_FILTER_EASING
      ),
      ...liveLayerReveals
    ]);
  }

  removeScatterSnapshot(selectedSnapshot);
  scatterSelectionTransitionActive = false;
  button.removeAttribute("aria-busy");
  els.scatterLegend?.removeAttribute("aria-busy");
}

function refreshScatterSelection(
  chart,
  selected = {},
  lazyUpdate = true,
  changedContinent = null
) {
  if (!chart || !scatterRuntime) {
    return;
  }

  const titles = [];
  const xAxis = [];
  const yAxis = [];
  const referenceSeries = [];
  const scatterSeriesUpdates = [];

  scatterRuntime.summariesByGrid.forEach((summariesByContinent, index) => {
    const activeSummaries = scatterRuntime.continents.flatMap((continent) => (
      selected[continent] === false ? [] : [summariesByContinent.get(continent)]
    )).filter(Boolean);
    const summary = combineScatterSummaries(activeSummaries);
    const stats = scatterFitFromSummary(summary);
    const axis = niceScatterAxis(summary.max || 1);

    titles.push({
      id: `scatter-title-${index}`,
      text: `${scatterRuntime.gridLabels[index]} · R² ${formatR2(stats.r2)}`
    });
    xAxis.push({
      id: `scatter-x-${index}`,
      max: axis.max,
      interval: axis.interval,
      splitNumber: 4
    });
    yAxis.push({
      id: `scatter-y-${index}`,
      max: axis.max,
      interval: axis.interval,
      splitNumber: 4
    });
    referenceSeries.push({
      id: `scatter-reference-${index}`,
      data: [[0, 0], [axis.max, axis.max]]
    });
    if (changedContinent && summariesByContinent.has(changedContinent)) {
      scatterSeriesUpdates.push({
        id: `scatter-${index}-${changedContinent}`,
        silent: selected[changedContinent] === false
      });
    }
  });

  chart.setOption(
    {
      title: titles,
      xAxis,
      yAxis,
      series: [...referenceSeries, ...scatterSeriesUpdates]
    },
    { notMerge: false, lazyUpdate, silent: true }
  );
}

async function renderScatterChart(renderId) {
  const containerWidth = chartContainerWidth(els.scatterChart);
  const columns = scatterColumns(containerWidth);
  const renderKey = `scatter|${columns}|${containerWidth}`;
  if (reuseRenderedChart(els.scatterChart, "scatter", renderKey)) {
    if (scatterRevealRequested) {
      scatterRevealRequested = false;
      els.scatterChart.style.visibility = "hidden";
      revealScatterLayers(charts.scatter, els.scatterChart);
    }
    setStatus("IEA comparison");
    return;
  }

  setStatus("Loading IEA comparison...");
  try {
    const [records, metadata, continentsByCountry] = await Promise.all([
      loadScatterRecords(),
      loadScatterMetadata(),
      loadCountryContinents()
    ]);
    if (!isCurrentRender(renderId)) {
      return;
    }
    updateScatterMetadata(metadata);
    const types = SCATTER_TYPE_ORDER.filter((type) => records.some((row) => row.type === type));
    const recordsByType = new Map(types.map((type) => [type, []]));
    records.forEach((row) => {
      if (recordsByType.has(row.type)) {
        recordsByType.get(row.type).push(row);
      }
    });
    const countries = [...new Set(records.map((row) => row.country))];
    const continents = SCATTER_CONTINENTS.filter((continent) => (
      continent === "Other"
        ? countries.some((country) => countryContinent(country, continentsByCountry) === "Other")
        : countries.some((country) => continentsByCountry.get(country) === continent)
    ));
    const layout = scatterLayout(containerWidth, types.length);
    const chartHeightValue = layout.height;

    const grid = [];
    const xAxis = [];
    const yAxis = [];
    const series = [];
    const rowsByGrid = [];
    const titles = [];

    types.forEach((type, index) => {
      const group = recordsByType.get(type) || [];
      const typeTitle = titleCase(type);
      const visibleGroup = scatterSelectedContinents
        ? group.filter((item) => (
          scatterSelectedContinents[countryContinent(item.country, continentsByCountry)] !== false
        ))
        : group;
      const stats = scatterFitStats(visibleGroup);
      const axis = niceScatterAxis(Math.max(...visibleGroup.flatMap((row) => [row.value, row.iea])));
      const maxVal = axis.max;
      const position = layout.position(index);

      grid.push({
        left: position.left,
        top: position.gridTop,
        width: position.plotWidth,
        height: position.plotHeight,
        containLabel: false,
        show: true,
        backgroundColor: "rgba(255, 255, 255, 0.28)",
        borderColor: "rgba(178, 172, 160, 0.42)",
        borderWidth: 0.7,
        shadowBlur: 8,
        shadowColor: "rgba(44, 40, 32, 0.07)",
        shadowOffsetY: 2
      });

      xAxis.push({
        id: `scatter-x-${index}`,
        gridIndex: index,
        min: 0,
        max: maxVal,
        interval: axis.interval,
        splitNumber: 4,
        name: "CM Power (TWh)",
        nameLocation: "center",
        nameGap: 27,
        position: "bottom",
        nameTextStyle: { color: DAILY_TREND_MUTED, fontSize: 10, fontWeight: 600 },
        axisLabel: {
          color: DAILY_TREND_MUTED,
          fontSize: 10,
          margin: 8,
          formatter: formatDailyTrendAxisValue
        },
        axisLine: {
          show: true,
          onZero: false,
          lineStyle: { color: "#aaa69d", width: 0.8 }
        },
        axisTick: {
          show: true,
          inside: true,
          length: 4,
          lineStyle: { color: "#bdb9b0", width: 0.8 }
        },
        minorTick: { show: false },
        splitLine: { show: false }
      });

      yAxis.push({
        id: `scatter-y-${index}`,
        gridIndex: index,
        min: 0,
        max: maxVal,
        interval: axis.interval,
        splitNumber: 4,
        name: "IEA (TWh)",
        nameLocation: "center",
        nameGap: 36,
        position: "left",
        nameTextStyle: { color: DAILY_TREND_MUTED, fontSize: 10, fontWeight: 600 },
        axisLabel: {
          color: DAILY_TREND_MUTED,
          fontSize: 10,
          margin: 7,
          formatter: formatDailyTrendAxisValue
        },
        axisLine: {
          show: false
        },
        axisTick: {
          show: false
        },
        minorTick: { show: false },
        splitLine: {
          show: true,
          lineStyle: { color: DAILY_TREND_GRID, width: 0.8, type: "dashed" }
        }
      });

      titles.push({
        id: `scatter-title-${index}`,
        text: `${typeTitle} · R² ${formatR2(stats.r2)}`,
        textAlign: "center",
        left: position.left + position.plotWidth / 2,
        top: position.titleTop,
        textStyle: { color: "#393833", fontSize: 13, fontWeight: 700 }
      });

      series.push({
        id: `scatter-reference-${index}`,
        name: `${typeTitle} 1:1`,
        type: "line",
        xAxisIndex: index,
        yAxisIndex: index,
        data: [[0, 0], [maxVal, maxVal]],
        symbol: "none",
        silent: true,
        lineStyle: { color: "#9f9b92", width: 0.9, type: "dashed", opacity: 0.72 },
        tooltip: { show: false },
        legendHoverLink: false
      });

      const rowsByContinent = new Map(continents.map((continent) => [continent, []]));
      group.forEach((item) => {
        const continent = countryContinent(item.country, continentsByCountry);
        if (rowsByContinent.has(continent)) {
          rowsByContinent.get(continent).push(item);
        }
      });

      continents.forEach((continent) => {
        const continentRows = rowsByContinent.get(continent)
          .sort((a, b) => (a.year - b.year) || (a.month - b.month));
        if (!continentRows.length) {
          return;
        }

        series.push({
          id: `scatter-${index}-${continent}`,
          name: continent,
          type: "scatter",
          xAxisIndex: index,
          yAxisIndex: index,
          zlevel: scatterLayerZlevel(continent),
          dimensions: ["CM_Power", "IEA", "country", "year", "month", "type"],
          encode: { x: 0, y: 1 },
          symbol: "circle",
          symbolSize: 8,
          large: false,
          progressive: 3000,
          progressiveThreshold: 5000,
          itemStyle: {
            color: CONTINENT_SCATTER_COLORS[continent],
            borderColor: "#5b5953",
            borderWidth: 0.7,
            opacity: 0.76
          },
          silent: scatterSelectedContinents?.[continent] === false,
          data: continentRows.map((item) => [
            item.value,
            item.iea,
            item.country,
            item.year,
            item.month,
            typeTitle
          ])
        });
      });
      rowsByGrid[index] = rowsByContinent;
    });

    scatterRuntime = {
      continents,
      gridLabels: types.map((type) => titleCase(type)),
      summariesByGrid: rowsByGrid.map((rowsByContinent) => new Map(
        [...rowsByContinent].map(([continent, rows]) => [
          continent,
          summarizeScatterRows(rows)
        ])
      ))
    };
    renderScatterLegend(continents);

    const option = {
      backgroundColor: DAILY_TREND_PAPER,
      title: titles,
      grid,
      xAxis,
      yAxis,
      series,
      tooltip: {
        trigger: "item",
        formatter: scatterTooltip,
        backgroundColor: "rgba(245, 243, 238, 0.97)",
        borderColor: DAILY_TREND_INK,
        borderWidth: 1,
        padding: [8, 10],
        extraCssText: "box-shadow:0 10px 28px rgba(28,28,26,.14);border-radius:4px;",
        textStyle: { color: DAILY_TREND_INK, fontSize: 11, lineHeight: 16 }
      },
      legend: { show: false }
    };

    setChart(els.scatterChart, "scatter", option, Math.max(760, chartHeightValue), renderKey);
    setStatus("IEA comparison");
  } catch (error) {
    if (!isCurrentRender(renderId)) {
      return;
    }
    showError(els.scatterChart, error);
    setStatus("IEA comparison failed");
  }
}

function render() {
  const renderId = ++renderSerial;
  if (state.tab === "overview") {
    renderOverview(renderId);
  } else if (state.tab === "line") {
    renderLineChart(renderId);
  } else if (state.tab === "stacked") {
    renderStackedChart(renderId);
  } else if (state.tab === "scatter") {
    renderScatterChart(renderId);
  } else if (state.tab === "map") {
    renderMapChart(renderId);
  }
}

function bindEvents() {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  });

  els.energy.addEventListener("change", () => {
    const nextEnergy = els.energy.value;
    if (nextEnergy !== state.energy) {
      state.mapDateIndex = null;
    }
    state.energy = nextEnergy;
    render();
  });

  els.continent.addEventListener("change", () => {
    state.continent = els.continent.value;
    render();
  });

  els.stacked.addEventListener("change", () => {
    state.stacked = els.stacked.value;
    render();
  });

  els.details.addEventListener("change", () => {
    state.details = els.details.checked;
    render();
  });

  els.mapDateSlider.addEventListener("input", () => {
    state.mapDateIndex = Number(els.mapDateSlider.value);
    if (state.tab === "map" && mapSliderFrame === null) {
      mapSliderFrame = window.requestAnimationFrame(() => {
        mapSliderFrame = null;
        updateMapForDate();
      });
    }
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (state.tab === "line" || state.tab === "scatter") {
        render();
      } else if (state.tab === "map") {
        updateMapForDate(true);
      } else {
        const chartName = state.tab === "stacked" ? "stacked" : null;
        const chart = chartName ? charts[chartName] : null;
        if (chart && !chart.isDisposed()) {
          chart.resize();
          if (chartRenderState[chartName]) {
            chartRenderState[chartName].width = chart.getWidth();
          }
        }
      }
    }, 150);
  });
}

fillSelect(els.energy, ENERGY_TYPES);
fillSelect(els.continent, CONTINENTS, (value) => value);
fillSelect(els.stacked, STACKED_TYPES, (value) => value);
bindEvents();
updateVisibleControls();
render();
