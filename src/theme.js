const THEME_STORAGE_KEY = "justcal-theme";
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

  const toggleLabel = isDark ? "Switch to light mode" : "Switch to dark mode";
  button.setAttribute("aria-label", toggleLabel);
  button.setAttribute("title", toggleLabel);
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
    const prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme({
      theme: prefersDark ? "dark" : "light",
      root,
      button,
      themeColorMeta,
    });
  }

  button.addEventListener("click", () => {
    const nextTheme = root.classList.contains("dark") ? "light" : "dark";
    applyTheme({ theme: nextTheme, root, button, themeColorMeta });
    setStoredTheme(nextTheme);
  });
}
