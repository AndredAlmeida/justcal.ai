const DEFAULT_CALENDAR_LABEL = "Energy Tracker";
const CALENDAR_BUTTON_LABEL = "Open calendars";
const CALENDAR_CLOSE_LABEL = "Close calendars";

function resolveCurrentCalendarLabel(switcher) {
  const activeCalendarButton = switcher?.querySelector(
    ".calendar-option.is-active[data-calendar-type]",
  );
  const activeLabel =
    activeCalendarButton
      ?.querySelector(".calendar-option-label")
      ?.textContent?.trim() || activeCalendarButton?.textContent?.trim();
  if (activeLabel) {
    return activeLabel;
  }
  return DEFAULT_CALENDAR_LABEL;
}

function setCalendarButtonLabel(button, nextLabel) {
  if (!button) return;

  const existingDot = button.querySelector(".calendar-current-dot");
  const existingName = button.querySelector(".calendar-current-name");
  if (existingDot && existingName) {
    existingName.textContent = nextLabel;
    return;
  }

  button.textContent = "";
  const dot = document.createElement("span");
  dot.className = "calendar-current-dot";
  dot.setAttribute("aria-hidden", "true");

  const name = document.createElement("span");
  name.className = "calendar-current-name";
  name.textContent = nextLabel;

  button.append(dot, name);
}

function setCalendarSwitcherExpanded({ switcher, button, isExpanded }) {
  const currentCalendarLabel = resolveCurrentCalendarLabel(switcher);
  setCalendarButtonLabel(button, currentCalendarLabel);
  switcher.classList.toggle("is-expanded", isExpanded);
  button.setAttribute("aria-expanded", String(isExpanded));
  button.setAttribute(
    "aria-label",
    isExpanded
      ? CALENDAR_CLOSE_LABEL
      : `${CALENDAR_BUTTON_LABEL} (${currentCalendarLabel})`,
  );
}

function setAddCalendarEditorExpanded({
  switcher,
  addShell,
  addEditor,
  addNameInput,
  isExpanded,
} = {}) {
  if (!switcher || !addShell || !addEditor) {
    return;
  }

  switcher.classList.toggle("is-adding", isExpanded);
  addShell.classList.toggle("is-editing", isExpanded);
  addEditor.setAttribute("aria-hidden", String(!isExpanded));

  if (!isExpanded && addNameInput) {
    addNameInput.value = "";
  }
}

export function setupCalendarSwitcher(button) {
  const switcher = document.getElementById("calendar-switcher");
  const addShell = document.getElementById("calendar-add-shell");
  const addTrigger = document.getElementById("calendar-add-trigger");
  const addEditor = document.getElementById("calendar-add-editor");
  const addCancelButton = document.getElementById("calendar-add-cancel");
  const addNameInput = document.getElementById("new-calendar-name");

  if (!switcher || !button) {
    return;
  }

  const resetAddEditor = () => {
    setAddCalendarEditorExpanded({
      switcher,
      addShell,
      addEditor,
      addNameInput,
      isExpanded: false,
    });
  };

  resetAddEditor();
  setCalendarSwitcherExpanded({ switcher, button, isExpanded: false });

  if (addTrigger && addShell && addEditor) {
    addTrigger.addEventListener("click", () => {
      setAddCalendarEditorExpanded({
        switcher,
        addShell,
        addEditor,
        addNameInput,
        isExpanded: true,
      });
      addNameInput?.focus();
    });
  }

  if (addCancelButton) {
    addCancelButton.addEventListener("click", () => {
      resetAddEditor();
      addTrigger?.focus();
    });
  }

  button.addEventListener("click", () => {
    const isExpanded = switcher.classList.contains("is-expanded");
    const nextExpanded = !isExpanded;
    if (!nextExpanded) {
      resetAddEditor();
    }
    setCalendarSwitcherExpanded({ switcher, button, isExpanded: nextExpanded });
  });

  document.addEventListener("click", (event) => {
    if (!switcher.classList.contains("is-expanded")) {
      return;
    }
    if (switcher.contains(event.target)) {
      return;
    }
    resetAddEditor();
    setCalendarSwitcherExpanded({ switcher, button, isExpanded: false });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    if (!switcher.classList.contains("is-expanded")) {
      return;
    }
    resetAddEditor();
    setCalendarSwitcherExpanded({ switcher, button, isExpanded: false });
    button.focus();
  });
}
