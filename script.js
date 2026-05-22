const startDateInput = document.getElementById("start-date");
const endDateInput = document.getElementById("end-date");
const refreshButton = document.getElementById("refresh-btn");
const prevDayButton = document.getElementById("prev-day-btn");
const nextDayButton = document.getElementById("next-day-btn");
const todayButton = document.getElementById("today-btn");
const chartMeta = document.getElementById("chart-meta");
const errorBanner = document.getElementById("error-banner");

const kpiConsumption = document.getElementById("kpi-consumption");
const kpiProduction = document.getElementById("kpi-production");
const kpiSelfConsumption = document.getElementById("kpi-self-consumption");
const kpiSelfRate = document.getElementById("kpi-self-rate");
const kpiSelfRateGauge = document.getElementById("kpi-self-rate-gauge");
const kpiSelfSolarFill = document.getElementById("kpi-self-solar-fill");
const kpiSelfExportFill = document.getElementById("kpi-self-export-fill");
const kpiSelfSplitLabel = document.getElementById("kpi-self-split-label");
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
let dateBounds = {
    minDate: null,
    maxDate: null,
};
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

const toIsoDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const clampDateToBounds = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return date;
    }

    const min = dateBounds.minDate ? parseIsoDate(dateBounds.minDate) : null;
    const max = dateBounds.maxDate ? parseIsoDate(dateBounds.maxDate) : null;

    if (min && date < min) {
        return new Date(min);
    }

    if (max && date > max) {
        return new Date(max);
    }

    return date;
};

const applyDateBoundsToInputs = () => {
    if (dateBounds.minDate) {
        startDateInput.min = dateBounds.minDate;
        endDateInput.min = dateBounds.minDate;
    }

    if (dateBounds.maxDate) {
        startDateInput.max = dateBounds.maxDate;
        endDateInput.max = dateBounds.maxDate;
    }
};

const normalizeDateInputsWithinBounds = () => {
    const start = parseIsoDate(startDateInput.value);
    const end = parseIsoDate(endDateInput.value);

    if (!start || !end) {
        return;
    }

    const clampedStart = clampDateToBounds(start);
    const clampedEnd = clampDateToBounds(end);

    if (clampedStart > clampedEnd) {
        startDateInput.value = toIsoDate(clampedEnd);
        endDateInput.value = toIsoDate(clampedEnd);
        return;
    }

    startDateInput.value = toIsoDate(clampedStart);
    endDateInput.value = toIsoDate(clampedEnd);
};

const loadDateBounds = async () => {
    try {
        const payload = await fetchJson("/api/energy/bounds");

        dateBounds = {
            minDate: typeof payload.minDate === "string" ? payload.minDate : null,
            maxDate: typeof payload.maxDate === "string" ? payload.maxDate : payload.today ?? null,
        };

        applyDateBoundsToInputs();
        normalizeDateInputsWithinBounds();
    } catch {
        const fallbackToday = new Date().toISOString().slice(0, 10);

        dateBounds = {
            minDate: null,
            maxDate: fallbackToday,
        };

        applyDateBoundsToInputs();
        normalizeDateInputsWithinBounds();
    }
};

const shiftDateRangeByDays = (days) => {
    const startDate = parseIsoDate(startDateInput.value);
    const endDate = parseIsoDate(endDateInput.value);

    if (!startDate || !endDate) {
        return;
    }

    startDate.setDate(startDate.getDate() + days);
    endDate.setDate(endDate.getDate() + days);

    const rangeDays = getRangeLengthInDays(startDateInput.value, endDateInput.value) ?? 1;
    const minDate = dateBounds.minDate ? parseIsoDate(dateBounds.minDate) : null;
    const maxDate = dateBounds.maxDate ? parseIsoDate(dateBounds.maxDate) : null;

    if (minDate && startDate < minDate) {
        startDate.setTime(minDate.getTime());
        endDate.setTime(minDate.getTime());
        endDate.setDate(endDate.getDate() + rangeDays - 1);
    }

    if (maxDate && endDate > maxDate) {
        endDate.setTime(maxDate.getTime());
        startDate.setTime(maxDate.getTime());
        startDate.setDate(startDate.getDate() - (rangeDays - 1));
    }

    const clampedStart = clampDateToBounds(startDate);
    const clampedEnd = clampDateToBounds(endDate);

    startDateInput.value = toIsoDate(clampedStart);
    endDateInput.value = toIsoDate(clampedEnd);
    refreshDashboard();
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

    if (!rangeDays || rangeDays < 2 || rangeDays > 3 || !lineChartTimeUnits.has(meta?.timeUnit ?? "DAY")) {
        return false;
    }

    // Mobile portrait can fail to render multiple canvases reliably on some Android devices.
    if (window.matchMedia("(max-width: 760px)").matches) {
        return false;
    }

    return true;
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
    const rate = Number(kpis.selfSufficiencyRate ?? 0);
    const normalizedRate = Math.max(0, Math.min(100, rate));
    const productionKwh = Number(kpis.productionKwh ?? 0);
    const consumptionKwh = Number(kpis.consumptionKwh ?? 0);
    const importedKwh = Number(kpis.importedKwh ?? Math.max(consumptionKwh - Number(kpis.selfConsumptionKwh ?? 0), 0));
    const selfConsumptionKwh = Number(kpis.selfConsumptionKwh ?? 0);
    const safeConsumptionKwh = consumptionKwh > 0 ? consumptionKwh : 0;
    const solarCoverageShare = safeConsumptionKwh > 0 ? (selfConsumptionKwh / safeConsumptionKwh) * 100 : 0;
    const gridShare = safeConsumptionKwh > 0 ? (importedKwh / safeConsumptionKwh) * 100 : 0;

    kpiConsumption.textContent = formatKwh(kpis.consumptionKwh);
    kpiProduction.textContent = formatKwh(kpis.productionKwh);
    kpiSelfConsumption.textContent = formatKwh(kpis.selfConsumptionKwh);
    kpiSelfRate.textContent = formatPercent(normalizedRate);

    if (kpiSelfRateGauge) {
        kpiSelfRateGauge.style.setProperty("--self-rate", `${normalizedRate}%`);
        let gaugeColor = "var(--self-gauge-low)";

        if (normalizedRate >= 85) {
            gaugeColor = "var(--self-gauge-excellent)";
        } else if (normalizedRate >= 65) {
            gaugeColor = "var(--self-gauge-good)";
        } else if (normalizedRate >= 45) {
            gaugeColor = "var(--self-gauge-mid)";
        }

        kpiSelfRateGauge.style.setProperty("--self-rate-color", gaugeColor);
    }

    if (kpiSelfSolarFill) {
        kpiSelfSolarFill.style.width = `${Math.max(0, Math.min(100, solarCoverageShare))}%`;
    }

    if (kpiSelfExportFill) {
        kpiSelfExportFill.style.width = `${Math.max(0, Math.min(100, gridShare))}%`;
    }

    if (kpiSelfSplitLabel) {
        kpiSelfSplitLabel.textContent = `Solar covered ${formatKwh(selfConsumptionKwh)} of ${formatKwh(consumptionKwh)} consumed, grid supplied ${formatKwh(importedKwh)}.`;
    }

    if (kpiSelfRateLabel) {
        if (normalizedRate >= 85) {
            kpiSelfRateLabel.textContent = "Excellent coverage: most home demand is met by solar.";
        } else if (normalizedRate >= 65) {
            kpiSelfRateLabel.textContent = "Good coverage: solar meets a large share of demand.";
        } else if (normalizedRate >= 45) {
            kpiSelfRateLabel.textContent = "Moderate coverage: shift loads to solar hours when possible.";
        } else {
            kpiSelfRateLabel.textContent = "Low coverage: most demand is still supplied by grid.";
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

const createLineDataset = ({ label, data, borderColor, backgroundColor, fill = false }) => ({
    type: "line",
    label,
    data,
    borderColor,
    backgroundColor,
    borderWidth: 2,
    pointRadius: 0,
    tension: 0.25,
    fill,
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

const buildPowerDatasets = ({ points, showLineChart, showSplitView }) => {
    const productionValues = points.map((point) => point.productionKw);
    const consumptionValues = points.map((point) => point.consumptionKw);
    const toGridValues = points.map((point) => point.toGridKw);
    const fromPvValues = points.map((point) => point.fromPvKw);
    const fromGridValues = points.map((point) => point.fromGridKw);
    const negativeFromGridValues = fromGridValues.map((value) => -value);

    const datasets = [];

    if (!showSplitView) {
        datasets.push(
            showLineChart
                ? createAreaDataset({
                    label: "Consumption (kW)",
                    data: consumptionValues,
                    borderColor: "#0a5a91",
                    backgroundColor: "rgba(10, 90, 145, 0.20)",
                })
                : {
                    type: "bar",
                    label: "Consumption (kW)",
                    data: consumptionValues,
                    backgroundColor: "rgba(10, 90, 145, 0.65)",
                    borderColor: "#0a5a91",
                    borderWidth: 1,
                },
        );

        datasets.push(
            showLineChart
                ? createAreaDataset({
                    label: "Production (kW)",
                    data: productionValues,
                    borderColor: "#2a9563",
                    backgroundColor: "rgba(42, 149, 99, 0.16)",
                })
                : {
                    type: "bar",
                    label: "Production (kW)",
                    data: productionValues,
                    backgroundColor: "rgba(42, 149, 99, 0.65)",
                    borderColor: "#2a9563",
                    borderWidth: 1,
                },
        );

        if (toGridValues.some((value) => value > 0)) {
            datasets.push(
                createLineDataset({
                    label: "To Grid (kW)",
                    data: toGridValues,
                    borderColor: "#6b5bd4",
                    backgroundColor: "rgba(107, 91, 212, 0.14)",
                }),
            );
        }
    } else {
        datasets.push(
            showLineChart
                ? createAreaDataset({
                    label: "Production (kW)",
                    data: productionValues,
                    borderColor: "#2a9563",
                    backgroundColor: "rgba(42, 149, 99, 0.18)",
                })
                : {
                    type: "bar",
                    label: "Production (kW)",
                    data: productionValues,
                    backgroundColor: "rgba(42, 149, 99, 0.65)",
                    borderColor: "#2a9563",
                    borderWidth: 1,
                },
        );

        if (fromPvValues.some((value) => value > 0)) {
            datasets.push(
                showLineChart
                    ? createAreaDataset({
                        label: "From PV (kW)",
                        data: fromPvValues.map((value) => -value),
                        borderColor: "#0a5a91",
                        backgroundColor: "rgba(10, 90, 145, 0.22)",
                    })
                    : {
                        type: "bar",
                        label: "From PV (kW)",
                        data: fromPvValues.map((value) => -value),
                        backgroundColor: "rgba(10, 90, 145, 0.65)",
                        borderColor: "#0a5a91",
                        borderWidth: 1,
                    },
            );
        }

        if (fromGridValues.some((value) => value > 0)) {
            datasets.push(
                showLineChart
                    ? createAreaDataset({
                        label: "From Grid (kW)",
                        data: negativeFromGridValues,
                        borderColor: "#d1632e",
                        backgroundColor: "rgba(209, 99, 46, 0.18)",
                    })
                    : {
                        type: "bar",
                        label: "From Grid (kW)",
                        data: negativeFromGridValues,
                        backgroundColor: "rgba(209, 99, 46, 0.65)",
                        borderColor: "#d1632e",
                        borderWidth: 1,
                    },
            );
        }
    }

    return datasets;
};

const toPowerPointsFromEnergy = (energyPoints, timeUnit) => {
    const multiplier = timeUnit === "QUARTER_OF_AN_HOUR" ? 4 : 1;

    return energyPoints.map((point) => {
        const productionKw = Number(((point.productionKwh ?? 0) * multiplier).toFixed(4));
        const consumptionKw = Number(((point.consumptionKwh ?? 0) * multiplier).toFixed(4));
        const fromPvKw = Number(((point.selfConsumptionKwh ?? 0) * multiplier).toFixed(4));
        const fromGridKw = Number(((point.importKwh ?? 0) * multiplier).toFixed(4));
        const toGridKw = Number(((point.exportKwh ?? 0) * multiplier).toFixed(4));

        return {
            label: point.label,
            productionKw,
            toBuildingKw: fromPvKw,
            toGridKw,
            consumptionKw,
            fromPvKw,
            fromGridKw,
        };
    });
};

const buildChartOptions = ({
    rawLabels,
    showLineChart,
    xAxisTickLimit,
    hideLegend = false,
    yAxisUnit = "kWh",
    useAbsoluteTicks = true,
}) => ({
    responsive: true,
    maintainAspectRatio: false,
    layout: {
        padding: {
            top: 6,
            right: 8,
            bottom: 18,
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
                autoSkipPadding: 14,
                padding: 10,
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
                text: yAxisUnit,
            },
            ticks: {
                callback: (value) => {
                    const numericValue = Number(value);
                    const displayValue = useAbsoluteTicks ? Math.abs(numericValue) : numericValue;
                    return displayValue.toLocaleString(undefined, { maximumFractionDigits: 2 });
                },
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
                yAxisUnit: "kWh",
                useAbsoluteTicks: true,
            }),
        });

        dailyCharts.push(chart);
    });
};

const renderChart = (energyPoints, meta, powerPoints = null) => {
    const timeUnit = meta?.timeUnit ?? "DAY";
    const hasParityPower = Array.isArray(powerPoints) && powerPoints.length > 0;
    const chartPoints = hasParityPower ? powerPoints : energyPoints;
    const showLineChart = shouldUseLineChart(meta);
    const showSplitView = chartViewMode === "split";
    const useDailySmallMultiples = !hasParityPower && shouldUseDailySmallMultiples(meta);

    if (useDailySmallMultiples) {
        if (energyChart) {
            energyChart.destroy();
            energyChart = null;
        }

        renderDailySmallMultiples({ points: chartPoints, meta, showSplitView });
        return;
    }

    clearDailyCharts();
    chartCanvas.hidden = false;

    const rawLabels = chartPoints.map((point) => point.label);
    const labels = rawLabels.map((label) => formatLabel(label, timeUnit));
    const xAxisTickLimit = getXAxisTickLimit(timeUnit, chartPoints.length);
    const datasets = hasParityPower
        ? buildPowerDatasets({ points: chartPoints, showLineChart, showSplitView })
        : buildDatasets({ points: chartPoints, showLineChart, showSplitView });

    const datasetConfig = {
        labels,
        datasets,
    };

    if (energyChart) {
        energyChart.destroy();
    }

    energyChart = new Chart(chartCanvas, {
        data: datasetConfig,
        options: buildChartOptions({
            rawLabels,
            showLineChart,
            xAxisTickLimit,
            yAxisUnit: hasParityPower ? "kW" : "kWh",
            useAbsoluteTicks: !hasParityPower,
        }),
    });
};

const buildChartMetaText = (meta, powerMode = null) => {
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

    if (powerMode === "parity") {
        text += " • parity mode (kW)";
    } else if (powerMode === "derived") {
        text += " • derived mode (kW)";
    }

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
        let powerPoints = null;
        let powerMode = null;

        if (lineChartTimeUnits.has(energyPayload?.meta?.timeUnit ?? "DAY")) {
            try {
                const parityPayload = await fetchJson(
                    `/api/power/intervals?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&timeUnit=${encodeURIComponent(energyPayload.meta.timeUnit)}`,
                );

                powerPoints = Array.isArray(parityPayload?.points) ? parityPayload.points : null;
                powerMode = powerPoints && powerPoints.length > 0 ? "parity" : null;
            } catch {
                powerPoints = toPowerPointsFromEnergy(energyPayload.points ?? [], energyPayload.meta.timeUnit);
                powerMode = powerPoints.length > 0 ? "derived" : null;
            }
        }

        currentEnergyPayload = {
            ...energyPayload,
            powerPoints,
            powerMode,
        };
        renderKpis(energyPayload.kpis);
        renderChart(energyPayload.points, energyPayload.meta, powerPoints);

        if (powerResult.status === "fulfilled") {
            renderLivePower(powerResult.value.powerFlow ?? null);
        } else {
            renderLivePower(null);
            setError("Live power is temporarily unavailable (network reset). Energy charts are still up to date.");
        }

        chartMeta.textContent = buildChartMetaText(energyPayload.meta, powerMode);
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
            renderChart(currentEnergyPayload.points, currentEnergyPayload.meta, currentEnergyPayload.powerPoints ?? null);
            chartMeta.textContent = buildChartMetaText(
                currentEnergyPayload.meta,
                currentEnergyPayload.powerMode ?? null,
            );
        }
    });
});

updateViewModeUi();


startDateInput.addEventListener("change", () => {
    normalizeDateInputsWithinBounds();
    refreshDashboard();
});
endDateInput.addEventListener("change", () => {
    normalizeDateInputsWithinBounds();
    refreshDashboard();
});

refreshButton.addEventListener("click", () => {
    refreshDashboard();
});

if (prevDayButton) {
    prevDayButton.addEventListener("click", () => {
        shiftDateRangeByDays(-1);
    });
}

if (nextDayButton) {
    nextDayButton.addEventListener("click", () => {
        shiftDateRangeByDays(1);
    });
}

if (todayButton) {
    todayButton.addEventListener("click", () => {
        const max = dateBounds.maxDate ? parseIsoDate(dateBounds.maxDate) : new Date();
        const target = clampDateToBounds(max ?? new Date());
        const iso = toIsoDate(target);
        startDateInput.value = iso;
        endDateInput.value = iso;
        refreshDashboard();
    });
}

await loadDateBounds();
refreshDashboard();
