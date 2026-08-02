/**
 * MinimēGPT device coordinator — registers this browser and enforces companion lock.
 */
(function () {
  "use strict";

  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || "";

  function deviceUid() {
    let id = localStorage.getItem("minime_device_id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("minime_device_id", id);
    }
    return id;
  }

  function defaultLabel() {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) return "iPhone / iPad";
    if (/Android/.test(ua)) return "Android device";
    if (/Windows/.test(ua)) return "Windows PC";
    if (/Mac/.test(ua)) return "Mac";
    return "This device";
  }

  async function registerDevice() {
    try {
      await fetch("/api/devices/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
          "X-Minime-Device-Id": deviceUid(),
        },
        body: JSON.stringify({
          device_uid: deviceUid(),
          label: defaultLabel(),
          platform: navigator.platform || "",
        }),
      });
    } catch {
      /* ignore */
    }
  }

  let overlay = null;

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "companionLockOverlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="companion-lock-card">
        <p class="companion-lock-eyebrow">Protected writing session</p>
        <h2 id="companionLockTitle">This device is locked</h2>
        <p id="companionLockMessage">A writing session is in progress on your main device. This overlay is best-effort in the browser — other apps are not controlled. It unlocks when the host ends the session.</p>
      </div>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  function showCompanionLock(title) {
    const el = ensureOverlay();
    document.getElementById("companionLockTitle").textContent = title || "This device is locked";
    el.hidden = false;
    document.body.style.overflow = "hidden";
    // Best-effort: request fullscreen on companion when possible (may be denied without a gesture).
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  function hideCompanionLock() {
    if (overlay) overlay.hidden = true;
    document.body.style.overflow = "";
  }

  async function pollLockStatus() {
    try {
      const res = await fetch(
        `/api/session/lock-status?device_uid=${encodeURIComponent(deviceUid())}`,
        { headers: { "X-Minime-Device-Id": deviceUid() } }
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data.active && data.role === "companion") {
        showCompanionLock(`Locked — ${data.project_title || "Writing session"}`);
      } else {
        hideCompanionLock();
      }
    } catch {
      /* ignore */
    }
  }

  window.MinimeDevices = {
    deviceUid,
    defaultLabel,
    registerDevice,
    pollLockStatus,
    hideCompanionLock,
  };

  registerDevice();
  pollLockStatus();
  setInterval(pollLockStatus, 2000);
})();
