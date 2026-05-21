const startDateInput = document.getElementById("start-date");
const endDateInput = document.getElementById("end-date");
const refreshButton = document.getElementById("refresh-btn");
const chartMeta = document.getElementById("chart-meta");
const errorBanner = document.getElementById("error-banner");

const kpiConsumption = document.getElementById("kpi-consumption");
const kpiProduction = document.getElementById("kpi-production");
const kpiSelfConsumption = document.getElementById("kpi-self-consumption");
const kpiSelfRate = document.getElementById("kpi-self-rate");
const kpiSelfRateFill = document.getElementById("kpi-self-rate-fill");
const kpiSelfRateLabel = document.getElementById("kpi-self-rate-label");

const livePv = document.getElementById("live-pv");
const liveLoad = document.getElementById("live-load");
const liveGrid = document.getElementById("live-grid");

const chartCanvas = document.getElementById("energy-chart");
const dailyChartsContainer = document.getElementById("daily-charts");
const viewModeButtons = document.querySelectorAll(".view-mode-btn");

let energyChart = null;
let dailyCharts = [];
let chartViewMode = "positive";
let currentEnergyPayload = null;
const lineChartTimeUnits = new Set(["HOUR", "QUARTER_OF_AN_HOUR"]);

const syncViewportHeight = () => {
    document.documentElement.style.setProperty("--app-vh", `${window.innerHeight * 0.01}px`);
};

syncViewportHeight();
window.addEventListener("resize", syncViewportHeight, { passive: true });
window.addEventListener("orientationchange", syncViewportHeight, { passive: true });

// Set default dates: today for both
const today = new Date();
startDateInput.valueAsDate = today;
endDateInput.valueAsDate = today;

const formatKwh = (value) => `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })} kWh`;
const formatPercent = (value) => `${Number(value).toFixed(1)}%`;
const formatPower = (value, unit) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return "-";
    }

    return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${unit ?? "kW"}`;
};

const setError = (message) => {
    if (!message) {
        errorBanner.hidden = true;
        errorBanner.textContent = "";
        return;
    }

    errorBanner.hidden = false;
    errorBanner.textContent = message;
};

const getCurrentDateValues = () => {
    if (!startDateInput.value) {
        startDateInput.valueAsDate = today;
    }
    if (!endDateInput.value) {
        endDateInput.valueAsDate = today;
    }
    return {
        start: startDateInput.value,
        end: endDateInput.value,
    };
};

const isSingleDayRange = (start, end) => start === end;
const MAX_LINE_VIEW_DAYS = 3;

const parseLabelDate = (label) => {
    const normalized = label.includes(" ") ? label.replace(" ", "T") : label;
    const date = new Date(normalized);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date;
};

const parseIsoDate = (value) => {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
};

const getRangeLengthInDays = (start, end) => {
    const startDate = parseIsoDate(start);
    const endDate = parseIsoDate(end);

    if (!startDate || !endDate) {
        return null;
    }

    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    const diffDays = Math.floor((endDate.getTime() - startDate.getTime()) / millisecondsPerDay) + 1;
    return diffDays > 0 ? diffDays : null;
};

const shouldUseLineChart = (meta) => {
    const timeUnit = meta?.timeUnit ?? "DAY";

    if (lineChartTimeUnits.has(timeUnit)) {
        return true;
    }

    const rangeDays = getRangeLengthInDays(meta?.start, meta?.end);
    return rangeDays !== null && rangeDays <= MAX_LINE_VIEW_DAYS;
};

const shouldUseDailySmallMultiples = (meta) => {
    const rangeDays = getRangeLengthInDays(meta?.start, meta?.end);
    return Boolean(rangeDays && rangeDays >= 2 && rangeDays <= 3 && lineChartTimeUnits.has(meta?.timeUnit ?? "DAY"));
};

const getDayKey = (label) => {
    if (typeof label === "string" && label.length >= 10) {
        return label.slice(0, 10);
    }

    return "unknown";
};

const groupPointsByDay = (points) => {
    const grouped = new Map();

    points.forEach((point) => {
        const dayKey = getDayKey(point.label);

        if (!grouped.has(dayKey)) {
            grouped.set(dayKey, []);
        }

        grouped.get(dayKey).push(point);
    });

    return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right));
};

const formatDayTitle = (dayKey) => {
    const date = parseIsoDate(dayKey);
    if (!date) {
        return dayKey;
    }

    return date.toLocaleDateString("fr-FR", {
        weekday: "short",
        day: "2-digit",
        month: "short",
    });
};

const formatTime24h = (date) => date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
});

const formatLabel = (label, timeUnit) => {
    const date = parseLabelDate(label);

    if (!date) {
        return label;
    }

    if (lineChartTimeUnits.has(timeUnit)) {
        return formatTime24h(date);
    }

    if (timeUnit === "MONTH") {
        return date.toLocaleDateString([], {
            month: "short",
            year: "2-digit",
        });
    }

    return date.toLocaleDateString([], {
        month: "short",
        day: "numeric",
    });
};

const getXAxisTickLimit = (timeUnit, pointCount) => {
    if (lineChartTimeUnits.has(timeUnit)) {
        return pointCount > 48 ? 6 : 8;
    }

    if (timeUnit === "MONTH") {
        return 12;
    }

    return Math.min(8, pointCount);
};

const fetchJson = async (url) => {
    const response = await fetch(url);
    const payload = await response.json();

    if (!response.ok) {
        throw new Error(payload?.error ?? "Unexpected API error");
    }

    return payload;
};

const renderKpis = (kpis) => {
    const rate = Number(kpis.selfConsumptionRate ?? 0);
    const normalizedRate = Math.max(0, Math.min(100, rate));

    kpiConsumption.textContent = formatKwh(kpis.consumptionKwh);
    kpiProduction.textContent = formatKwh(kpis.productionKwh);
    kpiSelfConsumption.textContent = formatKwh(kpis.selfConsumptionKwh);
    kpiSelfRate.textContent = formatPercent(normalizedRate);

    if (kpiSelfRateFill) {
        kpiSelfRateFill.style.width = `${normalizedRate}%`;
    }

    if (kpiSelfRateLabel) {
        if (normalizedRate >= 85) {
            kpiSelfRateLabel.textContent = "Excellent self-usage";
        } else if (normalizedRate >= 65) {
            kpiSelfRateLabel.textContent = "Good self-usage";
        } else if (normalizedRate >= 45) {
            kpiSelfRateLabel.textContent = "Moderate self-usage";
        } else {
            kpiSelfRateLabel.textContent = "Low self-usage";
        }
    }
};

const updateViewModeUi = () => {
    viewModeButtons.forEach((button) => {
        const isActive = button.dataset.viewMode === chartViewMode;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
    });
};

const createAreaDataset = ({ label, data, borderColor, backgroundColor }) => ({
    type: "line",
    label,
    data,
    borderColor,
    backgroundColor,
    borderWidth: 2,
    pointRadius: 0,
    tension: 0.28,
    fill: true,
});

const buildDatasets = ({ points, showLineChart, showSplitView }) => {
    const productionValues = points.map((point) => point.productionKwh);
    const consumptionValues = points.map((point) => point.consumptionKwh);
    const importValues = points.map((point) => point.importKwh);
    const exportValues = points.map((point) => point.exportKwh);
    const solarConsumptionValues = points.map((point) => point.selfConsumptionKwh);
    const negativeSolarConsumptionValues = solarConsumptionValues.map((value) => -value);
    const negativeGridConsumptionValues = importValues.map((value) => -value);

    const datasets = [];

    if (showSplitView) {
        datasets.push(
            showLineChart
                ? createAreaDataset({
                    label: "Production (kWh)",
                    data: productionValues,
                    borderColor: "#2a9563",
                    backgroundColor: "rgba(42, 149, 99, 0.18)",
                })
                : {
                    type: "bar",
                    label: "Production (kWh)",
                    data: productionValues,
                    backgroundColor: "rgba(42, 149, 99, 0.65)",
                    borderColor: "#2a9563",
                    borderWidth: 1,
                },
        );
    } else {
        datasets.push(
            showLineChart
                ? createAreaDataset({
                    label: "House Consumption (kWh)",
                    data: consumptionValues,
                    borderColor: "#0a5a91",
                    backgroundColor: "rgba(10, 90, 145, 0.20)",
                })
                : {
                    type: "bar",
                    label: "House Consumption (kWh)",
                    data: consumptionValues,
                    backgroundColor: "rgba(10, 90, 145, 0.65)",
                    borderColor: "#0a5a91",
                    borderWidth: 1,
                },
        );
        datasets.push(
            showLineChart
                ? createAreaDataset({
                    label: "Production (kWh)",
                    data: productionValues,
                    borderColor: "#2a9563",
                    backgroundColor: "rgba(42, 149, 99, 0.16)",
                })
                : {
                    type: "bar",
                    label: "Production (kWh)",
                    data: productionValues,
                    backgroundColor: "rgba(42, 149, 99, 0.65)",
                    borderColor: "#2a9563",
                    borderWidth: 1,
                },
        );
    }

    if (showSplitView && solarConsumptionValues.some((value) => value > 0)) {
        datasets.push(
            showLineChart
                ? createAreaDataset({
                    label: "Consumed From Solar (kWh)",
                    data: negativeSolarConsumptionValues,
                    borderColor: "#0a5a91",
                    backgroundColor: "rgba(10, 90, 145, 0.22)",
                })
                : {
                    type: "bar",
                    label: "Consumed From Solar (kWh)",
                    data: negativeSolarConsumptionValues,
                    backgroundColor: "rgba(10, 90, 145, 0.65)",
                    borderColor: "#0a5a91",
                    borderWidth: 1,
                },
        );
    }

    if (importValues.some((value) => value > 0)) {
        datasets.push(
            showSplitView && showLineChart
                ? createAreaDataset({
                    label: "Consumed From Grid (kWh)",
                    data: negativeGridConsumptionValues,
                    borderColor: "#d1632e",
                    backgroundColor: "rgba(209, 99, 46, 0.18)",
                })
                : {
                    type: showSplitView ? "bar" : "line",
                    label: showSplitView ? "Consumed From Grid (kWh)" : "From Grid (kWh)",
                    data: showSplitView ? negativeGridConsumptionValues : importValues,
                    borderColor: "#d1632e",
                    backgroundColor: "rgba(209, 99, 46, 0.18)",
                    borderWidth: showSplitView ? 1 : 2,
                    pointRadius: 0,
                    tension: 0.2,
                    fill: false,
                },
        );
    }

    if (exportValues.some((value) => value > 0)) {
        datasets.push(
            showLineChart
                ? createAreaDataset({
                    label: "To Grid (kWh)",
                    data: exportValues,
                    borderColor: "#6b5bd4",
                    backgroundColor: "rgba(107, 91, 212, 0.18)",
                })
                : {
                    type: "line",
                    label: "To Grid (kWh)",
                    data: exportValues,
                    borderColor: "#6b5bd4",
                    backgroundColor: "rgba(107, 91, 212, 0.14)",
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.2,
                    fill: false,
                },
        );
    }

    return datasets;
};

const buildChartOptions = ({ rawLabels, showLineChart, xAxisTickLimit, hideLegend = false }) => ({
    responsive: true,
    maintainAspectRatio: false,
    layout: {
        padding: {
            top: 6,
            right: 8,
            bottom: 10,
            left: 6,
        },
    },
    plugins: {
        legend: {
            display: !hideLegend,
            position: "top",
            labels: {
                boxWidth: 12,
            },
        },
        tooltip: {
            callbacks: {
                title: (items) => {
                    const item = items[0];
                    return rawLabels[item.dataIndex] ?? item.label;
                },
            },
        },
    },
    scales: {
        x: {
            ticks: {
                autoSkip: true,
                autoSkipPadding: 12,
                padding: 8,
                maxRotation: 0,
                minRotation: 0,
                maxTicksLimit: xAxisTickLimit,
            },
            grid: {
                display: false,
            },
        },
        y: {
            beginAtZero: true,
            title: {
                display: !hideLegend,
                text: "kWh",
            },
            ticks: {
                callback: (value) => Math.abs(Number(value)).toLocaleString(undefined, { maximumFractionDigits: 2 }),
            },
            grid: {
                color: (context) => context.tick.value === 0
                    ? "rgba(28, 43, 51, 0.38)"
                    : "rgba(18, 110, 130, 0.10)",
                lineWidth: (context) => context.tick.value === 0 ? 2 : 1,
            },
        },
    },
    elements: {
        line: {
            tension: showLineChart ? 0.28 : 0.2,
        },
    },
});

const clearDailyCharts = () => {
    dailyCharts.forEach((chart) => chart.destroy());
    dailyCharts = [];
    dailyChartsContainer.replaceChildren();
    dailyChartsContainer.hidden = true;
};

const renderDailySmallMultiples = ({ points, meta, showSplitView }) => {
    clearDailyCharts();
    chartCanvas.hidden = true;
    dailyChartsContainer.hidden = false;

    const groupedByDay = groupPointsByDay(points);

    groupedByDay.forEach(([dayKey, dayPoints]) => {
        const card = document.createElement("article");
        card.className = "daily-chart-item";

        const title = document.createElement("p");
        title.className = "daily-chart-title";
        title.textContent = formatDayTitle(dayKey);

        const canvas = document.createElement("canvas");
        canvas.className = "daily-chart-canvas";

        card.append(title, canvas);
        dailyChartsContainer.append(card);

        const rawLabels = dayPoints.map((point) => point.label);
        const labels = rawLabels.map((label) => formatLabel(label, meta.timeUnit));
        const datasets = buildDatasets({ points: dayPoints, showLineChart: true, showSplitView });
        const xAxisTickLimit = getXAxisTickLimit(meta.timeUnit, dayPoints.length);

        const chart = new Chart(canvas, {
            data: {
                labels,
                datasets,
            },
            options: buildChartOptions({
                rawLabels,
                showLineChart: true,
                xAxisTickLimit,
                hideLegend: true,
            }),
        });

        dailyCharts.push(chart);
    });
};

const renderChart = (points, meta) => {
    const timeUnit = meta?.timeUnit ?? "DAY";
    const showLineChart = shouldUseLineChart(meta);
    const showSplitView = chartViewMode === "split";
    const useDailySmallMultiples = shouldUseDailySmallMultiples(meta);

    if (useDailySmallMultiples) {
        if (energyChart) {
            energyChart.destroy();
            energyChart = null;
        }

        renderDailySmallMultiples({ points, meta, showSplitView });
        return;
    }

    clearDailyCharts();
    chartCanvas.hidden = false;

    const rawLabels = points.map((point) => point.label);
    const labels = rawLabels.map((label) => formatLabel(label, timeUnit));
    const xAxisTickLimit = getXAxisTickLimit(timeUnit, points.length);
    const datasets = buildDatasets({ points, showLineChart, showSplitView });

    const datasetConfig = {
        labels,
        datasets,
    };

    if (energyChart) {
        energyChart.destroy();
    }

    energyChart = new Chart(chartCanvas, {
        data: datasetConfig,
        options: buildChartOptions({ rawLabels, showLineChart, xAxisTickLimit }),
    });
};

const buildChartMetaText = (meta) => {
    let text = `${meta.start} to ${meta.end}`;

    if (isSingleDayRange(meta.start, meta.end)) {
        text += lineChartTimeUnits.has(meta.timeUnit)
            ? " • intraday line view"
            : " • daily view";
    } else if (shouldUseDailySmallMultiples(meta)) {
        text += " • one chart per day";
    }

    text += chartViewMode === "split"
        ? " • split +/-"
        : " • all positive";

    return text;
};

const renderLivePower = (powerFlow) => {
    const pv = powerFlow?.PV ?? powerFlow?.pv ?? null;
    const load = powerFlow?.LOAD ?? powerFlow?.load ?? null;
    const grid = powerFlow?.GRID ?? powerFlow?.grid ?? null;
    const unit = powerFlow?.unit ?? "kW";

    livePv.textContent = formatPower(pv?.currentPower, unit);
    liveLoad.textContent = formatPower(load?.currentPower, unit);
    liveGrid.textContent = formatPower(grid?.currentPower, unit);
};

const refreshDashboard = async () => {
    refreshButton.disabled = true;
    setError("");

    try {
        const { start, end } = getCurrentDateValues();

        const [energyResult, powerResult] = await Promise.allSettled([
            fetchJson(`/api/energy?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`),
            fetchJson("/api/power/live"),
        ]);

        if (energyResult.status !== "fulfilled") {
            throw energyResult.reason;
        }

        const energyPayload = energyResult.value;
        currentEnergyPayload = energyPayload;
        renderKpis(energyPayload.kpis);
        renderChart(energyPayload.points, energyPayload.meta);

        if (powerResult.status === "fulfilled") {
            renderLivePower(powerResult.value.powerFlow ?? null);
        } else {
            renderLivePower(null);
            setError("Live power is temporarily unavailable (network reset). Energy charts are still up to date.");
        }

        chartMeta.textContent = buildChartMetaText(energyPayload.meta);
    } catch (error) {
        setError(error instanceof Error ? error.message : "Failed to load SolarEdge data.");
    } finally {
        refreshButton.disabled = false;
    }
};

viewModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
        const nextMode = button.dataset.viewMode;

        if (!nextMode || nextMode === chartViewMode) {
            return;
        }

        chartViewMode = nextMode;
        updateViewModeUi();

        if (currentEnergyPayload) {
            renderChart(currentEnergyPayload.points, currentEnergyPayload.meta);
            chartMeta.textContent = buildChartMetaText(currentEnergyPayload.meta);
        }
    });
});

updateViewModeUi();


startDateInput.addEventListener("change", () => {
    refreshDashboard();
});
endDateInput.addEventListener("change", () => {
    refreshDashboard();
});

refreshButton.addEventListener("click", () => {
    refreshDashboard();
});

refreshDashboard();
