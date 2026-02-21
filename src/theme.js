const THEME_STORAGE_KEY = "justcal-theme";
const THEME_BUTTON_LABEL = "Themes";
const THEME_COLORS = {
  light: "#f8fafc",
  dark: "#020617",
};

function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures and keep toggle behavior in-memory.
  }
}

function applyTheme({ theme, root, button, themeColorMeta }) {
  const isDark = theme === "dark";
  root.classList.toggle("dark", isDark);
  document.body.classList.toggle("dark", isDark);

  button.setAttribute("aria-label", THEME_BUTTON_LABEL);
  button.setAttribute("data-tooltip", THEME_BUTTON_LABEL);
  button.removeAttribute("title");
  button.setAttribute("aria-pressed", String(isDark));

  if (themeColorMeta) {
    themeColorMeta.setAttribute(
      "content",
      isDark ? THEME_COLORS.dark : THEME_COLORS.light,
    );
  }
}

export function setupThemeToggle(button) {
  const root = document.documentElement;
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');

  const savedTheme = getStoredTheme();
  if (savedTheme === "dark" || savedTheme === "light") {
    applyTheme({ theme: savedTheme, root, button, themeColorMeta });
  } else {
    applyTheme({ theme: "dark", root, button, themeColorMeta });
  }

  button.addEventListener("click", () => {
    const nextTheme = root.classList.contains("dark") ? "light" : "dark";
    applyTheme({ theme: nextTheme, root, button, themeColorMeta });
    setStoredTheme(nextTheme);
  });
}
