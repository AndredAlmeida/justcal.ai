import {
  DEFAULT_SELECTION_EXPANSION,
  MAX_SELECTION_EXPANSION,
  MIN_SELECTION_EXPANSION,
} from "./calendar.js";

const SELECTION_EXPANSION_STORAGE_KEY = "justcal-selection-expansion";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getStoredSelectionExpansion() {
  try {
    const rawValue = localStorage.getItem(SELECTION_EXPANSION_STORAGE_KEY);
    if (rawValue === null) return null;
    const numericValue = Number(rawValue);
    return Number.isFinite(numericValue) ? numericValue : null;
  } catch {
    return null;
  }
}

function saveSelectionExpansion(value) {
  try {
    localStorage.setItem(SELECTION_EXPANSION_STORAGE_KEY, String(value));
  } catch {
    // Ignore storage failures; controls still work in-memory.
  }
}

function setPanelExpandedState(button, panel, isExpanded) {
  if (!button || !panel) return;
  panel.hidden = !isExpanded;

  const panelAction = isExpanded ? "Hide" : "Show";
  button.setAttribute("aria-expanded", String(isExpanded));
  button.setAttribute("aria-label", `${panelAction} day expansion panel`);
  button.setAttribute("title", `${panelAction} day expansion panel`);
}

export function setupTweakControls({
  panelToggleButton,
  onSelectionExpansionChange,
} = {}) {
  const controlsPanel = document.getElementById("tweak-controls");
  const expansionInput = document.getElementById("selection-expand");
  const expansionOutput = document.getElementById("selection-expand-value");

  setPanelExpandedState(panelToggleButton, controlsPanel, false);
  if (panelToggleButton && controlsPanel) {
    panelToggleButton.addEventListener("click", () => {
      setPanelExpandedState(panelToggleButton, controlsPanel, controlsPanel.hidden);
    });
  }

  if (!expansionInput) return;
  expansionInput.min = String(MIN_SELECTION_EXPANSION);
  expansionInput.max = String(MAX_SELECTION_EXPANSION);

  const storedValue = getStoredSelectionExpansion();
  const initialValue = clamp(
    storedValue ?? DEFAULT_SELECTION_EXPANSION,
    MIN_SELECTION_EXPANSION,
    MAX_SELECTION_EXPANSION,
  );

  function applyValue(nextValue) {
    const clampedValue = clamp(
      Number(nextValue),
      MIN_SELECTION_EXPANSION,
      MAX_SELECTION_EXPANSION,
    );
    expansionInput.value = String(clampedValue);
    if (expansionOutput) {
      expansionOutput.textContent = `${clampedValue.toFixed(2)}x`;
    }
    onSelectionExpansionChange?.(clampedValue);
    saveSelectionExpansion(clampedValue);
  }

  applyValue(initialValue);
  expansionInput.addEventListener("input", () => {
    applyValue(expansionInput.value);
  });
}
