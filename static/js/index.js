/**
 * MinimēGPT Writer Controller
 * Manages writing sessions with fullscreen lock and AI blocking
 */

document.addEventListener("DOMContentLoaded", () => {
  const project = window.MINIME_PROJECT || null;
  if (!project) return;

  // DOM Elements
  const editor = document.getElementById("editor");
  const projectTitle = document.getElementById("projectTitle");
  const topbar = document.getElementById("topbar");
  const statusIndicator = document.getElementById("statusIndicator");
  const metricsBar = document.getElementById("metricsBar");
  const lockOverlay = document.getElementById("lockOverlay");
  const startSessionBtn = document.getElementById("startSessionBtn");
  const endSessionBtn = document.getElementById("endSessionBtn");
  const completeProjectBtn = document.getElementById("completeProjectBtn");
  const saveSessionBtn = document.getElementById("saveSessionBtn");
  const exitSessionBtn = document.getElementById("exitSessionBtn");
  const warningPanel = document.getElementById("warningPanel");
  const warningMessage = document.getElementById("warningMessage");
  const wordCount = document.getElementById("wordCount");
  const charCount = document.getElementById("charCount");
  const readingTime = document.getElementById("readingTime");
  const sessionTime = document.getElementById("sessionTime");
  const goalGroup = document.getElementById("goalGroup");
  const goalProgress = document.getElementById("goalProgress");
  const goalBarFill = document.getElementById("goalBarFill");
  const sideToolbar = document.getElementById("sideToolbar");
  const darkModeToggle = document.getElementById("darkModeToggle");
  const toolbarButtons = document.querySelectorAll("[data-format]");
  const actionButtons = document.querySelectorAll("[data-action]");
  const wordGoalPopover = document.getElementById("wordGoalPopover");
  const wordGoalInput = document.getElementById("wordGoalInput");
  const setGoalBtn = document.getElementById("setGoalBtn");
  const clearGoalBtn = document.getElementById("clearGoalBtn");
  const wordGoalBtn = document.getElementById("wordGoalBtn");
  const lineHeightBtn = document.getElementById("lineHeightBtn");
  const focusModeBtn = document.getElementById("focusModeBtn");
  const serifToggleBtn = document.getElementById("serifToggleBtn");

  const LINE_HEIGHTS = [1.5, 1.75, 2, 2.25];
  const GOAL_KEY = `minime_goal_${project.id}`;
  const PREFS_KEY = `minime_prefs_${project.id}`;

  // Session state
  const state = {
    active: false,
    locked: false,
    saveTimer: null,
    sessionStart: null,
    sessionTimer: null,
    focusMode: false,
    lineHeightIndex: 1,
    wordGoal: 0,
  };

  // AI domains to block
  const AI_DOMAINS = [
    "openai.com", "chat.openai.com", "chatgpt.com",
    "claude.ai", "claude.com",
    "bard.google.com", "gemini.google.com",
    "copilot.microsoft.com",
    "perplexity.ai", "poe.com", "character.ai",
  ];

  // ==================== PREFERENCES ====================

  function loadPreferences() {
    try {
      const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
      state.lineHeightIndex = prefs.lineHeightIndex ?? 1;
      state.focusMode = prefs.focusMode ?? false;
      if (prefs.serif) editor.classList.add("editor-serif");
      if (serifToggleBtn && prefs.serif) serifToggleBtn.classList.add("active");
      if (focusModeBtn && state.focusMode) focusModeBtn.classList.add("active");
      applyLineHeight();
    } catch {
      /* ignore */
    }

    const goal = parseInt(localStorage.getItem(GOAL_KEY) || "0", 10);
    state.wordGoal = Number.isFinite(goal) ? goal : 0;
    if (wordGoalInput && state.wordGoal) wordGoalInput.value = state.wordGoal;
  }

  function savePreferences() {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        lineHeightIndex: state.lineHeightIndex,
        focusMode: state.focusMode,
        serif: editor.classList.contains("editor-serif"),
      })
    );
  }

  // ==================== SESSION CONTROL ====================

  async function startSession() {
    state.active = true;
    state.locked = false;
    state.sessionStart = Date.now();
    startSessionTimer();

    try {
      await document.documentElement.requestFullscreen();
    } catch (err) {
      console.error("Fullscreen denied:", err);
      state.active = false;
      stopSessionTimer();
      showWarning("Fullscreen required. Please try again.");
    }
  }

  async function endSession() {
    state.active = false;
    state.locked = false;
    stopSessionTimer();

    await saveDocument();

    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    }

    setTimeout(() => {
      window.location.href = "/dashboard";
    }, 200);
  }

  async function completeProject() {
    state.active = false;
    state.locked = false;
    stopSessionTimer();

    await saveDocument();

    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    }

    setTimeout(async () => {
      try {
        const res = await fetch(`/api/projects/${project.id}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        if (res.ok) {
          const blob = await res.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${project.title}.pdf`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);

          setTimeout(() => {
            window.location.href = "/dashboard";
          }, 500);
        }
      } catch (err) {
        console.error("Error completing project:", err);
        window.location.href = "/dashboard";
      }
    }, 200);
  }

  function startSessionTimer() {
    stopSessionTimer();
    state.sessionTimer = setInterval(updateSessionTime, 1000);
    updateSessionTime();
  }

  function stopSessionTimer() {
    if (state.sessionTimer) {
      clearInterval(state.sessionTimer);
      state.sessionTimer = null;
    }
  }

  function updateSessionTime() {
    if (!state.sessionStart || !sessionTime) return;
    const elapsed = Math.floor((Date.now() - state.sessionStart) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    sessionTime.textContent = `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  // ==================== FULLSCREEN STATE MACHINE ====================

  function onFullscreenChange() {
    const inFullscreen = !!document.fullscreenElement;

    if (!state.active) {
      topbar.style.display = "flex";
      sideToolbar.style.display = "none";
      lockOverlay.hidden = true;
      metricsBar.hidden = true;
      editor.contentEditable = "false";
      editor.classList.remove("editor-locked", "editor-focus-mode");
      editor.classList.add("editor-preview");
      return;
    }

    if (inFullscreen && !state.locked) {
      state.locked = true;
      topbar.style.display = "none";
      sideToolbar.style.display = "flex";
      lockOverlay.hidden = true;
      metricsBar.hidden = false;
      editor.contentEditable = "true";
      editor.classList.remove("editor-preview");
      editor.classList.add("editor-locked");
      if (state.focusMode) editor.classList.add("editor-focus-mode");
      editor.focus();
      updateMetrics();
    } else if (!inFullscreen && state.locked) {
      state.locked = false;
      lockOverlay.hidden = false;
      metricsBar.hidden = true;
      editor.contentEditable = "false";
      editor.classList.remove("editor-locked", "editor-focus-mode");
      editor.classList.add("editor-preview");
      sideToolbar.style.display = "none";
      showWarning('Fullscreen exited. You must end the session.');
    } else if (!inFullscreen && !state.locked) {
      topbar.style.display = "flex";
      sideToolbar.style.display = "none";
      lockOverlay.hidden = true;
      metricsBar.hidden = true;
      editor.contentEditable = "false";
      editor.classList.remove("editor-locked", "editor-focus-mode");
      editor.classList.add("editor-preview");
    }
  }

  // ==================== AUTO-SAVE ====================

  async function saveDocument() {
    const content = editor.innerHTML || "";
    const title = projectTitle.textContent || project.title;

    try {
      const res = await fetch(`/api/projects/${project.id}/autosave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, title }),
      });

      if (res.ok) {
        flashSaveIndicator();
        if (statusIndicator) {
          statusIndicator.textContent = "Saved";
          statusIndicator.classList.add("saved");
          setTimeout(() => {
            if (state.active && statusIndicator) {
              statusIndicator.textContent = "Writing...";
              statusIndicator.classList.remove("saved");
            }
          }, 1500);
        }
      }
    } catch (err) {
      console.error("Save failed:", err);
      showWarning("Save failed. Check your connection.");
    }
  }

  function flashSaveIndicator() {
    if (saveSessionBtn) {
      saveSessionBtn.classList.add("saved-flash");
      setTimeout(() => saveSessionBtn.classList.remove("saved-flash"), 600);
    }
  }

  function debounceAutoSave() {
    if (state.saveTimer) clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => {
      if (state.active) saveDocument();
    }, 250);
  }

  // ==================== METRICS ====================

  function getWordCount(text) {
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  }

  function updateMetrics() {
    const text = editor.textContent || "";
    const words = getWordCount(text);
    wordCount.textContent = words;
    charCount.textContent = text.length;

    const minutes = Math.max(1, Math.ceil(words / 200));
    readingTime.textContent = words === 0 ? "0 min" : `${minutes} min`;

    if (state.wordGoal > 0 && goalGroup) {
      goalGroup.hidden = false;
      const pct = Math.min(100, Math.round((words / state.wordGoal) * 100));
      goalProgress.textContent = `${pct}% (${words}/${state.wordGoal})`;
      if (goalBarFill) goalBarFill.style.width = `${pct}%`;
      if (pct >= 100) goalGroup.classList.add("goal-reached");
      else goalGroup.classList.remove("goal-reached");
    } else if (goalGroup) {
      goalGroup.hidden = true;
    }
  }

  // ==================== AI BLOCKING ====================

  function isAIDomain(url) {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return AI_DOMAINS.some((d) => hostname.includes(d));
    } catch {
      return false;
    }
  }

  function showWarning(msg) {
    warningMessage.textContent = msg;
    warningPanel.hidden = false;
    setTimeout(() => {
      warningPanel.hidden = true;
    }, 4000);
  }

  // ==================== TEXT FORMATTING ====================

  function canEdit() {
    return state.active && state.locked;
  }

  function applyFormat(command, value = null) {
    if (!canEdit()) return;
    editor.focus();
    document.execCommand(command, false, value);
    debounceAutoSave();
    updateToolbarState();
  }

  function handleFormat(format) {
    const map = {
      bold: () => applyFormat("bold"),
      italic: () => applyFormat("italic"),
      underline: () => applyFormat("underline"),
      strikethrough: () => applyFormat("strikethrough"),
      bulletList: () => applyFormat("insertUnorderedList"),
      numberedList: () => applyFormat("insertOrderedList"),
      blockquote: () => applyFormat("formatBlock", "blockquote"),
      horizontalRule: () => applyFormat("insertHorizontalRule"),
      indent: () => applyFormat("indent"),
      outdent: () => applyFormat("outdent"),
      h1: () => applyFormat("formatBlock", "h1"),
      h2: () => applyFormat("formatBlock", "h2"),
      h3: () => applyFormat("formatBlock", "h3"),
      paragraph: () => applyFormat("formatBlock", "p"),
      alignLeft: () => applyFormat("justifyLeft"),
      alignCenter: () => applyFormat("justifyCenter"),
      alignRight: () => applyFormat("justifyRight"),
      alignJustify: () => applyFormat("justifyFull"),
    };
    if (map[format]) map[format]();
  }

  function handleAction(action) {
    if (!canEdit() && !["wordGoal"].includes(action)) return;

    switch (action) {
      case "undo":
        applyFormat("undo");
        break;
      case "redo":
        applyFormat("redo");
        break;
      case "clearFormat":
        applyFormat("removeFormat");
        break;
      case "insertDate": {
        const now = new Date();
        const stamp = now.toLocaleString(undefined, {
          weekday: "short",
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        applyFormat("insertText", stamp);
        break;
      }
      case "toggleSerif":
        editor.classList.toggle("editor-serif");
        serifToggleBtn?.classList.toggle("active");
        savePreferences();
        break;
      case "cycleLineHeight":
        state.lineHeightIndex = (state.lineHeightIndex + 1) % LINE_HEIGHTS.length;
        applyLineHeight();
        savePreferences();
        break;
      case "toggleFocusMode":
        state.focusMode = !state.focusMode;
        editor.classList.toggle("editor-focus-mode", state.focusMode);
        focusModeBtn?.classList.toggle("active", state.focusMode);
        savePreferences();
        if (state.focusMode) updateFocusParagraph();
        break;
      case "wordGoal":
        toggleWordGoalPopover();
        break;
    }
  }

  function applyLineHeight() {
    const lh = LINE_HEIGHTS[state.lineHeightIndex];
    editor.style.lineHeight = String(lh);
    if (lineHeightBtn) lineHeightBtn.textContent = String(lh);
  }

  function updateToolbarState() {
    if (!canEdit()) return;
    const commands = {
      bold: "bold",
      italic: "italic",
      underline: "underline",
      strikethrough: "strikeThrough",
      bulletList: "insertUnorderedList",
      numberedList: "insertOrderedList",
      alignLeft: "justifyLeft",
      alignCenter: "justifyCenter",
      alignRight: "justifyRight",
      alignJustify: "justifyFull",
    };
    toolbarButtons.forEach((btn) => {
      const format = btn.dataset.format;
      const cmd = commands[format];
      if (cmd) btn.classList.toggle("active", document.queryCommandState(cmd));
    });
  }

  function updateFocusParagraph() {
    if (!state.focusMode || !canEdit()) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    let node = sel.anchorNode;
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
    const block = node?.closest?.("p, h1, h2, h3, li, blockquote");
    editor.querySelectorAll(".focus-active").forEach((el) => el.classList.remove("focus-active"));
    if (block && editor.contains(block)) block.classList.add("focus-active");
  }

  // ==================== WORD GOAL POPOVER ====================

  function toggleWordGoalPopover() {
    if (!wordGoalPopover) return;
    const isHidden = wordGoalPopover.classList.contains("hidden");
    wordGoalPopover.classList.toggle("hidden", !isHidden);
    if (isHidden && wordGoalInput) {
      wordGoalInput.value = state.wordGoal || "";
      wordGoalInput.focus();
    }
  }

  function setWordGoal() {
    const val = parseInt(wordGoalInput?.value || "0", 10);
    state.wordGoal = Number.isFinite(val) && val > 0 ? val : 0;
    if (state.wordGoal) localStorage.setItem(GOAL_KEY, String(state.wordGoal));
    else localStorage.removeItem(GOAL_KEY);
    wordGoalPopover?.classList.add("hidden");
    updateMetrics();
    if (state.wordGoal) showWarning(`Word goal set: ${state.wordGoal} words`);
  }

  // ==================== DARK MODE ====================

  function toggleDarkMode() {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    if (isDark) {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("darkMode", "false");
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("darkMode", "true");
    }
  }

  // ==================== KEYBOARD SHORTCUTS ====================

  document.addEventListener("keydown", (e) => {
    if (!canEdit()) return;

    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.shiftKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveDocument();
      return;
    }

    if (mod && !e.shiftKey) {
      const shortcuts = {
        b: () => applyFormat("bold"),
        i: () => applyFormat("italic"),
        u: () => applyFormat("underline"),
        z: () => applyFormat("undo"),
        y: () => applyFormat("redo"),
      };
      const handler = shortcuts[e.key.toLowerCase()];
      if (handler) {
        e.preventDefault();
        handler();
        return;
      }
    }
  });

  // ==================== CONTEXT MENU BLOCKING ====================

  document.addEventListener("contextmenu", (e) => {
    if (state.active && state.locked) {
      e.preventDefault();
      showWarning("Right-click is blocked during writing sessions.");
    }
  });

  // ==================== DRAG & DROP BLOCKING ====================

  document.addEventListener("dragstart", (e) => {
    if (state.active && state.locked) {
      e.preventDefault();
      showWarning("Drag operations are blocked during writing sessions.");
    }
  });

  document.addEventListener("drop", (e) => {
    if (state.active && state.locked) {
      e.preventDefault();
      showWarning("Drop operations are blocked during writing sessions.");
    }
  });

  document.addEventListener("dragover", (e) => {
    if (state.active && state.locked) e.preventDefault();
  });

  // ==================== EVENT LISTENERS ====================

  startSessionBtn.addEventListener("click", startSession);
  endSessionBtn.addEventListener("click", endSession);
  completeProjectBtn.addEventListener("click", completeProject);

  if (saveSessionBtn) {
    saveSessionBtn.addEventListener("click", () => saveDocument());
  }

  if (exitSessionBtn) {
    exitSessionBtn.addEventListener("click", endSession);
  }

  if (darkModeToggle) {
    darkModeToggle.addEventListener("click", toggleDarkMode);
  }

  toolbarButtons.forEach((btn) => {
    btn.addEventListener("click", () => handleFormat(btn.dataset.format));
  });

  actionButtons.forEach((btn) => {
    btn.addEventListener("click", () => handleAction(btn.dataset.action));
  });

  setGoalBtn?.addEventListener("click", setWordGoal);
  clearGoalBtn?.addEventListener("click", () => {
    state.wordGoal = 0;
    localStorage.removeItem(GOAL_KEY);
    if (wordGoalInput) wordGoalInput.value = "";
    wordGoalPopover?.classList.add("hidden");
    updateMetrics();
  });

  wordGoalInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") setWordGoal();
    if (e.key === "Escape") wordGoalPopover?.classList.add("hidden");
  });

  document.addEventListener("click", (e) => {
    if (
      wordGoalPopover &&
      !wordGoalPopover.classList.contains("hidden") &&
      !wordGoalPopover.contains(e.target) &&
      e.target !== wordGoalBtn
    ) {
      wordGoalPopover.classList.add("hidden");
    }
  });

  document.addEventListener("fullscreenchange", onFullscreenChange, false);

  editor.addEventListener("input", () => {
    if (state.active && state.locked) {
      updateMetrics();
      if (statusIndicator) {
        statusIndicator.textContent = "Unsaved...";
        statusIndicator.classList.remove("saved");
      }
      debounceAutoSave();
    }
  });

  editor.addEventListener("keyup", () => {
    updateToolbarState();
    updateFocusParagraph();
  });

  editor.addEventListener("mouseup", () => {
    updateToolbarState();
    updateFocusParagraph();
  });

  projectTitle.addEventListener("blur", () => {
    if (state.active) debounceAutoSave();
  });

  // ==================== PASTE BLOCKING ====================

  editor.addEventListener("paste", (e) => {
    if (!state.active) return;
    e.preventDefault();
    showWarning("Pasting is blocked during writing sessions.");
  });

  document.addEventListener("paste", (e) => {
    if (state.active) e.preventDefault();
  });

  // ==================== COPY BLOCKING ====================

  editor.addEventListener("copy", (e) => {
    if (state.active && state.locked) {
      e.preventDefault();
      showWarning("Copying is blocked during writing sessions.");
    }
  });

  editor.addEventListener("cut", (e) => {
    if (state.active && state.locked) {
      e.preventDefault();
      showWarning("Cut is blocked during writing sessions.");
    }
  });

  document.addEventListener("copy", (e) => {
    if (state.active && state.locked) e.preventDefault();
  });

  document.addEventListener("cut", (e) => {
    if (state.active && state.locked) e.preventDefault();
  });

  // ==================== SCREENSHOT & PAGE BLOCKING ====================

  document.addEventListener("keydown", (e) => {
    if (!state.active || !state.locked) return;

    if (e.key === "PrintScreen" || e.code === "PrintScreen") {
      e.preventDefault();
      showWarning("Screenshots are blocked during writing sessions.");
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "s") {
      return; // save handled in shortcuts listener
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "s" && !e.shiftKey) {
      e.preventDefault();
      showWarning("Use Ctrl+Shift+S to save, or the save button in the toolbar.");
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      showWarning('Use "Exit session" in the toolbar to leave.');
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "p") {
      e.preventDefault();
      showWarning("Printing is blocked during writing sessions.");
    }
  });

  document.addEventListener("keyup", (e) => {
    if (!state.active || !state.locked) return;
    if (e.ctrlKey && e.key === "PrintScreen") {
      e.preventDefault();
      showWarning("Screenshots are blocked during writing sessions.");
    }
  });

  // ==================== GENERIC SECURITY BLOCKING ====================

  document.addEventListener("click", (e) => {
    if (!state.active) return;
    const link = e.target.closest("a");
    if (link && isAIDomain(link.href)) {
      e.preventDefault();
      showWarning("AI domain access blocked.");
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (state.active && document.hidden) {
      showWarning("Tab switching detected.");
    }
  });

  // ==================== INIT ====================

  loadPreferences();
  editor.contentEditable = "false";
  editor.classList.add("editor-preview");
  sideToolbar.style.display = "none";
  lockOverlay.hidden = true;
  metricsBar.hidden = true;
  updateMetrics();

  console.log("Writer ready:", project.title);
});
