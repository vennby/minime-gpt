/**
 * Device pairing page (works without an existing login session).
 */
document.addEventListener("DOMContentLoaded", () => {
  const code = document.getElementById("linkDeviceRoot")?.dataset.pairingCode;
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || "";
  const labelInput = document.getElementById("deviceLabel");
  const consentBox = document.getElementById("consentLock");
  const errEl = document.getElementById("linkError");

  if (!code) return;

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
    if (/Windows/.test(ua)) return "Windows device";
    if (/Mac/.test(ua)) return "Mac";
    return "My device";
  }

  if (labelInput) labelInput.value = defaultLabel();

  document.getElementById("linkDeviceBtn")?.addEventListener("click", async () => {
    if (errEl) errEl.style.display = "none";
    if (!consentBox?.checked) {
      if (errEl) {
        errEl.textContent = "You must agree to enable session lock on this device.";
        errEl.style.display = "block";
      }
      return;
    }
    try {
      const res = await fetch("/api/devices/link", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({
          code,
          device_uid: deviceUid(),
          label: (labelInput?.value || "").trim() || defaultLabel(),
          platform: navigator.platform || "",
          consent_lock: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Link failed");
      window.location.href = "/?device_linked=1";
    } catch (e) {
      if (errEl) {
        errEl.textContent = e.message;
        errEl.style.display = "block";
      }
    }
  });
});
