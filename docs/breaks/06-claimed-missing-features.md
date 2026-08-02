# Claimed / missing features

Status: **Fixed** (2026-08-03)

## Issues

### “Popular paper formats”

- **Claim:** README said formats were available.
- **Fix:** Complete-project flow accepts `page_size`: `letter` | `a4` | `legal` (UI select on session pause overlay). PDF metadata includes format.
- **Where:** `app.py` → `PAGE_SIZES`, `complete_project`; `templates/index.html`; `static/js/index.js`

### Session / brainstorming logs

- **Claim:** Incomplete README checkbox.
- **Fix:** Ended/active `WritingSessionLock` rows listed under Settings → Writing sessions.
- **Where:** `app.py` → `settings`; `templates/settings.html`

### Unused `Flask-OAuthlib` dependency

- **Fix:** Removed from `requirements.txt` (Authlib only).
- **Where:** `requirements.txt`

### README accuracy

- **Fix:** Feature checklist updated to match shipped behavior; notes clarify best-effort browser locks.
- **Where:** `README.md`
