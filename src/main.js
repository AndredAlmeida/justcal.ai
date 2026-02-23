import { initInfiniteCalendar } from "./calendar.js";
import { getStoredActiveCalendar, setupCalendarSwitcher } from "./calendars.js";
import { setupTweakControls } from "./tweak-controls.js";
import { setupThemeToggle } from "./theme.js";

const calendarContainer = document.getElementById("calendar-scroll");
const headerCalendarsButton = document.getElementById("header-calendars-btn");
const returnToCurrentButton = document.getElementById("return-to-current");
const themeToggleButton = document.getElementById("theme-toggle");
const mobileDebugToggleButton = document.getElementById("mobile-debug-toggle");
const rootStyle = document.documentElement.style;
const initialActiveCalendar = getStoredActiveCalendar();

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

const calendarApi = calendarContainer
  ? initInfiniteCalendar(calendarContainer, {
      initialActiveCalendar,
    })
  : null;

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

const jumpToPresentDay = () => {
  calendarApi?.scrollToPresentDay?.();
};

if (themeToggleButton) {
  setupThemeToggle(themeToggleButton);
}

if (headerCalendarsButton) {
  setupCalendarSwitcher(headerCalendarsButton, {
    onActiveCalendarChange: (calendar) => {
      calendarApi?.setActiveCalendar(calendar);
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
