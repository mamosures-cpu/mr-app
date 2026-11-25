# Shashvi MR App

Field app for Shashvi Remedies Private Limited medical representatives.

- `index.html`, `manifest.json`, icons: the app page served by GitHub Pages.
- The page talks to the Google Apps Script backend (`src/Code.gs`, `doPost`). All data stays in the Google Sheet.
- `src/Index.html` is the source page; rebuild the site with `python3 src/build_web.py` after changing it.

Each person opens the app with their own private link (`?k=...`). Do not share links.
