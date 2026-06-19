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
  Africa: "#b73535",
  Asia: "#b47600",
  Europe: "#245f9c",
  "North America": "#81363f",
  Oceania: "#087968",
  "South America": "#7a3f99",
  Other: "#526166"
};
const SCATTER_CONTINENTS = [
  "Africa", "Asia", "Europe",
  "North America", "Oceania", "South America", "Other"
];

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
let scatterRecords = null;
let scatterMetadata = null;
let countryContinentMap = null;
let scatterRuntime = null;
let worldMapRegistered = false;
let renderSerial = 0;
let mapUpdateSerial = 0;

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
  const response = await fetch(encodeURI(path), { cache: "no-store" });
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

function setChart(container, name, option, height) {
  container.style.height = `${height}px`;
  if (charts[name]) {
    charts[name].dispose();
  }
  charts[name] = echarts.init(container, null, { renderer: "canvas", useDirtyRect: true });
  optimizeChartOption(option, name);
  charts[name].setOption(option, true);
  if (name === "line") {
    charts[name].on("legendselectchanged", () => refreshDailyTrendYearStyles(charts[name]));
    charts[name].on("legendselected", () => refreshDailyTrendYearStyles(charts[name]));
    charts[name].on("legendunselected", () => refreshDailyTrendYearStyles(charts[name]));
  } else if (name === "scatter") {
    charts[name].on("legendselectchanged", (params) => refreshScatterSelection(charts[name], params.selected));
    charts[name].on("legendselected", (params) => refreshScatterSelection(charts[name], params.selected));
    charts[name].on("legendunselected", (params) => refreshScatterSelection(charts[name], params.selected));
    refreshScatterSelection(charts[name]);
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
    series.emphasis = { disabled: true };
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
  return !legend || !legend.selected || legend.selected[year] !== false;
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

  legend.data = legend.data.map((item) => {
    const name = typeof item === "string" ? item : item.name;
    const color = DAILY_TREND_YEAR_COLORS[name];
    const isSelected = isDailyTrendYearSelected(option, name);
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

function refreshDailyTrendYearStyles(chart) {
  const option = chart.getOption();
  styleDailyTrendLegendItems(option);
  styleDailyTrendSeries(option);
  chart.setOption({
    legend: option.legend,
    series: option.series
  }, false);
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
  setStatus("Loading daily trends...");
  try {
    const config = await fetchJson(`tools/line_chart/${state.energy}.json`);
    if (!isCurrentRender(renderId)) {
      return;
    }
    const option = cloneOption(config.option);
    const selectedCountryCount = filterDailyTrendOption(option, config);
    const containerWidth = els.lineChart.clientWidth || els.lineChart.parentElement.clientWidth || window.innerWidth;
    const layout = dailyTrendLayout(option, containerWidth);
    reflowDailyTrendLayout(option, layout);
    setChart(els.lineChart, "line", option, layout.height);
    const regionLabel = state.continent === "World" ? "World" : `${state.continent} (${selectedCountryCount})`;
    setStatus(`${titleCase(state.energy)} trends / ${regionLabel}`);
  } catch (error) {
    if (!isCurrentRender(renderId)) {
      return;
    }
    showError(els.lineChart, error);
    setStatus("Daily trends failed");
  }
}

async function renderStackedChart(renderId) {
  setStatus("Loading generation mix...");
  try {
    const config = await fetchJson(`tools/stacked_area_chart/${state.stacked}.json`);
    if (!isCurrentRender(renderId)) {
      return;
    }
    setChart(els.stackedChart, "stacked", cloneOption(config.option), chartHeight(config));
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
  for (let index = dates.length - 1; index >= 0; index -= 1) {
    if (dates[index].countryCount === maxCountryCount) {
      latestCompleteCoverageDate = dates[index].date;
      break;
    }
  }

  const mapData = {
    dates,
    defaultIndex: dates.length - 1,
    maxCountryCount,
    latestCompleteCoverageDate
  };
  mapDataCache.set(energyType, mapData);
  return mapData;
}

function mapOptionForDate(entry, mapData) {
  return {
    backgroundColor: "#edf5f7",
    tooltip: {
      trigger: "item",
      confine: true,
      borderWidth: 0,
      backgroundColor: "rgba(30, 39, 38, 0.92)",
      textStyle: { color: "#ffffff" },
      formatter: (params) => {
        if (!params.data || !Number.isFinite(params.data.rawValue)) {
          return `<strong>${params.name}</strong><br>No CM Power data`;
        }
        return [
          `<strong>${params.name}</strong>`,
          entry.date,
          `${titleCase(state.energy)}: ${formatGwh(params.data.rawValue)}`,
          `Coverage: ${entry.countryCount} countries`
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
        color: "#e7e2da"
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
        areaColor: "#e7e2da",
        borderColor: "rgba(255, 255, 255, 0.94)",
        borderWidth: 0.75,
        shadowBlur: 3,
        shadowColor: "rgba(88, 111, 113, 0.13)",
        shadowOffsetY: 1
      },
      emphasis: {
        disabled: false,
        label: { show: false },
        itemStyle: {
          areaColor: "#f1c66d",
          borderColor: "#ffffff",
          borderWidth: 0.9
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
    setStatus(`${titleCase(state.energy)} map / ${entry.date}`);
  } else {
    setChart(els.mapChart, "map", mapOptionForDate(entry, mapData), MAP_CHART_HEIGHT);
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
    updateMapStats(entry);
    if (els.mapCoverageNote) {
      els.mapCoverageNote.textContent = `Color scale is relative within the selected date. Latest complete coverage: ${mapData.latestCompleteCoverageDate || "-"}.`;
    }
    setChart(els.mapChart, "map", mapOptionForDate(entry, mapData), MAP_CHART_HEIGHT);
    setStatus(`${titleCase(state.energy)} map / ${entry.date}`);
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

function scatterColumns(width, gridCount) {
  if (width < 720) {
    return 1;
  }
  if (width < 1180) {
    return Math.min(2, gridCount);
  }
  return Math.min(3, gridCount);
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
  if (!Array.isArray(value) || value.length < 6) {
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

function refreshScatterSelection(chart, selected = {}) {
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
  });

  chart.setOption({ title: titles, xAxis, yAxis, series: referenceSeries }, false);
}

async function renderScatterChart(renderId) {
  setStatus("Loading IEA comparison...");
  try {
    const records = await loadScatterRecords();
    const metadata = await loadScatterMetadata();
    if (!isCurrentRender(renderId)) {
      return;
    }
    updateScatterMetadata(metadata);
    const continentsByCountry = await loadCountryContinents();
    if (!isCurrentRender(renderId)) {
      return;
    }
    const types = ENERGY_TYPES.filter((type) => records.some((row) => row.type === type));
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
    const containerWidth = els.scatterChart.clientWidth || els.scatterChart.parentElement.clientWidth || window.innerWidth;
    const columns = scatterColumns(containerWidth, types.length);
    const rows = Math.max(1, Math.ceil(types.length / columns));
    const chartHeightValue = 122 + rows * 320 + 38;
    const sideGap = columns === 1 ? 8 : 4.5;
    const columnGap = columns === 1 ? 0 : 3.5;
    const gridWidth = (100 - sideGap * 2 - columnGap * (columns - 1)) / columns;

    const grid = [];
    const xAxis = [];
    const yAxis = [];
    const series = [];
    const rowsByGrid = [];
    const titles = [{
      text: "Comparison of CM_Power and IEA by Energy Source for Key Countries (TWh)",
      left: "center",
      top: "0%"
    }];

    types.forEach((type, index) => {
      const group = recordsByType.get(type) || [];
      const typeTitle = titleCase(type);
      const stats = scatterFitStats(group);
      const axis = niceScatterAxis(Math.max(...group.flatMap((row) => [row.value, row.iea])));
      const maxVal = axis.max;
      const col = index % columns;
      const row = Math.floor(index / columns);
      const left = sideGap + col * (gridWidth + columnGap);
      const titleTop = 92 + row * 320;
      const gridTop = titleTop + 28;

      grid.push({
        left: `${left}%`,
        top: gridTop,
        width: `${gridWidth}%`,
        height: 230,
        containLabel: true
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
        nameGap: 25,
        axisLabel: { color: "#5d6969", fontSize: 10 },
        axisLine: { lineStyle: { color: "#b7c7c5" } },
        splitLine: { lineStyle: { color: "#e6eeec" } }
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
        nameGap: 30,
        axisLabel: { color: "#5d6969", fontSize: 10 },
        axisLine: { lineStyle: { color: "#b7c7c5" } },
        splitLine: { lineStyle: { color: "#e6eeec" } }
      });

      titles.push({
        id: `scatter-title-${index}`,
        text: `${typeTitle} · R2 ${formatR2(stats.r2)}`,
        textAlign: "center",
        left: `${left + gridWidth / 2}%`,
        top: titleTop,
        textStyle: { color: "#546160", fontSize: 13, fontWeight: 700 }
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
          name: continent,
          type: "scatter",
          xAxisIndex: index,
          yAxisIndex: index,
          dimensions: ["CM_Power", "IEA", "country", "year", "month", "type"],
          encode: { x: 0, y: 1 },
          symbol: "circle",
          symbolSize: 6.2,
          large: false,
          progressive: 3000,
          progressiveThreshold: 5000,
          itemStyle: {
            color: CONTINENT_SCATTER_COLORS[continent],
            borderColor: "rgba(255, 255, 255, 0.88)",
            borderWidth: 0.6,
            opacity: 0.9
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

    const option = {
      title: titles,
      grid,
      xAxis,
      yAxis,
      series,
      tooltip: {
        trigger: "item",
        formatter: scatterTooltip
      },
      legend: {
        data: continents.map((continent) => ({
          name: continent,
          icon: "roundRect",
          textStyle: {
            color: CONTINENT_SCATTER_COLORS[continent],
            fontWeight: 800,
            backgroundColor: "#f8fbfa",
            borderColor: CONTINENT_SCATTER_COLORS[continent],
            borderWidth: 1,
            borderRadius: 4,
            padding: [4, 7, 4, 7]
          }
        })),
        orient: "horizontal",
        left: "center",
        top: 46,
        itemWidth: 22,
        itemHeight: 7,
        itemGap: 13,
        inactiveColor: "#aebaba",
        textStyle: { fontSize: 13, color: "#4b5656" }
      }
    };

    setChart(els.scatterChart, "scatter", option, Math.max(760, chartHeightValue));
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
    state.energy = els.energy.value;
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
      if (state.tab === "line") {
        render();
      } else if (state.tab === "scatter") {
        render();
      } else {
        Object.values(charts).forEach((chart) => chart.resize());
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
