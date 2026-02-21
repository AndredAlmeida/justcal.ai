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

export const MIN_SELECTION_EXPANSION = 1;
export const MAX_SELECTION_EXPANSION = 3;
export const DEFAULT_SELECTION_EXPANSION = 1.68;
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
export const DEFAULT_CAMERA_ZOOM = 1.68;

const DAY_STATE_STORAGE_KEY = "justcal-day-states";
const DAY_STATES = ["x", "red", "yellow", "green"];
const DEFAULT_DAY_STATE = "x";

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
  return DAY_STATES.includes(value) ? value : DEFAULT_DAY_STATE;
}

function loadDayStates() {
  try {
    const rawValue = localStorage.getItem(DAY_STATE_STORAGE_KEY);
    if (rawValue === null) return {};

    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function saveDayStates(dayStatesByKey) {
  try {
    localStorage.setItem(DAY_STATE_STORAGE_KEY, JSON.stringify(dayStatesByKey));
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
    button.textContent = "X";
    button.setAttribute("aria-label", "Mark day as X");
    button.title = "X";
  } else {
    button.setAttribute("aria-label", `Mark day as ${state}`);
    button.title = state[0].toUpperCase() + state.slice(1);
  }

  return button;
}

function applyDayStateToCell(cell, dayState) {
  const normalizedState = normalizeDayState(dayState);
  cell.dataset.dayState = normalizedState;

  const stateButtons = cell.querySelectorAll(".day-state-btn");
  stateButtons.forEach((button) => {
    const isActive = button.dataset.state === normalizedState;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function buildMonthCard(monthStart, getDayStateByKey, todayDayKey) {
  const year = monthStart.getFullYear();
  const monthIndex = monthStart.getMonth();
  const totalDays = daysInMonth(year, monthIndex);
  const firstWeekday = new Date(year, monthIndex, 1).getDay();

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
        const dayState = getDayStateByKey(dayKeyValue);
        td.dataset.dayKey = dayKeyValue;
        td.dataset.dayState = dayState;
        if (dayKeyValue === todayDayKey) {
          td.classList.add("today-cell");
        }

        const dayCellContent = document.createElement("div");
        dayCellContent.className = "day-cell-content";

        const dayNumberLabel = document.createElement("span");
        dayNumberLabel.className = "day-number";
        dayNumberLabel.textContent = String(dayNumber);
        dayCellContent.appendChild(dayNumberLabel);

        const dayStateRow = document.createElement("div");
        dayStateRow.className = "day-state-row";

        DAY_STATES.forEach((state) => {
          const dayStateButton = createDayStateButton(state, state === dayState);
          dayStateRow.appendChild(dayStateButton);
        });

        dayCellContent.appendChild(dayStateRow);
        td.appendChild(dayCellContent);

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

export function initInfiniteCalendar(container) {
  const now = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const todayDayKey = formatDayKey(now.getFullYear(), now.getMonth(), now.getDate());
  const dayStatesByKey = loadDayStates();
  const tableBaseLayoutMap = new WeakMap();
  const calendarCanvas = document.createElement("div");
  calendarCanvas.id = "calendar-canvas";
  container.appendChild(calendarCanvas);

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

  function getDayStateByKey(dayKeyValue) {
    return normalizeDayState(dayStatesByKey[dayKeyValue]);
  }

  function setDayStateForCell(cell, nextState) {
    const dayKeyValue = cell.dataset.dayKey;
    if (!dayKeyValue) return;

    const normalizedState = normalizeDayState(nextState);
    dayStatesByKey[dayKeyValue] = normalizedState;
    applyDayStateToCell(cell, normalizedState);
    saveDayStates(dayStatesByKey);
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
    const minOtherRowHeight = bodyHeight * MIN_OTHER_ROW_HEIGHT_RATIO;
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

    const elementRect = element.getBoundingClientRect();
    const canvasRect = calendarCanvas.getBoundingClientRect();
    return {
      left: elementRect.left - canvasRect.left,
      top: elementRect.top - canvasRect.top,
      width: elementRect.width,
      height: elementRect.height,
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

  function clearCanvasZoom({ immediate = false } = {}) {
    cleanupZoomResetListeners();
    container.classList.remove("is-zoomed");

    const finishReset = () => {
      cleanupZoomResetListeners();
      calendarCanvas.style.transformOrigin = "";
      calendarCanvas.style.transform = "";
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
    calendarCanvas.style.transform = "translate(0px, 0px) scale(1)";
    zoomResetTimer = window.setTimeout(finishReset, 300);
  }

  function applyCanvasZoomForCell(cell) {
    if (!cell || !cell.isConnected) return;

    clearCanvasZoom({ immediate: true });
    const scale = clamp(cameraZoom, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
    const containerRect = container.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    const cellCenterX = cellRect.left - containerRect.left + cellRect.width / 2;
    const cellCenterY = cellRect.top - containerRect.top + cellRect.height / 2;
    const targetX = container.clientWidth / 2 - cellCenterX;
    const targetY = container.clientHeight / 2 - cellCenterY;

    requestAnimationFrame(() => {
      if (!cell.isConnected || selectedCell !== cell) return;
      const rect = getElementRectWithinCanvas(cell);
      if (!rect) return;

      const originX = rect.left + rect.width / 2;
      const originY = rect.top + rect.height / 2;

      container.classList.add("is-zoomed");
      calendarCanvas.style.transformOrigin = `${originX}px ${originY}px`;
      calendarCanvas.style.transform = `translate(${targetX}px, ${targetY}px) scale(${scale})`;
    });
  }

  function reapplySelectionFocus() {
    if (!selectedCell || !selectedCell.isConnected) return;
    const table = selectedCell.closest("table");
    const rowIndex = Number(selectedCell.parentElement?.dataset.rowIndex ?? -1);
    const colIndex = Number(selectedCell.dataset.colIndex ?? -1);
    if (table && rowIndex >= 0 && colIndex >= 0) {
      applyTableSelectionLayout(table, rowIndex, colIndex);
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

  function clearSelectedDayCell() {
    if (!selectedCell) return false;

    const previousCell = selectedCell;
    selectedCell = null;
    previousCell.classList.remove("selected-day");
    const previousTable = previousCell.closest("table");
    if (previousTable) {
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
      selectedCell.classList.remove("selected-day");
    }
    selectedCell = cell;
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
        applyTableSelectionLayout(table, rowIndex, colIndex);
        applyCanvasZoomForCell(selectedCell);
      });
      return;
    }

    applyCanvasZoomForCell(selectedCell);
  }

  function appendFutureMonths(count) {
    const fragment = document.createDocumentFragment();
    const addedCards = [];
    for (let i = 1; i <= count; i += 1) {
      const card = buildMonthCard(shiftMonth(latestMonth, i), getDayStateByKey, todayDayKey);
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
      const card = buildMonthCard(shiftMonth(earliestMonth, -i), getDayStateByKey, todayDayKey);
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
      fragment.appendChild(buildMonthCard(shiftMonth(currentMonth, i), getDayStateByKey, todayDayKey));
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
    if (framePending) return;

    framePending = true;
    requestAnimationFrame(() => {
      framePending = false;
      maybeLoadMoreMonths();
    });
  });

  container.addEventListener("click", (event) => {
    const dayStateButton = event.target.closest("button.day-state-btn");
    if (dayStateButton && container.contains(dayStateButton)) {
      const dayCell = dayStateButton.closest("td.day-cell");
      if (!dayCell || !container.contains(dayCell)) return;
      setDayStateForCell(dayCell, dayStateButton.dataset.state);
      return;
    }

    const dayCell = event.target.closest("td.day-cell");
    if (!dayCell || !container.contains(dayCell)) return;
    selectDayCell(dayCell);
  });

  document.addEventListener("click", (event) => {
    const clickedElement = event.target instanceof Element ? event.target : null;
    if (clickedElement?.closest("td.day-cell")) return;
    clearSelectedDayCell();
  });

  window.addEventListener("resize", () => {
    const cards = Array.from(container.querySelectorAll(".month-card"));
    applyDefaultLayoutForCards(cards, { refreshBase: true });
    reapplySelectionFocus();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;

    const didClearSelection = clearSelectedDayCell();
    if (didClearSelection) {
      event.preventDefault();
    }
  });

  initialRender();
  return {
    scrollToPresentDay,
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
