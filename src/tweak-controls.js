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

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  return Boolean(target.closest("input, textarea, select"));
}

function animatePanelEntry(panel) {
  panel.classList.remove("is-entering");
  panel.classList.add("is-entering");
  // Force reflow, then remove the class on the next frame so it animates upward.
  void panel.offsetWidth;
  requestAnimationFrame(() => {
    panel.classList.remove("is-entering");
  });
}

function setPanelExpandedState(button, panel, isExpanded) {
  if (!panel) return;

  if (isExpanded) {
    panel.hidden = false;
    animatePanelEntry(panel);
  } else {
    panel.classList.remove("is-entering");
    panel.hidden = true;
  }

  const panelAction = isExpanded ? "Hide" : "Show";
  if (button) {
    button.setAttribute("aria-expanded", String(isExpanded));
    button.setAttribute("aria-label", `${panelAction} developer controls`);
    button.setAttribute("title", `${panelAction} developer controls`);
  }
}

export function setupTweakControls({
  panelToggleButton,
  onSelectionExpansionChange,
} = {}) {
  const controlsPanel = document.getElementById("tweak-controls");
  const expansionInput = document.getElementById("selection-expand");
  const expansionOutput = document.getElementById("selection-expand-value");

  setPanelExpandedState(panelToggleButton, controlsPanel, false);
  const toggleControlsPanel = () => {
    if (!controlsPanel) return;
    setPanelExpandedState(
      panelToggleButton,
      controlsPanel,
      controlsPanel.hidden,
    );
  };

  if (panelToggleButton && controlsPanel) {
    panelToggleButton.addEventListener("click", toggleControlsPanel);
  }

  if (controlsPanel) {
    document.addEventListener("keydown", (event) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() !== "p") return;
      if (isTypingTarget(event.target)) return;

      event.preventDefault();
      toggleControlsPanel();
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
