# Session / multi-device breaks

Status: **Fixed** (2026-08-03) — companion OS lock remains **best-effort** (browser limitation).

> Related critical fixes: [01-critical-product-breaks.md](./01-critical-product-breaks.md).

## Issues

### Companion lock is cosmetic

- **Symptom:** Overlay appears, but other apps / browsers still work.
- **Cause:** Web apps cannot lock the OS.
- **Fix / mitigation:** Honest copy on the companion overlay + API `notice` / `best_effort` flags; optional fullscreen request on companion; documented in README. Cannot be fully “fixed” in a browser.
- **Where:** `static/js/device-coordinator.js`, `session_lock_status`

### Empty `device_uid` can stop a lock

- **Symptom:** Any logged-in client could end the lock without proving host identity.
- **Cause:** Empty `device_uid` skipped the host check.
- **Fix:** Require non-empty `device_uid` equal to `lock.host_device_uid`.
- **Where:** `app.py` → `stop_writing_session_lock`

### Dead `/api/session/end` endpoint

- **Symptom:** Unused API clutter.
- **Fix:** Removed; frontend uses `/api/session/stop` then navigates to dashboard.
- **Where:** `app.py`

### Pairing requires same Google account on the other device

- **Symptom:** Unsigned phone could not join.
- **Cause:** Link routes required `@login_required` and matching session user.
- **Fix:** `/devices/link/<code>` and `/api/devices/link` work with a valid pairing code alone (still reject if signed in as a *different* account).
- **Where:** `app.py`, `templates/link-device.html`, `static/js/link-device.js`

### Device label XSS via `innerHTML`

- **Status:** **Fixed** — `escapeHtml()` on labels/uids in `renderDeviceList`.
- **Where:** `static/js/index.js`
