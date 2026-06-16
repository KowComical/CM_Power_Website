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
  stacked: "Source Share",
  scatter: "IEA Compare",
  map: "Global Map"
};

const WORLD_MAP_NAME = "cmPowerWorld";
const MAP_CHART_HEIGHT = 560;
const NON_MAP_COUNTRIES = new Set(["EU27&UK"]);
const MONTH_INDEX = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
};

const DAILY_TREND_YEAR_COLORS = {
  2019: "#c8d5dc",
  2020: "#b2c4ce",
  2021: "#98afbc",
  2022: "#7897a8",
  2023: "#587f93",
  2024: "#34657c",
  2025: "#184b60",
  2026: "#d84a3a"
};

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
let worldMapRegistered = false;

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
  scatterChart: document.getElementById("scatterChart"),
  mapChart: document.getElementById("mapChart"),
  mapDateSlider: document.getElementById("mapDateSlider"),
  mapDateLabel: document.getElementById("mapDateLabel"),
  mapDateValue: document.getElementById("mapDateValue"),
  mapCountryCount: document.getElementById("mapCountryCount"),
  mapTotalValue: document.getElementById("mapTotalValue")
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
  container.innerHTML = `
    <div class="error-box">
      Failed to load this view. Start a local web server from the project root if you opened the file directly.
      <br>${error.message}
    </div>
  `;
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
    jsonCache.set(path, fetchText(path).then((text) => JSON.parse(text)));
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

async function renderOverview() {
  setStatus("Loading overview...");
  const detailName = state.details ? "none" : "visible";
  const path = `tools/data_description/${state.energy}_${state.continent}_${detailName}.html`;
  try {
    els.scorecard.innerHTML = await fetchText(path);
    setStatus(`${titleCase(state.energy)} / ${state.continent}`);
  } catch (error) {
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
      if (chartName === "line") {
        const color = DAILY_TREND_YEAR_COLORS[series.name];
        const isLatest = series.name === "2026";
        if (color) {
          series.lineStyle = {
            ...(series.lineStyle || {}),
            color,
            width: isLatest ? 2.4 : 1.8,
            opacity: isLatest ? 1 : 0.78
          };
          series.itemStyle = {
            ...(series.itemStyle || {}),
            color,
            opacity: isLatest ? 1 : 0.78
          };
        }
      }
    }

    if (series.type === "scatter") {
      series.symbolSize = series.symbolSize || 4;
      series.large = true;
      series.largeThreshold = 600;
    }
  });
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
    option.legend.top = 52;
    option.legend.icon = "roundRect";
    option.legend.itemWidth = 18;
    option.legend.itemHeight = 4;
    option.legend.itemGap = 14;
    option.legend.borderWidth = 0;
    option.legend.borderRadius = 0;
    option.legend.backgroundColor = "transparent";
    option.legend.padding = 0;
    option.legend.textStyle = {
      ...(option.legend.textStyle || {}),
      color: "#50605d",
      fontSize: 12,
      fontWeight: 700
    };

    if (Array.isArray(option.legend.data)) {
      option.legend.data = option.legend.data.map((item) => {
        const name = typeof item === "string" ? item : item.name;
        const color = DAILY_TREND_YEAR_COLORS[name];
        return {
          ...(typeof item === "string" ? { name } : item),
          icon: "roundRect",
          textStyle: {
            ...((typeof item === "string" ? {} : item.textStyle) || {}),
            color: color || "#50605d"
          }
        };
      });
    }
  }
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

async function renderLineChart() {
  setStatus("Loading daily trends...");
  try {
    const config = await fetchJson(`tools/line_chart/${state.energy}.json`);
    const option = cloneOption(config.option);
    const selectedCountryCount = filterDailyTrendOption(option, config);
    const containerWidth = els.lineChart.clientWidth || els.lineChart.parentElement.clientWidth || window.innerWidth;
    const layout = dailyTrendLayout(option, containerWidth);
    reflowDailyTrendLayout(option, layout);
    setChart(els.lineChart, "line", option, layout.height);
    const regionLabel = state.continent === "World" ? "World" : `${state.continent} (${selectedCountryCount})`;
    setStatus(`${titleCase(state.energy)} trends / ${regionLabel}`);
  } catch (error) {
    showError(els.lineChart, error);
    setStatus("Daily trends failed");
  }
}

async function renderStackedChart() {
  setStatus("Loading source share...");
  try {
    const config = await fetchJson(`tools/stacked_area_chart/${state.stacked}.json`);
    setChart(els.stackedChart, "stacked", cloneOption(config.option), chartHeight(config));
    setStatus(`${state.stacked} share`);
  } catch (error) {
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

function quantile(values, probability) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) {
    return 0;
  }
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sorted[lower];
  }
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
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
      const rawValues = [];
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
          value: Math.log10(rawValue + 1),
          rawValue
        });
        rawValues.push(rawValue);
        total += rawValue;
      });

      if (data.length) {
        dates.push({
          date,
          data,
          countryCount: data.length,
          total,
          visualMax: Math.max(1, Math.log10(quantile(rawValues, 0.95) + 1))
        });
      }
    });
  });

  const maxCountryCount = Math.max(...dates.map((entry) => entry.countryCount));
  let maxCompleteIndex = dates.length - 1;
  for (let index = dates.length - 1; index >= 0; index -= 1) {
    if (dates[index].countryCount === maxCountryCount) {
      maxCompleteIndex = index;
      break;
    }
  }
  const completeDates = dates.slice(0, maxCompleteIndex + 1);
  const mapData = {
    dates: completeDates,
    defaultIndex: completeDates.length - 1
  };
  mapDataCache.set(energyType, mapData);
  return mapData;
}

function mapOptionForDate(entry) {
  const maxLabel = formatGwh(Math.pow(10, entry.visualMax) - 1);

  return {
    backgroundColor: "#fbfcfc",
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
          `${titleCase(state.energy)}: ${formatGwh(params.data.rawValue)}`
        ].join("<br>");
      }
    },
    visualMap: {
      min: 0,
      max: entry.visualMax,
      left: 24,
      bottom: 26,
      itemWidth: 12,
      itemHeight: 118,
      calculable: false,
      text: [maxLabel, "0 GWh"],
      textGap: 10,
      textStyle: {
        color: "#53625f",
        fontSize: 11,
        fontWeight: 700
      },
      inRange: {
        color: ["#fbfdff", "#d8e8f6", "#88b7dc", "#f0b6ad", "#c86464"]
      },
      outOfRange: {
        color: "#edf2f0"
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
        areaColor: "#edf2f0",
        borderColor: "#ffffff",
        borderWidth: 0.7
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
  const mapData = await loadMapData(state.energy);
  const entry = mapData.dates[state.mapDateIndex];
  if (!entry) {
    return;
  }

  updateMapStats(entry);
  els.mapDateSlider.value = String(state.mapDateIndex);

  if (charts.map) {
    charts.map.setOption(mapOptionForDate(entry), true);
    setStatus(`${titleCase(state.energy)} map / ${entry.date}`);
  } else {
    setChart(els.mapChart, "map", mapOptionForDate(entry), MAP_CHART_HEIGHT);
  }
}

async function renderMapChart() {
  setStatus("Loading global map...");
  try {
    await ensureWorldMap();
    const mapData = await loadMapData(state.energy);
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
    setChart(els.mapChart, "map", mapOptionForDate(entry), MAP_CHART_HEIGHT);
    setStatus(`${titleCase(state.energy)} map / ${entry.date}`);
  } catch (error) {
    showError(els.mapChart, error);
    setStatus("Global map failed");
  }
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift().split(",").map((header) => header.replace(/^\uFEFF/, ""));
  return lines.map((line) => {
    const cells = line.split(",");
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index];
    });
    row.year = Number(row.year);
    row.month = Number(row.month);
    row.value = Number(row.value);
    row.iea = Number(row.iea);
    return row;
  });
}

function colorForIndex(index, total) {
  const hue = Math.round((index * 360) / Math.max(total, 1));
  return `hsl(${hue}, 58%, 48%)`;
}

async function loadScatterRecords() {
  if (!scatterRecords) {
    scatterRecords = parseCsv(await fetchText("data/data_for_scatter_plot.csv"));
  }
  return scatterRecords;
}

async function renderScatterChart() {
  setStatus("Loading IEA comparison...");
  try {
    const records = await loadScatterRecords();
    const types = ENERGY_TYPES.filter((type) => records.some((row) => row.type === type));
    const countries = [...new Set(records.map((row) => row.country))].sort();
    const countryColors = new Map(countries.map((country, index) => [
      country,
      colorForIndex(index, countries.length)
    ]));

    const grid = [];
    const xAxis = [];
    const yAxis = [];
    const series = [];
    const titles = [{
      text: "Comparison of CM_Power and IEA by Energy Source for Key Countries (TWh)",
      left: "center",
      top: "0%"
    }];

    types.forEach((type, index) => {
      const group = records.filter((row) => row.type === type);
      const maxVal = Math.max(...group.flatMap((row) => [row.value, row.iea]));
      const col = index % 4;
      const row = Math.floor(index / 4);

      grid.push({
        left: `${col * 25 + 3}%`,
        top: `${row * 25 + 10}%`,
        width: "20.5%",
        height: "20.5%",
        containLabel: true
      });

      xAxis.push({
        gridIndex: index,
        min: 0,
        max: maxVal,
        name: "CM_Power",
        nameLocation: "center",
        nameGap: 25
      });

      yAxis.push({
        gridIndex: index,
        min: 0,
        max: maxVal,
        name: "IEA",
        nameLocation: "center",
        nameGap: 30
      });

      titles.push({
        text: titleCase(type),
        textAlign: "center",
        left: `${col * 25 + 13}%`,
        top: `${row * 25 + 8}%`,
        textStyle: { color: "#666", fontSize: 15 }
      });

      countries.forEach((country) => {
        const countryRows = group
          .filter((item) => item.country === country)
          .sort((a, b) => (a.year - b.year) || (a.month - b.month));

        if (!countryRows.length) {
          return;
        }

        series.push({
          name: country,
          type: "scatter",
          xAxisIndex: index,
          yAxisIndex: index,
          data: countryRows.map((item) => ({
            value: [item.value, item.iea],
            name: `${titleCase(type)} - ${country} ${item.year}-${String(item.month).padStart(2, "0")}\nCM_Power: ${item.value.toFixed(2)}\nIEA: ${item.iea.toFixed(2)}`,
            itemStyle: {
              color: countryColors.get(country),
              opacity: 0.5 + 0.5 * (item.year + item.month / 12 - 2019) / 7
            }
          }))
        });
      });
    });

    const option = {
      title: titles,
      grid,
      xAxis,
      yAxis,
      series,
      tooltip: {
        trigger: "item",
        formatter: (params) => String(params.data.name).replace(/\n/g, "<br>")
      },
      legend: {
        data: countries,
        orient: "horizontal",
        left: "center",
        top: 50,
        icon: "circle",
        itemWidth: 12,
        itemHeight: 12,
        textStyle: { fontSize: 14, color: "#333" }
      }
    };

    const height = Math.max(760, 500 * Math.ceil(types.length / 4));
    setChart(els.scatterChart, "scatter", option, height);
    setStatus("IEA comparison");
  } catch (error) {
    showError(els.scatterChart, error);
    setStatus("IEA comparison failed");
  }
}

function render() {
  if (state.tab === "overview") {
    renderOverview();
  } else if (state.tab === "line") {
    renderLineChart();
  } else if (state.tab === "stacked") {
    renderStackedChart();
  } else if (state.tab === "scatter") {
    renderScatterChart();
  } else if (state.tab === "map") {
    renderMapChart();
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
        renderLineChart();
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
