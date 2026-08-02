/**
 * MinimēGPT Writer Controller
 * Manages writing sessions with fullscreen lock and AI blocking
 */

document.addEventListener("DOMContentLoaded", () => {
  const bootEl = document.getElementById("minime-config");
  let boot = {};
  try {
    boot = JSON.parse(bootEl?.textContent || "{}");
  } catch {
    boot = {};
  }
  const project = boot.project || window.MINIME_PROJECT || null;
  if (!project) return;

  const gate = window.MinimeClipboardGate;
  const startWriter = () => initWriter(boot, project);

  if (gate?.install) {
    gate.install().then((ok) => {
      if (ok) startWriter();
      // if not ok, gate already redirected away
    });
  } else {
    // Fail closed: no gate script → do not serve writer.
    window.location.replace("/dashboard?clipboard_blocked=1");
  }
});

function initWriter(boot, project) {
  const CSRF_TOKEN = boot.csrf || window.MINIME_CSRF || "";
  const guard = window.MinimeSessionGuard;

  function apiHeaders() {
    return {
      "Content-Type": "application/json",
      "X-CSRF-Token": CSRF_TOKEN,
    };
  }

  function syncGuardState() {
    if (guard) {
      guard.setActive(state.active, state.locked);
    }
  }

  function updateToolbarOffset() {
    const container = document.querySelector(".editor-container");
    if (!container) return;
    const visible =
      sideToolbar &&
      !sideToolbar.hidden &&
      sideToolbar.style.display !== "none";
    const collapsed = sideToolbar?.getAttribute("data-collapsed") === "true";
    const width = !visible ? "0px" : collapsed ? "64px" : "212px";
    container.style.setProperty("--toolbar-offset", width);
  }

  function setSidebarVisible(visible) {
    if (!sideToolbar) return;
    sideToolbar.hidden = !visible;
    sideToolbar.style.display = visible ? "flex" : "none";
    updateToolbarOffset();
  }

  function toggleSidebarCollapsed() {
    if (!sideToolbar) return;
    const next = sideToolbar.getAttribute("data-collapsed") !== "true";
    sideToolbar.setAttribute("data-collapsed", next ? "true" : "false");
    localStorage.setItem("minime_toolbar_collapsed", next ? "1" : "0");
    if (toolbarCollapseBtn) {
      toolbarCollapseBtn.title = next ? "Expand sidebar" : "Collapse sidebar";
    }
    updateToolbarOffset();
  }

  function restoreSidebarCollapsed() {
    const collapsed = localStorage.getItem("minime_toolbar_collapsed") === "1";
    sideToolbar?.setAttribute("data-collapsed", collapsed ? "true" : "false");
    updateToolbarOffset();
  }

  // DOM Elements
  const editor = document.getElementById("editor");
  const projectTitle = document.getElementById("projectTitle");
  const topbar = document.getElementById("topbar");
  const statusIndicator = document.getElementById("statusIndicator");
  const metricsBar = document.getElementById("metricsBar");
  const lockOverlay = document.getElementById("lockOverlay");
  const startSessionBtn = document.getElementById("startSessionBtn");
  const endSessionBtn = document.getElementById("endSessionBtn");
  const resumeSessionBtn = document.getElementById("resumeSessionBtn");
  const completeProjectBtn = document.getElementById("completeProjectBtn");
  const pageSizeSelect = document.getElementById("pageSizeSelect");
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
  const toolbarCollapseBtn = document.getElementById("toolbarCollapseBtn");
  const toolbarButtons = document.querySelectorAll("[data-format]");
  const actionButtons = document.querySelectorAll("[data-action]");
  const wordGoalPopover = document.getElementById("wordGoalPopover");
  const wordGoalInput = document.getElementById("wordGoalInput");
  const setGoalBtn = document.getElementById("setGoalBtn");
  const clearGoalBtn = document.getElementById("clearGoalBtn");
  const wordGoalBtn = document.getElementById("wordGoalBtn");
  const lineHeightBtn = document.getElementById("lineHeightBtn");
  const lineHeightGlyph = document.getElementById("lineHeightGlyph");
  const focusModeBtn = document.getElementById("focusModeBtn");
  const serifToggleBtn = document.getElementById("serifToggleBtn");
  const sessionPrepOverlay = document.getElementById("sessionPrepOverlay");
  const scanDevicesBtn = document.getElementById("scanDevicesBtn");
  const pairingPanel = document.getElementById("pairingPanel");
  const pairingLink = document.getElementById("pairingLink");
  const pairingCode = document.getElementById("pairingCode");
  const scanStatus = document.getElementById("scanStatus");
  const deviceList = document.getElementById("deviceList");
  const deviceListEmpty = document.getElementById("deviceListEmpty");
  const cancelPrepBtn = document.getElementById("cancelPrepBtn");
  const confirmStartBtn = document.getElementById("confirmStartBtn");

  const devicesApi = window.MinimeDevices;

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
    pairingCode: null,
    pairingPollTimer: null,
    linkedDevices: [],
  };

  function getDeviceUid() {
    if (devicesApi?.deviceUid) return devicesApi.deviceUid();
    let id = localStorage.getItem("minime_device_id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("minime_device_id", id);
    }
    return id;
  }

  async function stopSessionLock() {
    try {
      await fetch("/api/session/stop", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ device_uid: getDeviceUid() }),
      });
    } catch {
      /* ignore */
    }
    devicesApi?.hideCompanionLock?.();
  }

  if (guard) {
    guard.setConfig(boot.security || window.MINIME_SECURITY || {});
  }

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

  // ==================== SESSION PREP (MULTI-DEVICE) ====================

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function openSessionPrep() {
    sessionPrepOverlay?.classList.remove("hidden");
    // Grant host lock consent first so a solo device can start without pairing.
    await ensureHostConsent();
    await loadLinkedDevices();
  }

  function closeSessionPrep() {
    sessionPrepOverlay?.classList.add("hidden");
    stopPairingPoll();
  }

  function stopPairingPoll() {
    if (state.pairingPollTimer) {
      clearInterval(state.pairingPollTimer);
      state.pairingPollTimer = null;
    }
  }

  async function loadLinkedDevices() {
    try {
      const res = await fetch(
        `/api/devices?device_uid=${encodeURIComponent(getDeviceUid())}`,
        { headers: { "X-Minime-Device-Id": getDeviceUid() } }
      );
      if (!res.ok) return;
      const data = await res.json();
      state.linkedDevices = data.devices || [];
      renderDeviceList();
    } catch {
      /* ignore */
    }
  }

  function renderDeviceList() {
    if (!deviceList) return;
    deviceList.innerHTML = "";
    const devices = state.linkedDevices;
    const currentUid = getDeviceUid();

    // Ensure the host appears even if the API list is briefly empty after register.
    if (!devices.some((d) => d.device_uid === currentUid)) {
      devices.unshift({
        device_uid: currentUid,
        label: devicesApi?.defaultLabel?.() || "This device",
        consent_lock: true,
        is_current: true,
      });
    }

    if (!devices.length) {
      deviceListEmpty?.classList.remove("hidden");
      if (confirmStartBtn) confirmStartBtn.disabled = true;
      return;
    }
    deviceListEmpty?.classList.add("hidden");

    devices.forEach((device) => {
      const row = document.createElement("div");
      row.className = "device-row" + (device.is_current ? " is-current" : "");
      const isCurrent = device.device_uid === currentUid || device.is_current;
      const canSelect = isCurrent || device.consent_lock;
      const checked = isCurrent || (device.consent_lock && device.is_current);
      const label = escapeHtml(device.label || "Device");
      const status = isCurrent
        ? "This device (host)"
        : device.consent_lock
          ? "Lock consent granted"
          : "No lock consent — link via pairing";
      row.innerHTML = `
        <input type="checkbox" id="dev-${escapeHtml(device.device_uid)}" data-uid="${escapeHtml(device.device_uid)}"
          ${checked ? "checked" : ""} ${canSelect ? "" : "disabled"}>
        <label for="dev-${escapeHtml(device.device_uid)}">
          ${label}${isCurrent ? " (this device)" : ""}
          <small>${status}</small>
        </label>`;
      deviceList.appendChild(row);
      row.querySelector("input")?.addEventListener("change", updateConfirmStartState);
    });
    updateConfirmStartState();
  }

  function selectedDeviceUids() {
    if (!deviceList) return [];
    return [...deviceList.querySelectorAll("input[type=checkbox]:checked")].map(
      (el) => el.dataset.uid
    );
  }

  function updateConfirmStartState() {
    const selected = selectedDeviceUids();
    if (confirmStartBtn) {
      // Solo host is enough; always allow if current device is selected or list empty-after-consent.
      confirmStartBtn.disabled = selected.length === 0;
    }
  }

  async function startPairingScan() {
    try {
      const res = await fetch("/api/devices/pairing-code", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ device_uid: getDeviceUid() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start pairing");

      state.pairingCode = data.code;
      pairingPanel?.classList.remove("hidden");
      if (pairingLink) pairingLink.value = data.link;
      if (pairingCode) pairingCode.textContent = data.code;
      if (scanStatus) scanStatus.textContent = "Waiting for devices to join…";

      stopPairingPoll();
      state.pairingPollTimer = setInterval(pollPairingDevices, 2500);
      pollPairingDevices();
    } catch (err) {
      showWarning(err.message || "Pairing failed");
    }
  }

  async function pollPairingDevices() {
    if (!state.pairingCode) return;
    const prevCount = state.linkedDevices.filter((d) => d.consent_lock).length;
    try {
      const res = await fetch(`/api/devices/pairing-code/${state.pairingCode}`, {
        headers: { "X-Minime-Device-Id": getDeviceUid() },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.valid) {
        if (scanStatus) scanStatus.textContent = "Pairing code expired. Generate a new one.";
        stopPairingPoll();
        return;
      }
      state.linkedDevices = data.devices || [];
      renderDeviceList();
      const count = state.linkedDevices.filter((d) => d.consent_lock).length;
      if (count > prevCount && scanStatus) {
        scanStatus.textContent = `Device found! ${count} device(s) ready to lock.`;
      }
    } catch {
      /* ignore */
    }
  }

  async function ensureHostConsent() {
    const uid = getDeviceUid();
    const host = state.linkedDevices.find((d) => d.device_uid === uid);
    if (host?.consent_lock) return true;

    await fetch("/api/devices/register", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        device_uid: uid,
        label: devicesApi?.defaultLabel?.() || "This device",
        platform: navigator.platform || "",
        consent_lock: true,
      }),
    });
    return true;
  }

  async function confirmStartSession() {
    let selected = selectedDeviceUids();
    const hostUid = getDeviceUid();
    if (!selected.includes(hostUid)) {
      selected = [hostUid, ...selected];
    }
    if (!selected.length) return;

    await ensureHostConsent();

    try {
      const res = await fetch("/api/session/start", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({
          project_id: project.id,
          host_device_uid: hostUid,
          device_uids: selected,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start session lock");

      closeSessionPrep();
      await startSession();
    } catch (err) {
      showWarning(err.message || "Failed to start session");
    }
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
      // Roll back server-side lock so companions are not stuck.
      await stopSessionLock();
      showWarning("Fullscreen required. Please try again.");
      applyDraftEditorMode();
    }
  }

  async function resumeSession() {
    if (!state.active) return;
    try {
      await document.documentElement.requestFullscreen();
    } catch (err) {
      console.error("Fullscreen denied:", err);
      showWarning("Fullscreen required to continue the session.");
    }
  }

  async function endSession() {
    state.active = false;
    state.locked = false;
    stopSessionTimer();

    await saveDocument();
    await stopSessionLock();

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
    await stopSessionLock();

    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    }

    setTimeout(async () => {
      try {
        const res = await fetch(`/api/projects/${project.id}/complete`, {
          method: "POST",
          headers: apiHeaders(),
          body: JSON.stringify({
            page_size: pageSizeSelect?.value || "letter",
          }),
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
        } else {
          const data = await res.json().catch(() => ({}));
          showWarning(data.error || "Could not complete project");
          applyDraftEditorMode();
        }
      } catch (err) {
        console.error("Error completing project:", err);
        showWarning("Could not complete project");
        applyDraftEditorMode();
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

  function applyDraftEditorMode() {
    topbar.style.display = "flex";
    setSidebarVisible(true);
    lockOverlay.hidden = true;
    metricsBar.hidden = true;
    editor.contentEditable = "true";
    editor.classList.remove("editor-locked");
    editor.classList.add("editor-preview");
    if (state.focusMode) editor.classList.add("editor-focus-mode");
    else editor.classList.remove("editor-focus-mode");
    syncGuardState();
  }

  function onFullscreenChange() {
    const inFullscreen = !!document.fullscreenElement;

    if (!state.active) {
      applyDraftEditorMode();
      return;
    }

    if (inFullscreen && !state.locked) {
      state.locked = true;
      topbar.style.display = "none";
      setSidebarVisible(true);
      lockOverlay.hidden = true;
      metricsBar.hidden = false;
      editor.contentEditable = "true";
      editor.classList.remove("editor-preview");
      editor.classList.add("editor-locked");
      if (state.focusMode) editor.classList.add("editor-focus-mode");
      editor.focus();
      updateMetrics();
      syncGuardState();
    } else if (!inFullscreen && state.locked) {
      state.locked = false;
      lockOverlay.hidden = false;
      metricsBar.hidden = true;
      editor.contentEditable = "false";
      editor.classList.remove("editor-locked", "editor-focus-mode");
      editor.classList.add("editor-preview");
      setSidebarVisible(false);
      showWarning("Fullscreen exited. Return to continue, or end the session.");
      syncGuardState();
    } else if (!inFullscreen && !state.locked) {
      topbar.style.display = "flex";
      setSidebarVisible(false);
      lockOverlay.hidden = false;
      metricsBar.hidden = true;
      editor.contentEditable = "false";
      editor.classList.remove("editor-locked", "editor-focus-mode");
      editor.classList.add("editor-preview");
      syncGuardState();
    }
  }

  // ==================== AUTO-SAVE ====================

  async function saveDocument() {
    const content = editor.innerHTML || "";
    const title = projectTitle.textContent || project.title;

    try {
      const res = await fetch(`/api/projects/${project.id}/autosave`, {
        method: "POST",
        headers: apiHeaders(),
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
      // Draft mode and locked sessions both persist.
      if (!state.active || state.locked) saveDocument();
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

  // ==================== AI & NAVIGATION BLOCKING ====================

  function purgeEditorContent() {
    if (guard?.purgeEditor(editor)) {
      debounceAutoSave();
    }
  }

  document.addEventListener("click", (e) => {
    if (!state.active || !state.locked) return;
    const link = e.target.closest("a");
    if (link) {
      e.preventDefault();
      e.stopPropagation();
      if (guard?.isAiUrl(link.href)) {
        showWarning("AI services are blocked during writing sessions.");
      } else {
        showWarning("Links are disabled during writing sessions.");
      }
    }
  }, true);

  document.addEventListener("auxclick", (e) => {
    if (state.active && state.locked && e.button === 1) {
      e.preventDefault();
      showWarning("Opening links is blocked during writing sessions.");
    }
  });

  function showWarning(msg) {
    warningMessage.textContent = msg;
    warningPanel.hidden = false;
    setTimeout(() => {
      warningPanel.hidden = true;
    }, 4000);
  }

  // ==================== TEXT FORMATTING ====================

  function canEdit() {
    // Draft (!active) or locked fullscreen session — not while session is paused.
    return !state.active || state.locked;
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
    if (lineHeightGlyph) lineHeightGlyph.textContent = String(lh);
    else if (lineHeightBtn) lineHeightBtn.textContent = String(lh);
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
  // Theme is configured only in Settings via MinimeTheme (global).

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

  startSessionBtn.addEventListener("click", openSessionPrep);
  cancelPrepBtn?.addEventListener("click", closeSessionPrep);
  scanDevicesBtn?.addEventListener("click", startPairingScan);
  confirmStartBtn?.addEventListener("click", confirmStartSession);
  resumeSessionBtn?.addEventListener("click", resumeSession);
  endSessionBtn.addEventListener("click", endSession);
  completeProjectBtn.addEventListener("click", completeProject);
  toolbarCollapseBtn?.addEventListener("click", toggleSidebarCollapsed);

  if (saveSessionBtn) {
    saveSessionBtn.addEventListener("click", () => saveDocument());
  }

  if (exitSessionBtn) {
    exitSessionBtn.addEventListener("click", endSession);
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
    if (!canEdit()) return;
    if (state.active && state.locked) {
      purgeEditorContent();
    }
    updateMetrics();
    if (statusIndicator) {
      statusIndicator.textContent = "Unsaved...";
      statusIndicator.classList.remove("saved");
    }
    debounceAutoSave();
  });

  editor.addEventListener("beforeinput", (e) => {
    const blockedTypes = new Set(["insertFromPaste", "insertFromDrop", "insertFromYank"]);
    if (blockedTypes.has(e.inputType)) {
      e.preventDefault();
      showWarning("Clipboard paste is prohibited on writing pages.");
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
    debounceAutoSave();
  });

  // ==================== PASTE / COPY / CLIPBOARD ====================
  // Hard blocking + permission gate live in clipboard-gate.js.
  // Keep warnings here so the user sees why an action failed.

  function warnClipboard(e, message) {
    if (e?.defaultPrevented) {
      showWarning(message);
    }
  }

  document.addEventListener(
    "paste",
    (e) => warnClipboard(e, "Clipboard paste is prohibited on writing pages."),
    true
  );
  document.addEventListener(
    "copy",
    (e) => warnClipboard(e, "Clipboard copy is prohibited on writing pages."),
    true
  );
  document.addEventListener(
    "cut",
    (e) => warnClipboard(e, "Clipboard cut is prohibited on writing pages."),
    true
  );

  // ==================== SCREENSHOT & PAGE BLOCKING ====================

  // Best-effort session reminders (browsers cannot fully block OS screenshots / new tabs).
  document.addEventListener("keydown", (e) => {
    if (!state.active || !state.locked) return;

    if (e.key === "PrintScreen" || e.code === "PrintScreen") {
      showWarning("Screenshots may still be possible via the OS. Stay focused on this session.");
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
      showWarning('Use "Return to fullscreen" or "Exit session" if the lock overlay appears.');
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "p") {
      e.preventDefault();
      showWarning("Printing is discouraged during protected sessions.");
      return;
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === "t" || e.key === "n" || e.key === "w")) {
      showWarning("Browser shortcuts may still open tabs. Session guards are best-effort only.");
    }
  });

  document.addEventListener("keyup", (e) => {
    if (!state.active || !state.locked) return;
    if (e.key === "PrintScreen" || e.code === "PrintScreen") {
      showWarning("Screenshots may still be possible via the OS. Stay focused on this session.");
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (state.active && document.hidden) {
      showWarning("Tab switching detected.");
    }
  });

  // ==================== INIT ====================

  if (guard) {
    guard.setViolationHandler(showWarning);
  }

  loadPreferences();
  restoreSidebarCollapsed();
  if (guard) {
    guard.purgeEditor(editor);
  }
  if (devicesApi?.registerDevice) {
    devicesApi.registerDevice();
  }
  applyDraftEditorMode();
  updateMetrics();
  document.getElementById("clipboardGateScreen")?.remove();
  document.querySelector(".app-shell")?.classList.remove("writer-pending");

  console.log("Writer ready:", project.title);
}
