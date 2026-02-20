import { initInfiniteCalendar } from "./calendar.js";
import { setupTweakControls } from "./tweak-controls.js";
import { setupThemeToggle } from "./theme.js";

const calendarContainer = document.getElementById("calendar-scroll");
const panelToggleButton = document.getElementById("panel-toggle");
const todayToggleButton = document.getElementById("today-toggle");
const themeToggleButton = document.getElementById("theme-toggle");

const calendarApi = calendarContainer ? initInfiniteCalendar(calendarContainer) : null;

if (themeToggleButton) {
  setupThemeToggle(themeToggleButton);
}

if (todayToggleButton) {
  todayToggleButton.addEventListener("click", () => {
    calendarApi?.scrollToPresentDay?.();
  });
}

setupTweakControls({
  panelToggleButton,
  onSelectionExpansionChange: (nextExpansion) => {
    calendarApi?.setSelectionExpansion(nextExpansion);
  },
});
