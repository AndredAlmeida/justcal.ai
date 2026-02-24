const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

const INITIAL_MONTH_SPAN = 6;
const LOAD_BATCH = 4;
const TOP_THRESHOLD = 450;
const BOTTOM_THRESHOLD = 650;
const FAST_SCROLL_DURATION_MS = 380;
const SELECTED_ROW_HEIGHT_MULTIPLIER = 1.5;
const MIN_OTHER_ROW_HEIGHT_RATIO = 0.06;
const MIN_OTHER_ROW_HEIGHT_RATIO_SHORT_MONTH = 0.01;
const DAY_DESELECT_FADE_MS = 1080;
const ZOOM_OUT_DURATION_MS = 480;
const ZOOM_OUT_RESET_FALLBACK_MS = ZOOM_OUT_DURATION_MS + 120;
const TABLE_UNEXPAND_DURATION_MS = 420;
const TABLE_UNEXPAND_RESET_FALLBACK_MS = TABLE_UNEXPAND_DURATION_MS + 80;

export const MIN_SELECTION_EXPANSION = 1;
export const MAX_SELECTION_EXPANSION = 3;
export const DEFAULT_SELECTION_EXPANSION = 2.6;
export const MIN_CELL_EXPANSION_X = MIN_SELECTION_EXPANSION;
export const MAX_CELL_EXPANSION_X = MAX_SELECTION_EXPANSION;
export const DEFAULT_CELL_EXPANSION_X = DEFAULT_SELECTION_EXPANSION;
export const MIN_CELL_EXPANSION_Y = MIN_SELECTION_EXPANSION;
export const MAX_CELL_EXPANSION_Y = MAX_SELECTION_EXPANSION;
export const DEFAULT_CELL_EXPANSION_Y = DEFAULT_SELECTION_EXPANSION;
export const MIN_CELL_EXPANSION = MIN_CELL_EXPANSION_X;
export const MAX_CELL_EXPANSION = MAX_CELL_EXPANSION_X;
export const DEFAULT_CELL_EXPANSION = DEFAULT_CELL_EXPANSION_X;
export const MIN_CAMERA_ZOOM = 1;
export const MAX_CAMERA_ZOOM = 3;
export const DEFAULT_CAMERA_ZOOM = 3;

const CALENDAR_DAY_STATES_STORAGE_KEY = "justcal-calendar-day-states";
const LEGACY_DAY_STATE_STORAGE_KEY = "justcal-day-states";
const DEFAULT_CALENDAR_ID = "energy-tracker";
const DEFAULT_CALENDAR_COLOR = "blue";
const CALENDAR_TYPE_SIGNAL = "signal-3";
const CALENDAR_TYPE_SCORE = "score";
const CALENDAR_TYPE_CHECK = "check";
const CALENDAR_TYPE_NOTES = "notes";
const DEFAULT_CALENDAR_TYPE = CALENDAR_TYPE_SIGNAL;
const DAY_STATES = ["x", "red", "yellow", "green"];
const DEFAULT_DAY_STATE = "x";
const SCORE_UNASSIGNED = -1;
const SCORE_MIN = SCORE_UNASSIGNED;
const SCORE_MAX = 10;
const SCORE_DISPLAY_NUMBER = "number";
const SCORE_DISPLAY_HEATMAP = "heatmap";
const SCORE_DISPLAY_NUMBER_HEATMAP = "number-heatmap";
const DEFAULT_SCORE_DISPLAY = SCORE_DISPLAY_NUMBER;
const CHECK_MARKED = true;
const NOTES_HOVER_PREVIEW_DELAY_MS = 1000;
const NOTES_HOVER_PREVIEW_GAP_PX = 8;
const NOTES_HOVER_PREVIEW_VIEWPORT_PADDING_PX = 8;
const MOBILE_LAYOUT_QUERY = "(max-width: 640px)";
const CALENDAR_COLOR_HEX_BY_KEY = Object.freeze({
  green: "#22c55e",
  red: "#ef4444",
  orange: "#f97316",
  yellow: "#facc15",
  cyan: "#22d3ee",
  blue: "#3b82f6",
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function shiftMonth(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function monthKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function formatDayKey(year, monthIndex, dayNumber) {
  const month = String(monthIndex + 1).padStart(2, "0");
  const day = String(dayNumber).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDayState(value) {
  if (typeof value !== "string") {
    return DEFAULT_DAY_STATE;
  }
  const normalizedValue = value.trim().toLowerCase();
  return DAY_STATES.includes(normalizedValue) ? normalizedValue : DEFAULT_DAY_STATE;
}

function normalizeCalendarType(calendarType) {
  if (typeof calendarType !== "string") {
    return DEFAULT_CALENDAR_TYPE;
  }

  const normalizedCalendarType = calendarType.trim().toLowerCase();
  if (normalizedCalendarType === CALENDAR_TYPE_SCORE) {
    return CALENDAR_TYPE_SCORE;
  }
  if (normalizedCalendarType === CALENDAR_TYPE_CHECK) {
    return CALENDAR_TYPE_CHECK;
  }
  if (normalizedCalendarType === CALENDAR_TYPE_NOTES) {
    return CALENDAR_TYPE_NOTES;
  }
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

function normalizeScoreDisplay(scoreDisplay) {
  if (typeof scoreDisplay !== "string") {
    return DEFAULT_SCORE_DISPLAY;
  }

  const normalizedScoreDisplay = scoreDisplay.trim().toLowerCase();
  if (normalizedScoreDisplay === SCORE_DISPLAY_HEATMAP) {
    return SCORE_DISPLAY_HEATMAP;
  }
  if (normalizedScoreDisplay === SCORE_DISPLAY_NUMBER_HEATMAP) {
    return SCORE_DISPLAY_NUMBER_HEATMAP;
  }
  return SCORE_DISPLAY_NUMBER;
}

function normalizeScoreValue(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return SCORE_UNASSIGNED;
  }

  const roundedScore = Math.round(numericValue);
  if (roundedScore < SCORE_MIN || roundedScore > SCORE_MAX) {
    return SCORE_UNASSIGNED;
  }
  return roundedScore;
}

function normalizeCheckValue(value) {
  if (value === true) {
    return true;
  }
  if (typeof value === "number") {
    return value === 1;
  }
  if (typeof value !== "string") {
    return false;
  }

  const normalizedValue = value.trim().toLowerCase();
  return (
    normalizedValue === "checked" ||
    normalizedValue === "true" ||
    normalizedValue === "1" ||
    normalizedValue === "yes" ||
    normalizedValue === "on"
  );
}

function normalizeDayNoteValue(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value;
}

function hasDayNoteValue(noteValue) {
  return normalizeDayNoteValue(noteValue).trim().length > 0;
}

function normalizeDayNotePreview(noteValue) {
  const normalizedNote = normalizeDayNoteValue(noteValue);
  if (!normalizedNote) {
    return "";
  }

  return normalizedNote
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .trim();
}

function normalizeCalendarDayEntries(rawDayStates) {
  if (!rawDayStates || typeof rawDayStates !== "object") {
    return {};
  }

  const normalizedDayEntries = {};
  Object.entries(rawDayStates).forEach(([dayKeyValue, rawDayValue]) => {
    if (typeof dayKeyValue !== "string" || dayKeyValue.length === 0) {
      return;
    }

    if (typeof rawDayValue === "string") {
      if (rawDayValue.trim().length > 0) {
        normalizedDayEntries[dayKeyValue] = rawDayValue;
      }
      return;
    }

    if (typeof rawDayValue === "number") {
      if (Number.isFinite(rawDayValue)) {
        normalizedDayEntries[dayKeyValue] = rawDayValue;
      }
      return;
    }

    if (rawDayValue === CHECK_MARKED) {
      normalizedDayEntries[dayKeyValue] = CHECK_MARKED;
    }
  });
  return normalizedDayEntries;
}

function loadCalendarDayStates() {
  try {
    const rawValue = localStorage.getItem(CALENDAR_DAY_STATES_STORAGE_KEY);
    if (rawValue !== null) {
      const parsed = JSON.parse(rawValue);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }

      const normalizedByCalendar = {};
      Object.entries(parsed).forEach(([calendarId, calendarDayStates]) => {
        if (typeof calendarId !== "string" || calendarId.length === 0) return;
        normalizedByCalendar[calendarId] = normalizeCalendarDayEntries(calendarDayStates);
      });
      return normalizedByCalendar;
    }
  } catch {
    return {};
  }

  // Migrate single-calendar storage from old releases.
  try {
    const legacyRawValue = localStorage.getItem(LEGACY_DAY_STATE_STORAGE_KEY);
    if (legacyRawValue === null) {
      return {};
    }

    const legacyParsed = JSON.parse(legacyRawValue);
    if (!legacyParsed || typeof legacyParsed !== "object" || Array.isArray(legacyParsed)) {
      return {};
    }

    return {
      [DEFAULT_CALENDAR_ID]: normalizeCalendarDayEntries(legacyParsed),
    };
  } catch {
    return {};
  }
}

function saveCalendarDayStates(dayStatesByCalendarId) {
  try {
    localStorage.setItem(
      CALENDAR_DAY_STATES_STORAGE_KEY,
      JSON.stringify(dayStatesByCalendarId),
    );
  } catch {
    // Ignore storage errors; buttons still work in-memory.
  }
}

function createDayStateButton(state, isActive) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `day-state-btn day-state-${state}`;
  button.dataset.state = state;
  button.classList.toggle("is-active", isActive);
  button.setAttribute("aria-pressed", String(isActive));

  if (state === "x") {
    button.setAttribute("aria-label", "Mark day as X");
    button.title = "X";
  } else {
    button.setAttribute("aria-label", `Mark day as ${state}`);
    button.title = state[0].toUpperCase() + state.slice(1);
  }

  return button;
}

function formatScoreLabel(scoreValue) {
  const normalizedScore = normalizeScoreValue(scoreValue);
  if (normalizedScore === SCORE_UNASSIGNED) {
    return "-1 (Unassigned)";
  }
  return String(normalizedScore);
}

function getScoreProgressPercent(scoreValue) {
  const normalizedScore = normalizeScoreValue(scoreValue);
  const progressRatio = (normalizedScore - SCORE_MIN) / (SCORE_MAX - SCORE_MIN);
  const progressPercent = clamp(progressRatio * 100, 0, 100);
  return `${progressPercent}%`;
}

function getScoreHeatIntensityPercent(scoreValue) {
  const normalizedScore = normalizeScoreValue(scoreValue);
  if (normalizedScore === SCORE_UNASSIGNED) {
    return "0%";
  }

  const normalizedRange = clamp(normalizedScore / SCORE_MAX, 0, 1);
  const intensityPercent = Math.round(12 + normalizedRange * 58);
  return `${intensityPercent}%`;
}

function syncDayScoreControls(cell, scoreValue) {
  const normalizedScore = normalizeScoreValue(scoreValue);

  const scoreSlider = cell.querySelector(".day-score-slider");
  if (scoreSlider instanceof HTMLInputElement) {
    scoreSlider.value = String(normalizedScore);
    scoreSlider.style.setProperty("--score-progress", getScoreProgressPercent(normalizedScore));
    scoreSlider.setAttribute("aria-valuetext", formatScoreLabel(normalizedScore));
  }

  const scoreValueLabel = cell.querySelector(".day-score-value");
  if (scoreValueLabel) {
    scoreValueLabel.textContent = formatScoreLabel(normalizedScore);
  }
}

function syncDayNoteControl(cell, noteValue) {
  const normalizedNote = normalizeDayNoteValue(noteValue);
  const noteInput = cell.querySelector(".day-note-input");
  if (noteInput instanceof HTMLTextAreaElement && noteInput.value !== normalizedNote) {
    noteInput.value = normalizedNote;
  }
}

function applyDayStateToCell(cell, dayState) {
  const normalizedState = normalizeDayState(dayState);
  cell.dataset.dayState = normalizedState;
  delete cell.dataset.dayScore;
  delete cell.dataset.dayChecked;
  delete cell.dataset.dayNote;
  delete cell.dataset.dayNotePreview;
  cell.style.removeProperty("--score-heat-intensity");

  const stateButtons = cell.querySelectorAll(".day-state-btn");
  stateButtons.forEach((button) => {
    const isActive = button.dataset.state === normalizedState;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  syncDayScoreControls(cell, SCORE_UNASSIGNED);
  syncDayNoteControl(cell, "");
}

function applyDayScoreToCell(cell, dayScore) {
  const normalizedScore = normalizeScoreValue(dayScore);
  delete cell.dataset.dayState;
  delete cell.dataset.dayChecked;
  delete cell.dataset.dayNote;
  delete cell.dataset.dayNotePreview;
  if (normalizedScore === SCORE_UNASSIGNED) {
    delete cell.dataset.dayScore;
    cell.style.removeProperty("--score-heat-intensity");
  } else {
    cell.dataset.dayScore = String(normalizedScore);
    cell.style.setProperty(
      "--score-heat-intensity",
      getScoreHeatIntensityPercent(normalizedScore),
    );
  }
  syncDayScoreControls(cell, normalizedScore);
  syncDayNoteControl(cell, "");
}

function applyDayCheckToCell(cell, dayCheckValue) {
  const isChecked = normalizeCheckValue(dayCheckValue);
  delete cell.dataset.dayState;
  delete cell.dataset.dayScore;
  delete cell.dataset.dayNote;
  delete cell.dataset.dayNotePreview;
  cell.style.removeProperty("--score-heat-intensity");
  if (isChecked) {
    cell.dataset.dayChecked = "true";
  } else {
    delete cell.dataset.dayChecked;
  }
  syncDayScoreControls(cell, SCORE_UNASSIGNED);
  syncDayNoteControl(cell, "");
}

function applyDayNoteToCell(cell, dayNoteValue) {
  const normalizedNote = normalizeDayNoteValue(dayNoteValue);
  delete cell.dataset.dayState;
  delete cell.dataset.dayScore;
  delete cell.dataset.dayChecked;
  cell.style.removeProperty("--score-heat-intensity");
  if (hasDayNoteValue(normalizedNote)) {
    cell.dataset.dayNote = "1";
    cell.dataset.dayNotePreview = normalizeDayNotePreview(normalizedNote);
  } else {
    delete cell.dataset.dayNote;
    delete cell.dataset.dayNotePreview;
  }
  syncDayScoreControls(cell, SCORE_UNASSIGNED);
  syncDayNoteControl(cell, normalizedNote);
}

function applyDayValueToCell(cell, dayValue, calendarType) {
  const normalizedCalendarType = normalizeCalendarType(calendarType);
  if (normalizedCalendarType === CALENDAR_TYPE_SCORE) {
    applyDayScoreToCell(cell, dayValue);
    return;
  }
  if (normalizedCalendarType === CALENDAR_TYPE_CHECK) {
    applyDayCheckToCell(cell, dayValue);
    return;
  }
  if (normalizedCalendarType === CALENDAR_TYPE_NOTES) {
    applyDayNoteToCell(cell, dayValue);
    return;
  }
  applyDayStateToCell(cell, dayValue);
}

function buildMonthCard(monthStart, getDayValueByKey, todayDayKey, calendarType) {
  const year = monthStart.getFullYear();
  const monthIndex = monthStart.getMonth();
  const totalDays = daysInMonth(year, monthIndex);
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const normalizedCalendarType = normalizeCalendarType(calendarType);

  const card = document.createElement("section");
  card.className = "month-card";
  card.dataset.month = monthKey(monthStart);

  const title = document.createElement("h2");
  title.className = "month-title";
  title.textContent = MONTH_LABEL.format(monthStart);
  card.appendChild(title);

  const table = document.createElement("table");
  const colgroup = document.createElement("colgroup");
  for (let col = 0; col < 7; col += 1) {
    colgroup.appendChild(document.createElement("col"));
  }
  table.appendChild(colgroup);

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  WEEKDAY_LABELS.forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const weekCount = Math.ceil((firstWeekday + totalDays) / 7);
  let dayNumber = 1;
  for (let row = 0; row < weekCount; row += 1) {
    const tr = document.createElement("tr");
    tr.dataset.rowIndex = String(row);
    for (let col = 0; col < 7; col += 1) {
      const td = document.createElement("td");
      td.dataset.colIndex = String(col);
      const cellIndex = row * 7 + col;
      if (cellIndex < firstWeekday || dayNumber > totalDays) {
        td.className = "empty";
        td.textContent = "";
      } else {
        td.className = "day-cell";

        const dayKeyValue = formatDayKey(year, monthIndex, dayNumber);
        const dayValue = getDayValueByKey(dayKeyValue);
        td.dataset.dayKey = dayKeyValue;
        if (dayKeyValue === todayDayKey) {
          td.classList.add("today-cell");
        }

        const dayCellContent = document.createElement("div");
        dayCellContent.className = "day-cell-content";

        const dayNumberLabel = document.createElement("span");
        dayNumberLabel.className = "day-number";
        dayNumberLabel.textContent = String(dayNumber);
        dayCellContent.appendChild(dayNumberLabel);

        const closeDayButton = document.createElement("button");
        closeDayButton.type = "button";
        closeDayButton.className = "day-close-btn";
        closeDayButton.setAttribute("aria-label", "Close day details");
        closeDayButton.title = "Close";
        closeDayButton.textContent = "×";

        const dayStateRow = document.createElement("div");
        dayStateRow.className = "day-state-row";

        DAY_STATES.forEach((state) => {
          const dayStateButton = createDayStateButton(
            state,
            normalizedCalendarType === CALENDAR_TYPE_SIGNAL && state === normalizeDayState(dayValue),
          );
          dayStateRow.appendChild(dayStateButton);
        });

        const dayScoreRow = document.createElement("div");
        dayScoreRow.className = "day-score-row";

        const dayScoreSlider = document.createElement("input");
        dayScoreSlider.type = "range";
        dayScoreSlider.className = "day-score-slider";
        dayScoreSlider.min = String(SCORE_MIN);
        dayScoreSlider.max = String(SCORE_MAX);
        dayScoreSlider.step = "1";
        dayScoreSlider.value = String(
          normalizedCalendarType === CALENDAR_TYPE_SCORE
            ? normalizeScoreValue(dayValue)
            : SCORE_UNASSIGNED,
        );
        dayScoreSlider.setAttribute("aria-label", "Set day score");

        const dayScoreValue = document.createElement("span");
        dayScoreValue.className = "day-score-value";
        dayScoreValue.textContent = formatScoreLabel(dayScoreSlider.value);
        dayScoreValue.setAttribute("aria-hidden", "true");

        dayScoreRow.append(dayScoreSlider, dayScoreValue);

        const dayNoteRow = document.createElement("div");
        dayNoteRow.className = "day-note-row";

        const dayNoteInput = document.createElement("textarea");
        dayNoteInput.className = "day-note-input";
        dayNoteInput.rows = 4;
        dayNoteInput.placeholder = "Write a note...";
        dayNoteInput.setAttribute("aria-label", "Write note for this day");
        dayNoteInput.value =
          normalizedCalendarType === CALENDAR_TYPE_NOTES
            ? normalizeDayNoteValue(dayValue)
            : "";

        dayNoteRow.append(dayNoteInput);

        td.appendChild(dayCellContent);
        td.appendChild(closeDayButton);
        td.appendChild(dayStateRow);
        td.appendChild(dayScoreRow);
        td.appendChild(dayNoteRow);
        applyDayValueToCell(td, dayValue, normalizedCalendarType);

        dayNumber += 1;
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);

  const tableShell = document.createElement("div");
  tableShell.className = "month-table-shell";
  tableShell.appendChild(table);
  card.appendChild(tableShell);
  return card;
}

export function initInfiniteCalendar(container, { initialActiveCalendar } = {}) {
  const now = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const todayDayKey = formatDayKey(now.getFullYear(), now.getMonth(), now.getDate());
  const dayStatesByCalendarId = loadCalendarDayStates();
  const tableBaseLayoutMap = new WeakMap();
  const cellDeselectFadeTimers = new WeakMap();
  const tableUnexpandTimers = new WeakMap();
  const calendarCanvas = document.createElement("div");
  calendarCanvas.id = "calendar-canvas";
  container.appendChild(calendarCanvas);
  const notesHoverPreview = document.createElement("aside");
  notesHoverPreview.className = "notes-hover-preview";
  notesHoverPreview.setAttribute("aria-hidden", "true");
  const notesHoverPreviewContent = document.createElement("div");
  notesHoverPreviewContent.className = "notes-hover-preview-content";
  notesHoverPreview.appendChild(notesHoverPreviewContent);
  const appRoot = document.getElementById("app") ?? document.body;
  appRoot.appendChild(notesHoverPreview);

  let earliestMonth = currentMonth;
  let latestMonth = currentMonth;
  let framePending = false;
  let selectedCell = null;
  let cellExpansionX = DEFAULT_CELL_EXPANSION_X;
  let cellExpansionY = DEFAULT_CELL_EXPANSION_Y;
  let cameraZoom = DEFAULT_CAMERA_ZOOM;
  let fastScrollFrame = 0;
  let zoomResetTimer = 0;
  let zoomResetHandler = null;
  const initialCalendarIdRaw =
    typeof initialActiveCalendar === "string"
      ? initialActiveCalendar
      : typeof initialActiveCalendar?.id === "string"
        ? initialActiveCalendar.id
        : "";
  const initialCalendarTypeRaw =
    typeof initialActiveCalendar === "object" && initialActiveCalendar !== null
      ? initialActiveCalendar.type
      : DEFAULT_CALENDAR_TYPE;
  const initialCalendarType = normalizeCalendarType(initialCalendarTypeRaw);
  const initialCalendarDisplayRaw =
    typeof initialActiveCalendar === "object" && initialActiveCalendar !== null
      ? initialActiveCalendar.display
      : DEFAULT_SCORE_DISPLAY;
  const initialCalendarDisplay =
    initialCalendarType === CALENDAR_TYPE_SCORE
      ? normalizeScoreDisplay(initialCalendarDisplayRaw)
      : DEFAULT_SCORE_DISPLAY;
  const initialCalendarColorRaw =
    typeof initialActiveCalendar === "object" && initialActiveCalendar !== null
      ? initialActiveCalendar.color
      : DEFAULT_CALENDAR_COLOR;
  const initialCalendarColor = normalizeCalendarColor(
    initialCalendarColorRaw,
    DEFAULT_CALENDAR_COLOR,
  );
  let activeCalendarId =
    initialCalendarIdRaw.trim() || DEFAULT_CALENDAR_ID;
  let activeCalendarType = initialCalendarType;
  let activeCalendarDisplay = initialCalendarDisplay;
  let activeCalendarColor = initialCalendarColor;
  let shouldPanZoomOnDaySelect = true;
  let shouldExpandOnDaySelect = true;
  let hoveredNotesCell = null;
  let notesHoverPreviewTimer = 0;
  let notesInputFocusTimer = 0;

  function ensureActiveCalendarDayStates() {
    if (!dayStatesByCalendarId[activeCalendarId]) {
      dayStatesByCalendarId[activeCalendarId] = {};
    }
    return dayStatesByCalendarId[activeCalendarId];
  }

  function applyActiveCalendarTypeToContainer() {
    container.dataset.calendarType = activeCalendarType;
    container.style.setProperty(
      "--active-calendar-color",
      resolveCalendarColorHex(activeCalendarColor, DEFAULT_CALENDAR_COLOR),
    );
    if (activeCalendarType === CALENDAR_TYPE_SCORE) {
      container.dataset.calendarDisplay = activeCalendarDisplay;
      return;
    }
    delete container.dataset.calendarDisplay;
  }

  function clearNotesHoverPreviewTimer() {
    if (!notesHoverPreviewTimer) return;
    clearTimeout(notesHoverPreviewTimer);
    notesHoverPreviewTimer = 0;
  }

  function clearNotesInputFocusTimer() {
    if (!notesInputFocusTimer) return;
    clearTimeout(notesInputFocusTimer);
    notesInputFocusTimer = 0;
  }

  function focusNotesInputForCell(cell, { immediate = false } = {}) {
    clearNotesInputFocusTimer();
    if (activeCalendarType !== CALENDAR_TYPE_NOTES) return;
    if (!cell || !cell.isConnected || !container.contains(cell)) return;

    const runFocus = () => {
      notesInputFocusTimer = 0;
      if (activeCalendarType !== CALENDAR_TYPE_NOTES) return;
      if (!selectedCell || selectedCell !== cell || !cell.classList.contains("selected-day")) {
        return;
      }
      const noteInput = cell.querySelector(".day-note-input");
      if (!(noteInput instanceof HTMLTextAreaElement)) return;
      noteInput.focus({ preventScroll: true });
      const inputTextLength = noteInput.value.length;
      noteInput.setSelectionRange(inputTextLength, inputTextLength);
    };

    if (immediate) {
      runFocus();
      return;
    }

    notesInputFocusTimer = window.setTimeout(runFocus, 140);
  }

  function isMobileLayout() {
    if (typeof window === "undefined") return false;
    if (typeof window.matchMedia === "function") {
      return window.matchMedia(MOBILE_LAYOUT_QUERY).matches;
    }
    return window.innerWidth <= 640;
  }

  function shouldPreserveNotesViewportOnResize() {
    if (activeCalendarType !== CALENDAR_TYPE_NOTES || !isMobileLayout()) {
      return false;
    }
    const focusedElement = document.activeElement;
    if (!(focusedElement instanceof HTMLTextAreaElement)) {
      return false;
    }
    if (!focusedElement.classList.contains("day-note-input")) {
      return false;
    }
    return container.contains(focusedElement);
  }

  function setNotesHoverPreviewVisible(isVisible) {
    notesHoverPreview.classList.toggle("is-visible", isVisible);
    notesHoverPreview.setAttribute("aria-hidden", String(!isVisible));
  }

  function updateNotesHoverPreviewPosition(cell) {
    if (!cell || !cell.isConnected || !container.contains(cell)) return;

    const cellRect = cell.getBoundingClientRect();
    const header = document.querySelector("header");
    const headerBottom = header ? Math.round(header.getBoundingClientRect().bottom) : 0;
    const previewRect = notesHoverPreview.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const previewWidth = previewRect.width;
    const previewHeight = previewRect.height;
    const minTopBoundary = Math.max(
      NOTES_HOVER_PREVIEW_VIEWPORT_PADDING_PX,
      headerBottom + NOTES_HOVER_PREVIEW_GAP_PX,
    );

    let nextLeft =
      cellRect.left + cellRect.width / 2 - previewWidth / 2;
    nextLeft = clamp(
      nextLeft,
      NOTES_HOVER_PREVIEW_VIEWPORT_PADDING_PX,
      viewportWidth - previewWidth - NOTES_HOVER_PREVIEW_VIEWPORT_PADDING_PX,
    );

    const topAboveCell = cellRect.top - previewHeight - NOTES_HOVER_PREVIEW_GAP_PX;
    const topBelowCell = cellRect.bottom + NOTES_HOVER_PREVIEW_GAP_PX;
    const hasSpaceAbove = topAboveCell >= minTopBoundary;

    let nextTop = hasSpaceAbove ? topAboveCell : topBelowCell;
    const maxTopBoundary = Math.max(
      minTopBoundary,
      viewportHeight - previewHeight - NOTES_HOVER_PREVIEW_VIEWPORT_PADDING_PX,
    );
    nextTop = clamp(
      nextTop,
      minTopBoundary,
      maxTopBoundary,
    );

    notesHoverPreview.style.left = `${Math.round(nextLeft)}px`;
    notesHoverPreview.style.top = `${Math.round(nextTop)}px`;
  }

  function hideNotesHoverPreview({
    clearContent = false,
    resetHoverTarget = true,
  } = {}) {
    clearNotesHoverPreviewTimer();
    if (resetHoverTarget) {
      hoveredNotesCell = null;
    }
    setNotesHoverPreviewVisible(false);
    if (clearContent) {
      notesHoverPreviewContent.textContent = "";
    }
  }

  function getDayCellFromEventTarget(target) {
    if (!(target instanceof Element)) return null;
    const dayCell = target.closest("td.day-cell");
    if (!dayCell || !container.contains(dayCell)) {
      return null;
    }
    return dayCell;
  }

  function canShowNotesHoverPreviewForCell(cell) {
    if (!cell || !cell.isConnected || !container.contains(cell)) return false;
    if (activeCalendarType !== CALENDAR_TYPE_NOTES) return false;
    if (cell.classList.contains("selected-day")) return false;
    return hasDayNoteValue(cell.dataset.dayNotePreview);
  }

  function scheduleNotesHoverPreviewForCell(cell) {
    clearNotesHoverPreviewTimer();
    if (!canShowNotesHoverPreviewForCell(cell)) {
      return;
    }

    notesHoverPreviewTimer = window.setTimeout(() => {
      notesHoverPreviewTimer = 0;
      if (hoveredNotesCell !== cell) return;
      if (!canShowNotesHoverPreviewForCell(cell)) return;
      if (!cell.matches(":hover")) return;

      notesHoverPreviewContent.textContent = cell.dataset.dayNotePreview ?? "";
      updateNotesHoverPreviewPosition(cell);
      setNotesHoverPreviewVisible(true);
    }, NOTES_HOVER_PREVIEW_DELAY_MS);
  }

  function setHoveredNotesCell(nextCell) {
    if (hoveredNotesCell === nextCell) return;

    hoveredNotesCell = nextCell;
    hideNotesHoverPreview({ resetHoverTarget: false });
    if (hoveredNotesCell) {
      scheduleNotesHoverPreviewForCell(hoveredNotesCell);
    }
  }

  function getDayValueByKey(dayKeyValue) {
    const activeDayStates = ensureActiveCalendarDayStates();
    const rawDayValue = activeDayStates[dayKeyValue];
    if (activeCalendarType === CALENDAR_TYPE_SCORE) {
      return normalizeScoreValue(rawDayValue);
    }
    if (activeCalendarType === CALENDAR_TYPE_CHECK) {
      return normalizeCheckValue(rawDayValue);
    }
    if (activeCalendarType === CALENDAR_TYPE_NOTES) {
      return normalizeDayNoteValue(rawDayValue);
    }
    return normalizeDayState(rawDayValue);
  }

  function refreshRenderedDayValues() {
    const dayCells = calendarCanvas.querySelectorAll("td.day-cell[data-day-key]");
    dayCells.forEach((dayCell) => {
      const dayKeyValue = dayCell.dataset.dayKey;
      if (!dayKeyValue) return;
      applyDayValueToCell(dayCell, getDayValueByKey(dayKeyValue), activeCalendarType);
    });
  }

  function setDayStateForCell(cell, nextState) {
    const dayKeyValue = cell.dataset.dayKey;
    if (!dayKeyValue) return;

    const normalizedState = normalizeDayState(nextState);
    const activeDayStates = ensureActiveCalendarDayStates();
    if (normalizedState === DEFAULT_DAY_STATE) {
      delete activeDayStates[dayKeyValue];
    } else {
      activeDayStates[dayKeyValue] = normalizedState;
    }
    applyDayValueToCell(cell, normalizedState, CALENDAR_TYPE_SIGNAL);
    saveCalendarDayStates(dayStatesByCalendarId);
  }

  function setDayScoreForCell(cell, nextScore) {
    const dayKeyValue = cell.dataset.dayKey;
    if (!dayKeyValue) return;

    const normalizedScore = normalizeScoreValue(nextScore);
    const activeDayStates = ensureActiveCalendarDayStates();
    if (normalizedScore === SCORE_UNASSIGNED) {
      delete activeDayStates[dayKeyValue];
    } else {
      activeDayStates[dayKeyValue] = normalizedScore;
    }
    applyDayValueToCell(cell, normalizedScore, CALENDAR_TYPE_SCORE);
    saveCalendarDayStates(dayStatesByCalendarId);
  }

  function setDayCheckForCell(cell, nextCheckValue) {
    const dayKeyValue = cell.dataset.dayKey;
    if (!dayKeyValue) return;

    const isChecked = normalizeCheckValue(nextCheckValue);
    const activeDayStates = ensureActiveCalendarDayStates();
    if (isChecked === CHECK_MARKED) {
      activeDayStates[dayKeyValue] = true;
    } else {
      delete activeDayStates[dayKeyValue];
    }
    applyDayValueToCell(cell, isChecked, CALENDAR_TYPE_CHECK);
    saveCalendarDayStates(dayStatesByCalendarId);
  }

  function setDayNoteForCell(cell, nextNoteValue) {
    const dayKeyValue = cell.dataset.dayKey;
    if (!dayKeyValue) return;

    const normalizedNote = normalizeDayNoteValue(nextNoteValue);
    const activeDayStates = ensureActiveCalendarDayStates();
    if (hasDayNoteValue(normalizedNote)) {
      activeDayStates[dayKeyValue] = normalizedNote;
    } else {
      delete activeDayStates[dayKeyValue];
    }
    applyDayValueToCell(cell, normalizedNote, CALENDAR_TYPE_NOTES);
    saveCalendarDayStates(dayStatesByCalendarId);

    if (hoveredNotesCell === cell) {
      if (canShowNotesHoverPreviewForCell(cell)) {
        notesHoverPreviewContent.textContent = cell.dataset.dayNotePreview ?? "";
        if (notesHoverPreview.classList.contains("is-visible")) {
          updateNotesHoverPreviewPosition(cell);
        }
      } else {
        setHoveredNotesCell(null);
      }
    }
  }

  function toggleDayCheckForCell(cell) {
    const isChecked = normalizeCheckValue(cell.dataset.dayChecked);
    setDayCheckForCell(cell, !isChecked);
  }

  function getTableStructure(table) {
    const bodyRows = Array.from(table.tBodies[0]?.rows ?? []);
    const colEls = Array.from(table.querySelectorAll("colgroup col"));
    if (bodyRows.length === 0 || colEls.length !== 7) return null;
    return { bodyRows, colEls };
  }

  function readTableBaseLayout(table) {
    const totalHeight = table.offsetHeight;
    const headHeight = table.tHead?.offsetHeight ?? 0;
    const bodyHeight = Math.max(totalHeight - headHeight, 0);
    const totalWidth = table.clientWidth;
    return { totalHeight, bodyHeight, totalWidth };
  }

  function ensureTableBaseLayout(table, structure, { refreshBase = false } = {}) {
    if (!refreshBase) {
      const cachedLayout = tableBaseLayoutMap.get(table);
      if (cachedLayout) return cachedLayout;
    }

    table.style.height = "";
    structure.bodyRows.forEach((row) => {
      row.style.height = "";
      row.classList.remove("selected-row");
    });
    structure.colEls.forEach((col) => {
      col.style.width = "";
    });
    table.classList.remove("has-selected-day");

    const nextBaseLayout = readTableBaseLayout(table);
    tableBaseLayoutMap.set(table, nextBaseLayout);
    return nextBaseLayout;
  }

  function applyDefaultTableLayout(table, options = {}) {
    const structure = getTableStructure(table);
    if (!structure) return;

    const baseLayout = ensureTableBaseLayout(table, structure, options);
    const { bodyRows, colEls } = structure;
    const { totalHeight, bodyHeight, totalWidth } = baseLayout;

    table.style.height = `${totalHeight}px`;

    const defaultRowHeight = bodyHeight / bodyRows.length;
    bodyRows.forEach((row) => {
      row.style.height = `${defaultRowHeight}px`;
      row.classList.remove("selected-row");
    });

    const defaultColWidth = totalWidth / colEls.length;
    colEls.forEach((col) => {
      col.style.width = `${defaultColWidth}px`;
    });

    table.classList.remove("has-selected-day");
    table.dataset.layoutReady = "1";
  }

  function applyDefaultLayoutForCards(cards, options = {}) {
    cards.forEach((card) => {
      const table = card.querySelector("table");
      if (table) applyDefaultTableLayout(table, options);
    });
  }

  function clearTableSelectionLayout(table) {
    applyDefaultTableLayout(table);
  }

  function applyTableSelectionLayout(table, rowIndex, colIndex) {
    const structure = getTableStructure(table);
    if (!structure) return;
    const baseLayout = ensureTableBaseLayout(table, structure);
    const { bodyRows, colEls } = structure;
    const { totalHeight, bodyHeight, totalWidth } = baseLayout;
    const rowCount = bodyRows.length;
    const colCount = colEls.length;
    table.style.height = `${totalHeight}px`;

    const requestedExpandedRowHeight =
      bodyHeight * ((cellExpansionY * SELECTED_ROW_HEIGHT_MULTIPLIER) / rowCount);
    const minOtherRowHeightRatio =
      rowCount <= 4
        ? MIN_OTHER_ROW_HEIGHT_RATIO_SHORT_MONTH
        : MIN_OTHER_ROW_HEIGHT_RATIO;
    const minOtherRowHeight = bodyHeight * minOtherRowHeightRatio;
    const maxExpandedRowHeight = bodyHeight - minOtherRowHeight * (rowCount - 1);
    const expandedRowHeight = clamp(requestedExpandedRowHeight, 0, maxExpandedRowHeight);
    const otherRowHeight = (bodyHeight - expandedRowHeight) / (rowCount - 1);

    bodyRows.forEach((row, idx) => {
      row.classList.toggle("selected-row", idx === rowIndex);
      row.style.height = `${idx === rowIndex ? expandedRowHeight : otherRowHeight}px`;
    });

    const expandedColWidth = totalWidth * (cellExpansionX / colCount);
    const otherColWidth = (totalWidth - expandedColWidth) / (colCount - 1);

    colEls.forEach((col, idx) => {
      col.style.width = `${idx === colIndex ? expandedColWidth : otherColWidth}px`;
    });

    table.classList.add("has-selected-day");
    table.dataset.layoutReady = "1";
  }

  function getElementRectWithinCanvas(element) {
    let left = 0;
    let top = 0;
    let current = element;

    while (current && current !== calendarCanvas) {
      left += current.offsetLeft;
      top += current.offsetTop;
      current = current.offsetParent;
    }

    if (current === calendarCanvas) {
      return {
        left,
        top,
        width: element.offsetWidth,
        height: element.offsetHeight,
      };
    }

    const getCurrentCanvasScale = () => {
      const transformValue = calendarCanvas.style.transform;
      if (!transformValue || transformValue === "none") return 1;

      const matrixMatch = transformValue.match(/^matrix\((.+)\)$/);
      if (matrixMatch) {
        const values = matrixMatch[1].split(",").map((entry) => Number(entry.trim()));
        if (values.length >= 2 && Number.isFinite(values[0]) && Number.isFinite(values[1])) {
          const scale = Math.hypot(values[0], values[1]);
          return scale > 0 ? scale : 1;
        }
      }

      const matrix3dMatch = transformValue.match(/^matrix3d\((.+)\)$/);
      if (matrix3dMatch) {
        const values = matrix3dMatch[1].split(",").map((entry) => Number(entry.trim()));
        if (values.length >= 2 && Number.isFinite(values[0]) && Number.isFinite(values[1])) {
          const scale = Math.hypot(values[0], values[1]);
          return scale > 0 ? scale : 1;
        }
      }

      return 1;
    };

    const elementRect = element.getBoundingClientRect();
    const canvasRect = calendarCanvas.getBoundingClientRect();
    const scale = getCurrentCanvasScale();
    return {
      left: (elementRect.left - canvasRect.left) / scale,
      top: (elementRect.top - canvasRect.top) / scale,
      width: elementRect.width / scale,
      height: elementRect.height / scale,
    };
  }

  function cleanupZoomResetListeners() {
    if (zoomResetTimer) {
      clearTimeout(zoomResetTimer);
      zoomResetTimer = 0;
    }
    if (zoomResetHandler) {
      calendarCanvas.removeEventListener("transitionend", zoomResetHandler);
      zoomResetHandler = null;
    }
  }

  function getCellTargetCenterWithinCanvas(cell) {
    const table = cell.closest("table");
    if (!table) return null;

    const tableRect = getElementRectWithinCanvas(table);
    if (!tableRect) return null;

    const rowIndex = Number(cell.parentElement?.dataset.rowIndex ?? -1);
    const colIndex = Number(cell.dataset.colIndex ?? -1);

    const bodyRows = Array.from(table.tBodies[0]?.rows ?? []);
    const colEls = Array.from(table.querySelectorAll("colgroup col"));
    if (
      rowIndex < 0 ||
      colIndex < 0 ||
      rowIndex >= bodyRows.length ||
      colIndex >= colEls.length
    ) {
      return null;
    }

    // Measure exact final row/column geometry using a hidden clone with target styles.
    const probeHost = document.createElement("div");
    probeHost.style.position = "fixed";
    probeHost.style.left = "-100000px";
    probeHost.style.top = "0";
    probeHost.style.width = `${table.clientWidth}px`;
    probeHost.style.visibility = "hidden";
    probeHost.style.pointerEvents = "none";

    const probeTable = table.cloneNode(true);
    if (!(probeTable instanceof HTMLTableElement)) {
      return null;
    }
    probeTable.style.width = `${table.clientWidth}px`;
    probeTable.style.height = `${table.offsetHeight}px`;
    probeTable.style.transition = "none";
    probeTable.querySelectorAll("col").forEach((col) => {
      col.style.transition = "none";
    });
    probeTable.querySelectorAll("tbody tr").forEach((row) => {
      row.style.transition = "none";
    });

    probeHost.appendChild(probeTable);
    document.body.appendChild(probeHost);

    try {
      const probeRow = probeTable.tBodies[0]?.rows?.[rowIndex] ?? null;
      const probeCell = probeRow?.cells?.[colIndex] ?? null;
      if (!probeCell) return null;

      const probeTableRect = probeTable.getBoundingClientRect();
      const probeCellRect = probeCell.getBoundingClientRect();
      const centerX =
        tableRect.left +
        (probeCellRect.left - probeTableRect.left) +
        probeCellRect.width / 2;
      const centerY =
        tableRect.top +
        (probeCellRect.top - probeTableRect.top) +
        probeCellRect.height / 2;

      return { x: centerX, y: centerY };
    } finally {
      probeHost.remove();
    }
  }

  function clearCanvasZoom({ immediate = false } = {}) {
    cleanupZoomResetListeners();
    container.classList.remove("is-zoomed");

    const finishReset = () => {
      cleanupZoomResetListeners();
      calendarCanvas.style.transformOrigin = "";
      calendarCanvas.style.transform = "";
      calendarCanvas.style.transitionDuration = "";
    };

    if (immediate) {
      finishReset();
      return;
    }

    if (!calendarCanvas.style.transform) {
      finishReset();
      return;
    }

    zoomResetHandler = (event) => {
      if (event.target !== calendarCanvas || event.propertyName !== "transform") {
        return;
      }
      finishReset();
    };
    calendarCanvas.addEventListener("transitionend", zoomResetHandler);
    calendarCanvas.style.transitionDuration = `${ZOOM_OUT_DURATION_MS}ms`;
    calendarCanvas.style.transformOrigin = "0 0";
    calendarCanvas.style.transform = "matrix(1, 0, 0, 1, 0, 0)";
    zoomResetTimer = window.setTimeout(finishReset, ZOOM_OUT_RESET_FALLBACK_MS);
  }

  function clearCellDeselectFade(cell) {
    if (!cell) return;
    const existingTimer = cellDeselectFadeTimers.get(cell);
    if (existingTimer) {
      clearTimeout(existingTimer);
      cellDeselectFadeTimers.delete(cell);
    }
    cell.classList.remove("is-deselecting");
  }

  function startCellDeselectFade(cell) {
    if (!cell) return;
    clearCellDeselectFade(cell);
    cell.classList.add("is-deselecting");
    const fadeTimer = window.setTimeout(() => {
      cell.classList.remove("is-deselecting");
      cellDeselectFadeTimers.delete(cell);
    }, DAY_DESELECT_FADE_MS);
    cellDeselectFadeTimers.set(cell, fadeTimer);
  }

  function clearTableUnexpandTransition(table) {
    if (!table) return;
    const existingTimer = tableUnexpandTimers.get(table);
    if (existingTimer) {
      clearTimeout(existingTimer);
      tableUnexpandTimers.delete(table);
    }
    table.classList.remove("is-unexpanding");
  }

  function startTableUnexpandTransition(table) {
    if (!table) return;
    clearTableUnexpandTransition(table);
    table.classList.add("is-unexpanding");
    const unexpandTimer = window.setTimeout(() => {
      table.classList.remove("is-unexpanding");
      tableUnexpandTimers.delete(table);
    }, TABLE_UNEXPAND_RESET_FALLBACK_MS);
    tableUnexpandTimers.set(table, unexpandTimer);
  }

  function applyCanvasZoomForCell(cell) {
    if (!cell || !cell.isConnected) return;

    if (!shouldPanZoomOnDaySelect) {
      clearCanvasZoom();
      return;
    }

    cleanupZoomResetListeners();
    const scale = clamp(cameraZoom, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
    const shouldResetFirst =
      !container.classList.contains("is-zoomed") || !calendarCanvas.style.transform;

    if (shouldResetFirst) {
      clearCanvasZoom({ immediate: true });
    }

    requestAnimationFrame(() => {
      if (!cell.isConnected || selectedCell !== cell) return;
      const center = getCellTargetCenterWithinCanvas(cell);
      const targetCenterX = center?.x;
      const targetCenterY = center?.y;
      if (!Number.isFinite(targetCenterX) || !Number.isFinite(targetCenterY)) return;

      // Fixed-origin matrix transform keeps retarget panning stable at zoom > 1.
      const targetX =
        container.clientWidth / 2 +
        container.scrollLeft -
        scale * targetCenterX;
      const targetY =
        container.clientHeight / 2 +
        container.scrollTop -
        scale * targetCenterY;

      container.classList.add("is-zoomed");
      calendarCanvas.style.transformOrigin = "0 0";
      calendarCanvas.style.transform = `matrix(${scale}, 0, 0, ${scale}, ${targetX}, ${targetY})`;
    });
  }

  function reapplySelectionFocus() {
    if (!selectedCell || !selectedCell.isConnected) return;
    const table = selectedCell.closest("table");
    const rowIndex = Number(selectedCell.parentElement?.dataset.rowIndex ?? -1);
    const colIndex = Number(selectedCell.dataset.colIndex ?? -1);
    if (table && rowIndex >= 0 && colIndex >= 0) {
      if (shouldExpandOnDaySelect) {
        applyTableSelectionLayout(table, rowIndex, colIndex);
      } else {
        clearTableUnexpandTransition(table);
        clearTableSelectionLayout(table);
      }
    }
    applyCanvasZoomForCell(selectedCell);
  }

  function setCellExpansionX(nextValue) {
    const numericValue = Number(nextValue);
    if (!Number.isFinite(numericValue)) return cellExpansionX;

    cellExpansionX = clamp(
      numericValue,
      MIN_CELL_EXPANSION_X,
      MAX_CELL_EXPANSION_X,
    );
    reapplySelectionFocus();
    return cellExpansionX;
  }

  function setCellExpansionY(nextValue) {
    const numericValue = Number(nextValue);
    if (!Number.isFinite(numericValue)) return cellExpansionY;

    cellExpansionY = clamp(
      numericValue,
      MIN_CELL_EXPANSION_Y,
      MAX_CELL_EXPANSION_Y,
    );
    reapplySelectionFocus();
    return cellExpansionY;
  }

  function setCellExpansion(nextValue) {
    const numericValue = Number(nextValue);
    if (!Number.isFinite(numericValue)) return cellExpansionX;

    cellExpansionX = clamp(
      numericValue,
      MIN_CELL_EXPANSION_X,
      MAX_CELL_EXPANSION_X,
    );
    cellExpansionY = clamp(
      numericValue,
      MIN_CELL_EXPANSION_Y,
      MAX_CELL_EXPANSION_Y,
    );
    reapplySelectionFocus();
    return cellExpansionX;
  }

  function setCameraZoom(nextValue) {
    const numericValue = Number(nextValue);
    if (!Number.isFinite(numericValue)) return cameraZoom;

    cameraZoom = clamp(
      numericValue,
      MIN_CAMERA_ZOOM,
      MAX_CAMERA_ZOOM,
    );
    reapplySelectionFocus();
    return cameraZoom;
  }

  function setSelectionExpansion(nextValue) {
    return setCellExpansion(nextValue);
  }

  function setPanZoomOnDaySelect(nextValue) {
    const nextEnabled = nextValue !== false;
    const didChange = nextEnabled !== shouldPanZoomOnDaySelect;
    shouldPanZoomOnDaySelect = nextEnabled;

    if (didChange && !nextEnabled) {
      clearCanvasZoom();
    } else if (didChange && nextEnabled) {
      reapplySelectionFocus();
    }

    return shouldPanZoomOnDaySelect;
  }

  function setExpandOnDaySelect(nextValue) {
    const nextEnabled = nextValue !== false;
    const didChange = nextEnabled !== shouldExpandOnDaySelect;
    shouldExpandOnDaySelect = nextEnabled;

    if (didChange) {
      reapplySelectionFocus();
    }

    return shouldExpandOnDaySelect;
  }

  function setActiveCalendar(nextCalendar) {
    const normalizedCalendarIdRaw =
      typeof nextCalendar === "string"
        ? nextCalendar
        : typeof nextCalendar?.id === "string"
          ? nextCalendar.id
          : "";
    const normalizedCalendarTypeRaw =
      typeof nextCalendar === "object" && nextCalendar !== null
        ? nextCalendar.type
        : DEFAULT_CALENDAR_TYPE;
    const normalizedCalendarDisplayRaw =
      typeof nextCalendar === "object" && nextCalendar !== null
        ? nextCalendar.display
        : DEFAULT_SCORE_DISPLAY;
    const normalizedCalendarColorRaw =
      typeof nextCalendar === "object" && nextCalendar !== null
        ? nextCalendar.color
        : activeCalendarColor;

    const normalizedCalendarId =
      normalizedCalendarIdRaw.trim() || DEFAULT_CALENDAR_ID;
    const normalizedCalendarType = normalizeCalendarType(normalizedCalendarTypeRaw);
    const normalizedCalendarDisplay =
      normalizedCalendarType === CALENDAR_TYPE_SCORE
        ? normalizeScoreDisplay(normalizedCalendarDisplayRaw)
        : DEFAULT_SCORE_DISPLAY;
    const normalizedCalendarColor = normalizeCalendarColor(
      normalizedCalendarColorRaw,
      activeCalendarColor || DEFAULT_CALENDAR_COLOR,
    );

    const didChange =
      normalizedCalendarId !== activeCalendarId ||
      normalizedCalendarType !== activeCalendarType ||
      normalizedCalendarDisplay !== activeCalendarDisplay ||
      normalizedCalendarColor !== activeCalendarColor;
    activeCalendarId = normalizedCalendarId;
    activeCalendarType = normalizedCalendarType;
    activeCalendarDisplay = normalizedCalendarDisplay;
    activeCalendarColor = normalizedCalendarColor;
    applyActiveCalendarTypeToContainer();
    ensureActiveCalendarDayStates();

    if (didChange) {
      hideNotesHoverPreview({ clearContent: true });
      clearSelectedDayCell();
      refreshRenderedDayValues();
    }

    return activeCalendarId;
  }

  function clearSelectedDayCell() {
    hideNotesHoverPreview();
    clearNotesInputFocusTimer();
    if (!selectedCell) return false;

    const previousCell = selectedCell;
    selectedCell = null;
    previousCell.classList.remove("selected-day");
    startCellDeselectFade(previousCell);
    const previousTable = previousCell.closest("table");
    if (previousTable) {
      if (shouldExpandOnDaySelect) {
        startTableUnexpandTransition(previousTable);
      } else {
        clearTableUnexpandTransition(previousTable);
      }
      clearTableSelectionLayout(previousTable);
    }
    clearCanvasZoom();

    return true;
  }

  function selectDayCell(cell) {
    if (selectedCell === cell) return;

    const previousCell = selectedCell;
    const nextTable = cell.closest("table");
    if (previousCell && previousCell !== cell) {
      const previousTable = previousCell.closest("table");
      if (previousTable && previousTable !== nextTable) {
        clearTableSelectionLayout(previousTable);
      }
    }

    if (selectedCell) {
      clearCellDeselectFade(selectedCell);
      selectedCell.classList.remove("selected-day");
      startCellDeselectFade(selectedCell);
    }
    selectedCell = cell;
    clearCellDeselectFade(selectedCell);
    selectedCell.classList.add("selected-day");

    const table = selectedCell.closest("table");
    const rowIndex = Number(selectedCell.parentElement?.dataset.rowIndex ?? -1);
    const colIndex = Number(selectedCell.dataset.colIndex ?? -1);
    if (table && rowIndex >= 0 && colIndex >= 0) {
      if (table.dataset.layoutReady !== "1") {
        applyDefaultTableLayout(table);
        // Force style flush so next frame transitions from explicit default sizes.
        table.getBoundingClientRect();
      }
      requestAnimationFrame(() => {
        if (!selectedCell || selectedCell !== cell || !cell.isConnected) return;
        if (shouldExpandOnDaySelect) {
          applyTableSelectionLayout(table, rowIndex, colIndex);
        } else {
          clearTableUnexpandTransition(table);
          clearTableSelectionLayout(table);
        }
        applyCanvasZoomForCell(selectedCell);
        focusNotesInputForCell(selectedCell);
      });
      return;
    }

    applyCanvasZoomForCell(selectedCell);
    focusNotesInputForCell(selectedCell);
  }

  function appendFutureMonths(count) {
    const fragment = document.createDocumentFragment();
    const addedCards = [];
    for (let i = 1; i <= count; i += 1) {
      const card = buildMonthCard(
        shiftMonth(latestMonth, i),
        getDayValueByKey,
        todayDayKey,
        activeCalendarType,
      );
      addedCards.push(card);
      fragment.appendChild(card);
    }
    latestMonth = shiftMonth(latestMonth, count);
    calendarCanvas.appendChild(fragment);
    applyDefaultLayoutForCards(addedCards, { refreshBase: true });
  }

  function prependPastMonths(count) {
    const beforeHeight = container.scrollHeight;
    const beforeTop = container.scrollTop;
    const fragment = document.createDocumentFragment();
    const addedCards = [];

    for (let i = count; i >= 1; i -= 1) {
      const card = buildMonthCard(
        shiftMonth(earliestMonth, -i),
        getDayValueByKey,
        todayDayKey,
        activeCalendarType,
      );
      addedCards.push(card);
      fragment.appendChild(card);
    }

    earliestMonth = shiftMonth(earliestMonth, -count);
    calendarCanvas.insertBefore(fragment, calendarCanvas.firstChild);
    applyDefaultLayoutForCards(addedCards, { refreshBase: true });

    const addedHeight = container.scrollHeight - beforeHeight;
    container.scrollTop = beforeTop + addedHeight;
  }

  function maybeLoadMoreMonths() {
    const nearTop = container.scrollTop < TOP_THRESHOLD;
    const nearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      BOTTOM_THRESHOLD;

    if (nearTop) prependPastMonths(LOAD_BATCH);
    if (nearBottom) appendFutureMonths(LOAD_BATCH);
  }

  function ensureMonthRendered(targetMonth) {
    const targetTime = targetMonth.getTime();
    while (targetTime < earliestMonth.getTime()) {
      prependPastMonths(LOAD_BATCH);
    }
    while (targetTime > latestMonth.getTime()) {
      appendFutureMonths(LOAD_BATCH);
    }
  }

  function resolveElementScrollTop(targetElement, block = "center") {
    const containerRect = container.getBoundingClientRect();
    const targetRect = targetElement.getBoundingClientRect();
    const absoluteTop = container.scrollTop + targetRect.top - containerRect.top;

    if (block === "start") return absoluteTop;
    return absoluteTop - (container.clientHeight - targetRect.height) / 2;
  }

  function stopFastScroll() {
    if (!fastScrollFrame) return;
    cancelAnimationFrame(fastScrollFrame);
    fastScrollFrame = 0;
  }

  function fastScrollTo(targetTop, durationMs = FAST_SCROLL_DURATION_MS) {
    stopFastScroll();
    const maxTop = Math.max(container.scrollHeight - container.clientHeight, 0);
    const clampedTop = clamp(targetTop, 0, maxTop);
    const startTop = container.scrollTop;
    const delta = clampedTop - startTop;

    if (Math.abs(delta) < 1 || durationMs <= 0) {
      container.scrollTop = clampedTop;
      return;
    }

    const startTs = performance.now();
    const easeInOutCubic = (t) =>
      t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;

    const step = (nowTs) => {
      const elapsed = nowTs - startTs;
      const progress = clamp(elapsed / durationMs, 0, 1);
      container.scrollTop = startTop + delta * easeInOutCubic(progress);

      if (progress < 1) {
        fastScrollFrame = requestAnimationFrame(step);
      } else {
        fastScrollFrame = 0;
      }
    };

    fastScrollFrame = requestAnimationFrame(step);
  }

  function scrollToPresentDay({ animate = true } = {}) {
    clearSelectedDayCell();

    const nowDate = new Date();
    const presentMonth = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1);
    ensureMonthRendered(presentMonth);

    const todayDayKey = formatDayKey(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
    const todayCell = container.querySelector(`td.day-cell[data-day-key="${todayDayKey}"]`);
    const presentMonthCard = container.querySelector(`[data-month="${monthKey(presentMonth)}"]`);
    const targetElement = todayCell ?? presentMonthCard;
    if (!targetElement) return false;

    const targetTop = resolveElementScrollTop(targetElement, todayCell ? "center" : "start");
    fastScrollTo(targetTop, animate ? FAST_SCROLL_DURATION_MS : 0);
    return true;
  }

  function initialRender() {
    const fragment = document.createDocumentFragment();
    for (let i = -INITIAL_MONTH_SPAN; i <= INITIAL_MONTH_SPAN; i += 1) {
      fragment.appendChild(
        buildMonthCard(
          shiftMonth(currentMonth, i),
          getDayValueByKey,
          todayDayKey,
          activeCalendarType,
        ),
      );
    }
    calendarCanvas.appendChild(fragment);

    earliestMonth = shiftMonth(currentMonth, -INITIAL_MONTH_SPAN);
    latestMonth = shiftMonth(currentMonth, INITIAL_MONTH_SPAN);

    const currentCard = container.querySelector(
      `[data-month="${monthKey(currentMonth)}"]`,
    );
    if (currentCard) {
      currentCard.scrollIntoView({ block: "start" });
    }

    maybeLoadMoreMonths();
    const initialCards = Array.from(container.querySelectorAll(".month-card"));
    applyDefaultLayoutForCards(initialCards, { refreshBase: true });
    scrollToPresentDay({ animate: false });
  }

  container.addEventListener("scroll", () => {
    hideNotesHoverPreview();
    if (framePending) return;

    framePending = true;
    requestAnimationFrame(() => {
      framePending = false;
      maybeLoadMoreMonths();
    });
  });

  container.addEventListener("pointermove", (event) => {
    if (activeCalendarType !== CALENDAR_TYPE_NOTES) {
      setHoveredNotesCell(null);
      return;
    }

    const dayCell = getDayCellFromEventTarget(event.target);
    if (!canShowNotesHoverPreviewForCell(dayCell)) {
      setHoveredNotesCell(null);
      return;
    }

    setHoveredNotesCell(dayCell);
  });

  container.addEventListener("pointerleave", () => {
    setHoveredNotesCell(null);
  });

  container.addEventListener("input", (event) => {
    const eventElement = event.target instanceof Element ? event.target : null;
    const dayScoreSlider = eventElement?.closest("input.day-score-slider");
    if (!(dayScoreSlider instanceof HTMLInputElement) || !container.contains(dayScoreSlider)) {
      const dayNoteInput = eventElement?.closest("textarea.day-note-input");
      if (!(dayNoteInput instanceof HTMLTextAreaElement) || !container.contains(dayNoteInput)) {
        return;
      }

      const dayCell = dayNoteInput.closest("td.day-cell");
      if (!dayCell || !container.contains(dayCell)) return;
      setDayNoteForCell(dayCell, dayNoteInput.value);
      return;
    }

    const dayCell = dayScoreSlider.closest("td.day-cell");
    if (!dayCell || !container.contains(dayCell)) return;
    setDayScoreForCell(dayCell, dayScoreSlider.value);
  });

  container.addEventListener("click", (event) => {
    hideNotesHoverPreview();
    const closeDayButton = event.target.closest("button.day-close-btn");
    if (closeDayButton && container.contains(closeDayButton)) {
      clearSelectedDayCell();
      return;
    }

    const dayScoreControl = event.target.closest(".day-score-row");
    if (dayScoreControl && container.contains(dayScoreControl)) {
      return;
    }

    const dayNoteControl = event.target.closest("textarea.day-note-input");
    if (dayNoteControl && container.contains(dayNoteControl)) {
      return;
    }

    const dayStateButton = event.target.closest("button.day-state-btn");
    if (dayStateButton && container.contains(dayStateButton)) {
      const dayCell = dayStateButton.closest("td.day-cell");
      if (!dayCell || !container.contains(dayCell)) return;
      setDayStateForCell(dayCell, dayStateButton.dataset.state);
      return;
    }

    const dayCell = event.target.closest("td.day-cell");
    if (!dayCell || !container.contains(dayCell)) return;
    if (activeCalendarType === CALENDAR_TYPE_CHECK) {
      toggleDayCheckForCell(dayCell);
      return;
    }
    if (
      activeCalendarType === CALENDAR_TYPE_SIGNAL ||
      activeCalendarType === CALENDAR_TYPE_SCORE
    ) {
      return;
    }
    selectDayCell(dayCell);
  });

  document.addEventListener("click", (event) => {
    hideNotesHoverPreview();
    const clickedElement = event.target instanceof Element ? event.target : null;
    if (clickedElement?.closest("td.day-cell")) return;
    if (clickedElement?.closest("#tweak-controls")) return;
    if (clickedElement?.closest("#mobile-debug-toggle")) return;
    clearSelectedDayCell();
  });

  window.addEventListener("resize", () => {
    if (shouldPreserveNotesViewportOnResize()) {
      return;
    }
    const cards = Array.from(container.querySelectorAll(".month-card"));
    applyDefaultLayoutForCards(cards, { refreshBase: true });
    reapplySelectionFocus();
    if (notesHoverPreview.classList.contains("is-visible") && hoveredNotesCell) {
      updateNotesHoverPreviewPosition(hoveredNotesCell);
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;

    const didClearSelection = clearSelectedDayCell();
    if (didClearSelection) {
      event.preventDefault();
    }
  });

  applyActiveCalendarTypeToContainer();
  initialRender();
  return {
    scrollToPresentDay,
    setActiveCalendar,
    getActiveCalendarId: () => activeCalendarId,
    setPanZoomOnDaySelect,
    getPanZoomOnDaySelect: () => shouldPanZoomOnDaySelect,
    setExpandOnDaySelect,
    getExpandOnDaySelect: () => shouldExpandOnDaySelect,
    setCellExpansionX,
    getCellExpansionX: () => cellExpansionX,
    setCellExpansionY,
    getCellExpansionY: () => cellExpansionY,
    setCellExpansion,
    getCellExpansion: () => cellExpansionX,
    setCameraZoom,
    getCameraZoom: () => cameraZoom,
    setSelectionExpansion,
    getSelectionExpansion: () => cellExpansionX,
  };
}
