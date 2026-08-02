# Smaller quality issues

Status: **Fixed** (2026-08-03)

## Issues

### Deprecated `datetime.utcnow()`

- **Fix:** Replaced with `utc_now()` using `datetime.now(timezone.utc)` (naive UTC stored for SQLite compatibility).
- **Where:** `app.py`

### CSP blocks inline dashboard/settings scripts

- **Symptom:** Share/theme/profile/delete JS did not run under `script-src 'self'`.
- **Fix:** Moved to `static/js/dashboard.js`, `settings.js`, `link-device.js`; writer boot config uses `type="application/json"` + `index.js` parse.
- **Where:** templates + `static/js/*`

### Dashboard dark-mode toggle missing

- **Fix:** Added `#themeToggle` on the dashboard navbar wired in `dashboard.js`.
- **Where:** `templates/dashboard.html`

### Complete-project PDF styling

- **Fix:** Neutral near-black title/body colors (no indigo); selectable page size; clearer metadata line.
- **Where:** `app.py` → `_build_project_pdf`
