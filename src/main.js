import { initInfiniteCalendar } from "./calendar.js";
import { getStoredActiveCalendar, setupCalendarSwitcher } from "./calendars.js";
import { setupTweakControls } from "./tweak-controls.js";
import { setupThemeToggle } from "./theme.js";

const calendarContainer = document.getElementById("calendar-scroll");
const yearViewContainer = document.getElementById("year-view");
const appRoot = document.getElementById("app");
const headerCalendarsButton = document.getElementById("header-calendars-btn");
const profileSwitcher = document.getElementById("profile-switcher");
const headerProfileButton = document.getElementById("header-profile-btn");
const profileOptions = document.getElementById("profile-options");
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
const CALENDARS_STORAGE_KEY = "justcal-calendars";
const CALENDAR_DAY_STATES_STORAGE_KEY = "justcal-calendar-day-states";
const LEGACY_DAY_STATE_STORAGE_KEY = "justcal-day-states";
const THEME_STORAGE_KEY = "justcal-theme";
const DRIVE_ACCOUNT_ID_STORAGE_KEY = "justcal-drive-account-id";
const DRIVE_CALENDAR_ID_MAP_STORAGE_KEY = "justcal-drive-calendar-id-map";
const DEFAULT_THEME = "tokyo-night-storm";
const DEFAULT_CALENDAR_ID = "energy-tracker";
const DEFAULT_CALENDAR_COLOR = "blue";
const CLEAR_ALL_DEFAULT_CALENDAR_ID = "default-calendar";
const CLEAR_ALL_DEFAULT_CALENDAR_NAME = "Default Calendar";
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
const SUPPORTED_THEME_KEYS = new Set([
  "light",
  "dark",
  "red",
  "tokyo-night-storm",
  "solarized-dark",
  "solarized-light",
]);
const MONTH_SHORT_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short" });
const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const DRIVE_ACCOUNT_ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DRIVE_ACCOUNT_ID_CHARSET_SIZE = DRIVE_ACCOUNT_ID_ALPHABET.length;
const DRIVE_ACCOUNT_ID_LENGTH = 22;
const DRIVE_ACCOUNT_ID_PATTERN = /^[A-Za-z0-9]{12,48}$/;
const LEGACY_DRIVE_ACCOUNT_ID_PATTERN = /^acc_[A-Za-z0-9][A-Za-z0-9_-]{5,63}$/;
const LEGACY_DRIVE_CALENDAR_ID_PATTERN = /^cal_[A-Za-z0-9][A-Za-z0-9_-]{5,63}$/;

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

function normalizeCanonicalDriveId(rawValue) {
  const candidateId = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!candidateId) {
    return "";
  }
  return DRIVE_ACCOUNT_ID_PATTERN.test(candidateId) ? candidateId : "";
}

function isValidDriveAccountId(rawValue) {
  const candidateId = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!candidateId || candidateId === "acc_default") {
    return false;
  }
  return DRIVE_ACCOUNT_ID_PATTERN.test(candidateId) || LEGACY_DRIVE_ACCOUNT_ID_PATTERN.test(candidateId);
}

function isValidDriveCalendarId(rawValue, { allowLegacy = true } = {}) {
  const candidateId = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!candidateId) {
    return false;
  }
  if (normalizeCanonicalDriveId(candidateId)) {
    return true;
  }
  return allowLegacy ? LEGACY_DRIVE_CALENDAR_ID_PATTERN.test(candidateId) : false;
}

function generateDriveAccountId(length = DRIVE_ACCOUNT_ID_LENGTH) {
  const tokenLength = Number.isInteger(length) && length > 0 ? length : DRIVE_ACCOUNT_ID_LENGTH;
  const randomSource =
    typeof crypto !== "undefined" && crypto && typeof crypto.getRandomValues === "function"
      ? crypto
      : null;
  let nextId = "";
  while (nextId.length < tokenLength) {
    const randomChunk = new Uint8Array(Math.max(tokenLength * 2, 16));
    if (randomSource) {
      randomSource.getRandomValues(randomChunk);
    } else {
      for (let index = 0; index < randomChunk.length; index += 1) {
        randomChunk[index] = Math.floor(Math.random() * 256);
      }
    }

    for (const rawByte of randomChunk) {
      if (rawByte >= 248) {
        continue;
      }
      nextId += DRIVE_ACCOUNT_ID_ALPHABET[rawByte % DRIVE_ACCOUNT_ID_CHARSET_SIZE];
      if (nextId.length >= tokenLength) {
        break;
      }
    }
  }
  return nextId;
}

function readStoredDriveAccountId() {
  try {
    const storedAccountId = localStorage.getItem(DRIVE_ACCOUNT_ID_STORAGE_KEY);
    if (!isValidDriveAccountId(storedAccountId)) {
      return "";
    }
    return storedAccountId.trim();
  } catch {
    return "";
  }
}

function persistDriveAccountId(rawAccountId) {
  if (!isValidDriveAccountId(rawAccountId)) {
    return false;
  }
  try {
    localStorage.setItem(DRIVE_ACCOUNT_ID_STORAGE_KEY, rawAccountId.trim());
    return true;
  } catch {
    return false;
  }
}

function getOrCreateDriveAccountId() {
  const storedAccountId = readStoredDriveAccountId();
  if (storedAccountId) {
    return storedAccountId;
  }

  const generatedAccountId = generateDriveAccountId();
  if (persistDriveAccountId(generatedAccountId)) {
    return generatedAccountId;
  }
  return generatedAccountId;
}

function readStoredDriveCalendarIdMap() {
  try {
    const rawStoredMap = localStorage.getItem(DRIVE_CALENDAR_ID_MAP_STORAGE_KEY);
    if (!rawStoredMap) {
      return {};
    }
    const parsedMap = JSON.parse(rawStoredMap);
    if (!parsedMap || typeof parsedMap !== "object" || Array.isArray(parsedMap)) {
      return {};
    }

    return Object.entries(parsedMap).reduce((nextValue, [rawKey, rawId]) => {
      const localCalendarId = String(rawKey ?? "").trim();
      const canonicalDriveId = normalizeCanonicalDriveId(rawId);
      if (!localCalendarId || !canonicalDriveId) {
        return nextValue;
      }
      nextValue[localCalendarId] = canonicalDriveId;
      return nextValue;
    }, {});
  } catch {
    return {};
  }
}

function persistDriveCalendarIdMap(idMap) {
  if (!idMap || typeof idMap !== "object" || Array.isArray(idMap)) {
    return false;
  }

  const normalizedMap = Object.entries(idMap).reduce((nextValue, [rawKey, rawId]) => {
    const localCalendarId = String(rawKey ?? "").trim();
    const canonicalDriveId = normalizeCanonicalDriveId(rawId);
    if (!localCalendarId || !canonicalDriveId) {
      return nextValue;
    }
    nextValue[localCalendarId] = canonicalDriveId;
    return nextValue;
  }, {});

  try {
    localStorage.setItem(DRIVE_CALENDAR_ID_MAP_STORAGE_KEY, JSON.stringify(normalizedMap));
    return true;
  } catch {
    return false;
  }
}

function generateDriveCalendarId(length = DRIVE_ACCOUNT_ID_LENGTH) {
  return generateDriveAccountId(length);
}

function getOrCreateDriveCalendarId(localCalendarId, usedIds = null) {
  const localKey = String(localCalendarId ?? "").trim();
  const idMap = readStoredDriveCalendarIdMap();

  const existingMappedId = localKey ? normalizeCanonicalDriveId(idMap[localKey]) : "";
  if (existingMappedId && !(usedIds instanceof Set && usedIds.has(existingMappedId))) {
    if (usedIds instanceof Set) {
      usedIds.add(existingMappedId);
    }
    return existingMappedId;
  }

  const reservedIds = new Set(Object.values(idMap).map((rawId) => normalizeCanonicalDriveId(rawId)).filter(Boolean));
  if (usedIds instanceof Set) {
    usedIds.forEach((existingId) => {
      const canonicalId = normalizeCanonicalDriveId(existingId);
      if (canonicalId) {
        reservedIds.add(canonicalId);
      }
    });
  }

  let nextDriveId = "";
  do {
    nextDriveId = generateDriveCalendarId();
  } while (reservedIds.has(nextDriveId));

  if (localKey) {
    idMap[localKey] = nextDriveId;
    persistDriveCalendarIdMap(idMap);
  }
  if (usedIds instanceof Set) {
    usedIds.add(nextDriveId);
  }
  return nextDriveId;
}

function resolveDriveCalendarId({ localCalendarId, rawCalendarId, usedIds = null } = {}) {
  const canonicalCalendarId = normalizeCanonicalDriveId(rawCalendarId);
  if (canonicalCalendarId && !(usedIds instanceof Set && usedIds.has(canonicalCalendarId))) {
    if (usedIds instanceof Set) {
      usedIds.add(canonicalCalendarId);
    }
    const localKey = String(localCalendarId ?? "").trim();
    if (localKey) {
      const idMap = readStoredDriveCalendarIdMap();
      if (idMap[localKey] !== canonicalCalendarId) {
        idMap[localKey] = canonicalCalendarId;
        persistDriveCalendarIdMap(idMap);
      }
    }
    return canonicalCalendarId;
  }

  return getOrCreateDriveCalendarId(localCalendarId, usedIds);
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
let calendarSwitcherApi = null;
let themeToggleApi = null;
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

function setupProfileSwitcher({ switcher, button, options, onDriveStateImported }) {
  const optionButtons = [...options.querySelectorAll("[data-profile-action]")];
  const googleDriveButton = options.querySelector('[data-profile-action="google-drive"]');
  const googleDriveLabel = options.querySelector("#profile-google-drive-label");
  const optionsDivider = options.querySelector(".calendar-options-divider");
  const driveBusyOverlay = document.getElementById("drive-busy-overlay");
  const driveDirtyIndicator = document.getElementById("drive-dirty-indicator");
  const GOOGLE_CONNECTED_COOKIE_NAME = "justcal_google_connected";
  const GOOGLE_AUTH_LOG_PREFIX = "[JustCalendar][GoogleDriveAuth]";
  const BACKEND_CALL_LOG_PREFIX = "[JustCalendar][BackendCall]";
  const LOCAL_CALENDAR_STORAGE_CHANGED_EVENT = "justcal:local-calendar-storage-changed";
  const GOOGLE_DRIVE_FILES_API_URL = "https://www.googleapis.com/drive/v3/files";
  const GOOGLE_DRIVE_UPLOAD_API_URL = "https://www.googleapis.com/upload/drive/v3/files";
  const GOOGLE_DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
  const GOOGLE_DRIVE_JSON_MIME_TYPE = "application/json";
  const JUSTCALENDAR_DRIVE_FOLDER_NAME = "JustCalendar.ai";
  const JUSTCALENDAR_CONFIG_FILE_NAME = "justcalendar.json";
  let isGoogleDriveConnected = false;
  let isGoogleDriveConfigured = true;
  let googleSub = "";
  let hasBootstrappedDriveConfig = false;
  let bootstrapDriveConfigPromise = null;
  let loadDriveStatePromise = null;
  let driveBusyCount = 0;
  let cachedDriveAccessToken = "";
  let cachedDriveAccessTokenExpiresAt = 0;
  let cachedDriveFolderId = "";
  let cachedDriveConfigFileId = "";
  let cachedDriveAccountId = readStoredDriveAccountId();
  const cachedDriveCalendarConfigById = new Map();
  const cachedDriveCalendarFileMetaById = new Map();
  const cachedDriveFileIdByName = new Map();
  const baselineCalendarMetaSignatureById = new Map();
  const baselineCalendarDaySignatureById = new Map();
  const AUTOSAVE_DEBOUNCE_MS = 2500;
  const AUTOSAVE_MAX_WAIT_MS = 20000;
  const AUTOSAVE_RETRY_STEPS_MS = [1000, 2000, 5000, 10000];
  let autosaveDebounceTimer = 0;
  let autosaveMaxWaitTimer = 0;
  let autosaveRetryTimer = 0;
  let autosaveRetryAttempt = 0;
  let autosaveInFlight = false;
  let autosaveRunPromise = null;
  let autosavePendingRun = false;
  let autosavePendingMode = "calendar";
  let lastObservedLocalActiveCalendarId =
    typeof getStoredActiveCalendar?.().id === "string" ? getStoredActiveCalendar().id : "";

  const logGoogleAuthMessage = (level, message, details) => {
    const logger = typeof console[level] === "function" ? console[level] : console.log;
    if (typeof details === "undefined") {
      logger(`${GOOGLE_AUTH_LOG_PREFIX} ${message}`);
      return;
    }
    logger(`${GOOGLE_AUTH_LOG_PREFIX} ${message}`, details);
  };

  const setDriveBusy = (isBusy) => {
    if (!driveBusyOverlay) return;
    const wasBusy = driveBusyCount > 0;
    if (isBusy) {
      driveBusyCount += 1;
    } else {
      driveBusyCount = Math.max(0, driveBusyCount - 1);
    }

    const isOverlayActive = driveBusyCount > 0;
    if (!wasBusy && isOverlayActive) {
      logGoogleAuthMessage("info", "Loading started.");
    } else if (wasBusy && !isOverlayActive) {
      logGoogleAuthMessage("info", "Loading finished.");
    }
    driveBusyOverlay.classList.toggle("is-active", isOverlayActive);
    driveBusyOverlay.setAttribute("aria-hidden", String(!isOverlayActive));
  };

  const readResponsePayload = async (response) => {
    try {
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return await response.json();
      }
      const textPayload = await response.text();
      if (!textPayload) {
        return null;
      }
      try {
        return JSON.parse(textPayload);
      } catch {
        return { raw: textPayload };
      }
    } catch {
      return null;
    }
  };

  const isBackendRequestTarget = (input) => {
    if (typeof input === "string") {
      return input.startsWith("/api/");
    }
    if (input instanceof URL) {
      return input.origin === window.location.origin && input.pathname.startsWith("/api/");
    }
    if (input instanceof Request) {
      try {
        const requestUrl = new URL(input.url, window.location.origin);
        return requestUrl.origin === window.location.origin && requestUrl.pathname.startsWith("/api/");
      } catch {
        return false;
      }
    }
    return false;
  };

  const toBackendRequestLabel = (input) => {
    if (typeof input === "string") {
      return input;
    }
    if (input instanceof URL) {
      return `${input.pathname}${input.search}`;
    }
    if (input instanceof Request) {
      try {
        const requestUrl = new URL(input.url, window.location.origin);
        return `${requestUrl.pathname}${requestUrl.search}`;
      } catch {
        return input.url || "<unknown>";
      }
    }
    return "<unknown>";
  };

  const backendFetch = async (input, init = undefined) => {
    const shouldLog = isBackendRequestTarget(input);
    const method =
      (init && typeof init.method === "string" && init.method.trim()) ||
      (input instanceof Request && typeof input.method === "string" && input.method.trim()) ||
      "GET";
    const targetLabel = toBackendRequestLabel(input);
    const startedAt =
      typeof performance !== "undefined" && performance && typeof performance.now === "function"
        ? performance.now()
        : Date.now();

    if (shouldLog) {
      console.info(`${BACKEND_CALL_LOG_PREFIX} -> ${method.toUpperCase()} ${targetLabel}`);
    }

    try {
      const response = await fetch(input, init);
      if (shouldLog) {
        const endedAt =
          typeof performance !== "undefined" && performance && typeof performance.now === "function"
            ? performance.now()
            : Date.now();
        const durationMs = Math.max(0, Math.round(endedAt - startedAt));
        console.info(
          `${BACKEND_CALL_LOG_PREFIX} <- ${method.toUpperCase()} ${targetLabel} ${response.status} (${durationMs}ms)`,
        );
      }
      return response;
    } catch (error) {
      if (shouldLog) {
        const endedAt =
          typeof performance !== "undefined" && performance && typeof performance.now === "function"
            ? performance.now()
            : Date.now();
        const durationMs = Math.max(0, Math.round(endedAt - startedAt));
        console.error(
          `${BACKEND_CALL_LOG_PREFIX} xx ${method.toUpperCase()} ${targetLabel} (${durationMs}ms)`,
          {
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
      throw error;
    }
  };

  const readCookieValue = (cookieName) => {
    const escapedCookieName = cookieName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const cookieMatch = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${escapedCookieName}=([^;]*)`),
    );
    if (!cookieMatch) return "";
    try {
      return decodeURIComponent(cookieMatch[1] || "");
    } catch {
      return cookieMatch[1] || "";
    }
  };

  const hasGoogleConnectedCookie = () => readCookieValue(GOOGLE_CONNECTED_COOKIE_NAME) === "1";

  const setGoogleDriveText = (nextLabel) => {
    if (googleDriveLabel) {
      googleDriveLabel.textContent = nextLabel;
      return;
    }
    if (googleDriveButton) {
      googleDriveButton.textContent = nextLabel;
    }
  };

  const syncStoredDriveAccountIdFromPayload = (payload) => {
    const accountId =
      payload && typeof payload === "object" && typeof payload.accountId === "string"
        ? payload.accountId.trim()
        : "";
    if (!accountId) {
      return "";
    }
    persistDriveAccountId(accountId);
    cachedDriveAccountId = accountId;
    return accountId;
  };

  const clearDriveRuntimeCache = ({ keepAccountId = false } = {}) => {
    cachedDriveAccessToken = "";
    cachedDriveAccessTokenExpiresAt = 0;
    cachedDriveFolderId = "";
    cachedDriveConfigFileId = "";
    cachedDriveCalendarConfigById.clear();
    cachedDriveCalendarFileMetaById.clear();
    cachedDriveFileIdByName.clear();
    if (!keepAccountId) {
      cachedDriveAccountId = "";
    }
  };

  const rememberCachedCalendarFileMeta = ({ calendarId = "", fileName = "", fileId = "" } = {}) => {
    const normalizedCalendarId = String(calendarId ?? "").trim();
    if (!isValidDriveCalendarId(normalizedCalendarId)) {
      return;
    }
    const normalizedFileName = String(fileName ?? "").trim();
    const normalizedFileId = String(fileId ?? "").trim();
    const previousMeta = isObjectLike(cachedDriveCalendarFileMetaById.get(normalizedCalendarId))
      ? cachedDriveCalendarFileMetaById.get(normalizedCalendarId)
      : {};
    const nextMeta = {
      ...previousMeta,
      ...(normalizedFileName ? { fileName: normalizedFileName } : {}),
      ...(normalizedFileId ? { fileId: normalizedFileId } : {}),
    };
    cachedDriveCalendarFileMetaById.set(normalizedCalendarId, nextMeta);
    if (normalizedFileName && normalizedFileId) {
      cachedDriveFileIdByName.set(normalizedFileName, normalizedFileId);
    }
  };

  const clearCachedCalendarFileId = ({ calendarId = "", fileName = "", fileId = "" } = {}) => {
    const normalizedCalendarId = String(calendarId ?? "").trim();
    const normalizedFileName = String(fileName ?? "").trim();
    const normalizedFileId = String(fileId ?? "").trim();
    if (normalizedCalendarId && cachedDriveCalendarFileMetaById.has(normalizedCalendarId)) {
      const existingMeta = cachedDriveCalendarFileMetaById.get(normalizedCalendarId);
      if (
        isObjectLike(existingMeta) &&
        typeof existingMeta.fileId === "string" &&
        existingMeta.fileId.trim() &&
        (!normalizedFileId || existingMeta.fileId.trim() === normalizedFileId)
      ) {
        const nextMeta = { ...existingMeta };
        delete nextMeta.fileId;
        if (Object.keys(nextMeta).length === 0) {
          cachedDriveCalendarFileMetaById.delete(normalizedCalendarId);
        } else {
          cachedDriveCalendarFileMetaById.set(normalizedCalendarId, nextMeta);
        }
      }
    }
    if (normalizedFileName && cachedDriveFileIdByName.has(normalizedFileName)) {
      const knownFileId = String(cachedDriveFileIdByName.get(normalizedFileName) ?? "").trim();
      if (!normalizedFileId || knownFileId === normalizedFileId) {
        cachedDriveFileIdByName.delete(normalizedFileName);
      }
    }
  };

  const getCachedCalendarFileId = ({ calendarId = "", fileName = "" } = {}) => {
    const normalizedCalendarId = String(calendarId ?? "").trim();
    if (normalizedCalendarId && cachedDriveCalendarFileMetaById.has(normalizedCalendarId)) {
      const cachedMeta = cachedDriveCalendarFileMetaById.get(normalizedCalendarId);
      if (isObjectLike(cachedMeta) && typeof cachedMeta.fileId === "string" && cachedMeta.fileId.trim()) {
        return cachedMeta.fileId.trim();
      }
    }
    const normalizedFileName = String(fileName ?? "").trim();
    if (!normalizedFileName) {
      return "";
    }
    const cachedFileId = cachedDriveFileIdByName.get(normalizedFileName);
    return typeof cachedFileId === "string" ? cachedFileId.trim() : "";
  };

  const rememberCachedCalendarConfigEntry = (rawCalendar) => {
    if (!isObjectLike(rawCalendar)) {
      return;
    }
    const calendarId =
      typeof rawCalendar.id === "string" && rawCalendar.id.trim() ? rawCalendar.id.trim() : "";
    if (!isValidDriveCalendarId(calendarId)) {
      return;
    }
    const dataFile =
      typeof rawCalendar["data-file"] === "string" ? rawCalendar["data-file"].trim() : "";
    const existingEntry = isObjectLike(cachedDriveCalendarConfigById.get(calendarId))
      ? cachedDriveCalendarConfigById.get(calendarId)
      : {};
    cachedDriveCalendarConfigById.set(calendarId, {
      ...existingEntry,
      id: calendarId,
      name: normalizeBootstrapCalendarName(rawCalendar.name, existingEntry.name || "Calendar"),
      type: normalizeBootstrapCalendarType(rawCalendar.type || existingEntry.type),
      color: normalizeCalendarColor(rawCalendar.color || existingEntry.color, DEFAULT_CALENDAR_COLOR),
      pinned:
        typeof rawCalendar.pinned === "boolean"
          ? rawCalendar.pinned
          : Boolean(existingEntry.pinned),
      ...(normalizeBootstrapCalendarType(rawCalendar.type || existingEntry.type) === CALENDAR_TYPE_SCORE
        ? {
            display: normalizeScoreDisplay(rawCalendar.display || existingEntry.display),
          }
        : {}),
      ...(dataFile ? { dataFile } : existingEntry.dataFile ? { dataFile: existingEntry.dataFile } : {}),
    });
    if (dataFile) {
      rememberCachedCalendarFileMeta({ calendarId, fileName: dataFile });
    }
  };

  const syncDriveRuntimeCacheFromPayload = (payload) => {
    if (!isObjectLike(payload)) {
      return;
    }
    syncStoredDriveAccountIdFromPayload(payload);

    const folderId = typeof payload.folderId === "string" ? payload.folderId.trim() : "";
    if (folderId) {
      cachedDriveFolderId = folderId;
    }

    const fileName = typeof payload.fileName === "string" ? payload.fileName.trim() : "";
    const fileId = typeof payload.fileId === "string" ? payload.fileId.trim() : "";
    if (fileName === JUSTCALENDAR_CONFIG_FILE_NAME && fileId) {
      cachedDriveConfigFileId = fileId;
    }

    const payloadCalendars = Array.isArray(payload.calendars) ? payload.calendars : [];
    payloadCalendars.forEach((rawCalendar) => {
      rememberCachedCalendarConfigEntry(rawCalendar);
    });

    if (isObjectLike(payload.calendar)) {
      rememberCachedCalendarConfigEntry(payload.calendar);
      const calendarId =
        typeof payload.calendar.id === "string" ? payload.calendar.id.trim() : "";
      const calendarDataFile =
        typeof payload.calendar["data-file"] === "string"
          ? payload.calendar["data-file"].trim()
          : fileName !== JUSTCALENDAR_CONFIG_FILE_NAME
            ? fileName
            : "";
      if (calendarId && (calendarDataFile || fileId)) {
        rememberCachedCalendarFileMeta({
          calendarId,
          fileName: calendarDataFile,
          fileId,
        });
      }
    }

    if (Array.isArray(payload.dataFiles)) {
      payload.dataFiles.forEach((rawDataFile) => {
        if (!isObjectLike(rawDataFile)) {
          return;
        }
        const calendarId =
          typeof rawDataFile.calendarId === "string" ? rawDataFile.calendarId.trim() : "";
        const dataFileName =
          typeof rawDataFile.fileName === "string" ? rawDataFile.fileName.trim() : "";
        const dataFileId =
          typeof rawDataFile.fileId === "string" ? rawDataFile.fileId.trim() : "";
        if (calendarId || dataFileName || dataFileId) {
          rememberCachedCalendarFileMeta({
            calendarId,
            fileName: dataFileName,
            fileId: dataFileId,
          });
        }
      });
    }

    const currentCalendarId =
      typeof payload.currentCalendarId === "string" ? payload.currentCalendarId.trim() : "";
    if (fileName && fileName !== JUSTCALENDAR_CONFIG_FILE_NAME && (currentCalendarId || fileId)) {
      rememberCachedCalendarFileMeta({
        calendarId: currentCalendarId,
        fileName,
        fileId,
      });
    }
  };

  const reorderGoogleDriveOption = (connected) => {
    if (!googleDriveButton || googleDriveButton.parentElement !== options) return;

    if (connected) {
      if (options.lastElementChild !== googleDriveButton) {
        options.appendChild(googleDriveButton);
      }
      return;
    }

    if (optionsDivider && optionsDivider.parentElement === options) {
      if (optionsDivider.nextElementSibling !== googleDriveButton) {
        optionsDivider.insertAdjacentElement("afterend", googleDriveButton);
      }
      return;
    }

    if (options.firstElementChild !== googleDriveButton) {
      options.insertBefore(googleDriveButton, options.firstElementChild);
    }
  };

  const normalizeBootstrapCalendarName = (rawName, fallbackName) => {
    const normalizedName = String(rawName ?? "").replace(/\s+/g, " ").trim();
    return normalizedName || fallbackName;
  };

  const normalizeBootstrapCalendarType = (rawType) => {
    if (typeof rawType !== "string") {
      return CALENDAR_TYPE_SIGNAL;
    }
    const normalizedType = rawType.trim().toLowerCase();
    if (
      normalizedType === CALENDAR_TYPE_SIGNAL ||
      normalizedType === CALENDAR_TYPE_SCORE ||
      normalizedType === CALENDAR_TYPE_CHECK ||
      normalizedType === CALENDAR_TYPE_NOTES
    ) {
      return normalizedType;
    }
    return CALENDAR_TYPE_SIGNAL;
  };

  const normalizeBootstrapCalendarDayEntries = (rawDayEntries) => {
    if (!isObjectLike(rawDayEntries)) {
      return {};
    }

    const normalizedDayEntries = {};
    Object.entries(rawDayEntries).forEach(([rawDayKey, rawDayValue]) => {
      const dayKey = String(rawDayKey ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
        return;
      }
      if (typeof rawDayValue === "string") {
        normalizedDayEntries[dayKey] = rawDayValue;
        return;
      }
      if (typeof rawDayValue === "boolean") {
        normalizedDayEntries[dayKey] = rawDayValue;
        return;
      }
      if (typeof rawDayValue === "number" && Number.isFinite(rawDayValue)) {
        normalizedDayEntries[dayKey] = rawDayValue;
      }
    });

    return normalizedDayEntries;
  };

  const readBootstrapCalendarDayStates = () => {
    try {
      const rawStoredDayStates = localStorage.getItem(CALENDAR_DAY_STATES_STORAGE_KEY);
      if (rawStoredDayStates !== null) {
        const parsedStoredDayStates = JSON.parse(rawStoredDayStates);
        if (isObjectLike(parsedStoredDayStates)) {
          return parsedStoredDayStates;
        }
      }
    } catch {
      // Ignore and try legacy fallback.
    }

    try {
      const rawLegacyDayStates = localStorage.getItem(LEGACY_DAY_STATE_STORAGE_KEY);
      if (rawLegacyDayStates === null) {
        return {};
      }
      const parsedLegacyDayStates = JSON.parse(rawLegacyDayStates);
      if (!isObjectLike(parsedLegacyDayStates)) {
        return {};
      }
      return {
        [DEFAULT_CALENDAR_ID]: parsedLegacyDayStates,
      };
    } catch {
      return {};
    }
  };

  const normalizeThemeForDrive = (rawTheme) => {
    const normalizedTheme = typeof rawTheme === "string" ? rawTheme.trim().toLowerCase() : "";
    if (normalizedTheme === "abyss") {
      return "solarized-dark";
    }
    return SUPPORTED_THEME_KEYS.has(normalizedTheme) ? normalizedTheme : "";
  };

  const readStoredThemeForDrive = () => {
    try {
      const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      return normalizeThemeForDrive(storedTheme);
    } catch {
      return "";
    }
  };

  const buildDriveBootstrapPayload = () => {
    const fallbackCalendars = [
      {
        id: "sleep-score",
        name: "Sleep Score",
        type: CALENDAR_TYPE_SCORE,
        color: "blue",
        pinned: true,
        display: SCORE_DISPLAY_NUMBER_HEATMAP,
        data: {},
      },
      {
        id: "took-pills",
        name: "Took Pills",
        type: CALENDAR_TYPE_CHECK,
        color: "green",
        pinned: true,
        data: {},
      },
      {
        id: "energy-tracker",
        name: "Energy Tracker",
        type: CALENDAR_TYPE_SIGNAL,
        color: "red",
        pinned: true,
        data: {},
      },
      {
        id: "todos",
        name: "TODOs",
        type: CALENDAR_TYPE_NOTES,
        color: "orange",
        pinned: true,
        data: {},
      },
      {
        id: "workout-intensity",
        name: "Workout Intensity",
        type: CALENDAR_TYPE_SCORE,
        color: "red",
        pinned: false,
        display: SCORE_DISPLAY_HEATMAP,
        data: {},
      },
    ];

    const currentAccountId = getOrCreateDriveAccountId();
    const buildDriveCalendarsFromLocalCalendars = ({
      localCalendars = [],
      dayStatesByLocalCalendarId = {},
    } = {}) => {
      const usedDriveIds = new Set();
      const localToDriveMap = new Map();
      const normalizedCalendars = localCalendars
        .map((calendar, index) => {
          if (!calendar || typeof calendar !== "object" || Array.isArray(calendar)) {
            return null;
          }

          const fallbackName = `Calendar ${index + 1}`;
          const localCalendarId =
            typeof calendar.id === "string" && calendar.id.trim()
              ? calendar.id.trim()
              : `calendar_${index + 1}`;
          const driveCalendarId = resolveDriveCalendarId({
            localCalendarId,
            rawCalendarId: typeof calendar.id === "string" ? calendar.id.trim() : "",
            usedIds: usedDriveIds,
          });
          if (!driveCalendarId) {
            return null;
          }
          localToDriveMap.set(localCalendarId, driveCalendarId);

          const dayEntries =
            localCalendarId && isObjectLike(dayStatesByLocalCalendarId)
              ? dayStatesByLocalCalendarId[localCalendarId]
              : {};
          return {
            id: driveCalendarId,
            name: normalizeBootstrapCalendarName(calendar.name, fallbackName),
            type: normalizeBootstrapCalendarType(calendar.type),
            color: normalizeCalendarColor(calendar.color, DEFAULT_CALENDAR_COLOR),
            pinned: Boolean(calendar.pinned),
            ...(normalizeBootstrapCalendarType(calendar.type) === CALENDAR_TYPE_SCORE
              ? { display: normalizeScoreDisplay(calendar.display) }
              : {}),
            data: normalizeBootstrapCalendarDayEntries(dayEntries),
          };
        })
        .filter(Boolean);

      return {
        normalizedCalendars,
        localToDriveMap,
      };
    };

    try {
      const rawStoredCalendarsState = localStorage.getItem(CALENDARS_STORAGE_KEY);
      const storedDayStatesByCalendarId = readBootstrapCalendarDayStates();
      if (!rawStoredCalendarsState) {
        const fallbackResult = buildDriveCalendarsFromLocalCalendars({
          localCalendars: fallbackCalendars,
          dayStatesByLocalCalendarId: {},
        });
        const driveCalendars =
          fallbackResult.normalizedCalendars.length > 0
            ? fallbackResult.normalizedCalendars
            : fallbackCalendars;
        return {
          currentAccount: "default",
          currentAccountId,
          currentCalendarId: driveCalendars[0]?.id || "",
          selectedTheme: readStoredThemeForDrive() || DEFAULT_THEME,
          calendars: driveCalendars,
        };
      }

      const parsedStoredCalendarsState = JSON.parse(rawStoredCalendarsState);
      const storedCalendars = Array.isArray(parsedStoredCalendarsState?.calendars)
        ? parsedStoredCalendarsState.calendars
        : [];
      const driveCalendarResult = buildDriveCalendarsFromLocalCalendars({
        localCalendars: storedCalendars,
        dayStatesByLocalCalendarId: storedDayStatesByCalendarId,
      });
      const normalizedCalendars = driveCalendarResult.normalizedCalendars;
      const requestedActiveLocalCalendarId =
        typeof parsedStoredCalendarsState?.activeCalendarId === "string"
          ? parsedStoredCalendarsState.activeCalendarId.trim()
          : "";
      const requestedActiveDriveCalendarId = requestedActiveLocalCalendarId
        ? driveCalendarResult.localToDriveMap.get(requestedActiveLocalCalendarId) || ""
        : "";
      const resolvedActiveCalendarId =
        requestedActiveDriveCalendarId &&
        normalizedCalendars.some((calendar) => calendar.id === requestedActiveDriveCalendarId)
          ? requestedActiveDriveCalendarId
          : normalizedCalendars[0]?.id || fallbackCalendars[0]?.id || "";

      return {
        currentAccount: "default",
        currentAccountId,
        currentCalendarId: resolvedActiveCalendarId,
        selectedTheme: readStoredThemeForDrive() || DEFAULT_THEME,
        calendars: normalizedCalendars.length > 0 ? normalizedCalendars : fallbackCalendars,
      };
    } catch {
      const fallbackResult = buildDriveCalendarsFromLocalCalendars({
        localCalendars: fallbackCalendars,
        dayStatesByLocalCalendarId: {},
      });
      const driveCalendars =
        fallbackResult.normalizedCalendars.length > 0
          ? fallbackResult.normalizedCalendars
          : fallbackCalendars;
      return {
        currentAccount: "default",
        currentAccountId,
        currentCalendarId: driveCalendars[0]?.id || "",
        selectedTheme: readStoredThemeForDrive() || DEFAULT_THEME,
        calendars: driveCalendars,
      };
    }
  };

  const normalizeRemoteCalendarEntry = (rawCalendar, index) => {
    if (!rawCalendar || typeof rawCalendar !== "object" || Array.isArray(rawCalendar)) {
      return null;
    }

    const fallbackId = `calendar-${index + 1}`;
    const fallbackName = `Calendar ${index + 1}`;
    const calendarId =
      typeof rawCalendar.id === "string" && rawCalendar.id.trim()
        ? rawCalendar.id.trim()
        : fallbackId;
    const calendarType = normalizeBootstrapCalendarType(rawCalendar.type);
    return {
      id: calendarId,
      name: normalizeBootstrapCalendarName(rawCalendar.name, fallbackName),
      type: calendarType,
      color: normalizeCalendarColor(rawCalendar.color, DEFAULT_CALENDAR_COLOR),
      pinned: Boolean(rawCalendar.pinned),
      ...(calendarType === CALENDAR_TYPE_SCORE
        ? { display: normalizeScoreDisplay(rawCalendar.display) }
        : {}),
    };
  };

  const normalizeRemoteCalendarDayEntries = (rawDayEntries, calendarType) => {
    if (!isObjectLike(rawDayEntries)) {
      return {};
    }

    const normalizedEntries = {};
    Object.entries(rawDayEntries).forEach(([rawDayKey, rawDayValue]) => {
      const dayKey = String(rawDayKey ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
        return;
      }

      if (calendarType === CALENDAR_TYPE_SCORE) {
        const normalizedScore = normalizeScoreValue(rawDayValue);
        if (normalizedScore === SCORE_UNASSIGNED) {
          return;
        }
        normalizedEntries[dayKey] = normalizedScore;
        return;
      }

      if (calendarType === CALENDAR_TYPE_CHECK) {
        if (!normalizeCheckValue(rawDayValue)) {
          return;
        }
        normalizedEntries[dayKey] = true;
        return;
      }

      if (calendarType === CALENDAR_TYPE_NOTES) {
        const normalizedNote = normalizeNoteValue(rawDayValue);
        if (!normalizedNote) {
          return;
        }
        normalizedEntries[dayKey] = normalizedNote;
        return;
      }

      const normalizedSignal = normalizeSignalValue(rawDayValue);
      if (!normalizedSignal) {
        return;
      }
      normalizedEntries[dayKey] = normalizedSignal;
    });

    return normalizedEntries;
  };

  const canonicalizeJson = (value) => {
    if (Array.isArray(value)) {
      return value.map((item) => canonicalizeJson(item));
    }
    if (!value || typeof value !== "object") {
      return value;
    }
    const sortedKeys = Object.keys(value).sort();
    return sortedKeys.reduce((nextObject, key) => {
      nextObject[key] = canonicalizeJson(value[key]);
      return nextObject;
    }, {});
  };

  const toCanonicalSignature = (value) => {
    return JSON.stringify(canonicalizeJson(value));
  };

  const readLocalDriveCalendarSignatures = () => {
    const bootstrapPayload = buildDriveBootstrapPayload();
    const calendars = Array.isArray(bootstrapPayload?.calendars) ? bootstrapPayload.calendars : [];
    const signaturesByCalendarId = new Map();
    calendars.forEach((rawCalendar) => {
      if (!isObjectLike(rawCalendar)) {
        return;
      }
      const calendarId =
        typeof rawCalendar.id === "string" ? rawCalendar.id.trim() : "";
      if (!calendarId) {
        return;
      }

      const calendarType = normalizeBootstrapCalendarType(rawCalendar.type);
      const calendarMetaPayload = {
        id: calendarId,
        name: normalizeBootstrapCalendarName(rawCalendar.name, "Calendar"),
        type: calendarType,
        color: normalizeCalendarColor(rawCalendar.color, DEFAULT_CALENDAR_COLOR),
        pinned: Boolean(rawCalendar.pinned),
        ...(calendarType === CALENDAR_TYPE_SCORE
          ? { display: normalizeScoreDisplay(rawCalendar.display) }
          : {}),
      };
      const calendarDayPayload = normalizeBootstrapCalendarDayEntries(rawCalendar.data);

      signaturesByCalendarId.set(calendarId, {
        meta: toCanonicalSignature(calendarMetaPayload),
        day: toCanonicalSignature(calendarDayPayload),
      });
    });

    const currentCalendarId =
      typeof bootstrapPayload?.currentCalendarId === "string"
        ? bootstrapPayload.currentCalendarId.trim()
        : "";

    return {
      currentCalendarId,
      signaturesByCalendarId,
    };
  };

  const setCalendarDirtyIndicator = (isDirty) => {
    if (!driveDirtyIndicator) {
      return;
    }
    driveDirtyIndicator.classList.toggle("is-visible", Boolean(isDirty));
    driveDirtyIndicator.setAttribute("aria-hidden", String(!isDirty));
  };

  const resolveActiveCalendarIdFromSignatures = ({ currentCalendarId, signaturesByCalendarId }) => {
    const requestedCalendarId = typeof currentCalendarId === "string" ? currentCalendarId.trim() : "";
    if (requestedCalendarId && signaturesByCalendarId.has(requestedCalendarId)) {
      return requestedCalendarId;
    }
    return signaturesByCalendarId.keys().next().value || "";
  };

  const readDriveDirtyCalendarSummary = () => {
    const { currentCalendarId, signaturesByCalendarId } = readLocalDriveCalendarSignatures();
    const resolvedActiveCalendarId = resolveActiveCalendarIdFromSignatures({
      currentCalendarId,
      signaturesByCalendarId,
    });

    const dirtyCalendarIds = [];
    const dirtyMetaCalendarIds = [];
    const dirtyDayCalendarIds = [];
    signaturesByCalendarId.forEach((signatures, calendarId) => {
      const baselineMetaSignature = baselineCalendarMetaSignatureById.get(calendarId);
      const baselineDaySignature = baselineCalendarDaySignatureById.get(calendarId);
      const isMetaDirty =
        typeof baselineMetaSignature !== "string" || baselineMetaSignature !== signatures.meta;
      const isDayDirty =
        typeof baselineDaySignature !== "string" || baselineDaySignature !== signatures.day;
      if (isMetaDirty || isDayDirty) {
        dirtyCalendarIds.push(calendarId);
      }
      if (isMetaDirty) {
        dirtyMetaCalendarIds.push(calendarId);
      }
      if (isDayDirty) {
        dirtyDayCalendarIds.push(calendarId);
      }
    });

    return {
      currentCalendarId: resolvedActiveCalendarId,
      signaturesByCalendarId,
      dirtyCalendarIds,
      dirtyMetaCalendarIds,
      dirtyDayCalendarIds,
      hasDirtyCalendars: dirtyCalendarIds.length > 0,
      currentCalendarMetaDirty: dirtyMetaCalendarIds.includes(resolvedActiveCalendarId),
      currentCalendarDayDirty: dirtyDayCalendarIds.includes(resolvedActiveCalendarId),
      currentCalendarDirty: dirtyCalendarIds.includes(resolvedActiveCalendarId),
    };
  };

  const refreshObservedLocalActiveCalendarId = () => {
    const { currentCalendarId, signaturesByCalendarId } = readLocalDriveCalendarSignatures();
    lastObservedLocalActiveCalendarId = resolveActiveCalendarIdFromSignatures({
      currentCalendarId,
      signaturesByCalendarId,
    });
    return lastObservedLocalActiveCalendarId;
  };

  const syncCalendarDirtyIndicator = () => {
    if (!isGoogleDriveConfigured || !isGoogleDriveConnected) {
      setCalendarDirtyIndicator(false);
      return;
    }
    if (
      baselineCalendarMetaSignatureById.size === 0 &&
      baselineCalendarDaySignatureById.size === 0 &&
      !hasBootstrappedDriveConfig
    ) {
      setCalendarDirtyIndicator(false);
      return;
    }

    const dirtySummary = readDriveDirtyCalendarSummary();
    setCalendarDirtyIndicator(Boolean(dirtySummary.currentCalendarDirty));
  };

  const clearCalendarDriveDirtyBaselines = () => {
    baselineCalendarMetaSignatureById.clear();
    baselineCalendarDaySignatureById.clear();
    syncCalendarDirtyIndicator();
  };

  const markAllCalendarsAsDriveCleanFromLocalState = () => {
    const { signaturesByCalendarId } = readLocalDriveCalendarSignatures();
    baselineCalendarMetaSignatureById.clear();
    baselineCalendarDaySignatureById.clear();
    signaturesByCalendarId.forEach((signatures, calendarId) => {
      baselineCalendarMetaSignatureById.set(calendarId, signatures.meta);
      baselineCalendarDaySignatureById.set(calendarId, signatures.day);
    });
    syncCalendarDirtyIndicator();
  };

  const markCalendarDayAsDriveCleanFromLocalState = (calendarId) => {
    const { currentCalendarId, signaturesByCalendarId } = readLocalDriveCalendarSignatures();
    const normalizedCalendarId = String(calendarId ?? "").trim();
    const targetCalendarId =
      normalizedCalendarId && signaturesByCalendarId.has(normalizedCalendarId)
        ? normalizedCalendarId
        : currentCalendarId && signaturesByCalendarId.has(currentCalendarId)
          ? currentCalendarId
          : "";
    if (!targetCalendarId) {
      syncCalendarDirtyIndicator();
      return;
    }

    const signatures = signaturesByCalendarId.get(targetCalendarId);
    if (!signatures) {
      syncCalendarDirtyIndicator();
      return;
    }

    if (!baselineCalendarMetaSignatureById.has(targetCalendarId)) {
      baselineCalendarMetaSignatureById.set(targetCalendarId, signatures.meta);
    }
    baselineCalendarDaySignatureById.set(targetCalendarId, signatures.day);
    syncCalendarDirtyIndicator();
  };

  const escapeDriveQueryValue = (value) => String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  const toNestedCalendarDayEntries = (flatDayEntries) => {
    if (!isObjectLike(flatDayEntries)) {
      return {};
    }

    const nestedDayEntries = {};
    const sortedDayEntries = Object.entries(flatDayEntries).sort(([leftDayKey], [rightDayKey]) =>
      leftDayKey.localeCompare(rightDayKey),
    );
    for (const [dayKey, dayValue] of sortedDayEntries) {
      const dayKeyMatch = dayKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!dayKeyMatch) {
        continue;
      }
      const [, yearKey, monthKey, dayToken] = dayKeyMatch;
      if (!nestedDayEntries[yearKey]) {
        nestedDayEntries[yearKey] = {};
      }
      if (!nestedDayEntries[yearKey][monthKey]) {
        nestedDayEntries[yearKey][monthKey] = {};
      }
      nestedDayEntries[yearKey][monthKey][dayToken] = dayValue;
    }
    return nestedDayEntries;
  };

  const toFlatCalendarDayEntries = (nestedDayEntries) => {
    if (!isObjectLike(nestedDayEntries)) {
      return {};
    }

    const flatDayEntries = {};
    Object.entries(nestedDayEntries).forEach(([rawYearKey, rawYearValue]) => {
      const yearKey = String(rawYearKey ?? "").trim();
      if (!/^\d{4}$/.test(yearKey) || !isObjectLike(rawYearValue)) {
        return;
      }

      Object.entries(rawYearValue).forEach(([rawMonthKey, rawMonthValue]) => {
        const monthTokenRaw = String(rawMonthKey ?? "").trim();
        const monthNumber = Number.parseInt(monthTokenRaw, 10);
        if (!Number.isFinite(monthNumber) || monthNumber < 1 || monthNumber > 12 || !isObjectLike(rawMonthValue)) {
          return;
        }
        const monthKey = String(monthNumber).padStart(2, "0");

        Object.entries(rawMonthValue).forEach(([rawDayKey, rawDayValue]) => {
          const dayTokenRaw = String(rawDayKey ?? "").trim();
          const dayNumber = Number.parseInt(dayTokenRaw, 10);
          if (!Number.isFinite(dayNumber) || dayNumber < 1 || dayNumber > 31) {
            return;
          }
          const dayKey = String(dayNumber).padStart(2, "0");
          const flatDayKey = `${yearKey}-${monthKey}-${dayKey}`;
          flatDayEntries[flatDayKey] = rawDayValue;
        });
      });
    });

    return flatDayEntries;
  };

  const requestGoogleAccessTokenFromBackend = async ({ forceRefresh = false } = {}) => {
    if (
      !forceRefresh &&
      cachedDriveAccessToken &&
      Number.isFinite(cachedDriveAccessTokenExpiresAt) &&
      cachedDriveAccessTokenExpiresAt > Date.now() + 30_000
    ) {
      return {
        ok: true,
        accessToken: cachedDriveAccessToken,
        payload: {
          cached: true,
          expiresAt: cachedDriveAccessTokenExpiresAt,
        },
      };
    }

    const response = await backendFetch("/api/auth/google/access-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });
    const payload = await readResponsePayload(response);
    const accessToken =
      payload && typeof payload.accessToken === "string" ? payload.accessToken.trim() : "";
    if (!response.ok || !accessToken) {
      return {
        ok: false,
        status: response.status,
        statusText: response.statusText,
        payload,
      };
    }
    const expiresAtRaw = Number(payload?.expiresAt);
    const expiresAt =
      Number.isFinite(expiresAtRaw) && expiresAtRaw > Date.now()
        ? expiresAtRaw
        : Date.now() + 45 * 60_000;
    cachedDriveAccessToken = accessToken;
    cachedDriveAccessTokenExpiresAt = expiresAt;
    return {
      ok: true,
      accessToken,
      payload,
    };
  };

  const requestDriveApi = async ({ accessToken, url, method = "GET", headers = {}, body } = {}) => {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...headers,
      },
      ...(typeof body === "undefined" ? {} : { body }),
    });
    const payload = await readResponsePayload(response);
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        statusText: response.statusText,
        payload,
      };
    }
    return {
      ok: true,
      payload,
      response,
    };
  };

  const findDriveFileByNameInFolderFromBrowser = async ({ accessToken, folderId, fileName }) => {
    if (!folderId || !fileName) {
      return {
        ok: false,
        error: "missing_file_lookup_params",
      };
    }

    const escapedFileName = escapeDriveQueryValue(fileName);
    const escapedFolderId = escapeDriveQueryValue(folderId);
    const listUrl = new URL(GOOGLE_DRIVE_FILES_API_URL);
    listUrl.searchParams.set(
      "q",
      `name = '${escapedFileName}' and '${escapedFolderId}' in parents and trashed = false`,
    );
    listUrl.searchParams.set("spaces", "drive");
    listUrl.searchParams.set("fields", "files(id,name,mimeType)");
    listUrl.searchParams.set("pageSize", "1");

    const listResult = await requestDriveApi({
      accessToken,
      url: listUrl,
    });
    if (!listResult.ok) {
      return {
        ok: false,
        error: "file_lookup_failed",
        status: listResult.status,
        statusText: listResult.statusText,
        payload: listResult.payload,
      };
    }

    const existingFile =
      Array.isArray(listResult.payload?.files) && listResult.payload.files.length > 0
        ? listResult.payload.files[0]
        : null;
    if (!existingFile || typeof existingFile.id !== "string" || !existingFile.id.trim()) {
      return {
        ok: true,
        found: false,
      };
    }

    return {
      ok: true,
      found: true,
      fileId: existingFile.id.trim(),
    };
  };

  const ensureDriveFolderFromBrowser = async (accessToken) => {
    if (cachedDriveFolderId) {
      return {
        ok: true,
        created: false,
        folderId: cachedDriveFolderId,
      };
    }

    const escapedFolderName = escapeDriveQueryValue(JUSTCALENDAR_DRIVE_FOLDER_NAME);
    const listUrl = new URL(GOOGLE_DRIVE_FILES_API_URL);
    listUrl.searchParams.set(
      "q",
      `name = '${escapedFolderName}' and mimeType = '${GOOGLE_DRIVE_FOLDER_MIME_TYPE}' and trashed = false`,
    );
    listUrl.searchParams.set("spaces", "drive");
    listUrl.searchParams.set("fields", "files(id,name,mimeType)");
    listUrl.searchParams.set("pageSize", "1");

    const lookupResult = await requestDriveApi({
      accessToken,
      url: listUrl,
    });
    if (!lookupResult.ok) {
      return {
        ok: false,
        error: "folder_lookup_failed",
        status: lookupResult.status,
        statusText: lookupResult.statusText,
        payload: lookupResult.payload,
      };
    }

    const firstFolder =
      Array.isArray(lookupResult.payload?.files) && lookupResult.payload.files.length > 0
        ? lookupResult.payload.files[0]
        : null;
    if (firstFolder && typeof firstFolder.id === "string" && firstFolder.id.trim()) {
      cachedDriveFolderId = firstFolder.id.trim();
      return {
        ok: true,
        created: false,
        folderId: cachedDriveFolderId,
      };
    }

    const createResult = await requestDriveApi({
      accessToken,
      url: GOOGLE_DRIVE_FILES_API_URL,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: JUSTCALENDAR_DRIVE_FOLDER_NAME,
        mimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE,
      }),
    });
    if (!createResult.ok) {
      return {
        ok: false,
        error: "folder_create_failed",
        status: createResult.status,
        statusText: createResult.statusText,
        payload: createResult.payload,
      };
    }

    const folderId =
      createResult.payload && typeof createResult.payload.id === "string"
        ? createResult.payload.id.trim()
        : "";
    if (!folderId) {
      return {
        ok: false,
        error: "missing_folder_id_after_create",
        status: 502,
        payload: createResult.payload,
      };
    }

    cachedDriveFolderId = folderId;
    return {
      ok: true,
      created: true,
      folderId,
    };
  };

  const createMultipartBoundary = () => {
    const randomChunk = new Uint8Array(12);
    if (typeof crypto !== "undefined" && crypto && typeof crypto.getRandomValues === "function") {
      crypto.getRandomValues(randomChunk);
    } else {
      for (let index = 0; index < randomChunk.length; index += 1) {
        randomChunk[index] = Math.floor(Math.random() * 256);
      }
    }
    const randomHex = Array.from(randomChunk, (entry) => entry.toString(16).padStart(2, "0")).join("");
    return `justcalendar_boundary_${randomHex}`;
  };

  const createDriveJsonFileInFolderFromBrowser = async ({
    accessToken,
    folderId,
    fileName,
    payload,
  } = {}) => {
    if (!folderId || !fileName) {
      return {
        ok: false,
        error: "missing_file_create_params",
      };
    }

    const metadata = {
      name: fileName,
      parents: [folderId],
      mimeType: GOOGLE_DRIVE_JSON_MIME_TYPE,
    };
    const fileContents = `${JSON.stringify(payload, null, 2)}\n`;
    const boundary = createMultipartBoundary();
    const multipartBody = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      fileContents,
      `--${boundary}--`,
      "",
    ].join("\r\n");

    const createUrl = new URL(GOOGLE_DRIVE_UPLOAD_API_URL);
    createUrl.searchParams.set("uploadType", "multipart");
    createUrl.searchParams.set("fields", "id,name,mimeType");

    const createResult = await requestDriveApi({
      accessToken,
      url: createUrl,
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    });
    if (!createResult.ok) {
      return {
        ok: false,
        error: "file_create_failed",
        status: createResult.status,
        statusText: createResult.statusText,
        payload: createResult.payload,
      };
    }

    const fileId =
      createResult.payload && typeof createResult.payload.id === "string"
        ? createResult.payload.id.trim()
        : "";
    if (!fileId) {
      return {
        ok: false,
        error: "missing_file_id_after_create",
        status: 502,
        payload: createResult.payload,
      };
    }

    return {
      ok: true,
      fileId,
      created: true,
    };
  };

  const updateDriveJsonFileByIdFromBrowser = async ({
    accessToken,
    fileId,
    payload,
  } = {}) => {
    if (!fileId) {
      return {
        ok: false,
        error: "missing_file_update_params",
      };
    }

    const updateUrl = new URL(`${GOOGLE_DRIVE_UPLOAD_API_URL}/${encodeURIComponent(fileId)}`);
    updateUrl.searchParams.set("uploadType", "media");
    updateUrl.searchParams.set("fields", "id,name,mimeType");

    const updateResult = await requestDriveApi({
      accessToken,
      url: updateUrl,
      method: "PATCH",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: `${JSON.stringify(payload, null, 2)}\n`,
    });
    if (!updateResult.ok) {
      return {
        ok: false,
        error: "file_update_failed",
        status: updateResult.status,
        statusText: updateResult.statusText,
        payload: updateResult.payload,
      };
    }

    return {
      ok: true,
      fileId,
      created: false,
    };
  };

  const upsertDriveJsonFileInFolderFromBrowser = async ({
    accessToken,
    folderId,
    fileName,
    payload,
  } = {}) => {
    const lookupResult = await findDriveFileByNameInFolderFromBrowser({
      accessToken,
      folderId,
      fileName,
    });
    if (!lookupResult.ok) {
      return lookupResult;
    }

    if (lookupResult.found) {
      return updateDriveJsonFileByIdFromBrowser({
        accessToken,
        fileId: lookupResult.fileId,
        payload,
      });
    }

    return createDriveJsonFileInFolderFromBrowser({
      accessToken,
      folderId,
      fileName,
      payload,
    });
  };

  const readDriveJsonFileByIdFromBrowser = async ({ accessToken, fileId } = {}) => {
    if (!fileId) {
      return {
        ok: false,
        error: "missing_file_read_params",
      };
    }

    const readUrl = new URL(`${GOOGLE_DRIVE_FILES_API_URL}/${encodeURIComponent(fileId)}`);
    readUrl.searchParams.set("alt", "media");

    const readResult = await requestDriveApi({
      accessToken,
      url: readUrl,
    });
    if (!readResult.ok) {
      return {
        ok: false,
        error: "file_read_failed",
        status: readResult.status,
        statusText: readResult.statusText,
        payload: readResult.payload,
      };
    }
    if (!isObjectLike(readResult.payload)) {
      return {
        ok: false,
        error: "file_read_invalid_payload",
        status: 502,
        payload: readResult.payload,
      };
    }

    return {
      ok: true,
      payload: readResult.payload,
    };
  };

  const buildDrivePersistedFilesFromBootstrap = (bootstrapPayload) => {
    const payloadObject =
      bootstrapPayload && typeof bootstrapPayload === "object" && !Array.isArray(bootstrapPayload)
        ? bootstrapPayload
        : {};
    const accountName = normalizeBootstrapCalendarName(payloadObject.currentAccount, "default");
    const accountId =
      (typeof payloadObject.currentAccountId === "string" ? payloadObject.currentAccountId.trim() : "") ||
      getOrCreateDriveAccountId();
    const selectedTheme = normalizeThemeForDrive(payloadObject.selectedTheme) || DEFAULT_THEME;
    const rawCalendars = Array.isArray(payloadObject.calendars) ? payloadObject.calendars : [];
    const usedDriveCalendarIds = new Set();
    const rawToDriveCalendarIdMap = new Map();
    const normalizedCalendars = rawCalendars
      .map((rawCalendar, index) => {
        if (!isObjectLike(rawCalendar)) {
          return null;
        }

        const fallbackName = `Calendar ${index + 1}`;
        const rawCalendarId =
          typeof rawCalendar.id === "string" ? rawCalendar.id.trim() : `calendar_${index + 1}`;
        const calendarId = resolveDriveCalendarId({
          localCalendarId: rawCalendarId || `calendar_${index + 1}`,
          rawCalendarId,
          usedIds: usedDriveCalendarIds,
        });
        if (!calendarId) {
          return null;
        }
        if (rawCalendarId) {
          rawToDriveCalendarIdMap.set(rawCalendarId, calendarId);
        }

        const calendarType = normalizeBootstrapCalendarType(rawCalendar.type);
        const calendarName = normalizeBootstrapCalendarName(rawCalendar.name, fallbackName);
        const calendarColor = normalizeCalendarColor(rawCalendar.color, DEFAULT_CALENDAR_COLOR);
        const calendarPinned = Boolean(rawCalendar.pinned);
        const calendarDisplay =
          calendarType === CALENDAR_TYPE_SCORE
            ? normalizeScoreDisplay(rawCalendar.display)
            : undefined;
        const dayEntries = normalizeBootstrapCalendarDayEntries(rawCalendar.data);
        const dataFile = `${accountId}_${calendarId}.json`;

        return {
          id: calendarId,
          name: calendarName,
          type: calendarType,
          color: calendarColor,
          pinned: calendarPinned,
          ...(calendarDisplay ? { display: calendarDisplay } : {}),
          dataFile,
          data: dayEntries,
        };
      })
      .filter(Boolean);

    const currentCalendarIdRaw =
      typeof payloadObject.currentCalendarId === "string" ? payloadObject.currentCalendarId.trim() : "";
    const mappedCurrentCalendarId =
      rawToDriveCalendarIdMap.get(currentCalendarIdRaw) || normalizeCanonicalDriveId(currentCalendarIdRaw);
    const currentCalendarId = normalizedCalendars.some((calendar) => calendar.id === currentCalendarIdRaw)
      ? currentCalendarIdRaw
      : normalizedCalendars.some((calendar) => calendar.id === mappedCurrentCalendarId)
        ? mappedCurrentCalendarId
      : normalizedCalendars[0]?.id || "";

    const configPayload = {
      version: 1,
      "current-account-id": accountId,
      "current-calendar-id": currentCalendarId,
      "selected-theme": selectedTheme,
      accounts: {
        [accountId]: {
          id: accountId,
          name: accountName,
          calendars: normalizedCalendars.map((calendar) => ({
            id: calendar.id,
            name: calendar.name,
            type: calendar.type,
            color: calendar.color,
            pinned: calendar.pinned,
            ...(calendar.type === CALENDAR_TYPE_SCORE && calendar.display
              ? { display: calendar.display }
              : {}),
            "data-file": calendar.dataFile,
          })),
        },
      },
    };

    const calendarDataFiles = normalizedCalendars.map((calendar) => ({
      calendarId: calendar.id,
      fileName: calendar.dataFile,
      payload: {
        version: 1,
        "account-id": accountId,
        "calendar-id": calendar.id,
        "calendar-type": calendar.type,
        data: toNestedCalendarDayEntries(calendar.data),
      },
    }));

    return {
      accountId,
      accountName,
      currentCalendarId,
      selectedTheme,
      calendars: normalizedCalendars,
      configPayload,
      calendarDataFiles,
    };
  };

  const ensureMissingDriveConfigFromBrowser = async () => {
    const accessTokenResult = await requestGoogleAccessTokenFromBackend();
    if (!accessTokenResult.ok) {
      return {
        ok: false,
        phase: "access_token",
        ...accessTokenResult,
      };
    }
    const accessToken = accessTokenResult.accessToken;

    const folderResult = await ensureDriveFolderFromBrowser(accessToken);
    if (!folderResult.ok) {
      return {
        ok: false,
        phase: "folder",
        ...folderResult,
      };
    }
    const folderId = folderResult.folderId || "";

    const configLookupResult = await findDriveFileByNameInFolderFromBrowser({
      accessToken,
      folderId,
      fileName: JUSTCALENDAR_CONFIG_FILE_NAME,
    });
    if (!configLookupResult.ok) {
      return {
        ok: false,
        phase: "config_lookup",
        ...configLookupResult,
      };
    }

    if (configLookupResult.found) {
      return {
        ok: true,
        handled: false,
        reason: "config_exists",
        folderId,
        fileId: configLookupResult.fileId || "",
      };
    }

    const bootstrapPayload = buildDriveBootstrapPayload();
    const persistedBundle = buildDrivePersistedFilesFromBootstrap(bootstrapPayload);
    const createConfigResult = await createDriveJsonFileInFolderFromBrowser({
      accessToken,
      folderId,
      fileName: JUSTCALENDAR_CONFIG_FILE_NAME,
      payload: persistedBundle.configPayload,
    });
    if (!createConfigResult.ok) {
      return {
        ok: false,
        phase: "config_create",
        ...createConfigResult,
      };
    }

    const calendarFileResults = [];
    for (const calendarDataFile of persistedBundle.calendarDataFiles) {
      const upsertResult = await upsertDriveJsonFileInFolderFromBrowser({
        accessToken,
        folderId,
        fileName: calendarDataFile.fileName,
        payload: calendarDataFile.payload,
      });
      if (!upsertResult.ok) {
        return {
          ok: false,
          phase: "calendar_data_upsert",
          details: {
            calendarId: calendarDataFile.calendarId,
            fileName: calendarDataFile.fileName,
            result: upsertResult,
          },
        };
      }
      calendarFileResults.push({
        calendarId: calendarDataFile.calendarId,
        fileName: calendarDataFile.fileName,
        fileId: upsertResult.fileId || "",
        created: Boolean(upsertResult.created),
      });
    }

    return {
      ok: true,
      handled: true,
      created: true,
      configSource: "created",
      folderId,
      fileId: createConfigResult.fileId || "",
      accountId: persistedBundle.accountId,
      account: persistedBundle.accountName,
      currentCalendarId: persistedBundle.currentCalendarId,
      selectedTheme: persistedBundle.selectedTheme,
      calendars: persistedBundle.calendars.map((calendar) => ({
        id: calendar.id,
        name: calendar.name,
        type: calendar.type,
        color: calendar.color,
        pinned: calendar.pinned,
        ...(calendar.type === CALENDAR_TYPE_SCORE && calendar.display
          ? { display: calendar.display }
          : {}),
        "data-file": calendar.dataFile,
      })),
      dataFiles: calendarFileResults,
      dataFilesCreated: calendarFileResults.filter((fileResult) => fileResult.created).length,
    };
  };

  const saveAllDriveStateFromBrowser = async () => {
    const accessTokenResult = await requestGoogleAccessTokenFromBackend();
    if (!accessTokenResult.ok) {
      return {
        ok: false,
        phase: "access_token",
        ...accessTokenResult,
      };
    }
    const accessToken = accessTokenResult.accessToken;

    const folderResult = await ensureDriveFolderFromBrowser(accessToken);
    if (!folderResult.ok) {
      return {
        ok: false,
        phase: "folder",
        ...folderResult,
      };
    }
    const folderId = folderResult.folderId || "";

    const configLookupResult = await findDriveFileByNameInFolderFromBrowser({
      accessToken,
      folderId,
      fileName: JUSTCALENDAR_CONFIG_FILE_NAME,
    });
    if (!configLookupResult.ok) {
      return {
        ok: false,
        phase: "config_lookup",
        ...configLookupResult,
      };
    }

    const existingConfigFileId = configLookupResult.found ? configLookupResult.fileId || "" : "";
    let existingAccountId = "";
    if (existingConfigFileId) {
      const readConfigResult = await readDriveJsonFileByIdFromBrowser({
        accessToken,
        fileId: existingConfigFileId,
      });
      if (readConfigResult.ok) {
        const rawAccountId =
          typeof readConfigResult.payload["current-account-id"] === "string"
            ? readConfigResult.payload["current-account-id"].trim()
            : "";
        if (isValidDriveAccountId(rawAccountId)) {
          existingAccountId = rawAccountId;
        }
      }
    }

    const bootstrapPayload = buildDriveBootstrapPayload();
    if (existingAccountId) {
      bootstrapPayload.currentAccountId = existingAccountId;
    }
    const persistedBundle = buildDrivePersistedFilesFromBootstrap(bootstrapPayload);

    const configWriteResult = existingConfigFileId
      ? await updateDriveJsonFileByIdFromBrowser({
          accessToken,
          fileId: existingConfigFileId,
          payload: persistedBundle.configPayload,
        })
      : await createDriveJsonFileInFolderFromBrowser({
          accessToken,
          folderId,
          fileName: JUSTCALENDAR_CONFIG_FILE_NAME,
          payload: persistedBundle.configPayload,
        });
    if (!configWriteResult.ok) {
      return {
        ok: false,
        phase: "config_write",
        ...configWriteResult,
      };
    }

    const calendarFileResults = [];
    for (const calendarDataFile of persistedBundle.calendarDataFiles) {
      const upsertResult = await upsertDriveJsonFileInFolderFromBrowser({
        accessToken,
        folderId,
        fileName: calendarDataFile.fileName,
        payload: calendarDataFile.payload,
      });
      if (!upsertResult.ok) {
        return {
          ok: false,
          phase: "calendar_data_upsert",
          details: {
            calendarId: calendarDataFile.calendarId,
            fileName: calendarDataFile.fileName,
            result: upsertResult,
          },
        };
      }
      calendarFileResults.push({
        calendarId: calendarDataFile.calendarId,
        fileName: calendarDataFile.fileName,
        fileId: upsertResult.fileId || "",
        created: Boolean(upsertResult.created),
      });
    }

    return {
      ok: true,
      created: !existingConfigFileId,
      configSource: existingConfigFileId ? "updated" : "created",
      folderId,
      fileId: existingConfigFileId || configWriteResult.fileId || "",
      fileName: JUSTCALENDAR_CONFIG_FILE_NAME,
      accountId: persistedBundle.accountId,
      account: persistedBundle.accountName,
      currentCalendarId: persistedBundle.currentCalendarId,
      selectedTheme: persistedBundle.selectedTheme,
      calendars: persistedBundle.calendars.map((calendar) => ({
        id: calendar.id,
        name: calendar.name,
        type: calendar.type,
        color: calendar.color,
        pinned: calendar.pinned,
        ...(calendar.type === CALENDAR_TYPE_SCORE && calendar.display
          ? { display: calendar.display }
          : {}),
        "data-file": calendar.dataFile,
      })),
      dataFiles: calendarFileResults,
      dataFilesSaved: calendarFileResults.length,
      dataFilesCreated: calendarFileResults.filter((fileResult) => fileResult.created).length,
    };
  };

  const extractCurrentAccountFromDriveConfig = (configPayload) => {
    if (!isObjectLike(configPayload)) {
      return null;
    }

    const accounts = isObjectLike(configPayload.accounts) ? configPayload.accounts : {};
    const requestedAccountId =
      typeof configPayload["current-account-id"] === "string"
        ? configPayload["current-account-id"].trim()
        : "";
    if (requestedAccountId && isObjectLike(accounts[requestedAccountId])) {
      return {
        accountId: requestedAccountId,
        accountRecord: accounts[requestedAccountId],
      };
    }

    for (const [rawAccountId, rawAccountRecord] of Object.entries(accounts)) {
      if (!isObjectLike(rawAccountRecord)) {
        continue;
      }
      const accountId = typeof rawAccountId === "string" ? rawAccountId.trim() : "";
      if (!accountId) {
        continue;
      }
      return {
        accountId,
        accountRecord: rawAccountRecord,
      };
    }

    return null;
  };

  const getLocalCurrentCalendarContext = () => {
    try {
      const rawCalendarsState = localStorage.getItem(CALENDARS_STORAGE_KEY);
      if (!rawCalendarsState) {
        return null;
      }
      const parsedCalendarsState = JSON.parse(rawCalendarsState);
      const calendars = Array.isArray(parsedCalendarsState?.calendars)
        ? parsedCalendarsState.calendars
        : [];
      if (calendars.length === 0) {
        return null;
      }

      const activeCalendarIdRaw =
        typeof parsedCalendarsState?.activeCalendarId === "string"
          ? parsedCalendarsState.activeCalendarId.trim()
          : "";
      const activeCalendar =
        calendars.find((calendar) => isObjectLike(calendar) && calendar.id === activeCalendarIdRaw) ||
        calendars.find((calendar) => isObjectLike(calendar)) ||
        null;
      if (!activeCalendar || typeof activeCalendar.id !== "string" || !activeCalendar.id.trim()) {
        return null;
      }

      return {
        localCalendarId: activeCalendar.id.trim(),
        calendarName: normalizeBootstrapCalendarName(activeCalendar.name, "Calendar"),
        calendarType: normalizeBootstrapCalendarType(activeCalendar.type),
      };
    } catch {
      return null;
    }
  };

  const saveCurrentCalendarStateFromBrowser = async () => {
    if (cachedDriveAccountId && isValidDriveAccountId(cachedDriveAccountId)) {
      persistDriveAccountId(cachedDriveAccountId);
    }

    const accessTokenResult = await requestGoogleAccessTokenFromBackend();
    if (!accessTokenResult.ok) {
      return {
        ok: false,
        phase: "access_token",
        ...accessTokenResult,
      };
    }
    const accessToken = accessTokenResult.accessToken;

    const folderResult = await ensureDriveFolderFromBrowser(accessToken);
    if (!folderResult.ok) {
      return {
        ok: false,
        phase: "folder",
        ...folderResult,
      };
    }
    const folderId = folderResult.folderId || "";
    const accountIdFromCache =
      cachedDriveAccountId && isValidDriveAccountId(cachedDriveAccountId) ? cachedDriveAccountId : "";

    const bootstrapPayload = buildDriveBootstrapPayload();
    const accountId =
      accountIdFromCache ||
      (typeof bootstrapPayload.currentAccountId === "string" ? bootstrapPayload.currentAccountId.trim() : "") ||
      getOrCreateDriveAccountId();
    const persistedBundle = buildDrivePersistedFilesFromBootstrap(bootstrapPayload);
    const currentCalendarId = persistedBundle.currentCalendarId;
    const currentCalendar = persistedBundle.calendars.find(
      (calendar) => calendar.id === currentCalendarId,
    );
    const currentCalendarDataFile = persistedBundle.calendarDataFiles.find(
      (calendarFile) => calendarFile.calendarId === currentCalendarId,
    );
    if (!currentCalendarId || !currentCalendar || !currentCalendarDataFile) {
      return {
        ok: false,
        phase: "current_calendar",
        status: 400,
        error: "missing_current_calendar_payload",
        details: {
          message: "Current calendar payload is missing.",
        },
      };
    }
    const currentCalendarName = normalizeBootstrapCalendarName(currentCalendar.name, "Calendar");
    const cachedCalendarConfig = isObjectLike(cachedDriveCalendarConfigById.get(currentCalendarId))
      ? cachedDriveCalendarConfigById.get(currentCalendarId)
      : {};
    const persistedConfigCalendarId =
      typeof cachedCalendarConfig.id === "string" && cachedCalendarConfig.id.trim()
        ? cachedCalendarConfig.id.trim()
        : currentCalendarId;
    const persistedConfigCalendarType = normalizeBootstrapCalendarType(
      cachedCalendarConfig.type || currentCalendar.type,
    );
    const dataFile =
      typeof cachedCalendarConfig.dataFile === "string"
        ? cachedCalendarConfig.dataFile.trim()
        : "";
    const fallbackFileName =
      typeof currentCalendar.dataFile === "string" && currentCalendar.dataFile.trim()
        ? currentCalendar.dataFile.trim()
        : `${accountId}_${persistedConfigCalendarId}.json`;
    const targetFileName = dataFile || fallbackFileName;
    const targetPayload = {
      version: 1,
      "account-id": accountId,
      "calendar-id": persistedConfigCalendarId,
      "calendar-type": persistedConfigCalendarType,
      data: currentCalendarDataFile.payload.data,
    };

    const cachedFileId = getCachedCalendarFileId({
      calendarId: persistedConfigCalendarId,
      fileName: targetFileName,
    });
    let savedFileId = "";
    let wasCreated = false;
    let writeSource = "";

    if (cachedFileId) {
      const cachedUpdateResult = await updateDriveJsonFileByIdFromBrowser({
        accessToken,
        fileId: cachedFileId,
        payload: targetPayload,
      });
      if (cachedUpdateResult.ok) {
        savedFileId = cachedUpdateResult.fileId || cachedFileId;
        writeSource = "cached_file_id";
      } else if (Number(cachedUpdateResult.status) === 404) {
        clearCachedCalendarFileId({
          calendarId: persistedConfigCalendarId,
          fileName: targetFileName,
          fileId: cachedFileId,
        });
      } else {
        return {
          ok: false,
          phase: "calendar_data_update_by_cached_file_id",
          ...cachedUpdateResult,
        };
      }
    }

    if (!savedFileId) {
      const lookupResult = await findDriveFileByNameInFolderFromBrowser({
        accessToken,
        folderId,
        fileName: targetFileName,
      });
      if (!lookupResult.ok) {
        return {
          ok: false,
          phase: "calendar_data_lookup",
          ...lookupResult,
        };
      }

      if (lookupResult.found && lookupResult.fileId) {
        const updateResult = await updateDriveJsonFileByIdFromBrowser({
          accessToken,
          fileId: lookupResult.fileId,
          payload: targetPayload,
        });
        if (!updateResult.ok) {
          return {
            ok: false,
            phase: "calendar_data_update",
            ...updateResult,
          };
        }
        savedFileId = updateResult.fileId || lookupResult.fileId;
        writeSource = "lookup_then_update";
      } else {
        const createResult = await createDriveJsonFileInFolderFromBrowser({
          accessToken,
          folderId,
          fileName: targetFileName,
          payload: targetPayload,
        });
        if (!createResult.ok) {
          return {
            ok: false,
            phase: "calendar_data_create",
            ...createResult,
          };
        }
        savedFileId = createResult.fileId || "";
        wasCreated = true;
        writeSource = "created";
      }
    }

    if (!savedFileId) {
      return {
        ok: false,
        phase: "calendar_data_missing_file_id_after_write",
        status: 502,
        error: "missing_file_id_after_write",
      };
    }

    rememberCachedCalendarConfigEntry({
      id: persistedConfigCalendarId,
      name: normalizeBootstrapCalendarName(
        cachedCalendarConfig.name || currentCalendar.name,
        currentCalendarName,
      ),
      type: persistedConfigCalendarType,
      color: normalizeCalendarColor(cachedCalendarConfig.color || currentCalendar.color, DEFAULT_CALENDAR_COLOR),
      pinned:
        typeof cachedCalendarConfig.pinned === "boolean"
          ? cachedCalendarConfig.pinned
          : Boolean(currentCalendar.pinned),
      ...(persistedConfigCalendarType === CALENDAR_TYPE_SCORE
        ? {
            display: normalizeScoreDisplay(cachedCalendarConfig.display || currentCalendar.display),
          }
        : {}),
      "data-file": targetFileName,
    });
    rememberCachedCalendarFileMeta({
      calendarId: persistedConfigCalendarId,
      fileName: targetFileName,
      fileId: savedFileId,
    });

    return {
      ok: true,
      folderId,
      fileId: savedFileId,
      fileName: targetFileName,
      created: wasCreated,
      writeSource,
      accountId,
      account: normalizeBootstrapCalendarName(bootstrapPayload.currentAccount, "default"),
      currentCalendarId: persistedConfigCalendarId,
      calendar: {
        id: persistedConfigCalendarId,
        name: normalizeBootstrapCalendarName(
          cachedCalendarConfig.name || currentCalendar.name,
          currentCalendarName,
        ),
        type: persistedConfigCalendarType,
        color: normalizeCalendarColor(
          cachedCalendarConfig.color || currentCalendar.color,
          DEFAULT_CALENDAR_COLOR,
        ),
        pinned:
          typeof cachedCalendarConfig.pinned === "boolean"
            ? cachedCalendarConfig.pinned
            : Boolean(currentCalendar.pinned),
        ...(persistedConfigCalendarType === CALENDAR_TYPE_SCORE
          ? {
              display: normalizeScoreDisplay(
                cachedCalendarConfig.display || currentCalendar.display,
              ),
            }
          : {}),
        "data-file": targetFileName,
      },
    };
  };

  const loadCurrentCalendarStateFromBrowser = async () => {
    const accessTokenResult = await requestGoogleAccessTokenFromBackend();
    if (!accessTokenResult.ok) {
      return {
        ok: false,
        phase: "access_token",
        ...accessTokenResult,
      };
    }
    const accessToken = accessTokenResult.accessToken;

    const folderResult = await ensureDriveFolderFromBrowser(accessToken);
    if (!folderResult.ok) {
      return {
        ok: false,
        phase: "folder",
        ...folderResult,
      };
    }
    const folderId = folderResult.folderId || "";

    const localContext = getLocalCurrentCalendarContext();
    if (!localContext) {
      return {
        ok: false,
        phase: "local_context",
        status: 400,
        error: "missing_local_current_calendar",
        details: {
          message: "Local current calendar could not be resolved.",
        },
      };
    }

    const bootstrapPayload = buildDriveBootstrapPayload();
    const persistedBundle = buildDrivePersistedFilesFromBootstrap(bootstrapPayload);
    const mappedCurrentCalendarId =
      persistedBundle.currentCalendarId ||
      persistedBundle.calendars.find((calendar) => calendar.name === localContext.calendarName)?.id ||
      "";
    let accountId =
      cachedDriveAccountId && isValidDriveAccountId(cachedDriveAccountId)
        ? cachedDriveAccountId
        : (typeof bootstrapPayload.currentAccountId === "string"
            ? bootstrapPayload.currentAccountId.trim()
            : "") || getOrCreateDriveAccountId();
    let accountName = normalizeBootstrapCalendarName(bootstrapPayload.currentAccount, "default");

    let persistedConfigCalendar = isObjectLike(cachedDriveCalendarConfigById.get(mappedCurrentCalendarId))
      ? cachedDriveCalendarConfigById.get(mappedCurrentCalendarId)
      : null;
    if (!persistedConfigCalendar) {
      persistedConfigCalendar =
        [...cachedDriveCalendarConfigById.values()].find((rawCalendar) => {
          if (!isObjectLike(rawCalendar)) {
            return false;
          }
          return (
            normalizeBootstrapCalendarName(rawCalendar.name, "") === localContext.calendarName
          );
        }) || null;
    }

    let loadedConfigFileId = "";
    let configSource = persistedConfigCalendar ? "cache" : "";
    if (!persistedConfigCalendar) {
      let configFileId = cachedDriveConfigFileId;
      if (!configFileId) {
        const cachedConfigByName = cachedDriveFileIdByName.get(JUSTCALENDAR_CONFIG_FILE_NAME);
        configFileId = typeof cachedConfigByName === "string" ? cachedConfigByName.trim() : "";
      }

      if (!configFileId) {
        const configLookupResult = await findDriveFileByNameInFolderFromBrowser({
          accessToken,
          folderId,
          fileName: JUSTCALENDAR_CONFIG_FILE_NAME,
        });
        if (!configLookupResult.ok) {
          return {
            ok: false,
            phase: "config_lookup",
            ...configLookupResult,
          };
        }
        if (!configLookupResult.found || !configLookupResult.fileId) {
          return {
            ok: false,
            phase: "config_missing",
            status: 404,
            error: "missing_config",
            details: {
              message: "justcalendar.json was not found in Google Drive.",
            },
          };
        }
        configFileId = configLookupResult.fileId.trim();
      }

      cachedDriveConfigFileId = configFileId;
      cachedDriveFileIdByName.set(JUSTCALENDAR_CONFIG_FILE_NAME, configFileId);
      loadedConfigFileId = configFileId;

      const readConfigResult = await readDriveJsonFileByIdFromBrowser({
        accessToken,
        fileId: configFileId,
      });
      if (!readConfigResult.ok) {
        return {
          ok: false,
          phase: "config_read",
          ...readConfigResult,
        };
      }

      const accountEntry = extractCurrentAccountFromDriveConfig(readConfigResult.payload);
      if (!accountEntry) {
        return {
          ok: false,
          phase: "config_parse",
          status: 422,
          error: "missing_account_in_config",
          details: {
            message: "justcalendar.json is missing account structure.",
          },
        };
      }
      accountId = accountEntry.accountId;
      accountName = normalizeBootstrapCalendarName(accountEntry.accountRecord?.name, accountName);
      persistDriveAccountId(accountId);
      cachedDriveAccountId = accountId;

      const configCalendars = Array.isArray(accountEntry.accountRecord?.calendars)
        ? accountEntry.accountRecord.calendars
        : [];
      configCalendars.forEach((rawCalendar) => {
        rememberCachedCalendarConfigEntry(rawCalendar);
      });

      persistedConfigCalendar =
        configCalendars.find((rawCalendar) => {
          if (!isObjectLike(rawCalendar)) {
            return false;
          }
          const configCalendarId =
            typeof rawCalendar.id === "string" ? rawCalendar.id.trim() : "";
          if (configCalendarId && mappedCurrentCalendarId && configCalendarId === mappedCurrentCalendarId) {
            return true;
          }
          const configCalendarName = normalizeBootstrapCalendarName(rawCalendar.name, "");
          return Boolean(configCalendarName) && configCalendarName === localContext.calendarName;
        }) || null;
      configSource = "drive_config";
    }

    if (!persistedConfigCalendar || !isObjectLike(persistedConfigCalendar)) {
      return {
        ok: false,
        phase: "config_calendar_lookup",
        status: 404,
        error: "current_calendar_not_found_in_config",
        details: {
          message: "Current calendar was not found in justcalendar.json.",
          currentCalendarId: mappedCurrentCalendarId,
          currentCalendarName: localContext.calendarName,
        },
      };
    }

    const persistedConfigCalendarId =
      typeof persistedConfigCalendar.id === "string" && persistedConfigCalendar.id.trim()
        ? persistedConfigCalendar.id.trim()
        : mappedCurrentCalendarId;
    const dataFileFromConfigObject =
      typeof persistedConfigCalendar.dataFile === "string"
        ? persistedConfigCalendar.dataFile.trim()
        : "";
    const dataFileFromRawConfig =
      typeof persistedConfigCalendar["data-file"] === "string"
        ? persistedConfigCalendar["data-file"].trim()
        : "";
    const dataFile = dataFileFromConfigObject || dataFileFromRawConfig;
    const targetFileName = dataFile || `${accountId}_${persistedConfigCalendarId}.json`;
    rememberCachedCalendarConfigEntry({
      id: persistedConfigCalendarId,
      name: normalizeBootstrapCalendarName(
        persistedConfigCalendar.name,
        localContext.calendarName,
      ),
      type: normalizeBootstrapCalendarType(
        persistedConfigCalendar.type || localContext.calendarType,
      ),
      color: normalizeCalendarColor(
        persistedConfigCalendar.color,
        DEFAULT_CALENDAR_COLOR,
      ),
      pinned: Boolean(persistedConfigCalendar.pinned),
      ...(normalizeBootstrapCalendarType(
        persistedConfigCalendar.type || localContext.calendarType,
      ) === CALENDAR_TYPE_SCORE
        ? { display: normalizeScoreDisplay(persistedConfigCalendar.display) }
        : {}),
      "data-file": targetFileName,
    });

    const cachedDataFileId = getCachedCalendarFileId({
      calendarId: persistedConfigCalendarId,
      fileName: targetFileName,
    });
    let remoteDayEntriesFlat = {};
    let loadedDataFileId = "";
    let dataReadSource = "";
    let shouldLookupCalendarDataFile = true;

    if (cachedDataFileId) {
      const cachedReadResult = await readDriveJsonFileByIdFromBrowser({
        accessToken,
        fileId: cachedDataFileId,
      });
      if (cachedReadResult.ok) {
        const rawDataContainer = isObjectLike(cachedReadResult.payload?.data)
          ? cachedReadResult.payload.data
          : {};
        remoteDayEntriesFlat = toFlatCalendarDayEntries(rawDataContainer);
        loadedDataFileId = cachedDataFileId;
        dataReadSource = "cached_file_id";
        shouldLookupCalendarDataFile = false;
      } else if (Number(cachedReadResult.status) === 404) {
        clearCachedCalendarFileId({
          calendarId: persistedConfigCalendarId,
          fileName: targetFileName,
          fileId: cachedDataFileId,
        });
      } else {
        return {
          ok: false,
          phase: "calendar_file_read_by_cached_file_id",
          ...cachedReadResult,
        };
      }
    }

    if (shouldLookupCalendarDataFile) {
      const dataFileLookupResult = await findDriveFileByNameInFolderFromBrowser({
        accessToken,
        folderId,
        fileName: targetFileName,
      });
      if (!dataFileLookupResult.ok) {
        return {
          ok: false,
          phase: "calendar_file_lookup",
          ...dataFileLookupResult,
        };
      }

      if (dataFileLookupResult.found && dataFileLookupResult.fileId) {
        const readDataFileResult = await readDriveJsonFileByIdFromBrowser({
          accessToken,
          fileId: dataFileLookupResult.fileId,
        });
        if (!readDataFileResult.ok) {
          return {
            ok: false,
            phase: "calendar_file_read",
            ...readDataFileResult,
          };
        }

        const rawDataContainer = isObjectLike(readDataFileResult.payload?.data)
          ? readDataFileResult.payload.data
          : {};
        remoteDayEntriesFlat = toFlatCalendarDayEntries(rawDataContainer);
        loadedDataFileId = dataFileLookupResult.fileId;
        dataReadSource = "lookup_then_read";
      }
    }

    if (loadedDataFileId || targetFileName) {
      rememberCachedCalendarFileMeta({
        calendarId: persistedConfigCalendarId,
        fileName: targetFileName,
        fileId: loadedDataFileId,
      });
    }

    const normalizedDayEntries = normalizeRemoteCalendarDayEntries(
      remoteDayEntriesFlat,
      localContext.calendarType,
    );
    const currentDayStatesByCalendarId = readBootstrapCalendarDayStates();
    currentDayStatesByCalendarId[localContext.localCalendarId] = normalizedDayEntries;
    localStorage.setItem(
      CALENDAR_DAY_STATES_STORAGE_KEY,
      JSON.stringify(currentDayStatesByCalendarId),
    );
    localStorage.removeItem(LEGACY_DAY_STATE_STORAGE_KEY);

    return {
      ok: true,
      folderId,
      configFileId: loadedConfigFileId || cachedDriveConfigFileId || "",
      fileId: loadedDataFileId || "",
      fileName: targetFileName,
      accountId,
      account: accountName,
      currentCalendarId: persistedConfigCalendarId,
      configSource,
      readSource: dataReadSource || "not_found",
      calendar: {
        id: persistedConfigCalendarId,
        name: normalizeBootstrapCalendarName(
          persistedConfigCalendar.name,
          localContext.calendarName,
        ),
        type: normalizeBootstrapCalendarType(
          persistedConfigCalendar.type || localContext.calendarType,
        ),
        color: normalizeCalendarColor(
          persistedConfigCalendar.color,
          DEFAULT_CALENDAR_COLOR,
        ),
        pinned: Boolean(persistedConfigCalendar.pinned),
        ...(normalizeBootstrapCalendarType(
          persistedConfigCalendar.type || localContext.calendarType,
        ) === CALENDAR_TYPE_SCORE
          ? { display: normalizeScoreDisplay(persistedConfigCalendar.display) }
          : {}),
        "data-file": targetFileName,
      },
      loadedDays: Object.keys(normalizedDayEntries).length,
    };
  };

  const mergeAutosaveModes = (leftMode = "calendar", rightMode = "calendar") => {
    return leftMode === "all" || rightMode === "all" ? "all" : "calendar";
  };

  const clearAutosaveDebounceTimerIfScheduled = () => {
    if (!autosaveDebounceTimer) {
      return;
    }
    window.clearTimeout(autosaveDebounceTimer);
    autosaveDebounceTimer = 0;
  };

  const clearAutosaveMaxWaitTimerIfScheduled = () => {
    if (!autosaveMaxWaitTimer) {
      return;
    }
    window.clearTimeout(autosaveMaxWaitTimer);
    autosaveMaxWaitTimer = 0;
  };

  const clearAutosaveRetryTimerIfScheduled = () => {
    if (!autosaveRetryTimer) {
      return;
    }
    window.clearTimeout(autosaveRetryTimer);
    autosaveRetryTimer = 0;
  };

  const clearAutosaveScheduledTimers = ({ includeRetry = false } = {}) => {
    clearAutosaveDebounceTimerIfScheduled();
    clearAutosaveMaxWaitTimerIfScheduled();
    if (includeRetry) {
      clearAutosaveRetryTimerIfScheduled();
    }
  };

  const resetAutosaveRetryState = () => {
    clearAutosaveRetryTimerIfScheduled();
    autosaveRetryAttempt = 0;
  };

  const resetAutosaveRuntimeState = () => {
    clearAutosaveScheduledTimers({ includeRetry: true });
    autosavePendingRun = false;
    autosavePendingMode = "calendar";
    autosaveRetryAttempt = 0;
    refreshObservedLocalActiveCalendarId();
  };

  const resolveAutosaveWriteMode = ({ requestedMode = "calendar", dirtySummary }) => {
    if (!dirtySummary?.hasDirtyCalendars) {
      return "none";
    }
    if (requestedMode === "all") {
      return "all";
    }

    if (dirtySummary.dirtyMetaCalendarIds.length > 0) {
      return "all";
    }
    if (dirtySummary.dirtyCalendarIds.length !== 1) {
      return "all";
    }
    if (!dirtySummary.currentCalendarDirty) {
      return "all";
    }
    if (dirtySummary.currentCalendarDayDirty && !dirtySummary.currentCalendarMetaDirty) {
      return "calendar";
    }
    return "all";
  };

  const runAutosaveSaveOperation = async ({
    requestedMode = "calendar",
    reason = "autosave",
  } = {}) => {
    if (!isGoogleDriveConfigured || !isGoogleDriveConnected || !hasBootstrappedDriveConfig) {
      return {
        ok: true,
        skipped: true,
        reason: "drive_not_ready",
      };
    }

    const dirtySummary = readDriveDirtyCalendarSummary();
    const writeMode = resolveAutosaveWriteMode({
      requestedMode,
      dirtySummary,
    });
    if (writeMode === "none") {
      return {
        ok: true,
        skipped: true,
        reason: "already_clean",
      };
    }

    if (writeMode === "all") {
      const saveResult = await saveAllDriveStateFromBrowser();
      if (!saveResult.ok) {
        return {
          ok: false,
          retryable: true,
          writeMode,
          reason,
          saveResult,
        };
      }
      syncDriveRuntimeCacheFromPayload(saveResult);
      markAllCalendarsAsDriveCleanFromLocalState();
      return {
        ok: true,
        skipped: false,
        writeMode,
        reason,
        saveResult,
      };
    }

    const saveResult = await saveCurrentCalendarStateFromBrowser();
    if (!saveResult.ok) {
      return {
        ok: false,
        retryable: true,
        writeMode: "calendar",
        reason,
        saveResult,
      };
    }
    syncDriveRuntimeCacheFromPayload(saveResult);
    markCalendarDayAsDriveCleanFromLocalState(
      saveResult?.currentCalendarId || saveResult?.calendar?.id || "",
    );
    return {
      ok: true,
      skipped: false,
      writeMode: "calendar",
      reason,
      saveResult,
    };
  };

  const scheduleAutosaveRetry = ({ requestedMode = "calendar", reason = "autosave", failure } = {}) => {
    if (!isGoogleDriveConfigured || !isGoogleDriveConnected || !hasBootstrappedDriveConfig) {
      return;
    }

    clearAutosaveRetryTimerIfScheduled();
    const retryStepIndex = Math.min(
      AUTOSAVE_RETRY_STEPS_MS.length - 1,
      Math.max(0, autosaveRetryAttempt),
    );
    const retryDelayMs = AUTOSAVE_RETRY_STEPS_MS[retryStepIndex];
    const nextAttempt = autosaveRetryAttempt + 1;
    autosaveRetryAttempt = nextAttempt;
    logGoogleAuthMessage("warn", `Autosave failed; retrying in ${retryDelayMs}ms (attempt ${nextAttempt}).`, {
      requestedMode,
      reason,
      failure,
    });

    autosaveRetryTimer = window.setTimeout(() => {
      autosaveRetryTimer = 0;
      void runAutosaveNow({
        requestedMode,
        reason: `${reason}_retry_${nextAttempt}`,
      });
    }, retryDelayMs);
  };

  const runAutosaveNow = async ({ requestedMode = "calendar", reason = "autosave" } = {}) => {
    const normalizedRequestedMode = requestedMode === "all" ? "all" : "calendar";
    autosavePendingMode = mergeAutosaveModes(autosavePendingMode, normalizedRequestedMode);

    if (autosaveInFlight) {
      autosavePendingRun = true;
      if (autosaveRunPromise) {
        return autosaveRunPromise;
      }
      return {
        ok: true,
        queued: true,
      };
    }

    clearAutosaveDebounceTimerIfScheduled();
    clearAutosaveMaxWaitTimerIfScheduled();
    clearAutosaveRetryTimerIfScheduled();

    autosaveInFlight = true;
    autosaveRunPromise = (async () => {
      let currentMode = autosavePendingMode;
      let currentReason = reason;
      autosavePendingMode = "calendar";

      while (true) {
        autosavePendingRun = false;
        const result = await runAutosaveSaveOperation({
          requestedMode: currentMode,
          reason: currentReason,
        });
        if (result.ok) {
          resetAutosaveRetryState();
        } else if (result.retryable) {
          const retryMode = mergeAutosaveModes(currentMode, autosavePendingMode);
          scheduleAutosaveRetry({
            requestedMode: retryMode,
            reason: currentReason,
            failure: result,
          });
        }

        if (!autosavePendingRun || !result.ok) {
          autosavePendingRun = false;
          autosavePendingMode = "calendar";
          return result;
        }

        currentMode = mergeAutosaveModes(currentMode, autosavePendingMode);
        autosavePendingMode = "calendar";
        currentReason = "autosave_pending_changes";
      }
    })();

    try {
      return await autosaveRunPromise;
    } finally {
      autosaveRunPromise = null;
      autosaveInFlight = false;
    }
  };

  const scheduleAutosave = ({
    requestedMode = "calendar",
    reason = "local_change",
    immediate = false,
  } = {}) => {
    if (!isGoogleDriveConfigured || !isGoogleDriveConnected || !hasBootstrappedDriveConfig) {
      return;
    }

    const normalizedRequestedMode = requestedMode === "all" ? "all" : "calendar";
    autosavePendingMode = mergeAutosaveModes(autosavePendingMode, normalizedRequestedMode);

    if (immediate) {
      clearAutosaveDebounceTimerIfScheduled();
      clearAutosaveMaxWaitTimerIfScheduled();
      void runAutosaveNow({
        requestedMode: autosavePendingMode,
        reason,
      });
      return;
    }

    if (autosaveInFlight) {
      autosavePendingRun = true;
      return;
    }

    clearAutosaveRetryTimerIfScheduled();
    clearAutosaveDebounceTimerIfScheduled();
    autosaveDebounceTimer = window.setTimeout(() => {
      autosaveDebounceTimer = 0;
      clearAutosaveMaxWaitTimerIfScheduled();
      void runAutosaveNow({
        requestedMode: autosavePendingMode,
        reason: `${reason}_debounce`,
      });
    }, AUTOSAVE_DEBOUNCE_MS);

    if (!autosaveMaxWaitTimer) {
      autosaveMaxWaitTimer = window.setTimeout(() => {
        autosaveMaxWaitTimer = 0;
        clearAutosaveDebounceTimerIfScheduled();
        void runAutosaveNow({
          requestedMode: autosavePendingMode,
          reason: `${reason}_max_wait`,
        });
      }, AUTOSAVE_MAX_WAIT_MS);
    }
  };

  const flushAutosave = async ({ requestedMode = "all", reason = "autosave_flush" } = {}) => {
    clearAutosaveDebounceTimerIfScheduled();
    clearAutosaveMaxWaitTimerIfScheduled();
    const normalizedRequestedMode = requestedMode === "all" ? "all" : "calendar";
    return runAutosaveNow({
      requestedMode: normalizedRequestedMode,
      reason,
    });
  };

  const syncLocalStateFromDrive = (bootstrapPayload) => {
    const remoteState =
      bootstrapPayload && typeof bootstrapPayload === "object" ? bootstrapPayload.remoteState : null;
    if (!remoteState || typeof remoteState !== "object") {
      return false;
    }

    const rawCalendars = Array.isArray(remoteState.calendars) ? remoteState.calendars : [];
    const remoteCalendars = rawCalendars
      .map((calendar, index) => normalizeRemoteCalendarEntry(calendar, index))
      .filter(Boolean);
    if (remoteCalendars.length === 0) {
      return false;
    }

    const remoteActiveCalendarId =
      typeof remoteState.activeCalendarId === "string" ? remoteState.activeCalendarId.trim() : "";
    const remoteSelectedTheme = normalizeThemeForDrive(remoteState.selectedTheme);
    const hasActiveCalendar = remoteCalendars.some(
      (calendar) => calendar.id === remoteActiveCalendarId,
    );
    const activeCalendarId = hasActiveCalendar ? remoteActiveCalendarId : remoteCalendars[0].id;

    const remoteDayStatesSource = isObjectLike(remoteState.dayStatesByCalendarId)
      ? remoteState.dayStatesByCalendarId
      : {};
    const nextDayStatesByCalendarId = {};
    remoteCalendars.forEach((calendar) => {
      nextDayStatesByCalendarId[calendar.id] = normalizeRemoteCalendarDayEntries(
        remoteDayStatesSource[calendar.id],
        calendar.type,
      );
    });

    const nextCalendarsState = {
      version: 1,
      activeCalendarId,
      calendars: remoteCalendars,
    };
    const currentCalendarsRaw = localStorage.getItem(CALENDARS_STORAGE_KEY);
    const currentDayStatesRaw = localStorage.getItem(CALENDAR_DAY_STATES_STORAGE_KEY);
    const currentTheme = readStoredThemeForDrive() || DEFAULT_THEME;
    const nextCalendarsCanonical = JSON.stringify(canonicalizeJson(nextCalendarsState));
    const nextDayStatesCanonical = JSON.stringify(canonicalizeJson(nextDayStatesByCalendarId));
    const themeChanged = Boolean(remoteSelectedTheme) && remoteSelectedTheme !== currentTheme;

    let currentCalendarsCanonical = "";
    let currentDayStatesCanonical = "";
    try {
      currentCalendarsCanonical = currentCalendarsRaw
        ? JSON.stringify(canonicalizeJson(JSON.parse(currentCalendarsRaw)))
        : "";
    } catch {
      currentCalendarsCanonical = "";
    }
    try {
      currentDayStatesCanonical = currentDayStatesRaw
        ? JSON.stringify(canonicalizeJson(JSON.parse(currentDayStatesRaw)))
        : "";
    } catch {
      currentDayStatesCanonical = "";
    }

    if (
      currentCalendarsCanonical === nextCalendarsCanonical &&
      currentDayStatesCanonical === nextDayStatesCanonical &&
      !themeChanged
    ) {
      return false;
    }

    localStorage.setItem(CALENDARS_STORAGE_KEY, JSON.stringify(nextCalendarsState));
    localStorage.setItem(
      CALENDAR_DAY_STATES_STORAGE_KEY,
      JSON.stringify(nextDayStatesByCalendarId),
    );
    if (themeChanged) {
      localStorage.setItem(THEME_STORAGE_KEY, remoteSelectedTheme);
    }
    localStorage.removeItem(LEGACY_DAY_STATE_STORAGE_KEY);
    return true;
  };

  const ensureDriveBootstrapConfigViaBackend = async () => {
    const response = await backendFetch("/api/auth/google/bootstrap-config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildDriveBootstrapPayload()),
    });
    const payload = await readResponsePayload(response);
    if (!response.ok || !payload?.ok) {
      logGoogleAuthMessage(
        "error",
        "Failed to ensure justcalendar.json bootstrap config in Google Drive.",
        {
          status: response.status,
          statusText: response.statusText,
          payload,
        },
      );
      return;
    }

    if (typeof payload?.fileId !== "string" || !payload.fileId.trim()) {
      logGoogleAuthMessage(
        "error",
        "Drive bootstrap returned success but no config file id; will retry later.",
        payload,
      );
      return;
    }

    syncDriveRuntimeCacheFromPayload(payload);

    const shouldImportRemoteState =
      payload?.configSource === "existing" && isObjectLike(payload?.remoteState);
    if (shouldImportRemoteState) {
      const importedFromDrive = syncLocalStateFromDrive(payload);
      markAllCalendarsAsDriveCleanFromLocalState();
      resetAutosaveRuntimeState();
      if (importedFromDrive) {
        hasBootstrappedDriveConfig = true;
        logGoogleAuthMessage(
          "info",
          "Loaded calendars and data from Google Drive and replaced local state.",
        );
        if (typeof onDriveStateImported === "function") {
          onDriveStateImported(payload);
        }
        setExpanded(false);
        return;
      }
    }

    hasBootstrappedDriveConfig = true;
    if (payload.created) {
      markAllCalendarsAsDriveCleanFromLocalState();
      resetAutosaveRuntimeState();
      logGoogleAuthMessage(
        "info",
        "Created first-time justcalendar.json config in Google Drive.",
        payload,
      );
    } else {
      logGoogleAuthMessage(
        "info",
        "justcalendar.json already exists in Google Drive.",
        payload,
      );
    }
  };

  const ensureDriveBootstrapConfig = async () => {
    if (!isGoogleDriveConfigured || !isGoogleDriveConnected || hasBootstrappedDriveConfig) {
      return;
    }
    if (bootstrapDriveConfigPromise) {
      await bootstrapDriveConfigPromise;
      return;
    }

    setDriveBusy(true);
    bootstrapDriveConfigPromise = (async () => {
      try {
        const directBootstrapResult = await ensureMissingDriveConfigFromBrowser();
        if (directBootstrapResult.ok && directBootstrapResult.handled) {
          syncDriveRuntimeCacheFromPayload(directBootstrapResult);
          hasBootstrappedDriveConfig = true;
          markAllCalendarsAsDriveCleanFromLocalState();
          resetAutosaveRuntimeState();
          logGoogleAuthMessage(
            "info",
            "Created first-time justcalendar.json and calendar data files directly from browser.",
            directBootstrapResult,
          );
          return;
        }

        if (directBootstrapResult.ok && directBootstrapResult.reason === "config_exists") {
          await ensureDriveBootstrapConfigViaBackend();
          return;
        }

        logGoogleAuthMessage(
          "warn",
          "Browser bootstrap for missing justcalendar.json failed; falling back to backend bootstrap.",
          directBootstrapResult,
        );
        await ensureDriveBootstrapConfigViaBackend();
      } catch (error) {
        logGoogleAuthMessage("error", "Drive config bootstrap request failed.", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();

    try {
      await bootstrapDriveConfigPromise;
    } finally {
      bootstrapDriveConfigPromise = null;
      setDriveBusy(false);
    }
  };

  const loadDriveStateViaBackend = async ({
    successLogMessage = "Loaded calendars and data from Google Drive and replaced local state.",
    matchLogMessage = "Load finished; local state already matched Drive.",
    missingLogMessage = "Load completed, but no remote state was found in Google Drive.",
    noRemoteStateLogMessage = missingLogMessage,
    failureLogMessage = "Load failed while reading state from Google Drive.",
  } = {}) => {
    if (loadDriveStatePromise) {
      return loadDriveStatePromise;
    }

    loadDriveStatePromise = (async () => {
      try {
        const response = await backendFetch("/api/auth/google/load-state", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });
        const payload = await readResponsePayload(response);
        if (!response.ok || !payload?.ok) {
          logGoogleAuthMessage("error", failureLogMessage, {
            status: response.status,
            statusText: response.statusText,
            payload,
          });
          return {
            ok: false,
            status: response.status,
            statusText: response.statusText,
            payload,
          };
        }

        syncDriveRuntimeCacheFromPayload(payload);

        if (payload?.missing) {
          hasBootstrappedDriveConfig = false;
          clearCalendarDriveDirtyBaselines();
          resetAutosaveRuntimeState();
          logGoogleAuthMessage("warn", missingLogMessage, payload);
          return {
            ok: true,
            missing: true,
            imported: false,
            payload,
          };
        }

        if (!isObjectLike(payload?.remoteState)) {
          hasBootstrappedDriveConfig = true;
          syncCalendarDirtyIndicator();
          logGoogleAuthMessage("warn", noRemoteStateLogMessage, payload);
          return {
            ok: true,
            missing: false,
            imported: false,
            payload,
          };
        }

        const importedFromDrive = syncLocalStateFromDrive(payload);
        hasBootstrappedDriveConfig = true;
        markAllCalendarsAsDriveCleanFromLocalState();
        resetAutosaveRuntimeState();
        if (importedFromDrive) {
          logGoogleAuthMessage("info", successLogMessage);
          if (typeof onDriveStateImported === "function") {
            onDriveStateImported(payload);
          }
        } else {
          logGoogleAuthMessage("info", matchLogMessage);
        }

        return {
          ok: true,
          missing: false,
          imported: importedFromDrive,
          payload,
        };
      } catch (error) {
        logGoogleAuthMessage("error", `${failureLogMessage} Request exception.`, {
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          ok: false,
          error: "request_exception",
          details: error instanceof Error ? error.message : String(error),
        };
      }
    })();

    try {
      return await loadDriveStatePromise;
    } finally {
      loadDriveStatePromise = null;
    }
  };

  const setGoogleDriveUiState = ({
    connected = false,
    configured = true,
    identityConnected = false,
    driveScopeGranted = false,
    drivePermissionId = "",
  } = {}) => {
    if (!googleDriveButton) return;

    isGoogleDriveConnected = connected;
    isGoogleDriveConfigured = configured;
    googleSub =
      (connected || identityConnected) && typeof drivePermissionId === "string"
        ? drivePermissionId
        : "";
    switcher.classList.toggle("is-drive-connected", connected);
    reorderGoogleDriveOption(connected);
    if (!connected) {
      hasBootstrappedDriveConfig = false;
      clearDriveRuntimeCache();
      clearCalendarDriveDirtyBaselines();
      resetAutosaveRuntimeState();
    }

    if (!configured) {
      setGoogleDriveText("Google Drive (Not Configured)");
      googleDriveButton.title =
        "Google OAuth env vars are missing on the server. Check .env.local.";
      googleDriveButton.setAttribute("aria-label", "Google Drive not configured");
      if (googleDriveButton instanceof HTMLButtonElement) {
        googleDriveButton.disabled = true;
      } else {
        googleDriveButton.classList.add("is-disabled");
        googleDriveButton.setAttribute("aria-disabled", "true");
        googleDriveButton.removeAttribute("href");
      }
      syncCalendarDirtyIndicator();
      return;
    }

    if (googleDriveButton instanceof HTMLButtonElement) {
      googleDriveButton.disabled = false;
    } else {
      googleDriveButton.classList.remove("is-disabled");
      googleDriveButton.removeAttribute("aria-disabled");
    }

    if (connected) {
      const connectedLabel = "Logout from Google Drive";
      setGoogleDriveText(connectedLabel);
      googleDriveButton.title = connectedLabel;
      googleDriveButton.setAttribute("aria-label", connectedLabel);
      if (googleDriveButton instanceof HTMLAnchorElement) {
        googleDriveButton.setAttribute("href", "#");
      }
      syncCalendarDirtyIndicator();
      return;
    }

    const needsDriveReconnect = identityConnected && !driveScopeGranted;
    const reconnectLabel = needsDriveReconnect
      ? "Login to Google Drive (Grant Drive Access)"
      : "Login to Google Drive";
    setGoogleDriveText("Login to Google Drive");
    googleDriveButton.title = reconnectLabel;
    googleDriveButton.setAttribute("aria-label", reconnectLabel);
    if (googleDriveButton instanceof HTMLAnchorElement) {
      googleDriveButton.setAttribute("href", "/api/auth/google/start");
    }
    syncCalendarDirtyIndicator();
  };

  const refreshGoogleDriveStatus = async () => {
    if (!googleDriveButton) return;
    try {
      const response = await backendFetch("/api/auth/google/status", {
        method: "GET",
        cache: "no-store",
      });
      const statusPayload = await readResponsePayload(response);
      if (!response.ok) {
        logGoogleAuthMessage("error", "Failed to fetch Google status endpoint.", {
          status: response.status,
          statusText: response.statusText,
          payload: statusPayload,
        });
        throw new Error(`status_request_failed_${response.status}`);
      }
      setGoogleDriveUiState({
        connected: Boolean(statusPayload?.connected),
        configured: Boolean(statusPayload?.configured ?? true),
        identityConnected: Boolean(statusPayload?.identityConnected),
        driveScopeGranted: Boolean(statusPayload?.driveScopeGranted),
        drivePermissionId:
          typeof statusPayload?.drivePermissionId === "string"
            ? statusPayload.drivePermissionId
            : "",
      });
      if (statusPayload?.connected) {
        if (!hasBootstrappedDriveConfig) {
          if (statusPayload?.driveConfigReady) {
            let shouldEnsureConfigAfterLoad = false;
            setDriveBusy(true);
            try {
              const loadResult = await loadDriveStateViaBackend({
                successLogMessage: "Loaded calendars and data from Google Drive during startup.",
                matchLogMessage: "Startup load finished; local state already matched Drive.",
                missingLogMessage:
                  "No justcalendar.json config found in Google Drive during startup; creating bootstrap config.",
                noRemoteStateLogMessage:
                  "Startup load completed, but no remote state was returned from Google Drive.",
                failureLogMessage: "Startup load failed while reading state from Google Drive.",
              });
              shouldEnsureConfigAfterLoad = Boolean(loadResult?.ok && loadResult?.missing);
            } finally {
              setDriveBusy(false);
            }
            if (shouldEnsureConfigAfterLoad) {
              await ensureDriveBootstrapConfig();
            }
          } else {
            await ensureDriveBootstrapConfig();
          }
        }
      }

      if (statusPayload?.identityConnected && statusPayload?.driveScopeGranted === false) {
        logGoogleAuthMessage(
          "warn",
          "Google Drive session exists, but Drive scope is missing. Click Login to grant drive.file.",
          statusPayload,
        );
      } else if (!statusPayload?.connected) {
        logGoogleAuthMessage("warn", "Google status indicates disconnected state.", {
          statusPayload,
          connectedCookie: hasGoogleConnectedCookie(),
        });
      } else if (!statusPayload?.driveFolderReady) {
        logGoogleAuthMessage(
          "warn",
          "Google account is connected but JustCalendar.ai folder is not ready yet.",
          statusPayload,
        );
      }
    } catch {
      logGoogleAuthMessage(
        "error",
        "Status refresh failed; applying fallback UI state from cookie if available.",
        {
          connectedCookie: hasGoogleConnectedCookie(),
        },
      );
      setGoogleDriveUiState({
        connected: false,
        configured: true,
        drivePermissionId: "",
      });
      if (hasGoogleConnectedCookie()) {
        setGoogleDriveUiState({
          connected: true,
          configured: true,
          drivePermissionId: "",
        });
      }
    }
  };

  const setExpanded = (isExpanded, { focusButton = false } = {}) => {
    switcher.classList.toggle("is-expanded", isExpanded);
    button.setAttribute("aria-expanded", String(isExpanded));
    button.setAttribute("aria-label", isExpanded ? "Close account menu" : "Open account menu");
    button.setAttribute("data-tooltip", isExpanded ? "Close Account Menu" : "Account Menu");

    if (!isExpanded && focusButton) {
      button.focus({ preventScroll: true });
    }
  };

  setExpanded(false);

  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener(LOCAL_CALENDAR_STORAGE_CHANGED_EVENT, (event) => {
      syncCalendarDirtyIndicator();

      const changedStorageKey =
        event instanceof CustomEvent && isObjectLike(event.detail) && typeof event.detail.key === "string"
          ? event.detail.key
          : "";
      const previousActiveCalendarId = lastObservedLocalActiveCalendarId;
      const nextActiveCalendarId = refreshObservedLocalActiveCalendarId();
      const hasActiveCalendarSwitch =
        Boolean(nextActiveCalendarId) &&
        Boolean(previousActiveCalendarId) &&
        nextActiveCalendarId !== previousActiveCalendarId;

      if (!isGoogleDriveConfigured || !isGoogleDriveConnected || !hasBootstrappedDriveConfig) {
        return;
      }

      if (hasActiveCalendarSwitch) {
        scheduleAutosave({
          requestedMode: "all",
          reason: "active_calendar_switched",
          immediate: true,
        });
        return;
      }

      scheduleAutosave({
        requestedMode: changedStorageKey === CALENDARS_STORAGE_KEY ? "all" : "calendar",
        reason: changedStorageKey ? `local_change_${changedStorageKey}` : "local_change",
      });
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "hidden") {
        return;
      }
      void flushAutosave({
        requestedMode: "all",
        reason: "lifecycle_visibility_hidden",
      });
    });

    window.addEventListener("pagehide", () => {
      void flushAutosave({
        requestedMode: "all",
        reason: "lifecycle_pagehide",
      });
    });
  }

  button.addEventListener("click", () => {
    const shouldExpand = !switcher.classList.contains("is-expanded");
    setExpanded(shouldExpand);
    if (shouldExpand) {
      void refreshGoogleDriveStatus();
    }
  });

  optionButtons.forEach((optionButton) => {
    optionButton.addEventListener("click", async (event) => {
      const actionType = optionButton.dataset.profileAction || "";
      if (actionType === "google-drive") {
        if (!isGoogleDriveConfigured) {
          event.preventDefault();
          setExpanded(false);
          return;
        }

        if (!isGoogleDriveConnected) {
          logGoogleAuthMessage("info", "Starting Google OAuth redirect.");
          setExpanded(false);
          if (optionButton instanceof HTMLButtonElement) {
            window.location.assign("/api/auth/google/start");
          }
          // Anchor fallback keeps native navigation when JS logic does not run.
          return;
        }

        event.preventDefault();
        const flushBeforeDisconnect = await flushAutosave({
          requestedMode: "all",
          reason: "before_disconnect",
        });
        if (!flushBeforeDisconnect?.ok) {
          logGoogleAuthMessage(
            "warn",
            "Autosave flush failed before disconnect; proceeding with Google Drive logout.",
            flushBeforeDisconnect,
          );
        }
        if (optionButton instanceof HTMLButtonElement) {
          optionButton.disabled = true;
        } else {
          optionButton.classList.add("is-disabled");
          optionButton.setAttribute("aria-disabled", "true");
        }
        try {
          const response = await backendFetch("/api/auth/google/disconnect", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
          });
          if (!response.ok) {
            const payload = await readResponsePayload(response);
            logGoogleAuthMessage("error", "Google disconnect endpoint returned an error.", {
              status: response.status,
              statusText: response.statusText,
              payload,
            });
          }
        } catch (error) {
          logGoogleAuthMessage("error", "Google disconnect request failed.", {
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          if (optionButton instanceof HTMLButtonElement) {
            optionButton.disabled = false;
          } else {
            optionButton.classList.remove("is-disabled");
            optionButton.removeAttribute("aria-disabled");
          }
          await refreshGoogleDriveStatus();
          setExpanded(false);
        }
        return;
      }

      if (actionType === "save") {
        event.preventDefault();
        await refreshGoogleDriveStatus();

        if (!isGoogleDriveConfigured) {
          logGoogleAuthMessage(
            "warn",
            "Save All cannot run because Google Drive OAuth is not configured.",
          );
          setExpanded(false);
          return;
        }

        if (!isGoogleDriveConnected) {
          logGoogleAuthMessage(
            "warn",
            "Save All cannot run because Google Drive is not connected.",
          );
          setExpanded(false);
          return;
        }

        clearAutosaveScheduledTimers({ includeRetry: true });
        if (optionButton instanceof HTMLButtonElement) {
          optionButton.disabled = true;
        }
        setDriveBusy(true);
        const saveStartedAt =
          typeof performance !== "undefined" && performance && typeof performance.now === "function"
            ? performance.now()
            : Date.now();
        let saveOutcome = "failed";

        try {
          const saveResult = await saveAllDriveStateFromBrowser();
          if (!saveResult.ok) {
            logGoogleAuthMessage(
              "error",
              "Save All failed while writing state to Google Drive from browser.",
              saveResult,
            );
          } else {
            syncDriveRuntimeCacheFromPayload(saveResult);
            markAllCalendarsAsDriveCleanFromLocalState();
            resetAutosaveRuntimeState();
            saveOutcome = "success";
            logGoogleAuthMessage(
              "info",
              "Saved full app state to Google Drive from browser.",
              saveResult,
            );
          }
        } catch (error) {
          logGoogleAuthMessage("error", "Save All request failed.", {
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          const saveFinishedAt =
            typeof performance !== "undefined" && performance && typeof performance.now === "function"
              ? performance.now()
              : Date.now();
          const elapsedMs = Math.max(0, Math.round(saveFinishedAt - saveStartedAt));
          logGoogleAuthMessage(
            "info",
            `Save All finished in ${elapsedMs}ms (${saveOutcome}).`,
          );
          if (optionButton instanceof HTMLButtonElement) {
            optionButton.disabled = false;
          }
          setDriveBusy(false);
          await refreshGoogleDriveStatus();
        }
        setExpanded(false);
        return;
      }

      if (actionType === "save-calendar") {
        event.preventDefault();
        await refreshGoogleDriveStatus();

        if (!isGoogleDriveConfigured) {
          logGoogleAuthMessage(
            "warn",
            "Save Calendar cannot run because Google Drive OAuth is not configured.",
          );
          setExpanded(false);
          return;
        }

        if (!isGoogleDriveConnected) {
          logGoogleAuthMessage(
            "warn",
            "Save Calendar cannot run because Google Drive is not connected.",
          );
          setExpanded(false);
          return;
        }

        clearAutosaveScheduledTimers({ includeRetry: true });
        if (optionButton instanceof HTMLButtonElement) {
          optionButton.disabled = true;
        }
        setDriveBusy(true);
        const saveStartedAt =
          typeof performance !== "undefined" && performance && typeof performance.now === "function"
            ? performance.now()
            : Date.now();
        let saveOutcome = "failed";

        try {
          const saveResult = await saveCurrentCalendarStateFromBrowser();
          if (!saveResult.ok) {
            logGoogleAuthMessage(
              "error",
              "Save Calendar failed while writing to Google Drive from browser.",
              saveResult,
            );
          } else {
            syncDriveRuntimeCacheFromPayload(saveResult);
            markCalendarDayAsDriveCleanFromLocalState(
              saveResult?.currentCalendarId || saveResult?.calendar?.id || "",
            );
            resetAutosaveRetryState();
            saveOutcome = "success";
            logGoogleAuthMessage(
              "info",
              "Saved current calendar data to Google Drive from browser.",
              saveResult,
            );
          }
        } catch (error) {
          logGoogleAuthMessage("error", "Save Calendar request failed.", {
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          const saveFinishedAt =
            typeof performance !== "undefined" && performance && typeof performance.now === "function"
              ? performance.now()
              : Date.now();
          const elapsedMs = Math.max(0, Math.round(saveFinishedAt - saveStartedAt));
          logGoogleAuthMessage(
            "info",
            `Save Calendar finished in ${elapsedMs}ms (${saveOutcome}).`,
          );
          if (optionButton instanceof HTMLButtonElement) {
            optionButton.disabled = false;
          }
          setDriveBusy(false);
          await refreshGoogleDriveStatus();
        }
        setExpanded(false);
        return;
      }

      if (actionType === "load-all" || actionType === "load") {
        event.preventDefault();
        await refreshGoogleDriveStatus();

        if (!isGoogleDriveConfigured) {
          logGoogleAuthMessage(
            "warn",
            "Load cannot run because Google Drive OAuth is not configured.",
          );
          setExpanded(false);
          return;
        }

        if (!isGoogleDriveConnected) {
          logGoogleAuthMessage(
            "warn",
            "Load cannot run because Google Drive is not connected.",
          );
          setExpanded(false);
          return;
        }

        const flushBeforeLoadAll = await flushAutosave({
          requestedMode: "all",
          reason: "before_load_all",
        });
        if (!flushBeforeLoadAll?.ok) {
          logGoogleAuthMessage(
            "warn",
            "Load aborted because local autosave flush failed before replacing local state from Drive.",
            flushBeforeLoadAll,
          );
          setExpanded(false);
          return;
        }

        if (optionButton instanceof HTMLButtonElement) {
          optionButton.disabled = true;
        }
        setDriveBusy(true);

        try {
          await loadDriveStateViaBackend({
            successLogMessage: "Loaded calendars and data from Google Drive and replaced local state.",
            matchLogMessage: "Load finished; local state already matched Drive.",
            missingLogMessage: "Load completed, but no remote state was found in Google Drive.",
            failureLogMessage: "Load failed while reading state from Google Drive.",
          });
        } finally {
          if (optionButton instanceof HTMLButtonElement) {
            optionButton.disabled = false;
          }
          setDriveBusy(false);
          await refreshGoogleDriveStatus();
        }

        setExpanded(false);
        return;
      }

      if (actionType === "load-calendar") {
        event.preventDefault();
        await refreshGoogleDriveStatus();

        if (!isGoogleDriveConfigured) {
          logGoogleAuthMessage(
            "warn",
            "Load Calendar cannot run because Google Drive OAuth is not configured.",
          );
          setExpanded(false);
          return;
        }

        if (!isGoogleDriveConnected) {
          logGoogleAuthMessage(
            "warn",
            "Load Calendar cannot run because Google Drive is not connected.",
          );
          setExpanded(false);
          return;
        }

        const flushBeforeLoadCalendar = await flushAutosave({
          requestedMode: "all",
          reason: "before_load_calendar",
        });
        if (!flushBeforeLoadCalendar?.ok) {
          logGoogleAuthMessage(
            "warn",
            "Load Calendar aborted because local autosave flush failed before reading from Drive.",
            flushBeforeLoadCalendar,
          );
          setExpanded(false);
          return;
        }

        if (optionButton instanceof HTMLButtonElement) {
          optionButton.disabled = true;
        }
        setDriveBusy(true);
        const loadStartedAt =
          typeof performance !== "undefined" && performance && typeof performance.now === "function"
            ? performance.now()
            : Date.now();
        let loadOutcome = "failed";

        try {
          const loadResult = await loadCurrentCalendarStateFromBrowser();
          if (!loadResult.ok) {
            logGoogleAuthMessage(
              "error",
              "Load Calendar failed while reading current calendar from Google Drive.",
              loadResult,
            );
          } else {
            syncDriveRuntimeCacheFromPayload(loadResult);
            markCalendarDayAsDriveCleanFromLocalState(
              loadResult?.currentCalendarId || loadResult?.calendar?.id || "",
            );
            resetAutosaveRetryState();
            refreshObservedLocalActiveCalendarId();
            logGoogleAuthMessage(
              "info",
              "Loaded current calendar data from Google Drive.",
              loadResult,
            );
            loadOutcome = "success";
            if (typeof onDriveStateImported === "function") {
              onDriveStateImported();
            }
          }
        } catch (error) {
          logGoogleAuthMessage("error", "Load Calendar request failed.", {
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          const loadFinishedAt =
            typeof performance !== "undefined" && performance && typeof performance.now === "function"
              ? performance.now()
              : Date.now();
          const elapsedMs = Math.max(0, Math.round(loadFinishedAt - loadStartedAt));
          logGoogleAuthMessage(
            "info",
            `Load Calendar finished in ${elapsedMs}ms (${loadOutcome}).`,
          );
          if (optionButton instanceof HTMLButtonElement) {
            optionButton.disabled = false;
          }
          setDriveBusy(false);
          await refreshGoogleDriveStatus();
        }
        setExpanded(false);
        return;
      }

      if (actionType === "clear-all") {
        event.preventDefault();
        let isConnectedForClearAll = isGoogleDriveConnected;
        try {
          const statusResponse = await backendFetch("/api/auth/google/status", {
            method: "GET",
            cache: "no-store",
          });
          const statusPayload = await readResponsePayload(statusResponse);
          if (statusResponse.ok) {
            isConnectedForClearAll = Boolean(statusPayload?.connected);
            setGoogleDriveUiState({
              connected: isConnectedForClearAll,
              configured: Boolean(statusPayload?.configured ?? true),
              identityConnected: Boolean(statusPayload?.identityConnected),
              driveScopeGranted: Boolean(statusPayload?.driveScopeGranted),
              drivePermissionId:
                typeof statusPayload?.drivePermissionId === "string"
                  ? statusPayload.drivePermissionId
                  : "",
            });
          } else {
            logGoogleAuthMessage(
              "warn",
              "Clear All could not confirm Google Drive status; using current UI state.",
              {
                status: statusResponse.status,
                statusText: statusResponse.statusText,
                payload: statusPayload,
              },
            );
          }
        } catch (error) {
          logGoogleAuthMessage(
            "warn",
            "Clear All status check failed; using current UI connection state.",
            {
              error: error instanceof Error ? error.message : String(error),
            },
          );
        }

        if (isConnectedForClearAll) {
          logGoogleAuthMessage(
            "warn",
            "Clear All is blocked while Google Drive is connected. Logout from Google Drive first.",
          );
          setExpanded(false);
          return;
        }

        if (optionButton instanceof HTMLButtonElement) {
          optionButton.disabled = true;
        }

        try {
          localStorage.setItem(
            CALENDARS_STORAGE_KEY,
            JSON.stringify({
              version: 1,
              activeCalendarId: CLEAR_ALL_DEFAULT_CALENDAR_ID,
              calendars: [
                {
                  id: CLEAR_ALL_DEFAULT_CALENDAR_ID,
                  name: CLEAR_ALL_DEFAULT_CALENDAR_NAME,
                  type: CALENDAR_TYPE_CHECK,
                  color: DEFAULT_CALENDAR_COLOR,
                  pinned: false,
                },
              ],
            }),
          );
          localStorage.setItem(CALENDAR_DAY_STATES_STORAGE_KEY, JSON.stringify({}));
          localStorage.removeItem(LEGACY_DAY_STATE_STORAGE_KEY);
          clearCalendarDriveDirtyBaselines();
          resetAutosaveRuntimeState();
          logGoogleAuthMessage(
            "info",
            "Cleared local calendar data. Only Default Calendar (Check) remains.",
          );
          setExpanded(false);
          window.location.reload();
          return;
        } catch (error) {
          logGoogleAuthMessage("error", "Clear All failed while resetting local storage.", {
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          if (optionButton instanceof HTMLButtonElement) {
            optionButton.disabled = false;
          }
        }

        setExpanded(false);
        return;
      }

      setExpanded(false);
    });
  });

  document.addEventListener("click", (event) => {
    if (!switcher.classList.contains("is-expanded")) {
      return;
    }
    const clickTarget = event.target;
    if (!(clickTarget instanceof Node)) {
      return;
    }
    if (switcher.contains(clickTarget)) {
      return;
    }
    setExpanded(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !switcher.classList.contains("is-expanded")) {
      return;
    }
    event.preventDefault();
    setExpanded(false, { focusButton: true });
  });

  if (hasGoogleConnectedCookie()) {
    setGoogleDriveUiState({
      connected: true,
      configured: true,
      drivePermissionId: "",
    });
  }

  refreshGoogleDriveStatus();
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

const applyDriveImportedStateInPlace = () => {
  themeToggleApi?.syncFromStorage?.();
  calendarApi?.refreshFromStorage?.();

  const nextActiveCalendar =
    calendarSwitcherApi?.syncFromStorage?.({ notify: false }) || getStoredActiveCalendar();
  if (nextActiveCalendar) {
    activeCalendar = nextActiveCalendar;
    calendarApi?.setActiveCalendar(nextActiveCalendar);
  }

  if (currentViewMode === VIEW_MODE_YEAR) {
    renderYearView(activeCalendar, activeYearViewYear);
  }
};

if (themeToggleButton) {
  themeToggleApi = setupThemeToggle(themeToggleButton);
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
  calendarSwitcherApi = setupCalendarSwitcher(headerCalendarsButton, {
    onActiveCalendarChange: (calendar) => {
      activeCalendar = calendar;
      calendarApi?.setActiveCalendar(calendar);
      if (currentViewMode === VIEW_MODE_YEAR) {
        renderYearView(calendar, activeYearViewYear);
      }
    },
  });
}

if (profileSwitcher && headerProfileButton && profileOptions) {
  setupProfileSwitcher({
    switcher: profileSwitcher,
    button: headerProfileButton,
    options: profileOptions,
    onDriveStateImported: applyDriveImportedStateInPlace,
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
