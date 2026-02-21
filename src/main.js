import { initInfiniteCalendar } from "./calendar.js";
import { setupTweakControls } from "./tweak-controls.js";
import { setupThemeToggle } from "./theme.js";

const calendarContainer = document.getElementById("calendar-scroll");
const returnToCurrentButton = document.getElementById("return-to-current");
const themeToggleButton = document.getElementById("theme-toggle");

const calendarApi = calendarContainer ? initInfiniteCalendar(calendarContainer) : null;

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

if (calendarContainer && returnToCurrentButton) {
  setupReturnToCurrentButton({
    container: calendarContainer,
    button: returnToCurrentButton,
    onReturn: jumpToPresentDay,
  });
}

setupTweakControls({
  onSelectionExpansionChange: (nextExpansion) => {
    calendarApi?.setSelectionExpansion(nextExpansion);
  },
});
