import { initInfiniteCalendar } from "./calendar.js";
import { getStoredActiveCalendar, setupCalendarSwitcher } from "./calendars.js";
import { setupTweakControls } from "./tweak-controls.js";
import { setupThemeToggle } from "./theme.js";

const calendarContainer = document.getElementById("calendar-scroll");
const yearViewContainer = document.getElementById("year-view");
const appRoot = document.getElementById("app");
const headerCalendarsButton = document.getElementById("header-calendars-btn");
const returnToCurrentButton = document.getElementById("return-to-current");
const themeToggleButton = document.getElementById("theme-toggle");
const mobileDebugToggleButton = document.getElementById("mobile-debug-toggle");
const telegramLogToggleButton = document.getElementById("telegram-log-toggle");
const telegramLogPanel = document.getElementById("telegram-log-panel");
const telegramLogPanelBackdrop = document.getElementById("telegram-log-panel-backdrop");
const telegramLogCloseButton = document.getElementById("telegram-log-close");
const telegramLogFrame = document.getElementById("telegram-log-frame");
const monthViewButton = document.getElementById("view-month-btn");
const yearViewButton = document.getElementById("view-year-btn");
const calendarViewToggle = document.getElementById("calendar-view-toggle");
const rootStyle = document.documentElement.style;
const initialActiveCalendar = getStoredActiveCalendar();

const VIEW_MODE_MONTH = "month";
const VIEW_MODE_YEAR = "year";
const MOBILE_LAYOUT_QUERY = "(max-width: 640px)";
const YEAR_VIEW_YEAR = new Date().getFullYear();
const CALENDAR_DAY_STATES_STORAGE_KEY = "justcal-calendar-day-states";
const LEGACY_DAY_STATE_STORAGE_KEY = "justcal-day-states";
const DEFAULT_CALENDAR_ID = "energy-tracker";
const DEFAULT_CALENDAR_COLOR = "blue";
const CALENDAR_TYPE_SIGNAL = "signal-3";
const CALENDAR_TYPE_SCORE = "score";
const CALENDAR_TYPE_CHECK = "check";
const CALENDAR_TYPE_NOTES = "notes";
const SCORE_UNASSIGNED = -1;
const SCORE_MIN = SCORE_UNASSIGNED;
const SCORE_MAX = 10;
const SCORE_DISPLAY_NUMBER = "number";
const SCORE_DISPLAY_HEATMAP = "heatmap";
const SCORE_DISPLAY_NUMBER_HEATMAP = "number-heatmap";
const DEFAULT_SCORE_DISPLAY = SCORE_DISPLAY_NUMBER;
const CALENDAR_COLOR_HEX_BY_KEY = Object.freeze({
  green: "#22c55e",
  red: "#ef4444",
  orange: "#f97316",
  yellow: "#facc15",
  cyan: "#22d3ee",
  blue: "#3b82f6",
});
const SIGNAL_STATE_COLOR_HEX_BY_KEY = Object.freeze({
  red: "#ef4444",
  yellow: "#facc15",
  green: "#22c55e",
});
const SIGNAL_STATE_LABEL_BY_KEY = Object.freeze({
  red: "Red",
  yellow: "Yellow",
  green: "Green",
});
const CALENDAR_TYPE_LABEL_BY_KEY = Object.freeze({
  [CALENDAR_TYPE_SIGNAL]: "Semaphore",
  [CALENDAR_TYPE_SCORE]: "Score",
  [CALENDAR_TYPE_CHECK]: "Check",
  [CALENDAR_TYPE_NOTES]: "Notes",
});
const MONTH_SHORT_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short" });
const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const MIN_FADE_DELTA = 0;
const MAX_FADE_DELTA = 100;
const FALLBACK_BG_TOP = [15, 18, 36];
const FALLBACK_BG_BOTTOM = [23, 28, 52];
const COLOR_PROBE_STYLE = `
  position: fixed;
  left: -10000px;
  top: -10000px;
  width: 0;
  height: 0;
  pointer-events: none;
  visibility: hidden;
`;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mixRgb(baseColor, targetColor, amount) {
  const mixAmount = clamp(amount, 0, 1);
  return baseColor.map((baseChannel, index) => {
    const targetChannel = targetColor[index] ?? baseChannel;
    return Math.round(baseChannel + (targetChannel - baseChannel) * mixAmount);
  });
}

function rgbString(color) {
  return `rgb(${color[0]} ${color[1]} ${color[2]})`;
}

let colorProbeElement = null;
let currentFadeDelta = 1;
const mobileLayoutMedia =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(MOBILE_LAYOUT_QUERY)
    : null;

function isMobileLayout() {
  if (mobileLayoutMedia) {
    return mobileLayoutMedia.matches;
  }
  if (typeof window !== "undefined") {
    return window.innerWidth <= 640;
  }
  return false;
}

function getColorProbeElement() {
  if (colorProbeElement) return colorProbeElement;

  const probe = document.createElement("span");
  probe.style.cssText = COLOR_PROBE_STYLE;
  document.body.appendChild(probe);
  colorProbeElement = probe;
  return colorProbeElement;
}

function parseColorToRgb(value) {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) return null;

  const directRgbMatch = rawValue.match(/rgba?\(([^)]+)\)/i);
  if (directRgbMatch) {
    const numbers = directRgbMatch[1].match(/-?\d*\.?\d+/g);
    if (numbers && numbers.length >= 3) {
      return numbers.slice(0, 3).map((entry) => clamp(Number(entry), 0, 255));
    }
  }

  const probe = getColorProbeElement();
  probe.style.color = rawValue;
  const resolvedColor = getComputedStyle(probe).color;
  const resolvedNumbers = resolvedColor.match(/-?\d*\.?\d+/g);
  if (!resolvedNumbers || resolvedNumbers.length < 3) return null;
  return resolvedNumbers.slice(0, 3).map((entry) => clamp(Number(entry), 0, 255));
}

function getRootColorVariable(variableName, fallbackRgb) {
  const rawValue = getComputedStyle(document.documentElement).getPropertyValue(variableName);
  return parseColorToRgb(rawValue) ?? fallbackRgb;
}

function applyAppBackgroundFadeDelta(nextFadeDelta) {
  const fadeDelta = clamp(Number(nextFadeDelta), MIN_FADE_DELTA, MAX_FADE_DELTA);
  currentFadeDelta = fadeDelta;
  const fadeProgress =
    (fadeDelta - MIN_FADE_DELTA) / (MAX_FADE_DELTA - MIN_FADE_DELTA || 1);
  const contrastProgress = fadeProgress ** 0.8;
  const isDarkStyle = document.documentElement.classList.contains("dark");

  const baseTop = getRootColorVariable("--bg-top", FALLBACK_BG_TOP);
  const baseBottom = getRootColorVariable("--bg-bottom", FALLBACK_BG_BOTTOM);
  const mutedColor = getRootColorVariable("--muted", baseBottom);
  const panelColor = getRootColorVariable("--panel", baseBottom);
  const lineColor = getRootColorVariable("--line", mutedColor);
  const inkColor = getRootColorVariable(
    "--ink",
    isDarkStyle ? [229, 231, 235] : [17, 24, 39],
  );

  const topTarget = isDarkStyle
    ? [0, 0, 0]
    : mixRgb(lineColor, inkColor, 0.35);
  const bottomTarget = isDarkStyle
    ? mixRgb(mutedColor, lineColor, 0.68)
    : mixRgb(panelColor, mutedColor, 0.22);

  const topColor = mixRgb(
    baseTop,
    topTarget,
    contrastProgress * (isDarkStyle ? 0.58 : 0.66),
  );
  const bottomColor = mixRgb(
    baseBottom,
    bottomTarget,
    contrastProgress * (isDarkStyle ? 1.1 : 1.0),
  );

  rootStyle.setProperty("--app-bg-top", rgbString(topColor));
  rootStyle.setProperty("--app-bg-bottom", rgbString(bottomColor));
}

function setupAppBackgroundFadeSync() {
  const root = document.documentElement;
  const observer = new MutationObserver(() => {
    applyAppBackgroundFadeDelta(currentFadeDelta);
  });
  observer.observe(root, {
    attributes: true,
    attributeFilter: ["class"],
  });
}

function getYearMonthLabels(yearValue = YEAR_VIEW_YEAR) {
  return Array.from({ length: 12 }, (_, monthIndex) => {
    return MONTH_SHORT_FORMATTER.format(new Date(yearValue, monthIndex, 1));
  });
}

function isObjectLike(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isLeapYear(yearValue) {
  return new Date(yearValue, 1, 29).getMonth() === 1;
}

function daysInYear(yearValue) {
  return isLeapYear(yearValue) ? 366 : 365;
}

function daysInMonth(yearValue, monthIndex) {
  return new Date(yearValue, monthIndex + 1, 0).getDate();
}

function formatDayKey(yearValue, monthIndex, dayNumber) {
  const monthLabel = String(monthIndex + 1).padStart(2, "0");
  const dayLabel = String(dayNumber).padStart(2, "0");
  return `${yearValue}-${monthLabel}-${dayLabel}`;
}

function formatDateLabel(yearValue, monthIndex, dayNumber) {
  return DATE_LABEL_FORMATTER.format(new Date(yearValue, monthIndex, dayNumber));
}

function normalizeCalendarType(calendarType) {
  if (typeof calendarType !== "string") {
    return CALENDAR_TYPE_SIGNAL;
  }
  const normalized = calendarType.trim().toLowerCase();
  if (normalized === CALENDAR_TYPE_SCORE) return CALENDAR_TYPE_SCORE;
  if (normalized === CALENDAR_TYPE_CHECK) return CALENDAR_TYPE_CHECK;
  if (normalized === CALENDAR_TYPE_NOTES) return CALENDAR_TYPE_NOTES;
  return CALENDAR_TYPE_SIGNAL;
}

function normalizeCalendarColor(colorKey, fallbackColor = DEFAULT_CALENDAR_COLOR) {
  if (
    typeof colorKey === "string" &&
    Object.prototype.hasOwnProperty.call(CALENDAR_COLOR_HEX_BY_KEY, colorKey)
  ) {
    return colorKey;
  }
  return fallbackColor;
}

function resolveCalendarColorHex(colorKey, fallbackColor = DEFAULT_CALENDAR_COLOR) {
  const normalizedColor = normalizeCalendarColor(colorKey, fallbackColor);
  return CALENDAR_COLOR_HEX_BY_KEY[normalizedColor];
}

function normalizeSignalValue(dayValue) {
  if (typeof dayValue !== "string") return "";
  const normalized = dayValue.trim().toLowerCase();
  if (normalized === "red" || normalized === "yellow" || normalized === "green") {
    return normalized;
  }
  return "";
}

function normalizeCheckValue(dayValue) {
  if (dayValue === true || dayValue === 1) return true;
  if (typeof dayValue !== "string") return false;
  const normalized = dayValue.trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "checked" ||
    normalized === "yes" ||
    normalized === "on"
  );
}

function normalizeScoreValue(dayValue) {
  const numericValue = Number(dayValue);
  if (!Number.isFinite(numericValue)) {
    return SCORE_UNASSIGNED;
  }
  const roundedScore = Math.round(numericValue);
  if (roundedScore < SCORE_MIN || roundedScore > SCORE_MAX) {
    return SCORE_UNASSIGNED;
  }
  return roundedScore;
}

function normalizeNoteValue(dayValue) {
  if (typeof dayValue !== "string") return "";
  return dayValue.trim();
}

function normalizeScoreDisplay(scoreDisplay) {
  if (typeof scoreDisplay !== "string") {
    return DEFAULT_SCORE_DISPLAY;
  }
  const normalized = scoreDisplay.trim().toLowerCase();
  if (normalized === SCORE_DISPLAY_HEATMAP) return SCORE_DISPLAY_HEATMAP;
  if (normalized === SCORE_DISPLAY_NUMBER_HEATMAP) return SCORE_DISPLAY_NUMBER_HEATMAP;
  return SCORE_DISPLAY_NUMBER;
}

function readStoredCalendarDayStates(activeCalendarId = DEFAULT_CALENDAR_ID) {
  try {
    const rawValue = localStorage.getItem(CALENDAR_DAY_STATES_STORAGE_KEY);
    if (rawValue !== null) {
      const parsed = JSON.parse(rawValue);
      if (isObjectLike(parsed)) {
        return parsed;
      }
    }
  } catch {
    return {};
  }

  try {
    const legacyRawValue = localStorage.getItem(LEGACY_DAY_STATE_STORAGE_KEY);
    if (legacyRawValue === null) {
      return {};
    }
    const legacyParsed = JSON.parse(legacyRawValue);
    if (!isObjectLike(legacyParsed)) {
      return {};
    }
    return {
      [activeCalendarId || DEFAULT_CALENDAR_ID]: legacyParsed,
    };
  } catch {
    return {};
  }
}

function createYearKpiChip(label, value) {
  const chip = document.createElement("article");
  chip.className = "year-kpi-chip";

  const chipLabel = document.createElement("p");
  chipLabel.className = "year-kpi-label";
  chipLabel.textContent = label;

  const chipValue = document.createElement("p");
  chipValue.className = "year-kpi-value";
  chipValue.textContent = value;

  chip.append(chipLabel, chipValue);
  return chip;
}

function truncateNotePreview(noteValue, maxLength = 120) {
  if (noteValue.length <= maxLength) return noteValue;
  return `${noteValue.slice(0, maxLength - 1)}…`;
}

function formatScoreAverage(sum, count) {
  if (count <= 0) return "N/A";
  return (sum / count).toFixed(1);
}

function formatCoveragePercent(trackedDaysCount, totalDays) {
  if (totalDays <= 0) return "0.0%";
  return `${((trackedDaysCount / totalDays) * 100).toFixed(1)}%`;
}

function computeLongestCheckStreakForYear(dayEntries, yearValue) {
  if (!isObjectLike(dayEntries)) {
    return 0;
  }

  let longestStreak = 0;
  let currentStreak = 0;
  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    const monthDays = daysInMonth(yearValue, monthIndex);
    for (let dayNumber = 1; dayNumber <= monthDays; dayNumber += 1) {
      const dayKey = formatDayKey(yearValue, monthIndex, dayNumber);
      const isChecked = normalizeCheckValue(dayEntries[dayKey]);
      if (isChecked) {
        currentStreak += 1;
        if (currentStreak > longestStreak) {
          longestStreak = currentStreak;
        }
        continue;
      }
      currentStreak = 0;
    }
  }
  return longestStreak;
}

function renderYearView(activeCalendar, yearValue = YEAR_VIEW_YEAR) {
  if (!yearViewContainer) return;

  const normalizedCalendarType = normalizeCalendarType(activeCalendar?.type);
  const normalizedCalendarDisplay = normalizeScoreDisplay(activeCalendar?.display);
  const calendarName =
    typeof activeCalendar?.name === "string" && activeCalendar.name.trim()
      ? activeCalendar.name.trim()
      : "Calendar";
  const activeCalendarId =
    typeof activeCalendar?.id === "string" && activeCalendar.id.trim()
      ? activeCalendar.id.trim()
      : DEFAULT_CALENDAR_ID;
  const activeCalendarColor = resolveCalendarColorHex(
    activeCalendar?.color,
    DEFAULT_CALENDAR_COLOR,
  );
  const totalDaysInYear = daysInYear(yearValue);
  const monthLabels = getYearMonthLabels(yearValue);
  const today = new Date();
  const isCurrentYear = today.getFullYear() === yearValue;
  const todayMonthIndex = today.getMonth();
  const todayDayNumber = today.getDate();

  const dayStatesByCalendar = readStoredCalendarDayStates(activeCalendarId);
  const dayEntries = isObjectLike(dayStatesByCalendar[activeCalendarId])
    ? dayStatesByCalendar[activeCalendarId]
    : {};

  const totalStats = {
    trackedDays: 0,
    redDays: 0,
    yellowDays: 0,
    greenDays: 0,
    checkedDays: 0,
    scoreCount: 0,
    scoreSum: 0,
    scoreMin: null,
    scoreMax: null,
    noteDays: 0,
    noteCharacters: 0,
  };

  const yearViewContent = document.createElement("div");
  yearViewContent.id = "year-view-content";
  yearViewContent.style.setProperty("--year-calendar-color", activeCalendarColor);

  const summaryPanel = document.createElement("section");
  summaryPanel.className = "year-summary-panel";
  summaryPanel.style.setProperty("--year-calendar-color", activeCalendarColor);

  const summaryHeader = document.createElement("div");
  summaryHeader.className = "year-summary-header";

  const summaryHeading = document.createElement("div");
  const summaryTitleRow = document.createElement("div");
  summaryTitleRow.className = "year-summary-title-row";
  const summaryTitle = document.createElement("h2");
  summaryTitle.className = "year-summary-title";
  summaryTitle.textContent = `${yearValue} Year View`;

  const yearNavControls = document.createElement("div");
  yearNavControls.className = "year-nav-controls";

  const previousYearButton = document.createElement("button");
  previousYearButton.type = "button";
  previousYearButton.className = "year-nav-btn";
  previousYearButton.setAttribute("aria-label", `Go to ${yearValue - 1}`);
  previousYearButton.innerHTML =
    '<svg class="year-nav-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M10.9 2.2 4.8 8l6.1 5.8Z"/></svg>';

  const nextYearButton = document.createElement("button");
  nextYearButton.type = "button";
  nextYearButton.className = "year-nav-btn";
  nextYearButton.setAttribute("aria-label", `Go to ${yearValue + 1}`);
  nextYearButton.innerHTML =
    '<svg class="year-nav-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.1 2.2 11.2 8l-6.1 5.8Z"/></svg>';

  previousYearButton.addEventListener("click", () => {
    activeYearViewYear = yearValue - 1;
    renderYearView(activeCalendar, activeYearViewYear);
  });

  nextYearButton.addEventListener("click", () => {
    activeYearViewYear = yearValue + 1;
    renderYearView(activeCalendar, activeYearViewYear);
  });

  yearNavControls.append(previousYearButton, nextYearButton);
  summaryTitleRow.append(summaryTitle, yearNavControls);

  const summarySubtitle = document.createElement("p");
  summarySubtitle.className = "year-summary-subtitle";
  summarySubtitle.textContent = `${calendarName} calendar across ${totalDaysInYear} days`;
  summaryHeading.append(summaryTitleRow, summarySubtitle);

  const summaryType = document.createElement("p");
  summaryType.className = "year-summary-type";
  summaryType.textContent =
    CALENDAR_TYPE_LABEL_BY_KEY[normalizedCalendarType] ||
    CALENDAR_TYPE_LABEL_BY_KEY[CALENDAR_TYPE_SIGNAL];

  summaryHeader.append(summaryHeading, summaryType);

  const yearGridShell = document.createElement("div");
  yearGridShell.className = "year-grid-shell";

  const yearGrid = document.createElement("table");
  yearGrid.className = "year-grid";
  yearGrid.style.setProperty("--year-calendar-color", activeCalendarColor);

  const tableHead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const monthHeaderCell = document.createElement("th");
  monthHeaderCell.className = "year-month-name";
  monthHeaderCell.scope = "col";
  monthHeaderCell.textContent = "Month";
  headerRow.appendChild(monthHeaderCell);

  for (let dayNumber = 1; dayNumber <= 16; dayNumber += 1) {
    const dayHeaderCell = document.createElement("th");
    dayHeaderCell.scope = "col";
    dayHeaderCell.textContent = "";
    dayHeaderCell.setAttribute("aria-label", `Day ${dayNumber}`);
    headerRow.appendChild(dayHeaderCell);
  }

  const summaryHeaderCell = document.createElement("th");
  summaryHeaderCell.className = "year-month-summary";
  summaryHeaderCell.scope = "col";
  summaryHeaderCell.textContent = "Month Summary";
  headerRow.appendChild(summaryHeaderCell);
  tableHead.appendChild(headerRow);
  yearGrid.appendChild(tableHead);

  const tableBody = document.createElement("tbody");

  const buildYearDayCell = ({
    dayNumber,
    monthIndex,
    monthDays,
    monthStats,
  }) => {
    const dayCell = document.createElement("td");
    dayCell.className = "year-day-cell";
    const dayValue = document.createElement("span");
    dayValue.className = "year-day-value";

    if (dayNumber > monthDays) {
      dayCell.classList.add("is-empty");
      return dayCell;
    }

    const dayNumberLabel = document.createElement("span");
    dayNumberLabel.className = "year-day-number";
    dayNumberLabel.textContent = String(dayNumber);
    dayCell.appendChild(dayNumberLabel);

    const dayKey = formatDayKey(yearValue, monthIndex, dayNumber);
    const dateLabel = formatDateLabel(yearValue, monthIndex, dayNumber);
    if (
      isCurrentYear &&
      monthIndex === todayMonthIndex &&
      dayNumber === todayDayNumber
    ) {
      dayCell.classList.add("is-today");
    }

    if (normalizedCalendarType === CALENDAR_TYPE_SIGNAL) {
      const signalState = normalizeSignalValue(dayEntries[dayKey]);
      if (!signalState) {
        dayCell.title = `${dateLabel} • Unassigned`;
        return dayCell;
      }

      const signalColor = SIGNAL_STATE_COLOR_HEX_BY_KEY[signalState];
      const signalDot = document.createElement("span");
      signalDot.className = "year-day-dot";
      signalDot.style.setProperty("--signal-color", signalColor);
      dayValue.classList.add("is-signal");
      dayValue.appendChild(signalDot);
      dayCell.classList.add("has-value");
      dayCell.title = `${dateLabel} • ${SIGNAL_STATE_LABEL_BY_KEY[signalState]}`;

      monthStats.trackedDays += 1;
      totalStats.trackedDays += 1;
      if (signalState === "red") {
        monthStats.redDays += 1;
        totalStats.redDays += 1;
      } else if (signalState === "yellow") {
        monthStats.yellowDays += 1;
        totalStats.yellowDays += 1;
      } else if (signalState === "green") {
        monthStats.greenDays += 1;
        totalStats.greenDays += 1;
      }
    } else if (normalizedCalendarType === CALENDAR_TYPE_CHECK) {
      const isChecked = normalizeCheckValue(dayEntries[dayKey]);
      if (!isChecked) {
        dayCell.title = `${dateLabel} • Unchecked`;
        return dayCell;
      }

      dayValue.classList.add("is-check");
      dayValue.textContent = "✓";
      dayCell.classList.add("has-value");
      dayCell.title = `${dateLabel} • Checked`;

      monthStats.trackedDays += 1;
      monthStats.checkedDays += 1;
      totalStats.trackedDays += 1;
      totalStats.checkedDays += 1;
    } else if (normalizedCalendarType === CALENDAR_TYPE_SCORE) {
      const scoreValue = normalizeScoreValue(dayEntries[dayKey]);
      if (scoreValue === SCORE_UNASSIGNED) {
        dayCell.title = `${dateLabel} • Unassigned`;
        return dayCell;
      }

      dayValue.classList.add("is-score");
      const shouldShowScoreNumber =
        normalizedCalendarDisplay === SCORE_DISPLAY_NUMBER ||
        normalizedCalendarDisplay === SCORE_DISPLAY_NUMBER_HEATMAP;
      if (shouldShowScoreNumber) {
        dayValue.textContent = String(scoreValue);
      }

      if (
        normalizedCalendarDisplay === SCORE_DISPLAY_HEATMAP ||
        normalizedCalendarDisplay === SCORE_DISPLAY_NUMBER_HEATMAP
      ) {
        const scoreFillStrength = Math.round(18 + (scoreValue / SCORE_MAX) * 58);
        dayCell.classList.add("has-score-fill");
        dayCell.style.setProperty("--score-fill-strength", `${scoreFillStrength}%`);
      }

      dayCell.classList.add("has-value");
      dayCell.title = `${dateLabel} • Score ${scoreValue}`;

      monthStats.trackedDays += 1;
      monthStats.scoreCount += 1;
      monthStats.scoreSum += scoreValue;
      totalStats.trackedDays += 1;
      totalStats.scoreCount += 1;
      totalStats.scoreSum += scoreValue;
      totalStats.scoreMin =
        totalStats.scoreMin === null ? scoreValue : Math.min(totalStats.scoreMin, scoreValue);
      totalStats.scoreMax =
        totalStats.scoreMax === null ? scoreValue : Math.max(totalStats.scoreMax, scoreValue);
    } else if (normalizedCalendarType === CALENDAR_TYPE_NOTES) {
      const noteValue = normalizeNoteValue(dayEntries[dayKey]);
      if (!noteValue) {
        dayCell.title = `${dateLabel} • No note`;
        return dayCell;
      }

      dayValue.classList.add("is-notes");
      dayValue.textContent = "✎";
      dayCell.classList.add("has-value");
      dayCell.title = `${dateLabel} • ${truncateNotePreview(noteValue)}`;

      monthStats.trackedDays += 1;
      monthStats.noteDays += 1;
      totalStats.trackedDays += 1;
      totalStats.noteDays += 1;
      totalStats.noteCharacters += noteValue.length;
    }

    if (dayValue.childNodes.length > 0 || dayValue.textContent.trim().length > 0) {
      dayCell.appendChild(dayValue);
    }
    return dayCell;
  };

  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    const monthDays = daysInMonth(yearValue, monthIndex);
    const monthTopRow = document.createElement("tr");
    const monthBottomRow = document.createElement("tr");
    monthBottomRow.className = "year-month-row-secondary";

    const monthNameCell = document.createElement("th");
    monthNameCell.className = "year-month-name";
    monthNameCell.scope = "rowgroup";
    monthNameCell.rowSpan = 2;
    monthNameCell.textContent = monthLabels[monthIndex];
    monthTopRow.appendChild(monthNameCell);

    const monthStats = {
      trackedDays: 0,
      redDays: 0,
      yellowDays: 0,
      greenDays: 0,
      checkedDays: 0,
      scoreCount: 0,
      scoreSum: 0,
      noteDays: 0,
    };

    for (let dayOffset = 0; dayOffset < 16; dayOffset += 1) {
      const topRowDayNumber = 1 + dayOffset;
      monthTopRow.appendChild(
        buildYearDayCell({
          dayNumber: topRowDayNumber,
          monthIndex,
          monthDays,
          monthStats,
        }),
      );
    }

    for (let dayOffset = 0; dayOffset < 16; dayOffset += 1) {
      const bottomRowDayNumber = 17 + dayOffset;
      monthBottomRow.appendChild(
        buildYearDayCell({
          dayNumber: bottomRowDayNumber,
          monthIndex,
          monthDays,
          monthStats,
        }),
      );
    }

    const monthSummaryCell = document.createElement("td");
    monthSummaryCell.className = "year-month-summary";
    monthSummaryCell.rowSpan = 2;
    if (normalizedCalendarType === CALENDAR_TYPE_SIGNAL) {
      const signalSummary = document.createElement("span");
      signalSummary.className = "year-month-summary-signal";

      const trackedLabel = document.createElement("span");
      trackedLabel.className = "year-month-summary-signal-tracked";
      trackedLabel.textContent = `Tracked ${monthStats.trackedDays}`;
      signalSummary.appendChild(trackedLabel);

      const metricsRow = document.createElement("span");
      metricsRow.className = "year-month-summary-signal-row";

      ["green", "yellow", "red"].forEach((signalState) => {
        const metric = document.createElement("span");
        metric.className = "year-month-summary-signal-metric";

        const metricDot = document.createElement("span");
        metricDot.className = "year-legend-dot";
        metricDot.style.setProperty(
          "--legend-color",
          SIGNAL_STATE_COLOR_HEX_BY_KEY[signalState] || activeCalendarColor,
        );

        const metricCount = document.createElement("span");
        metricCount.textContent = String(monthStats[`${signalState}Days`] ?? 0);

        metric.append(metricDot, metricCount);
        metricsRow.appendChild(metric);
      });

      signalSummary.appendChild(metricsRow);
      monthSummaryCell.appendChild(signalSummary);
    } else if (normalizedCalendarType === CALENDAR_TYPE_CHECK) {
      monthSummaryCell.textContent = `${monthStats.checkedDays} checked`;
    } else if (normalizedCalendarType === CALENDAR_TYPE_SCORE) {
      monthSummaryCell.textContent = monthStats.scoreCount
        ? `Avg ${formatScoreAverage(monthStats.scoreSum, monthStats.scoreCount)}`
        : "No scores";
    } else if (normalizedCalendarType === CALENDAR_TYPE_NOTES) {
      monthSummaryCell.textContent = `${monthStats.noteDays} notes`;
    } else {
      monthSummaryCell.textContent = `${monthStats.trackedDays} tracked`;
    }
    monthTopRow.appendChild(monthSummaryCell);
    tableBody.append(monthTopRow, monthBottomRow);
  }

  yearGrid.appendChild(tableBody);
  yearGridShell.appendChild(yearGrid);

  const kpiGrid = document.createElement("div");
  kpiGrid.className = "year-kpi-grid";
  kpiGrid.appendChild(createYearKpiChip("Tracked Days", `${totalStats.trackedDays}`));
  kpiGrid.appendChild(
    createYearKpiChip(
      "Coverage",
      formatCoveragePercent(totalStats.trackedDays, totalDaysInYear),
    ),
  );

  if (normalizedCalendarType === CALENDAR_TYPE_SIGNAL) {
    kpiGrid.appendChild(createYearKpiChip("Green", `${totalStats.greenDays}`));
    kpiGrid.appendChild(createYearKpiChip("Yellow", `${totalStats.yellowDays}`));
    kpiGrid.appendChild(createYearKpiChip("Red", `${totalStats.redDays}`));
  } else if (normalizedCalendarType === CALENDAR_TYPE_CHECK) {
    const longestStreak = computeLongestCheckStreakForYear(dayEntries, yearValue);
    kpiGrid.appendChild(createYearKpiChip("Checked Days", `${totalStats.checkedDays}`));
    kpiGrid.appendChild(createYearKpiChip("Longest Streak", `${longestStreak} days`));
  } else if (normalizedCalendarType === CALENDAR_TYPE_SCORE) {
    kpiGrid.appendChild(
      createYearKpiChip("Average Score", formatScoreAverage(totalStats.scoreSum, totalStats.scoreCount)),
    );
    kpiGrid.appendChild(
      createYearKpiChip("Best Score", totalStats.scoreMax === null ? "N/A" : `${totalStats.scoreMax}`),
    );
    kpiGrid.appendChild(
      createYearKpiChip("Lowest Score", totalStats.scoreMin === null ? "N/A" : `${totalStats.scoreMin}`),
    );
  } else if (normalizedCalendarType === CALENDAR_TYPE_NOTES) {
    const averageNoteLength =
      totalStats.noteDays > 0
        ? Math.round(totalStats.noteCharacters / totalStats.noteDays)
        : 0;
    kpiGrid.appendChild(createYearKpiChip("Days With Notes", `${totalStats.noteDays}`));
    kpiGrid.appendChild(createYearKpiChip("Avg Note Length", `${averageNoteLength} chars`));
  }

  const legend = document.createElement("div");
  legend.className = "year-legend";
  if (normalizedCalendarType === CALENDAR_TYPE_SIGNAL) {
    ["green", "yellow", "red"].forEach((stateKey) => {
      const legendChip = document.createElement("span");
      legendChip.className = "year-legend-chip";
      const legendDot = document.createElement("span");
      legendDot.className = "year-legend-dot";
      legendDot.style.setProperty(
        "--legend-color",
        SIGNAL_STATE_COLOR_HEX_BY_KEY[stateKey] || activeCalendarColor,
      );
      legendChip.append(legendDot, SIGNAL_STATE_LABEL_BY_KEY[stateKey] || stateKey);
      legend.appendChild(legendChip);
    });
  } else if (normalizedCalendarType === CALENDAR_TYPE_CHECK) {
    const checkedLegend = document.createElement("span");
    checkedLegend.className = "year-legend-chip";
    checkedLegend.textContent = "✓ Checked";
    legend.appendChild(checkedLegend);
  } else if (normalizedCalendarType === CALENDAR_TYPE_SCORE) {
    const scoreLegend = document.createElement("span");
    scoreLegend.className = "year-legend-chip";
    scoreLegend.textContent =
      normalizedCalendarDisplay === SCORE_DISPLAY_NUMBER
        ? "Score numbers"
        : normalizedCalendarDisplay === SCORE_DISPLAY_HEATMAP
          ? "Heatmap intensity"
          : "Number + Heatmap";
    legend.appendChild(scoreLegend);
  } else if (normalizedCalendarType === CALENDAR_TYPE_NOTES) {
    const notesLegend = document.createElement("span");
    notesLegend.className = "year-legend-chip";
    notesLegend.textContent = "✎ Day has note";
    legend.appendChild(notesLegend);
  }

  summaryPanel.append(summaryHeader, kpiGrid, legend);
  yearViewContent.append(summaryPanel, yearGridShell);
  yearViewContainer.replaceChildren(yearViewContent);
}

const calendarApi = calendarContainer
  ? initInfiniteCalendar(calendarContainer, {
      initialActiveCalendar,
    })
  : null;
let activeCalendar = initialActiveCalendar;
let currentViewMode = VIEW_MODE_MONTH;
let activeYearViewYear = YEAR_VIEW_YEAR;

function syncViewToggleButtons(isYearView) {
  const mobileLayout = isMobileLayout();
  if (calendarViewToggle) {
    calendarViewToggle.dataset.activeView = isYearView ? VIEW_MODE_YEAR : VIEW_MODE_MONTH;
  }
  if (monthViewButton) {
    if (mobileLayout) {
      monthViewButton.classList.add("is-active");
      monthViewButton.setAttribute("aria-pressed", "true");
      monthViewButton.textContent = isYearView ? "Year" : "Month";
      monthViewButton.setAttribute(
        "aria-label",
        isYearView ? "Switch to month view" : "Switch to year view",
      );
    } else {
      monthViewButton.classList.toggle("is-active", !isYearView);
      monthViewButton.setAttribute("aria-pressed", String(!isYearView));
      monthViewButton.textContent = "Month";
      monthViewButton.removeAttribute("aria-label");
    }
  }
  if (yearViewButton) {
    if (mobileLayout) {
      yearViewButton.setAttribute("aria-hidden", "true");
      yearViewButton.tabIndex = -1;
    } else {
      yearViewButton.classList.toggle("is-active", isYearView);
      yearViewButton.setAttribute("aria-pressed", String(isYearView));
      yearViewButton.removeAttribute("aria-hidden");
      yearViewButton.tabIndex = 0;
    }
  }
}

function setCalendarViewMode(nextViewMode, { force = false } = {}) {
  const normalizedViewMode =
    nextViewMode === VIEW_MODE_YEAR ? VIEW_MODE_YEAR : VIEW_MODE_MONTH;
  if (!force && normalizedViewMode === currentViewMode) {
    return;
  }

  currentViewMode = normalizedViewMode;
  const isYearView = normalizedViewMode === VIEW_MODE_YEAR;
  if (calendarContainer) {
    calendarContainer.hidden = isYearView;
  }
  if (yearViewContainer) {
    yearViewContainer.hidden = !isYearView;
    if (isYearView) {
      renderYearView(activeCalendar, activeYearViewYear);
    }
  }
  appRoot?.classList.toggle("is-year-view", isYearView);

  if (returnToCurrentButton && isYearView) {
    returnToCurrentButton.classList.remove("is-visible");
    returnToCurrentButton.classList.remove("is-down");
    returnToCurrentButton.setAttribute("aria-hidden", "true");
  }
  if (calendarContainer && !isYearView) {
    requestAnimationFrame(() => {
      calendarContainer.dispatchEvent(new Event("scroll"));
    });
  }

  syncViewToggleButtons(isYearView);
}

function getCurrentMonthKey(nowDate = new Date()) {
  return `${nowDate.getFullYear()}-${nowDate.getMonth()}`;
}

function setReturnButtonState(button, direction) {
  const isVisible = direction === "up" || direction === "down";
  button.classList.toggle("is-visible", isVisible);
  button.classList.toggle("is-down", direction === "down");
  button.setAttribute("aria-hidden", String(!isVisible));
}

function setupReturnToCurrentButton({ container, button, onReturn }) {
  const currentMonthSelector = `[data-month="${getCurrentMonthKey()}"]`;

  const updateVisibility = () => {
    const currentMonthCard = container.querySelector(currentMonthSelector);
    if (!currentMonthCard) {
      setReturnButtonState(button, null);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const cardRect = currentMonthCard.getBoundingClientRect();
    const isCurrentMonthAboveViewport = cardRect.bottom <= containerRect.top + 1;
    const isCurrentMonthBelowViewport = cardRect.top >= containerRect.bottom - 1;

    if (isCurrentMonthAboveViewport) {
      setReturnButtonState(button, "up");
      return;
    }

    if (isCurrentMonthBelowViewport) {
      setReturnButtonState(button, "down");
      return;
    }

    setReturnButtonState(button, null);
  };

  button.addEventListener("click", onReturn);
  container.addEventListener("scroll", updateVisibility, { passive: true });
  window.addEventListener("resize", updateVisibility);
  requestAnimationFrame(updateVisibility);
}

function setupTelegramLogPanel({ toggleButton, panel, backdrop, closeButton }) {
  const setOpenState = (isOpen, { focusToggle = false } = {}) => {
    panel.classList.toggle("is-open", isOpen);
    backdrop?.classList.toggle("is-open", isOpen);
    panel.setAttribute("aria-hidden", String(!isOpen));
    backdrop?.setAttribute("aria-hidden", String(!isOpen));
    toggleButton.setAttribute("aria-expanded", String(isOpen));
    toggleButton.setAttribute(
      "data-tooltip",
      isOpen ? "Close Telegram Log" : "Open Telegram Log",
    );

    if (!isOpen && focusToggle) {
      toggleButton.focus({ preventScroll: true });
    }
  };

  setOpenState(false);

  toggleButton.addEventListener("click", () => {
    const shouldOpen = !panel.classList.contains("is-open");
    setOpenState(shouldOpen);
  });

  closeButton?.addEventListener("click", () => {
    setOpenState(false, { focusToggle: true });
  });

  backdrop?.addEventListener("click", () => {
    setOpenState(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !panel.classList.contains("is-open")) {
      return;
    }
    event.preventDefault();
    setOpenState(false, { focusToggle: true });
  });
}

function setupTelegramLogFrameThemeSync(frame) {
  const applyFrameTheme = () => {
    const frameDocument = frame.contentDocument;
    if (!frameDocument) return;

    const frameRoot = frameDocument.documentElement;
    if (!frameRoot) return;

    const appRootStyles = getComputedStyle(document.documentElement);
    const panelColor = appRootStyles.getPropertyValue("--panel").trim() || "#ffffff";
    const bgColor = appRootStyles.getPropertyValue("--bg-bottom").trim() || panelColor;
    const mutedColor = appRootStyles.getPropertyValue("--muted").trim() || "#eef2f8";
    const lineColor = appRootStyles.getPropertyValue("--line").trim() || "#b6c0cf";
    const inkColor = appRootStyles.getPropertyValue("--ink").trim() || "#111827";
    const accentColor =
      appRootStyles.getPropertyValue("--score-slider-active").trim() || "#3b82f6";
    const isLightTheme =
      document.documentElement.classList.contains("light") ||
      document.documentElement.classList.contains("solarized-light");

    const mutedTextColor = rgbString(
      mixRgb(
        parseColorToRgb(inkColor) ?? [17, 24, 39],
        parseColorToRgb(lineColor) ?? [182, 192, 207],
        0.42,
      ),
    );
    const thumbHoverColor = rgbString(
      mixRgb(
        parseColorToRgb(lineColor) ?? [182, 192, 207],
        parseColorToRgb(inkColor) ?? [17, 24, 39],
        isLightTheme ? 0.16 : 0.2,
      ),
    );
    const hoverSurfaceColor = rgbString(
      mixRgb(
        parseColorToRgb(mutedColor) ?? [238, 242, 248],
        parseColorToRgb(lineColor) ?? [182, 192, 207],
        isLightTheme ? 0.24 : 0.36,
      ),
    );
    const codeTextColor = rgbString(
      mixRgb(
        parseColorToRgb(accentColor) ?? [59, 130, 246],
        parseColorToRgb(inkColor) ?? [17, 24, 39],
        0.18,
      ),
    );

    frameRoot.style.setProperty("--log-scroll-track", mutedColor);
    frameRoot.style.setProperty("--log-scroll-thumb", lineColor);
    frameRoot.style.setProperty("--log-scroll-thumb-hover", thumbHoverColor);
    frameRoot.style.colorScheme = isLightTheme ? "light" : "dark";

    const themeStyleId = "justcal-log-scroll-theme";
    let themeStyleElement = frameDocument.getElementById(themeStyleId);
    if (!themeStyleElement) {
      themeStyleElement = frameDocument.createElement("style");
      themeStyleElement.id = themeStyleId;
      (frameDocument.head || frameRoot).appendChild(themeStyleElement);
    }
    themeStyleElement.textContent = `
      html {
        scrollbar-width: thin !important;
        scrollbar-color: ${lineColor} ${mutedColor} !important;
      }

      html,
      body {
        background: ${bgColor} !important;
        color: ${inkColor} !important;
      }

      .page_wrap,
      .page_body,
      .page_header {
        background: ${panelColor} !important;
        color: ${inkColor} !important;
      }

      .page_header {
        border-bottom: 1px solid ${lineColor} !important;
      }

      .bold,
      .message,
      .message .body,
      .list_page .entry {
        color: ${inkColor} !important;
      }

      .details,
      .date.details,
      .service .body {
        color: ${mutedTextColor} !important;
      }

      .page_wrap a,
      .default .from_name {
        color: ${accentColor} !important;
      }

      a.block_link:hover,
      div.selected,
      .bot_button {
        background: ${hoverSurfaceColor} !important;
      }

      code {
        color: ${codeTextColor} !important;
        background: ${mutedColor} !important;
      }

      pre {
        color: ${inkColor} !important;
        background: ${mutedColor} !important;
        border: 1px solid ${lineColor} !important;
      }

      html::-webkit-scrollbar,
      body::-webkit-scrollbar {
        width: 10px !important;
        height: 10px !important;
      }

      html::-webkit-scrollbar-track,
      body::-webkit-scrollbar-track {
        background: ${mutedColor} !important;
      }

      html::-webkit-scrollbar-thumb,
      body::-webkit-scrollbar-thumb {
        background-color: ${lineColor} !important;
        border-radius: 999px !important;
        border: 2px solid ${mutedColor} !important;
      }

      html::-webkit-scrollbar-thumb:hover,
      body::-webkit-scrollbar-thumb:hover {
        background-color: ${thumbHoverColor} !important;
      }
    `;
  };

  frame.addEventListener("load", applyFrameTheme);
  applyFrameTheme();

  const classObserver = new MutationObserver(() => {
    applyFrameTheme();
  });
  classObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
}

const jumpToPresentDay = () => {
  calendarApi?.scrollToPresentDay?.();
};

if (themeToggleButton) {
  setupThemeToggle(themeToggleButton);
}

if (telegramLogToggleButton && telegramLogPanel) {
  setupTelegramLogPanel({
    toggleButton: telegramLogToggleButton,
    panel: telegramLogPanel,
    backdrop: telegramLogPanelBackdrop,
    closeButton: telegramLogCloseButton,
  });
}

if (telegramLogFrame) {
  setupTelegramLogFrameThemeSync(telegramLogFrame);
}

if (headerCalendarsButton) {
  setupCalendarSwitcher(headerCalendarsButton, {
    onActiveCalendarChange: (calendar) => {
      activeCalendar = calendar;
      calendarApi?.setActiveCalendar(calendar);
      if (currentViewMode === VIEW_MODE_YEAR) {
        renderYearView(calendar, activeYearViewYear);
      }
    },
  });
}

if (calendarContainer && returnToCurrentButton) {
  setupReturnToCurrentButton({
    container: calendarContainer,
    button: returnToCurrentButton,
    onReturn: jumpToPresentDay,
  });
}

if (monthViewButton) {
  monthViewButton.addEventListener("click", () => {
    if (isMobileLayout()) {
      setCalendarViewMode(
        currentViewMode === VIEW_MODE_YEAR ? VIEW_MODE_MONTH : VIEW_MODE_YEAR,
      );
      return;
    }
    setCalendarViewMode(VIEW_MODE_MONTH);
  });
}

if (yearViewButton) {
  yearViewButton.addEventListener("click", () => {
    setCalendarViewMode(VIEW_MODE_YEAR);
  });
}

if (mobileLayoutMedia) {
  const handleLayoutMediaChange = () => {
    syncViewToggleButtons(currentViewMode === VIEW_MODE_YEAR);
  };
  if (typeof mobileLayoutMedia.addEventListener === "function") {
    mobileLayoutMedia.addEventListener("change", handleLayoutMediaChange);
  } else if (typeof mobileLayoutMedia.addListener === "function") {
    mobileLayoutMedia.addListener(handleLayoutMediaChange);
  }
}

setupTweakControls({
  panelToggleButton: mobileDebugToggleButton,
  onCellExpansionXChange: (nextExpansionX) => {
    calendarApi?.setCellExpansionX(nextExpansionX);
  },
  onCellExpansionYChange: (nextExpansionY) => {
    calendarApi?.setCellExpansionY(nextExpansionY);
  },
  onCameraZoomChange: (nextZoom) => {
    calendarApi?.setCameraZoom(nextZoom);
  },
  onFadeDeltaChange: (nextFadeDelta) => {
    applyAppBackgroundFadeDelta(nextFadeDelta);
  },
});

setupAppBackgroundFadeSync();
setCalendarViewMode(VIEW_MODE_MONTH, { force: true });
