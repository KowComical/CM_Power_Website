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
  scatter: "IEA Compare"
};

const state = {
  tab: "overview",
  energy: "total",
  continent: "World",
  stacked: "Fossil",
  details: false
};

const jsonCache = new Map();
const charts = {};
let scatterRecords = null;

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
  scatterChart: document.getElementById("scatterChart")
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

function dailyTrendColumns(width) {
  if (width < 620) {
    return 1;
  }
  if (width < 980) {
    return 2;
  }
  if (width < 1320) {
    return 3;
  }
  return 4;
}

function lineChartHeight(option, columns) {
  const gridCount = Array.isArray(option.grid) ? option.grid.length : 1;
  const rows = Math.max(1, Math.ceil(gridCount / columns));
  return Math.max(620, rows * 320 + 120);
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
      series.large = true;
      series.largeThreshold = 600;
    }
  });
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
    axis.axisTick.interval = (index, value) => quarterLabels.has(value);
  });
}

function reflowDailyTrendLayout(option, containerWidth) {
  if (!Array.isArray(option.grid)) {
    return 1;
  }

  const gridCount = option.grid.length;
  const columns = dailyTrendColumns(containerWidth);
  const rows = Math.max(1, Math.ceil(gridCount / columns));
  const width = 100 / columns;
  const rowHeight = 92 / rows;
  const widthAdjustment = columns === 1 ? 1.8 : 0.8;
  const rowGap = Math.min(1.2, Math.max(0.22, rowHeight * 0.18));
  const titleBand = Math.min(0.95, Math.max(0.32, rowHeight * 0.12));

  option.grid.forEach((grid, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const itemTop = rowHeight * row + 3.0 + rowGap * 0.65;
    const gridTop = itemTop + titleBand;
    grid.top = `${gridTop}%`;
    grid.left = `${width * column + widthAdjustment - 0.2}%`;
    grid.width = `${width - 2.0 * widthAdjustment}%`;
    grid.height = `${rowHeight - rowGap - titleBand}%`;
    grid.containLabel = true;
    grid.show = true;
    grid.backgroundColor = "rgba(255, 255, 255, 0)";
    grid.borderColor = "rgba(49, 90, 125, 0.18)";
    grid.borderWidth = 1;
  });

  if (Array.isArray(option.graphic)) {
    option.graphic.forEach((graphic, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const gridCenter = width * column + widthAdjustment - 0.2 + (width - 2.0 * widthAdjustment) / 2;
      const itemTop = rowHeight * row + 3.0 + rowGap * 0.65;
      graphic.left = `${gridCenter}%`;
      graphic.top = `${itemTop + 0.18}%`;
      graphic.style = {
        ...(graphic.style || {}),
        align: "center",
        textAlign: "center",
        textVerticalAlign: "top"
      };
    });
  }

  return columns;
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
    const columns = reflowDailyTrendLayout(option, containerWidth);
    setChart(els.lineChart, "line", option, lineChartHeight(option, columns));
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
