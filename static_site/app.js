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

const WORLD_MAP_NAME = "cmPowerWorld";
const MAP_CHART_HEIGHT = 560;
const NON_MAP_COUNTRIES = new Set(["EU27&UK"]);
const MAP_SCALE_COLORS = [
  "#f7fbff",
  "#d8eef5",
  "#9ed2e1",
  "#61abc5",
  "#c9dfbb",
  "#fff0a8",
  "#f3c369",
  "#e58a4f",
  "#d85b4f",
  "#b93643",
  "#7f1f2d"
];
const MONTH_INDEX = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
};

const DAILY_TREND_YEAR_COLORS = {
  2019: "#b4dd9f",
  2020: "#70c268",
  2021: "#35994b",
  2022: "#176f34",
  2023: "#b0d2ea",
  2024: "#68a5d3",
  2025: "#246fa8",
  2026: "#d73027"
};

const DAILY_TREND_INACTIVE_COLOR = "#dbe3e4";
const CONTINENT_SCATTER_COLORS = {
  Africa: "#5070dd",
  Asia: "#b6d634",
  Europe: "#505372",
  "North America": "#ff994d",
  Oceania: "#0ca8df",
  "South America": "#ffd10a",
  Other: "#fb628b"
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
let worldMapRegistered = false;
let renderSerial = 0;
let mapUpdateSerial = 0;
let scatterSelectedContinents = null;
let scatterHasAnimated = false;
let scatterTransitionSerial = 0;

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
  mapCountryCount: document.getElementById("mapCountryCount"),
  mapTotalValue: document.getElementById("mapTotalValue"),
  mapCoverageNote: document.getElementById("mapCoverageNote")
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
  const rowGap = rows === 1 ? 0 : 24;
  const topBand = 112;
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
    charts[name].dispose();
  }
  const animateInitialScatter = name === "scatter" && !scatterHasAnimated;
  if (animateInitialScatter) {
    container.style.visibility = "hidden";
  }
  charts[name] = echarts.init(container, null, { renderer: "canvas", useDirtyRect: true });
  optimizeChartOption(option, name);
  if (name === "line" && Array.isArray(option.series)) {
    option.series.forEach((series, index) => {
      series.id = `daily-line-${index}`;
    });
    prepareDailyTrendRuntime(charts[name], option);
  }
  charts[name].setOption(option, true);
  if (animateInitialScatter) {
    scatterHasAnimated = true;
    revealScatterLayers(charts[name], container);
  } else if (name === "scatter") {
    syncScatterLayerVisibility(charts[name]);
  }
  chartRenderState[name] = {
    key: renderKey,
    width: chartContainerWidth(container),
    height
  };
  if (name === "line") {
    charts[name].on("legendselectchanged", (params) => (
      refreshDailyTrendYearStyles(charts[name], params.selected)
    ));
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
    option.tooltip.triggerOn = "mousemove|click";
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

function isDailyTrendYearSelected(option, year) {
  const legend = getDailyTrendLegend(option);
  return !legend || dailyTrendYearSelected(legend.selected, year);
}

function dailyTrendYearSelected(selected, year) {
  return !selected || selected[year] !== false;
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

  option.series.forEach((series) => {
    if (series.type !== "line") {
      return;
    }

    const color = DAILY_TREND_YEAR_COLORS[series.name];
    if (!color) {
      return;
    }

    const isLatest = series.name === "2026";
    const isSelected = isDailyTrendYearSelected(option, series.name);
    series.lineStyle = {
      ...(series.lineStyle || {}),
      color,
      width: isLatest ? 2.6 : isSelected ? 2.15 : 1.35,
      opacity: isLatest ? 1 : isSelected ? 0.96 : 0.42
    };
    series.itemStyle = {
      ...(series.itemStyle || {}),
      color,
      opacity: isLatest ? 1 : isSelected ? 0.96 : 0.42
    };
  });
}

function styleDailyTrendLegendItems(option) {
  const legend = getDailyTrendLegend(option);
  if (!legend || !Array.isArray(legend.data)) {
    return;
  }

  legend.data = styledDailyTrendLegendItems(legend.data, legend.selected);
}

function styledDailyTrendLegendItems(items, selected) {
  return items.map((item) => {
    const name = typeof item === "string" ? item : item.name;
    const color = DAILY_TREND_YEAR_COLORS[name];
    const isSelected = dailyTrendYearSelected(selected, name);
    return {
      ...(typeof item === "string" ? { name } : item),
      icon: "roundRect",
      textStyle: {
        ...((typeof item === "string" ? {} : item.textStyle) || {}),
        color: isSelected ? color || "#50605d" : DAILY_TREND_INACTIVE_COLOR,
        backgroundColor: isSelected ? "#ffffff" : "transparent",
        borderColor: isSelected ? color || "#50605d" : "transparent",
        borderWidth: isSelected ? 1 : 0,
        borderRadius: 4,
        fontWeight: isSelected ? 800 : 650,
        opacity: isSelected ? 1 : 0.45,
        padding: [3, 6, 3, 6]
      }
    };
  });
}

function prepareDailyTrendRuntime(chart, option) {
  const legend = getDailyTrendLegend(option);
  dailyTrendRuntime = {
    chart,
    legendItems: Array.isArray(legend?.data)
      ? legend.data.map((item) => (typeof item === "string" ? item : { ...item }))
      : [],
    series: option.series.map((series) => ({
      id: series.id,
      name: series.name,
      lineStyle: { ...(series.lineStyle || {}) },
      itemStyle: { ...(series.itemStyle || {}) }
    }))
  };
}

function refreshDailyTrendYearStyles(chart, selected = {}) {
  if (!dailyTrendRuntime || dailyTrendRuntime.chart !== chart) {
    return;
  }

  const series = dailyTrendRuntime.series.map((item) => {
    const color = DAILY_TREND_YEAR_COLORS[item.name];
    const isLatest = item.name === "2026";
    const isSelected = dailyTrendYearSelected(selected, item.name);
    return {
      id: item.id,
      lineStyle: {
        ...item.lineStyle,
        color,
        width: isLatest ? 2.6 : isSelected ? 2.15 : 1.35,
        opacity: isLatest ? 1 : isSelected ? 0.96 : 0.42
      },
      itemStyle: {
        ...item.itemStyle,
        color,
        opacity: isLatest ? 1 : isSelected ? 0.96 : 0.42
      }
    };
  });

  chart.setOption({
    legend: {
      selected: { ...selected },
      data: styledDailyTrendLegendItems(dailyTrendRuntime.legendItems, selected)
    },
    series
  }, { notMerge: false, lazyUpdate: true, silent: true });
}

function applyDailyTrendTheme(option) {
  option.backgroundColor = "#fbfcfc";
  option.color = Object.values(DAILY_TREND_YEAR_COLORS);

  const titles = Array.isArray(option.title) ? option.title : [option.title].filter(Boolean);
  titles.forEach((title, index) => {
    title.left = index === 0 ? "center" : title.left;
    title.top = index === 0 ? 16 : title.top;
    title.text = index === 0
      ? `${titleCase(state.energy)} Daily Generation Trends (${state.continent})`
      : title.text;
    title.textStyle = {
      ...(title.textStyle || {}),
      color: index === 0 ? "#1e2726" : "#2f3f3d",
      fontSize: index === 0 ? 18 : 13,
      fontWeight: index === 0 ? 700 : 700
    };
  });

  if (option.legend) {
    setDailyTrendRecentYearsSelected(option);
    option.legend.top = 52;
    option.legend.icon = "roundRect";
    option.legend.itemWidth = 18;
    option.legend.itemHeight = 4;
    option.legend.itemGap = 14;
    option.legend.borderWidth = 0;
    option.legend.borderRadius = 0;
    option.legend.backgroundColor = "transparent";
    option.legend.padding = 0;
    option.legend.inactiveColor = DAILY_TREND_INACTIVE_COLOR;
    option.legend.inactiveBorderColor = DAILY_TREND_INACTIVE_COLOR;
    option.legend.textStyle = {
      ...(option.legend.textStyle || {}),
      color: "#50605d",
      fontSize: 12,
      fontWeight: 700
    };

    styleDailyTrendLegendItems(option);
  }
}

function formatDailyTrendAxes(option, chartName) {
  if (chartName !== "line" || !Array.isArray(option.xAxis)) {
    return;
  }

  const quarterLabels = new Map([
    ["Apr-01", "Apr"],
    ["Jul-01", "Jul"], ["Oct-01", "Oct"]
  ]);

  option.xAxis.forEach((axis) => {
    axis.axisLabel = axis.axisLabel || {};
    axis.axisTick = axis.axisTick || {};
    axis.axisLabel.interval = (index, value) => quarterLabels.has(value);
    axis.axisLabel.formatter = (value) => quarterLabels.get(value) || "";
    axis.axisLabel.color = "#75847f";
    axis.axisLabel.fontSize = 10;
    axis.axisLabel.margin = 8;
    axis.axisTick.interval = (index, value) => quarterLabels.has(value);
    axis.axisTick.lineStyle = { color: "#c6d2d0" };
    axis.axisLine = axis.axisLine || {};
    axis.axisLine.lineStyle = { color: "#c6d2d0" };
  });

  if (Array.isArray(option.yAxis)) {
    option.yAxis.forEach((axis) => {
      axis.axisLabel = {
        ...(axis.axisLabel || {}),
        color: "#75847f",
        fontSize: 10,
        margin: 6
      };
      axis.axisTick = { ...(axis.axisTick || {}), show: false };
      axis.axisLine = { ...(axis.axisLine || {}), show: false };
      axis.splitLine = {
        ...(axis.splitLine || {}),
        show: true,
        lineStyle: {
          color: "#e6ecea",
          width: 1
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
  const sideGap = width < 620 ? 16 : 24;
  const columnGap = width < 760 ? 16 : 22;
  const availableWidth = Math.max(280, width - sideGap * 2 - columnGap * (columns - 1));
  const gridWidth = availableWidth / columns;
  const titleOffset = 0;
  const plotTopOffset = 28;
  const plotHeight = rowHeight - 52;

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
    grid.backgroundColor = "rgba(255, 255, 255, 0)";
    grid.borderColor = "#dce5e2";
    grid.borderWidth = 1;
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
        fill: "#2f3f3d",
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
  if (worldMapRegistered) {
    return;
  }
  const geoJson = await fetchJson("static_site/world-countries.geojson");
  echarts.registerMap(WORLD_MAP_NAME, geoJson);
  worldMapRegistered = true;
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

function mapOptionForDate(entry, mapData) {
  return {
    backgroundColor: "#f7faf9",
    tooltip: {
      trigger: "item",
      confine: true,
      borderWidth: 0,
      backgroundColor: "rgba(30, 39, 38, 0.92)",
      textStyle: { color: "#ffffff" },
      formatter: (params) => {
        if (!params.data || !Number.isFinite(params.data.rawValue)) {
          return [
            `<strong>${params.name}</strong>`,
            entry.date,
            "No CM Power data for this date"
          ].join("<br>");
        }
        return [
          `<strong>${params.name}</strong>`,
          entry.date,
          `${titleCase(state.energy)}: ${formatGwh(params.data.rawValue)}`
        ].join("<br>");
      }
    },
    visualMap: {
      type: "continuous",
      min: 0,
      max: 100,
      left: 24,
      bottom: 26,
      itemWidth: 12,
      itemHeight: 128,
      calculable: false,
      text: ["High", "Low"],
      textGap: 10,
      textStyle: {
        color: "#53625f",
        fontSize: 11,
        fontWeight: 700
      },
      inRange: {
        color: MAP_SCALE_COLORS
      },
      outOfRange: {
        color: "#d9dfdc"
      }
    },
    series: [{
      name: titleCase(state.energy),
      type: "map",
      map: WORLD_MAP_NAME,
      data: entry.data,
      roam: true,
      zoom: 1,
      top: 18,
      left: 28,
      right: 28,
      bottom: 18,
      selectedMode: false,
      label: {
        show: false
      },
      itemStyle: {
        areaColor: "#d9dfdc",
        borderColor: "rgba(24, 32, 30, 0.42)",
        borderWidth: 0.58
      },
      emphasis: {
        disabled: false,
        label: { show: false },
        itemStyle: {
          areaColor: "#f1c66d",
          borderColor: "rgba(24, 32, 30, 0.7)",
          borderWidth: 0.85
        }
      }
    }]
  };
}

function updateMapStats(entry) {
  els.mapDateValue.textContent = entry.date;
  els.mapCountryCount.textContent = entry.countryCount.toLocaleString();
  els.mapTotalValue.textContent = formatGwh(entry.total);
  els.mapDateLabel.textContent = entry.date;
}

async function updateMapForDate() {
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

  if (charts.map) {
    charts.map.setOption(mapOptionForDate(entry, mapData), true);
    chartRenderState.map = {
      key: `${state.energy}|${entry.date}`,
      width: chartContainerWidth(els.mapChart),
      height: MAP_CHART_HEIGHT
    };
    setStatus(`${titleCase(state.energy)} map / ${entry.date}`);
  } else {
    setChart(
      els.mapChart,
      "map",
      mapOptionForDate(entry, mapData),
      MAP_CHART_HEIGHT,
      `${state.energy}|${entry.date}`
    );
  }
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
    const entry = mapData.dates[state.mapDateIndex];
    const renderKey = `${state.energy}|${entry.date}`;
    updateMapStats(entry);
    if (els.mapCoverageNote) {
      els.mapCoverageNote.textContent = `Relative color scale within the selected date. No-data countries are gray. Latest complete coverage: ${mapData.latestCompleteCoverageDate || "-"}.`;
    }
    const status = `${titleCase(state.energy)} map / ${entry.date}`;
    if (!reuseRenderedChart(els.mapChart, "map", renderKey)) {
      setChart(els.mapChart, "map", mapOptionForDate(entry, mapData), MAP_CHART_HEIGHT, renderKey);
    }
    setStatus(status);
  } catch (error) {
    if (!isCurrentRender(renderId)) {
      return;
    }
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
  els.scatterMeta.innerHTML = `
    <span>IEA monthly comparison through <strong>${comparisonMonth}</strong></span>
  `;
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
    `${typeTitle} - ${country} ${year}-${monthLabel}`,
    `Continent: ${params.seriesName}`,
    `CM_Power: ${Number(cmPower).toFixed(2)}`,
    `IEA: ${Number(iea).toFixed(2)}`
  ].join("<br>");
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

function animateLayerOpacity(element, targetOpacity, duration, delay = 0) {
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
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
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

function revealScatterLayers(chart, container) {
  const continents = scatterRuntime?.continents || [];
  const selected = normalizedScatterSelection(scatterSelectedContinents || {});
  const layers = continents.map((continent) => ({
    continent,
    element: scatterLayerElement(chart, continent)
  })).filter(({ element }) => Boolean(element));

  layers.forEach(({ element }) => {
    element.style.opacity = "0";
  });
  container.style.visibility = "";

  window.requestAnimationFrame(() => {
    layers.forEach(({ continent, element }, index) => {
      if (selected[continent]) {
        animateLayerOpacity(element, 1, 1600, index * 90);
      }
    });
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

async function transitionScatterContinent(continent, button) {
  const chart = charts.scatter;
  if (
    !chart || chart.isDisposed() || !scatterRuntime ||
    els.scatterLegend?.classList.contains("is-transitioning")
  ) {
    return;
  }

  const serial = ++scatterTransitionSerial;
  const previousSelection = normalizedScatterSelection(scatterSelectedContinents || {});
  const nextSelected = !previousSelection[continent];
  const nextSelection = { ...previousSelection, [continent]: nextSelected };
  scatterSelectedContinents = nextSelection;
  button.setAttribute("aria-pressed", String(nextSelected));
  els.scatterLegend?.classList.add("is-transitioning");
  els.scatterLegend?.setAttribute("aria-busy", "true");

  await animateLayerOpacity(
    scatterLayerElement(chart, continent),
    nextSelected ? 1 : 0,
    nextSelected ? 1350 : 1150
  );

  if (serial === scatterTransitionSerial && !chart.isDisposed()) {
    refreshScatterSelection(chart, nextSelection, false);
  }

  els.scatterLegend?.classList.remove("is-transitioning");
  els.scatterLegend?.removeAttribute("aria-busy");
}

function refreshScatterSelection(chart, selected = {}, lazyUpdate = true) {
  if (!chart || !scatterRuntime) {
    return;
  }

  const rowsByGrid = scatterRuntime.rowsByGrid.map((rowsByContinent) => (
    scatterRuntime.continents.flatMap((continent) => (
      selected[continent] === false ? [] : rowsByContinent.get(continent) || []
    ))
  ));

  const titles = [];
  const xAxis = [];
  const yAxis = [];
  const referenceSeries = [];
  const scatterSeriesUpdates = [];

  rowsByGrid.forEach((rows, index) => {
    const stats = scatterFitStats(rows);
    const maxValue = rows.length ? Math.max(...rows.flatMap((row) => [row.value, row.iea])) : 1;
    const axis = niceScatterAxis(maxValue);

    titles.push({
      id: `scatter-title-${index}`,
      text: `${scatterRuntime.gridLabels[index]} · R2 ${formatR2(stats.r2)}`
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
    scatterRuntime.continents.forEach((continent) => {
      scatterSeriesUpdates.push({
        id: `scatter-${index}-${continent}`,
        silent: selected[continent] === false
      });
    });
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
        show: false
      });

      xAxis.push({
        id: `scatter-x-${index}`,
        gridIndex: index,
        min: 0,
        max: maxVal,
        interval: axis.interval,
        splitNumber: 4,
        name: "CM_Power",
        nameLocation: "center",
        nameGap: 31,
        position: "bottom",
        nameTextStyle: { color: "#35413f", fontSize: 13, fontWeight: 650 },
        axisLabel: { color: "#4f5b59", fontSize: 12, margin: 10 },
        axisLine: {
          show: true,
          onZero: false,
          lineStyle: { color: "#202725", width: 1.1 }
        },
        axisTick: {
          show: true,
          inside: true,
          length: 7,
          lineStyle: { color: "#202725", width: 1 }
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
        name: "IEA",
        nameLocation: "center",
        nameGap: 40,
        position: "left",
        nameTextStyle: { color: "#35413f", fontSize: 13, fontWeight: 650 },
        axisLabel: { color: "#4f5b59", fontSize: 12, margin: 10 },
        axisLine: {
          show: true,
          onZero: false,
          lineStyle: { color: "#202725", width: 1.1 }
        },
        axisTick: {
          show: true,
          inside: true,
          length: 7,
          lineStyle: { color: "#202725", width: 1 }
        },
        minorTick: { show: false },
        splitLine: { show: false }
      });

      titles.push({
        id: `scatter-title-${index}`,
        text: `${typeTitle} · R2 ${formatR2(stats.r2)}`,
        textAlign: "center",
        left: position.left + position.plotWidth / 2,
        top: position.titleTop,
        textStyle: { color: "#35413f", fontSize: 16, fontWeight: 750 }
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
        lineStyle: { color: "#98a7a5", width: 1.2, type: "dashed", opacity: 0.75 },
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
          symbolSize: 15,
          large: false,
          progressive: 3000,
          progressiveThreshold: 5000,
          itemStyle: {
            color: CONTINENT_SCATTER_COLORS[continent],
            borderColor: "#555",
            borderWidth: 1,
            opacity: 0.86
          },
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
      rowsByGrid
    };
    renderScatterLegend(continents);

    const option = {
      title: titles,
      grid,
      xAxis,
      yAxis,
      series,
      tooltip: {
        trigger: "item",
        formatter: scatterTooltip,
        padding: [10, 12],
        textStyle: { fontSize: 14, lineHeight: 20 }
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
    if (state.tab === "map") {
      updateMapForDate();
    }
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (state.tab === "line" || state.tab === "scatter") {
        render();
      } else {
        const chartName = state.tab === "stacked" ? "stacked" : state.tab === "map" ? "map" : null;
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
