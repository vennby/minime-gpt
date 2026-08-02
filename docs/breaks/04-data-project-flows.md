# Data / project flow breaks

Status: **Fixed** (2026-08-03)

## Issues

### Complete project deletes before PDF is delivered

- **Symptom:** Failed response after delete → project gone with no PDF.
- **Cause:** Deleted in DB before `send_file`.
- **Fix:** Build PDF first; delete only in `@after_this_request` when the response status is 2xx.
- **Where:** `app.py` → `complete_project`

### No project delete without “complete”

- **Symptom:** Could not remove a draft without exporting PDF.
- **Fix:** `POST /projects/<id>/delete` with CSRF + dashboard Delete button.
- **Where:** `app.py` → `delete_project`, `templates/dashboard.html`

### Share links cannot be revoked or rotated

- **Symptom:** Token lived until project delete.
- **Fix:** `POST /api/projects/<id>/share` with `{rotate: true}`; `DELETE` same path revokes. Dashboard Share / Rotate / Revoke buttons.
- **Where:** `app.py`, `static/js/dashboard.js`

### Dashboard word count wrong

- **Symptom:** Counts included HTML tags.
- **Fix:** `plain_word_count()` strips HTML then splits words; dashboard uses `project_cards`.
- **Where:** `security.py`, `app.py` → `dashboard`

### Share button XSS / quote breakage

- **Symptom:** Titles with quotes broke `onclick`.
- **Fix:** `data-share-project` attributes + external `dashboard.js` (no inline handlers).
- **Where:** `templates/dashboard.html`, `static/js/dashboard.js`

### Flash messages never appear

- **Symptom:** Flash UI unused.
- **Fix:** `flash()` on create/delete project, logout, account delete.
- **Where:** `app.py` routes; dashboard flash block
