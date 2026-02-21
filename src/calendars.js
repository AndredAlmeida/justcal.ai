const CALENDAR_BUTTON_LABEL = "Calendars";
const CALENDAR_CLOSE_LABEL = "Close calendars";

function setCalendarSwitcherExpanded({ switcher, button, isExpanded }) {
  switcher.classList.toggle("is-expanded", isExpanded);
  button.setAttribute("aria-expanded", String(isExpanded));
  button.setAttribute("aria-label", isExpanded ? CALENDAR_CLOSE_LABEL : CALENDAR_BUTTON_LABEL);
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
