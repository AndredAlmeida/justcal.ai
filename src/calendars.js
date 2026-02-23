const CALENDARS_STORAGE_KEY = "justcal-calendars";
const DEFAULT_CALENDAR_LABEL = "Energy Tracker";
const DEFAULT_CALENDAR_ID = "energy-tracker";
const DEFAULT_CALENDAR_COLOR = "blue";
const DEFAULT_NEW_CALENDAR_COLOR = "gray";
const CALENDAR_TYPE_SIGNAL = "signal-3";
const CALENDAR_TYPE_SCORE = "score";
const CALENDAR_TYPE_CHECK = "check";
const CALENDAR_TYPE_NOTES = "notes";
const DEFAULT_CALENDAR_TYPE = CALENDAR_TYPE_SIGNAL;
const SCORE_DISPLAY_NUMBER = "number";
const SCORE_DISPLAY_HEATMAP = "heatmap";
const DEFAULT_SCORE_DISPLAY = SCORE_DISPLAY_NUMBER;
const CALENDAR_BUTTON_LABEL = "Open calendars";
const CALENDAR_CLOSE_LABEL = "Close calendars";
const CALENDAR_COLOR_HEX_BY_KEY = Object.freeze({
  gray: "#9ca3af",
  red: "#ef4444",
  orange: "#f97316",
  yellow: "#facc15",
  cyan: "#22d3ee",
  blue: "#3b82f6",
});

function getDefaultCalendar() {
  return {
    id: DEFAULT_CALENDAR_ID,
    name: DEFAULT_CALENDAR_LABEL,
    type: DEFAULT_CALENDAR_TYPE,
    color: DEFAULT_CALENDAR_COLOR,
  };
}

function isObjectLike(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwnProperty(target, key) {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function sanitizeCalendarName(rawName) {
  return String(rawName ?? "").replace(/\s+/g, " ").trim();
}

function normalizeCalendarType(calendarType, fallbackType = DEFAULT_CALENDAR_TYPE) {
  if (typeof calendarType !== "string") {
    return fallbackType;
  }

  const normalizedCalendarType = calendarType.trim().toLowerCase();
  if (normalizedCalendarType === CALENDAR_TYPE_SIGNAL) {
    return CALENDAR_TYPE_SIGNAL;
  }
  if (normalizedCalendarType === CALENDAR_TYPE_SCORE) {
    return CALENDAR_TYPE_SCORE;
  }
  if (normalizedCalendarType === CALENDAR_TYPE_CHECK) {
    return CALENDAR_TYPE_CHECK;
  }
  if (normalizedCalendarType === CALENDAR_TYPE_NOTES) {
    return CALENDAR_TYPE_NOTES;
  }
  return fallbackType;
}

function normalizeCalendarColor(colorKey, fallbackColor = DEFAULT_NEW_CALENDAR_COLOR) {
  if (typeof colorKey === "string" && hasOwnProperty(CALENDAR_COLOR_HEX_BY_KEY, colorKey)) {
    return colorKey;
  }
  return fallbackColor;
}

function normalizeScoreDisplay(
  displayMode,
  fallbackDisplay = DEFAULT_SCORE_DISPLAY,
) {
  if (typeof displayMode !== "string") {
    return fallbackDisplay;
  }

  const normalizedDisplayMode = displayMode.trim().toLowerCase();
  if (normalizedDisplayMode === SCORE_DISPLAY_NUMBER) {
    return SCORE_DISPLAY_NUMBER;
  }
  if (normalizedDisplayMode === SCORE_DISPLAY_HEATMAP) {
    return SCORE_DISPLAY_HEATMAP;
  }
  return fallbackDisplay;
}

function resolveCalendarColorHex(colorKey, fallbackColor = DEFAULT_CALENDAR_COLOR) {
  const normalizedColor = normalizeCalendarColor(colorKey, fallbackColor);
  return CALENDAR_COLOR_HEX_BY_KEY[normalizedColor];
}

function slugifyCalendarName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function createUniqueCalendarId(name, usedIds) {
  const baseId = slugifyCalendarName(name) || "calendar";
  let candidateId = baseId;
  let suffix = 2;
  while (usedIds.has(candidateId)) {
    candidateId = `${baseId}-${suffix}`;
    suffix += 1;
  }
  return candidateId;
}

function normalizeStoredCalendar(rawCalendar, index, usedIds) {
  if (!isObjectLike(rawCalendar)) return null;

  const fallbackName = `Calendar ${index + 1}`;
  const normalizedName = sanitizeCalendarName(rawCalendar.name) || fallbackName;
  const rawId = typeof rawCalendar.id === "string" ? rawCalendar.id.trim() : "";
  const normalizedId =
    rawId && !usedIds.has(rawId) ? rawId : createUniqueCalendarId(normalizedName, usedIds);

  usedIds.add(normalizedId);

  const normalizedCalendarType = normalizeCalendarType(rawCalendar.type);
  const normalizedScoreDisplay = normalizeScoreDisplay(rawCalendar.display);

  return {
    id: normalizedId,
    name: normalizedName,
    type: normalizedCalendarType,
    color: normalizeCalendarColor(rawCalendar.color),
    ...(normalizedCalendarType === CALENDAR_TYPE_SCORE
      ? { display: normalizedScoreDisplay }
      : {}),
  };
}

function loadCalendarsState() {
  const fallbackCalendar = getDefaultCalendar();
  const fallbackState = {
    activeCalendarId: fallbackCalendar.id,
    calendars: [fallbackCalendar],
  };

  try {
    const rawStoredValue = localStorage.getItem(CALENDARS_STORAGE_KEY);
    if (rawStoredValue === null) {
      return fallbackState;
    }

    const parsedState = JSON.parse(rawStoredValue);
    if (!isObjectLike(parsedState)) {
      return fallbackState;
    }

    const storedCalendars = Array.isArray(parsedState.calendars) ? parsedState.calendars : [];
    const usedIds = new Set();
    const normalizedCalendars = storedCalendars
      .map((calendar, index) => normalizeStoredCalendar(calendar, index, usedIds))
      .filter(Boolean);

    const calendars = normalizedCalendars.length > 0 ? normalizedCalendars : [fallbackCalendar];
    const activeCalendarIdRaw =
      typeof parsedState.activeCalendarId === "string"
        ? parsedState.activeCalendarId.trim()
        : "";
    const hasStoredActiveCalendar = calendars.some(
      (calendar) => calendar.id === activeCalendarIdRaw,
    );

    return {
      calendars,
      activeCalendarId: hasStoredActiveCalendar ? activeCalendarIdRaw : calendars[0].id,
    };
  } catch {
    return fallbackState;
  }
}

function saveCalendarsState({ calendars, activeCalendarId }) {
  try {
    localStorage.setItem(
      CALENDARS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        activeCalendarId,
        calendars,
      }),
    );
  } catch {
    // Ignore storage errors and keep behavior in-memory.
  }
}

function createCalendarTypeIconElement(calendarType) {
  const normalizedCalendarType = normalizeCalendarType(calendarType);
  const typeIcon = document.createElement("span");
  typeIcon.className = "calendar-option-type-icon";
  typeIcon.setAttribute("aria-hidden", "true");

  if (normalizedCalendarType === CALENDAR_TYPE_SCORE) {
    typeIcon.classList.add("is-score");
    typeIcon.textContent = "S";
  } else if (normalizedCalendarType === CALENDAR_TYPE_CHECK) {
    typeIcon.classList.add("is-check");
    typeIcon.textContent = "";
  } else if (normalizedCalendarType === CALENDAR_TYPE_NOTES) {
    typeIcon.classList.add("is-notes");
    typeIcon.textContent = "";
  }

  return typeIcon;
}

function createCalendarOptionElement(calendar, isActive) {
  const optionButton = document.createElement("button");
  optionButton.type = "button";
  optionButton.className = "calendar-option calendar-option-main";
  optionButton.classList.toggle("is-active", isActive);
  optionButton.dataset.calendarType = calendar.type;
  optionButton.dataset.calendarId = calendar.id;
  optionButton.setAttribute("aria-label", calendar.name);
  optionButton.setAttribute("aria-pressed", String(isActive));

  const left = document.createElement("span");
  left.className = "calendar-option-left";

  const dot = document.createElement("span");
  dot.className = "calendar-option-dot";
  dot.setAttribute("aria-hidden", "true");
  dot.style.setProperty("--calendar-dot-color", resolveCalendarColorHex(calendar.color));

  const label = document.createElement("span");
  label.className = "calendar-option-label";
  label.textContent = calendar.name;

  const nameWrap = document.createElement("span");
  nameWrap.className = "calendar-option-name-wrap";
  nameWrap.append(label);

  const typeIcon = createCalendarTypeIconElement(calendar.type);
  if (typeIcon) {
    nameWrap.append(typeIcon);
  }

  left.append(dot, nameWrap);

  optionButton.append(left);
  return optionButton;
}

function setCalendarButtonLabel(button, activeCalendar) {
  if (!button) return;

  const nextLabel =
    sanitizeCalendarName(activeCalendar?.name) || DEFAULT_CALENDAR_LABEL;
  const nextDotColor = resolveCalendarColorHex(
    activeCalendar?.color,
    DEFAULT_CALENDAR_COLOR,
  );

  const existingDot = button.querySelector(".calendar-current-dot");
  const existingName = button.querySelector(".calendar-current-name");
  if (existingDot && existingName) {
    existingName.textContent = nextLabel;
    existingDot.style.setProperty("--calendar-dot-color", nextDotColor);
    return;
  }

  button.textContent = "";
  const dot = document.createElement("span");
  dot.className = "calendar-current-dot";
  dot.setAttribute("aria-hidden", "true");
  dot.style.setProperty("--calendar-dot-color", nextDotColor);

  const name = document.createElement("span");
  name.className = "calendar-current-name";
  name.textContent = nextLabel;

  button.append(dot, name);
}

function setCalendarSwitcherExpanded({ switcher, button, activeCalendar, isExpanded }) {
  const activeCalendarLabel =
    sanitizeCalendarName(activeCalendar?.name) || DEFAULT_CALENDAR_LABEL;
  setCalendarButtonLabel(button, activeCalendar);
  switcher.classList.toggle("is-expanded", isExpanded);
  button.setAttribute("aria-expanded", String(isExpanded));
  button.setAttribute(
    "aria-label",
    isExpanded
      ? CALENDAR_CLOSE_LABEL
      : `${CALENDAR_BUTTON_LABEL} (${activeCalendarLabel})`,
  );
}

function setAddCalendarEditorExpanded({
  switcher,
  addShell,
  addEditor,
  addNameInput,
  addTypeSelect,
  addDisplayField,
  addDisplaySelect,
  isExpanded,
} = {}) {
  if (!switcher || !addShell || !addEditor) return;

  switcher.classList.toggle("is-adding", isExpanded);
  addShell.classList.toggle("is-editing", isExpanded);
  addEditor.setAttribute("aria-hidden", String(!isExpanded));

  if (!isExpanded) {
    if (addNameInput) {
      addNameInput.value = "";
    }
    if (addTypeSelect) {
      addTypeSelect.value = DEFAULT_CALENDAR_TYPE;
    }
    if (addDisplaySelect) {
      addDisplaySelect.value = DEFAULT_SCORE_DISPLAY;
    }
    addShell.classList.remove("has-score-display");
    switcher.classList.remove("has-score-display");
  }

  if (addTypeSelect && addDisplayField) {
    const selectedCalendarType = normalizeCalendarType(addTypeSelect.value);
    const shouldShowDisplayField = selectedCalendarType === CALENDAR_TYPE_SCORE;
    switcher.classList.toggle("has-score-display", isExpanded && shouldShowDisplayField);
    addShell.classList.toggle("has-score-display", isExpanded && shouldShowDisplayField);
    addDisplayField.hidden = !shouldShowDisplayField;
    addDisplayField.setAttribute("aria-hidden", String(!shouldShowDisplayField));
    if (!shouldShowDisplayField && addDisplaySelect) {
      addDisplaySelect.value = DEFAULT_SCORE_DISPLAY;
    }
  } else {
    switcher.classList.remove("has-score-display");
    addShell.classList.remove("has-score-display");
  }
}

function setEditCalendarEditorExpanded({
  switcher,
  editShell,
  editEditor,
  editNameInput,
  isExpanded,
} = {}) {
  if (!switcher || !editShell || !editEditor) return;

  switcher.classList.toggle("is-editing-calendar", isExpanded);
  editShell.classList.toggle("is-editing", isExpanded);
  editEditor.setAttribute("aria-hidden", String(!isExpanded));

  if (!isExpanded && editNameInput) {
    editNameInput.value = "";
  }
}

export function setupCalendarSwitcher(button, { onActiveCalendarChange } = {}) {
  const switcher = document.getElementById("calendar-switcher");
  const calendarList = document.getElementById("calendar-list");
  const addShell = document.getElementById("calendar-add-shell");
  const addTrigger = document.getElementById("calendar-add-trigger");
  const addEditor = document.getElementById("calendar-add-editor");
  const addSubmitButton = document.getElementById("calendar-add-submit");
  const addCancelButton = document.getElementById("calendar-add-cancel");
  const addNameInput = document.getElementById("new-calendar-name");
  const addTypeSelect = document.getElementById("new-calendar-type");
  const addDisplayField = document.getElementById("new-calendar-display-field");
  const addDisplaySelect = document.getElementById("new-calendar-display");
  const addColorOptions = document.getElementById("new-calendar-color");
  const addColorButtons = addColorOptions
    ? [...addColorOptions.querySelectorAll(".calendar-color-option")]
    : [];
  const editShell = document.getElementById("calendar-edit-shell");
  const editTrigger = document.getElementById("calendar-edit-trigger");
  const editEditor = document.getElementById("calendar-edit-editor");
  const editForm = document.getElementById("calendar-edit-form");
  const editSaveButton = document.getElementById("calendar-edit-save");
  const editCancelButton = document.getElementById("calendar-edit-cancel");
  const editDeleteButton = document.getElementById("calendar-edit-delete");
  const editNameInput = document.getElementById("edit-calendar-name");
  const editColorOptions = document.getElementById("edit-calendar-color");
  const editColorButtons = editColorOptions
    ? [...editColorOptions.querySelectorAll(".calendar-color-option")]
    : [];
  const deleteConfirmEditor = document.getElementById("calendar-delete-confirm");
  const deleteConfirmName = document.getElementById("calendar-delete-name");
  const deleteConfirmInput = document.getElementById("calendar-delete-confirm-input");
  const deleteConfirmRemoveButton = document.getElementById(
    "calendar-delete-confirm-remove",
  );
  const deleteConfirmCancelButton = document.getElementById(
    "calendar-delete-confirm-cancel",
  );

  if (!switcher || !button || !calendarList) {
    return;
  }

  const flashMissingInput = (targetInput) => {
    if (!targetInput) return;
    targetInput.classList.remove("is-error-flash");
    // Force reflow so repeated clicks replay the animation.
    void targetInput.offsetWidth;
    targetInput.classList.add("is-error-flash");
  };

  const flashMissingName = () => {
    flashMissingInput(addNameInput);
  };

  const flashMissingEditName = () => {
    flashMissingInput(editNameInput);
  };

  const setActiveColor = (nextButton) => {
    if (!nextButton) return;
    addColorButtons.forEach((candidateButton) => {
      const isActive = candidateButton === nextButton;
      candidateButton.classList.toggle("is-active", isActive);
      candidateButton.setAttribute("aria-pressed", String(isActive));
    });
  };

  const defaultColorButton =
    addColorButtons.find((candidateButton) => {
      return candidateButton.dataset.color === DEFAULT_NEW_CALENDAR_COLOR;
    }) || addColorButtons[0];

  const resetAddColor = () => {
    setActiveColor(defaultColorButton);
  };

  const setActiveEditColor = (nextButton) => {
    if (!nextButton) return;
    editColorButtons.forEach((candidateButton) => {
      const isActive = candidateButton === nextButton;
      candidateButton.classList.toggle("is-active", isActive);
      candidateButton.setAttribute("aria-pressed", String(isActive));
    });
  };

  const defaultEditColorButton =
    editColorButtons.find((candidateButton) => {
      return candidateButton.dataset.color === DEFAULT_NEW_CALENDAR_COLOR;
    }) || editColorButtons[0];

  const setEditColorByKey = (colorKey) => {
    const normalizedColor = normalizeCalendarColor(colorKey);
    const matchingButton =
      editColorButtons.find((candidateButton) => {
        return candidateButton.dataset.color === normalizedColor;
      }) || defaultEditColorButton;
    setActiveEditColor(matchingButton);
  };

  const state = loadCalendarsState();
  let calendars = state.calendars;
  let activeCalendarId = state.activeCalendarId;
  let deleteConfirmTargetName = "";
  let deleteConfirmTargetId = "";

  const normalizeCalendarNameForComparison = (calendarName) => {
    return sanitizeCalendarName(calendarName).toLocaleLowerCase();
  };

  const hasCalendarNameCollision = (candidateName, { excludingCalendarId = "" } = {}) => {
    const normalizedCandidateName = normalizeCalendarNameForComparison(candidateName);
    if (!normalizedCandidateName) {
      return false;
    }

    return calendars.some((calendar) => {
      if (excludingCalendarId && calendar.id === excludingCalendarId) {
        return false;
      }
      return normalizeCalendarNameForComparison(calendar.name) === normalizedCandidateName;
    });
  };

  const setDeleteConfirmExpanded = ({ isExpanded, calendarName, calendarId } = {}) => {
    if (!editEditor || !editForm || !deleteConfirmEditor) {
      return;
    }

    const nextCalendarName = sanitizeCalendarName(calendarName) || DEFAULT_CALENDAR_LABEL;
    editEditor.classList.toggle("is-delete-confirming", isExpanded);
    editForm.setAttribute("aria-hidden", String(isExpanded));
    deleteConfirmEditor.setAttribute("aria-hidden", String(!isExpanded));
    if (deleteConfirmName) {
      deleteConfirmName.textContent = isExpanded ? nextCalendarName : "";
    }
    if (deleteConfirmInput) {
      deleteConfirmInput.classList.remove("is-error-flash");
      deleteConfirmInput.value = "";
    }
    deleteConfirmTargetName = isExpanded ? nextCalendarName : "";
    deleteConfirmTargetId = isExpanded ? String(calendarId || "") : "";
  };

  const resolveActiveCalendar = () => {
    return (
      calendars.find((calendar) => calendar.id === activeCalendarId) || calendars[0] || null
    );
  };

  const notifyActiveCalendarChange = () => {
    if (typeof onActiveCalendarChange !== "function") return;
    const activeCalendar = resolveActiveCalendar();
    if (activeCalendar) {
      onActiveCalendarChange(activeCalendar);
    }
  };

  const renderCalendarList = () => {
    const fragment = document.createDocumentFragment();
    calendars.forEach((calendar) => {
      const isActive = calendar.id === activeCalendarId;
      fragment.appendChild(createCalendarOptionElement(calendar, isActive));
    });
    calendarList.replaceChildren(fragment);
  };

  const syncSwitcherButton = () => {
    const activeCalendar = resolveActiveCalendar();
    setCalendarSwitcherExpanded({
      switcher,
      button,
      activeCalendar,
      isExpanded: switcher.classList.contains("is-expanded"),
    });
  };

  const syncDeleteButtonState = () => {
    if (!editDeleteButton) return;
    const hasDeleteTarget = calendars.length > 1;
    editDeleteButton.disabled = !hasDeleteTarget;
    editDeleteButton.setAttribute("aria-disabled", String(!hasDeleteTarget));
  };

  const persistCalendarState = () => {
    saveCalendarsState({
      calendars,
      activeCalendarId,
    });
  };

  const syncCalendarUi = () => {
    renderCalendarList();
    syncSwitcherButton();
    syncDeleteButtonState();
  };

  const setActiveCalendarId = (nextCalendarId) => {
    if (!nextCalendarId) return false;
    const hasCalendar = calendars.some((calendar) => calendar.id === nextCalendarId);
    if (!hasCalendar || nextCalendarId === activeCalendarId) {
      return false;
    }

    activeCalendarId = nextCalendarId;
    persistCalendarState();
    syncCalendarUi();
    notifyActiveCalendarChange();
    return true;
  };

  const resetAddEditor = () => {
    setAddCalendarEditorExpanded({
      switcher,
      addShell,
      addEditor,
      addNameInput,
      addTypeSelect,
      addDisplayField,
      addDisplaySelect,
      isExpanded: false,
    });
    resetAddColor();
  };

  const resetEditEditor = () => {
    setEditCalendarEditorExpanded({
      switcher,
      editShell,
      editEditor,
      editNameInput,
      isExpanded: false,
    });
    setDeleteConfirmExpanded({ isExpanded: false });
    if (editNameInput) {
      editNameInput.classList.remove("is-error-flash");
    }
    setEditColorByKey(DEFAULT_NEW_CALENDAR_COLOR);
  };

  const prefillEditEditorFromActiveCalendar = () => {
    const activeCalendar = resolveActiveCalendar();
    if (!activeCalendar) {
      if (editNameInput) {
        editNameInput.value = "";
      }
      setEditColorByKey(DEFAULT_NEW_CALENDAR_COLOR);
      return;
    }
    if (editNameInput) {
      editNameInput.value = activeCalendar.name;
    }
    setEditColorByKey(activeCalendar.color);
  };

  const removeCalendarById = (calendarId) => {
    if (!calendarId) return false;
    const removeIndex = calendars.findIndex((calendar) => calendar.id === calendarId);
    if (removeIndex < 0) {
      return false;
    }

    const nextCalendars = calendars.filter((calendar) => calendar.id !== calendarId);
    if (nextCalendars.length <= 0) {
      const fallbackCalendar = getDefaultCalendar();
      nextCalendars.push(fallbackCalendar);
    }

    calendars = nextCalendars;

    if (!calendars.some((calendar) => calendar.id === activeCalendarId)) {
      const fallbackIndex = Math.min(removeIndex, calendars.length - 1);
      activeCalendarId = calendars[fallbackIndex].id;
    }
    return true;
  };

  addColorButtons.forEach((colorButton) => {
    colorButton.addEventListener("click", () => {
      setActiveColor(colorButton);
    });
  });

  editColorButtons.forEach((colorButton) => {
    colorButton.addEventListener("click", () => {
      setActiveEditColor(colorButton);
    });
  });

  resetAddEditor();
  resetEditEditor();
  syncCalendarUi();
  saveCalendarsState({
    calendars,
    activeCalendarId,
  });
  notifyActiveCalendarChange();

  calendarList.addEventListener("click", (event) => {
    const optionButton = event.target.closest("button.calendar-option[data-calendar-id]");
    if (!optionButton || !calendarList.contains(optionButton)) {
      return;
    }

    const nextCalendarId = optionButton.dataset.calendarId || "";
    setActiveCalendarId(nextCalendarId);
    resetAddEditor();
    resetEditEditor();
    setCalendarSwitcherExpanded({
      switcher,
      button,
      activeCalendar: resolveActiveCalendar(),
      isExpanded: false,
    });
  });

  if (addTrigger && addShell && addEditor) {
    addTrigger.addEventListener("click", () => {
      resetEditEditor();
      setAddCalendarEditorExpanded({
        switcher,
        addShell,
        addEditor,
        addNameInput,
        addTypeSelect,
        addDisplayField,
        addDisplaySelect,
        isExpanded: true,
      });
      addNameInput?.focus();
    });
  }

  addTypeSelect?.addEventListener("change", () => {
    setAddCalendarEditorExpanded({
      switcher,
      addShell,
      addEditor,
      addNameInput,
      addTypeSelect,
      addDisplayField,
      addDisplaySelect,
      isExpanded: addShell?.classList.contains("is-editing") === true,
    });
  });

  if (editTrigger && editShell && editEditor) {
    editTrigger.addEventListener("click", () => {
      resetAddEditor();
      prefillEditEditorFromActiveCalendar();
      setDeleteConfirmExpanded({ isExpanded: false });
      setEditCalendarEditorExpanded({
        switcher,
        editShell,
        editEditor,
        editNameInput,
        isExpanded: true,
      });
      editNameInput?.focus();
    });
  }

  if (addCancelButton) {
    addCancelButton.addEventListener("click", () => {
      resetAddEditor();
      addTrigger?.focus();
    });
  }

  if (editCancelButton) {
    editCancelButton.addEventListener("click", () => {
      resetEditEditor();
      editTrigger?.focus();
    });
  }

  if (editDeleteButton) {
    editDeleteButton.addEventListener("click", () => {
      const activeCalendar = resolveActiveCalendar();
      if (!activeCalendar || calendars.length <= 1) {
        return;
      }
      setDeleteConfirmExpanded({
        isExpanded: true,
        calendarName: activeCalendar.name,
        calendarId: activeCalendar.id,
      });
      deleteConfirmInput?.focus();
    });
  }

  if (deleteConfirmCancelButton) {
    deleteConfirmCancelButton.addEventListener("click", () => {
      const activeCalendar = resolveActiveCalendar();
      setDeleteConfirmExpanded({
        isExpanded: false,
        calendarName: activeCalendar?.name,
      });
      editDeleteButton?.focus();
    });
  }

  if (deleteConfirmRemoveButton) {
    deleteConfirmRemoveButton.addEventListener("click", () => {
      const activeCalendar = resolveActiveCalendar();
      if (!activeCalendar || calendars.length <= 1) {
        setDeleteConfirmExpanded({ isExpanded: false });
        return;
      }

      const expectedCalendarName = deleteConfirmTargetName || activeCalendar.name;
      const typedCalendarName = deleteConfirmInput?.value ?? "";
      if (typedCalendarName !== expectedCalendarName) {
        flashMissingInput(deleteConfirmInput);
        deleteConfirmInput?.focus();
        return;
      }

      const targetCalendarId = deleteConfirmTargetId || activeCalendar.id;
      const didRemove = removeCalendarById(targetCalendarId);
      if (!didRemove) {
        return;
      }

      persistCalendarState();
      syncCalendarUi();
      notifyActiveCalendarChange();

      resetEditEditor();
      setCalendarSwitcherExpanded({
        switcher,
        button,
        activeCalendar: resolveActiveCalendar(),
        isExpanded: false,
      });
      button.focus();
    });
  }

  addNameInput?.addEventListener("input", () => {
    addNameInput.classList.remove("is-error-flash");
  });

  editNameInput?.addEventListener("input", () => {
    editNameInput.classList.remove("is-error-flash");
  });

  deleteConfirmInput?.addEventListener("input", () => {
    deleteConfirmInput.classList.remove("is-error-flash");
  });

  addNameInput?.addEventListener("animationend", (event) => {
    if (event.animationName !== "calendar-add-input-error-flash") {
      return;
    }
    addNameInput.classList.remove("is-error-flash");
  });

  editNameInput?.addEventListener("animationend", (event) => {
    if (event.animationName !== "calendar-add-input-error-flash") {
      return;
    }
    editNameInput.classList.remove("is-error-flash");
  });

  deleteConfirmInput?.addEventListener("animationend", (event) => {
    if (event.animationName !== "calendar-add-input-error-flash") {
      return;
    }
    deleteConfirmInput.classList.remove("is-error-flash");
  });

  if (addSubmitButton) {
    addSubmitButton.addEventListener("click", () => {
      const nextName = sanitizeCalendarName(addNameInput?.value);
      if (!nextName) {
        flashMissingName();
        addNameInput?.focus();
        return;
      }
      if (hasCalendarNameCollision(nextName)) {
        flashMissingName();
        addNameInput?.focus();
        return;
      }

      const usedIds = new Set(calendars.map((calendar) => calendar.id));
      const selectedColorButton = addColorButtons.find((candidateButton) => {
        return candidateButton.classList.contains("is-active");
      });
      const nextCalendarType = normalizeCalendarType(addTypeSelect?.value);

      const nextCalendar = {
        id: createUniqueCalendarId(nextName, usedIds),
        name: nextName,
        type: nextCalendarType,
        color: normalizeCalendarColor(selectedColorButton?.dataset.color),
        ...(nextCalendarType === CALENDAR_TYPE_SCORE
          ? {
              display: normalizeScoreDisplay(addDisplaySelect?.value),
            }
          : {}),
      };

      calendars = [...calendars, nextCalendar];
      activeCalendarId = nextCalendar.id;

      persistCalendarState();
      syncCalendarUi();
      notifyActiveCalendarChange();

      resetAddEditor();
      setCalendarSwitcherExpanded({
        switcher,
        button,
        activeCalendar: resolveActiveCalendar(),
        isExpanded: false,
      });
      button.focus();
    });
  }

  if (editSaveButton) {
    editSaveButton.addEventListener("click", () => {
      const activeCalendar = resolveActiveCalendar();
      if (!activeCalendar) {
        return;
      }

      const nextName = sanitizeCalendarName(editNameInput?.value);
      if (!nextName) {
        flashMissingEditName();
        editNameInput?.focus();
        return;
      }
      if (
        hasCalendarNameCollision(nextName, {
          excludingCalendarId: activeCalendar.id,
        })
      ) {
        flashMissingEditName();
        editNameInput?.focus();
        return;
      }

      const selectedColorButton = editColorButtons.find((candidateButton) => {
        return candidateButton.classList.contains("is-active");
      });
      const nextColor = normalizeCalendarColor(selectedColorButton?.dataset.color);

      calendars = calendars.map((calendar) => {
        if (calendar.id !== activeCalendar.id) {
          return calendar;
        }
        return {
          ...calendar,
          name: nextName,
          color: nextColor,
        };
      });

      persistCalendarState();
      syncCalendarUi();
      notifyActiveCalendarChange();

      resetEditEditor();
      setCalendarSwitcherExpanded({
        switcher,
        button,
        activeCalendar: resolveActiveCalendar(),
        isExpanded: false,
      });
      button.focus();
    });
  }

  button.addEventListener("click", () => {
    const isExpanded = switcher.classList.contains("is-expanded");
    const nextExpanded = !isExpanded;
    if (!nextExpanded) {
      resetAddEditor();
      resetEditEditor();
    }
    setCalendarSwitcherExpanded({
      switcher,
      button,
      activeCalendar: resolveActiveCalendar(),
      isExpanded: nextExpanded,
    });
  });

  document.addEventListener("click", (event) => {
    if (!switcher.classList.contains("is-expanded")) {
      return;
    }
    if (switcher.contains(event.target)) {
      return;
    }
    resetAddEditor();
    resetEditEditor();
    setCalendarSwitcherExpanded({
      switcher,
      button,
      activeCalendar: resolveActiveCalendar(),
      isExpanded: false,
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    if (!switcher.classList.contains("is-expanded")) {
      return;
    }
    resetAddEditor();
    resetEditEditor();
    setCalendarSwitcherExpanded({
      switcher,
      button,
      activeCalendar: resolveActiveCalendar(),
      isExpanded: false,
    });
    button.focus();
  });
}
