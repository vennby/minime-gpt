<h1 align="center"> MinimēGPT </h1>

<p align="center"> A clear, isolated writing environment untainted by generative AI. </p>

<img src="https://64.media.tumblr.com/e563e79c77a782b4f4b188060bbef8d8/tumblr_pdfueymmRj1xchmwfo1_500.gif" width="2000" />

<p align="justify"> MinimēGPT is a way of going back to the time when writing involved a blank page, an energy drink, and just your brain. It's an isolated writing environment that allows for pure, old-school research, nurtures critical thinking, and preserves your intellectual integrity. </p>

<p align="justify"> MinimēGPT, as suggested by the name, is a <b>minimal writing platform</b> with guarded writing sessions that actively work to block distractions and AI interference with your creative processes.</p>

### Features offered by MinimēGPT

- [x] Focus writing mode with fullscreen session lock behavior
- [x] Draft editing with autosave before a locked session
- [x] Multi-device pairing + companion lock overlay
- [x] Paper formats for PDF export (Letter, A4, Legal)
- [x] Writing session history in Settings
- [x] Share links with rotate / revoke

### Notes

- Browser-only fullscreen locks and AI URL blocking are **best-effort**. The OS, other browsers, and disabled JavaScript are outside what a web app can control. See `docs/breaks/` for known limitations and fixes.
- Set `SECRET_KEY` (or rely on the auto-generated `instance/secret_key` in development), plus `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. Optionally set `REDIRECT_URI` and `PREFERRED_URL_SCHEME` (`http` or `https`).
