/**
 * Clipboard hard-gate for the writer page.
 * If the browser reports clipboard permission as granted (user clicked Allow),
 * refuse to serve the writing UI and leave the page.
 */
(function (global) {
  "use strict";

  const CLIPBOARD_PERMS = ["clipboard-read", "clipboard-write"];

  function refuseWriter(reason) {
    try {
      sessionStorage.setItem("minime_clipboard_block_reason", reason || "granted");
    } catch {
      /* ignore */
    }
    // Replace history so Back doesn't return to a usable writer.
    global.location.replace("/dashboard?clipboard_blocked=1");
  }

  async function queryClipboardPermission(name) {
    if (!navigator.permissions?.query) return null;
    try {
      return await navigator.permissions.query({ name });
    } catch {
      // Some browsers reject unknown permission names.
      return null;
    }
  }

  async function anyClipboardGranted() {
    for (const name of CLIPBOARD_PERMS) {
      const status = await queryClipboardPermission(name);
      if (status && status.state === "granted") {
        return { granted: true, name, status };
      }
    }
    return { granted: false };
  }

  function watchPermission(status) {
    if (!status || typeof status.addEventListener !== "function") return;
    status.addEventListener("change", () => {
      if (status.state === "granted") {
        refuseWriter(`${status.name || "clipboard"} granted`);
      }
    });
  }

  async function installClipboardGate() {
    const gateScreen = document.getElementById("clipboardGateScreen");

    // Permanent stub: clipboard APIs must never succeed on the writer page.
    if (navigator.clipboard) {
      const blocked = () =>
        Promise.reject(new Error("Clipboard is prohibited on MinimēGPT writing pages."));
      try {
        navigator.clipboard.writeText = blocked;
        navigator.clipboard.readText = blocked;
        if (navigator.clipboard.write) navigator.clipboard.write = blocked;
        if (navigator.clipboard.read) navigator.clipboard.read = blocked;
      } catch {
        /* ignore non-configurable */
      }
    }

    const result = await anyClipboardGranted();
    if (result.granted) {
      refuseWriter(result.name);
      return false;
    }

    // Watch for the user accepting a later browser prompt.
    for (const name of CLIPBOARD_PERMS) {
      const status = await queryClipboardPermission(name);
      if (status) watchPermission(status);
    }

    // Periodic re-check (covers browsers with flaky PermissionStatus events).
    setInterval(async () => {
      const again = await anyClipboardGranted();
      if (again.granted) refuseWriter(again.name);
    }, 2000);

    gateScreen?.remove();
    document.querySelector(".app-shell")?.classList.remove("writer-pending");
    return true;
  }

  // Block legacy clipboard events for the whole writer document.
  function blockEvent(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.clipboardData) {
      try {
        e.clipboardData.setData("text/plain", "");
        e.clipboardData.clearData();
      } catch {
        /* ignore */
      }
    }
  }

  ["copy", "cut", "paste"].forEach((type) => {
    document.addEventListener(type, blockEvent, true);
  });

  document.addEventListener(
    "keydown",
    (e) => {
      const key = (e.key || "").toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (key === "c" || key === "x" || key === "v" || key === "insert")) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (e.shiftKey && key === "insert") {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );

  global.MinimeClipboardGate = {
    install: installClipboardGate,
    refuseWriter,
    anyClipboardGranted,
  };
})(window);
