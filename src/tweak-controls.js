import {
  DEFAULT_CAMERA_ZOOM,
  DEFAULT_CELL_EXPANSION_X,
  DEFAULT_CELL_EXPANSION_Y,
  MAX_CAMERA_ZOOM,
  MAX_CELL_EXPANSION_X,
  MAX_CELL_EXPANSION_Y,
  MIN_CAMERA_ZOOM,
  MIN_CELL_EXPANSION_X,
  MIN_CELL_EXPANSION_Y,
} from "./calendar.js";

const CELL_EXPANSION_X_STORAGE_KEY = "justcal-cell-expansion-x";
const CELL_EXPANSION_Y_STORAGE_KEY = "justcal-cell-expansion-y";
const CAMERA_ZOOM_STORAGE_KEY = "justcal-camera-zoom";
const LEGACY_CELL_EXPANSION_STORAGE_KEY = "justcal-cell-expansion";
const LEGACY_SELECTION_EXPANSION_STORAGE_KEY = "justcal-selection-expansion";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getStoredNumericValue(storageKey) {
  try {
    const rawValue = localStorage.getItem(storageKey);
    if (rawValue === null) return null;
    const numericValue = Number(rawValue);
    return Number.isFinite(numericValue) ? numericValue : null;
  } catch {
    return null;
  }
}

function saveNumericValue(storageKey, value) {
  try {
    localStorage.setItem(storageKey, String(value));
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
  onCellExpansionXChange,
  onCellExpansionYChange,
  onCellExpansionChange,
  onCameraZoomChange,
  onSelectionExpansionChange,
} = {}) {
  const controlsPanel = document.getElementById("tweak-controls");
  const cameraZoomInput = document.getElementById("selection-camera-zoom");
  const cameraZoomOutput = document.getElementById("selection-camera-zoom-value");
  const expansionXInput = document.getElementById("selection-expand-x");
  const expansionXOutput = document.getElementById("selection-expand-x-value");
  const expansionYInput = document.getElementById("selection-expand-y");
  const expansionYOutput = document.getElementById("selection-expand-y-value");

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

  if (cameraZoomInput) {
    cameraZoomInput.min = String(MIN_CAMERA_ZOOM);
    cameraZoomInput.max = String(MAX_CAMERA_ZOOM);
  }
  if (expansionXInput) {
    expansionXInput.min = String(MIN_CELL_EXPANSION_X);
    expansionXInput.max = String(MAX_CELL_EXPANSION_X);
  }
  if (expansionYInput) {
    expansionYInput.min = String(MIN_CELL_EXPANSION_Y);
    expansionYInput.max = String(MAX_CELL_EXPANSION_Y);
  }

  const storedCameraZoom = getStoredNumericValue(CAMERA_ZOOM_STORAGE_KEY);
  const legacyCellExpansion = getStoredNumericValue(
    LEGACY_CELL_EXPANSION_STORAGE_KEY,
  );
  const legacySelectionExpansion = getStoredNumericValue(
    LEGACY_SELECTION_EXPANSION_STORAGE_KEY,
  );
  const legacyExpansionValue = legacyCellExpansion ?? legacySelectionExpansion;
  const initialCameraZoom = clamp(
    storedCameraZoom ?? legacyExpansionValue ?? DEFAULT_CAMERA_ZOOM,
    MIN_CAMERA_ZOOM,
    MAX_CAMERA_ZOOM,
  );

  const storedCellExpansionX = getStoredNumericValue(CELL_EXPANSION_X_STORAGE_KEY);
  const initialCellExpansionX = clamp(
    storedCellExpansionX ?? legacyExpansionValue ?? DEFAULT_CELL_EXPANSION_X,
    MIN_CELL_EXPANSION_X,
    MAX_CELL_EXPANSION_X,
  );

  const storedCellExpansionY = getStoredNumericValue(CELL_EXPANSION_Y_STORAGE_KEY);
  const initialCellExpansionY = clamp(
    storedCellExpansionY ?? legacyExpansionValue ?? DEFAULT_CELL_EXPANSION_Y,
    MIN_CELL_EXPANSION_Y,
    MAX_CELL_EXPANSION_Y,
  );

  const hasAxisExpansionHandlers =
    typeof onCellExpansionXChange === "function" ||
    typeof onCellExpansionYChange === "function";

  function applyCameraZoom(nextValue) {
    if (!cameraZoomInput) return;
    const clampedValue = clamp(
      Number(nextValue),
      MIN_CAMERA_ZOOM,
      MAX_CAMERA_ZOOM,
    );
    cameraZoomInput.value = String(clampedValue);
    if (cameraZoomOutput) {
      cameraZoomOutput.textContent = `${clampedValue.toFixed(2)}x`;
    }
    onCameraZoomChange?.(clampedValue);
    saveNumericValue(CAMERA_ZOOM_STORAGE_KEY, clampedValue);
  }

  function notifyLegacyExpansionHandlers(value) {
    onCellExpansionChange?.(value);
    onSelectionExpansionChange?.(value);
  }

  function applyCellExpansionX(nextValue) {
    if (!expansionXInput) return;
    const clampedValue = clamp(
      Number(nextValue),
      MIN_CELL_EXPANSION_X,
      MAX_CELL_EXPANSION_X,
    );
    expansionXInput.value = String(clampedValue);
    if (expansionXOutput) {
      expansionXOutput.textContent = `${clampedValue.toFixed(2)}x`;
    }
    onCellExpansionXChange?.(clampedValue);
    if (!hasAxisExpansionHandlers) {
      notifyLegacyExpansionHandlers(clampedValue);
    }
    saveNumericValue(CELL_EXPANSION_X_STORAGE_KEY, clampedValue);
  }

  function applyCellExpansionY(nextValue) {
    if (!expansionYInput) return;
    const clampedValue = clamp(
      Number(nextValue),
      MIN_CELL_EXPANSION_Y,
      MAX_CELL_EXPANSION_Y,
    );
    expansionYInput.value = String(clampedValue);
    if (expansionYOutput) {
      expansionYOutput.textContent = `${clampedValue.toFixed(2)}x`;
    }
    onCellExpansionYChange?.(clampedValue);
    if (!hasAxisExpansionHandlers) {
      notifyLegacyExpansionHandlers(clampedValue);
    }
    saveNumericValue(CELL_EXPANSION_Y_STORAGE_KEY, clampedValue);
  }

  if (cameraZoomInput) {
    applyCameraZoom(initialCameraZoom);
    cameraZoomInput.addEventListener("input", () => {
      applyCameraZoom(cameraZoomInput.value);
    });
  }

  if (expansionXInput) {
    applyCellExpansionX(initialCellExpansionX);
    expansionXInput.addEventListener("input", () => {
      applyCellExpansionX(expansionXInput.value);
    });
  }

  if (expansionYInput) {
    applyCellExpansionY(initialCellExpansionY);
    expansionYInput.addEventListener("input", () => {
      applyCellExpansionY(expansionYInput.value);
    });
  }
}
