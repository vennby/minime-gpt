# Auth / account breaks

Status: **Fixed** (2026-08-03)

## Issues

### OAuth redirect hardcodes HTTP

- **Symptom:** Google sign-in fails with `redirect_uri_mismatch` behind HTTPS or wrong host.
- **Cause:** `get_oauth_redirect_uri()` forced `_scheme='http'`.
- **Fix:** Uses `REDIRECT_URI` if set; otherwise `PREFERRED_URL_SCHEME` or `request.scheme`. Pairing links use the same scheme helper.
- **Where:** `app.py` → `get_oauth_redirect_uri`

### Weak / missing `SECRET_KEY`

- **Symptom:** Predictable default secret in shared/dev deployments.
- **Cause:** Fell back to `dev-key-change-in-production`.
- **Fix:** Production still requires `SECRET_KEY`. Dev auto-generates and persists `instance/secret_key` (gitignored via `instance/`).
- **Where:** `app.py` → `_resolve_secret_key`

### Google identity not fully verified

- **Symptom:** Account tied by email alone; `google_id` mismatch possible.
- **Cause:** Lookup was email-first; no `email_verified` check.
- **Fix:** Lookup by `google_id` first; reject email collisions with a different `sub`; require `email_verified` is not `False`.
- **Where:** `app.py` → `auth_callback`

### Logout via GET

- **Symptom:** Cross-site request could log the user out.
- **Cause:** `/logout` was GET without CSRF.
- **Fix:** `POST /logout` with CSRF; dashboard/settings use POST forms.
- **Where:** `app.py`, `templates/dashboard.html`, `templates/settings.html`

### Register is a stub

- **Symptom:** POST to `/register` did nothing useful.
- **Cause:** Always rendered a duplicate Google signup page.
- **Fix:** `/register` redirects to `auth_google` (single OAuth signup/signin path).
- **Where:** `app.py` → `register`

### Account delete leaves orphans

- **Symptom:** Locks / pairing codes could remain after user delete.
- **Cause:** No explicit delete of related rows; weak FK cascades.
- **Fix:** Explicitly deletes session locks, pairing codes, devices, and projects before the user; relationships use `ondelete='CASCADE'` where applicable; SQLite foreign keys enabled.
- **Where:** `app.py` → `delete_account`, models, `_enable_sqlite_foreign_keys`
