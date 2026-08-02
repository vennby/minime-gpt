# Security / integrity breaks

Status: **Fixed / mitigated** (2026-08-03)

These undermine the product promise of an AI-free environment. Full OS enforcement is impossible in a web app; mitigations are honest UX + tighter server/client guards.

## Issues

### AI / distraction blocking is client-only

- **Symptom:** Bypass via DevTools / another browser / no JS.
- **Fix / mitigation:** Kept client hooks for UX; server still sanitizes HTML on autosave; README and companion/session copy state **best-effort**. Not claimable as absolute enforcement.
- **Where:** `session-guard.js`, `sanitize_html`, README

### Blocklist is blunt / incorrect

- **Symptom:** Whole domains blocked; bad fragments like `amazon.com/q`.
- **Fix:** Narrowed host list; added `AI_HOST_PATH_RULES` for shared domains; removed overly broad `/chat` path hint; aligned client heuristics.
- **Where:** `security.py`, `static/js/session-guard.js`

### Screenshot / new-tab shortcuts cannot be reliably blocked

- **Symptom:** UI claimed hard blocks the browser/OS cannot provide.
- **Fix:** Softened warnings to “best-effort / may still be possible”; stopped pretending `preventDefault` blocks OS screenshots or Ctrl+T.
- **Where:** `static/js/index.js`

### API auth returns HTML redirects

- **Symptom:** Unauthenticated `/api/*` got HTML landing redirects.
- **Fix:** `login_required` returns JSON `401` when the request wants JSON / is under `/api/`.
- **Where:** `app.py` → `login_required`, `_wants_json_response`

### Debug mode if run as main

- **Symptom:** `python app.py` enabled debug.
- **Fix:** `debug` only when `FLASK_DEBUG=1`.
- **Where:** `app.py` bottom

### SQLite + no migrations

- **Symptom:** Schema drift; weak concurrency story.
- **Fix:** Enable `PRAGMA foreign_keys=ON`; lightweight `PRAGMA table_info` ensure for `share_token`; document SQLite limits. Full Alembic not added (kept minimal).
- **Where:** `app.py` initialization
