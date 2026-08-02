/**
 * Global theme controller — single source of truth for light/dark mode.
 * Preference key: localStorage.minime_theme = "dark" | "light"
 * Legacy keys (darkMode, theme) are migrated once.
 */
(function (global) {
  "use strict";

  const STORAGE_KEY = "minime_theme";

  function migrateLegacy() {
    if (localStorage.getItem(STORAGE_KEY)) return;
    const legacyDark = localStorage.getItem("darkMode");
    const legacyTheme = localStorage.getItem("theme");
    if (legacyDark === "true" || legacyTheme === "dark") {
      localStorage.setItem(STORAGE_KEY, "dark");
    } else if (legacyDark === "false" || legacyTheme === "light") {
      localStorage.setItem(STORAGE_KEY, "light");
    }
  }

  function current() {
    migrateLegacy();
    return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  }

  function isDark() {
    return current() === "dark";
  }

  function apply(theme) {
    const next = theme === "dark" ? "dark" : "light";
    localStorage.setItem(STORAGE_KEY, next);
    // Keep legacy keys in sync for any leftover readers.
    localStorage.setItem("darkMode", next === "dark" ? "true" : "false");
    localStorage.setItem("theme", next);

    if (next === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }

    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      const icon = btn.querySelector(".theme-icon");
      if (icon) icon.textContent = next === "dark" ? "☾" : "☀";
      btn.setAttribute("aria-pressed", next === "dark" ? "true" : "false");
      btn.title = next === "dark" ? "Switch to light mode" : "Switch to dark mode";
    });

    global.dispatchEvent(new CustomEvent("minime:theme", { detail: { theme: next } }));
  }

  function setDark(enabled) {
    apply(enabled ? "dark" : "light");
  }

  function toggle() {
    apply(isDark() ? "light" : "dark");
  }

  function bindToggles() {
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      if (btn.dataset.themeBound === "1") return;
      btn.dataset.themeBound = "1";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        toggle();
      });
    });
  }

  // Apply immediately so first paint matches preference (script in <head> also bootstraps).
  migrateLegacy();
  apply(current());

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindToggles);
  } else {
    bindToggles();
  }

  global.MinimeTheme = { current, isDark, apply, setDark, toggle, bindToggles };
})(window);
