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
  details: false,
  hoverTooltips: true,
  selectedYears: []
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
  hoverTooltips: document.getElementById("hoverTooltipToggle"),
  yearButtons: document.getElementById("yearButtons"),
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
  setHidden('[data-filter="continent"]', state.tab !== "overview");
  setHidden('[data-filter="details"]', state.tab !== "overview");
  setHidden('[data-filter="chart-tooltip"]', !["line", "stacked"].includes(state.tab));
  setHidden('[data-filter="years"]', state.tab !== "line");
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
    option.tooltip.triggerOn = state.hoverTooltips || chartName === "scatter" ? "mousemove|click" : "click";
    option.tooltip.axisPointer = option.tooltip.axisPointer || {};
    option.tooltip.axisPointer.animation = false;
    if (!state.hoverTooltips && chartName !== "scatter") {
      option.tooltip.trigger = "item";
    }
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

  const monthLabels = new Map([
    ["Jan-01", "Jan"], ["Feb-01", "Feb"], ["Mar-01", "Mar"],
    ["Apr-01", "Apr"], ["May-01", "May"], ["Jun-01", "Jun"],
    ["Jul-01", "Jul"], ["Aug-01", "Aug"], ["Sep-01", "Sep"],
    ["Oct-01", "Oct"], ["Nov-01", "Nov"], ["Dec-01", "Dec"]
  ]);

  option.xAxis.forEach((axis) => {
    axis.axisLabel = axis.axisLabel || {};
    axis.axisTick = axis.axisTick || {};
    axis.axisLabel.interval = (index, value) => monthLabels.has(value);
    axis.axisLabel.formatter = (value) => monthLabels.get(value) || "";
    axis.axisTick.interval = (index, value) => monthLabels.has(value);
  });
}

function ensureSelectedYears(config) {
  const years = config.years || [];
  const availableYears = new Set(years);
  state.selectedYears = state.selectedYears.filter((year) => availableYears.has(year));

  if (!state.selectedYears.length) {
    state.selectedYears = [...(config.default_years || years.slice(-3))];
  }
}

function renderYearButtons(config) {
  const years = config.years || [];
  const colors = config.year_colors || {};

  els.yearButtons.innerHTML = "";
  years.forEach((year) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "year-button";
    button.dataset.year = year;
    button.textContent = year;
    button.style.setProperty("--year-color", colors[year] || "#315A7D");
    button.classList.toggle("is-active", state.selectedYears.includes(year));
    button.addEventListener("click", () => toggleYear(year, config));
    els.yearButtons.appendChild(button);
  });
}

function toggleYear(year, config) {
  if (state.selectedYears.includes(year)) {
    if (state.selectedYears.length === 1) {
      return;
    }
    state.selectedYears = state.selectedYears.filter((item) => item !== year);
  } else {
    state.selectedYears = [...state.selectedYears, year].sort();
  }

  renderYearButtons(config);
  renderLineChart();
}

function applySelectedYears(option) {
  option.legend = option.legend || {};
  option.legend.selected = {};
  const selectedYears = new Set(state.selectedYears);

  (option.legend.data || []).forEach((item) => {
    const year = typeof item === "string" ? item : item.name;
    option.legend.selected[year] = selectedYears.has(year);
  });
}

async function renderLineChart() {
  setStatus("Loading daily trends...");
  try {
    const config = await fetchJson(`tools/line_chart/${state.energy}.json`);
    ensureSelectedYears(config);
    renderYearButtons(config);
    const option = cloneOption(config.option);
    applySelectedYears(option);
    setChart(els.lineChart, "line", option, chartHeight(config));
    setStatus(`${titleCase(state.energy)} trends`);
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

  els.hoverTooltips.addEventListener("change", () => {
    state.hoverTooltips = els.hoverTooltips.checked;
    render();
  });

  window.addEventListener("resize", () => {
    Object.values(charts).forEach((chart) => chart.resize());
  });
}

fillSelect(els.energy, ENERGY_TYPES);
fillSelect(els.continent, CONTINENTS, (value) => value);
fillSelect(els.stacked, STACKED_TYPES, (value) => value);
els.hoverTooltips.checked = state.hoverTooltips;
bindEvents();
updateVisibleControls();
render();
