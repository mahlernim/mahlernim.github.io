# Sangzin Ahn - Personal Website

Automated personal website for Dr. Sangzin Ahn, hosted on GitHub Pages.
Mirrors content from `ahn-lab.org` and automatically updates publications from PubMed and video playlists from YouTube.

## Features
- **Modern Design:** Clean, responsive interface with academic focus.
- **Automated Updates:** Fetches new papers from PubMed and videos from YouTube weekly via GitHub Actions.

## Project Structure
```
.
├── scripts/
│   ├── fetch_pubmed.py    # Fetches publications
│   ├── fetch_youtube.py  # Fetches playlist items
│   └── build.py          # Generates index.html
├── templates/
│   └── index.html        # Jinja2 template
├── static/
│   └── css/style.css     # Styles
└── index.html            # Generated site (Do not edit directly)
```

## How to Run Locally
1. Install dependencies:
   ```bash
   pip install requests feedparser jinja2
   ```
2. Run the build script:
   ```bash
   python build.py
   ```
3. Open `website/index.html` in your browser.

## Deployment

The standalone app landing page lives in `ttokttok/index.html` and
`ttokttok/style.css` at `https://ahn-lab.org/ttokttok/`. Edit those files
directly. The offline build preserves them and includes the route in the
project listings and sitemap.

Its screenshots and icon come from the MIT-licensed native
[gas-self-meter-ai project](https://github.com/mahlernim/gas-self-meter-ai),
captured in the app's demo mode. Attribution and the MIT license text are retained
in `ttokttok/assets/LICENSE-app.txt`. The browser catalog is a separately written
official-link directory. It does not carry native authentication, billing retrieval,
or submission capability into the browser.

The 20-second `demo.mp4` walks through four real app screens —
`meter.png`, `submission.png`, `alerts.png` and `history.png` in
`ttokttok/assets`. Rebuild it, its poster and the social preview with
`python scripts/render_ttokttok_demo.py`, which needs Pillow, the Malgun
Gothic fonts and ffmpeg on PATH. Replace the screenshots first when the app's
screens change. Media generation is manual, outside the daily content job.
The landing has no login, submission API, analytics or signup form. Android
enrollment links point to Google Groups and Google Play. The Android app is
recommended on every device, alongside the browser workspace.

### Local web app

`web/ttokttok` contains the TypeScript source for `/ttokttok/app/`. Its generated
static output is committed under `ttokttok/app` for the existing GitHub Pages
deployment. Source, dependencies, tests and developer documentation are excluded
from Pages. Node.js 24 is used in CI.

```sh
cd web/ttokttok
npm ci
npm test
npm run build
npx playwright install chromium webkit
npm run test:browser
```

The app saves one household in IndexedDB using atomic transactions and revision
checks across tabs. It imports public Android JSON schemas 1–4 and exports
schema 4, excluding authentication state. The model and compatibility baseline
is gas-self-meter-ai revision `ac6eb498fa90e00c4f5475c31566c573053dbad2`.
Backup exports contain household records and may contain customer/contract
display information. They are ordinary readable files, not encrypted backups.
Import is validated before replacement and never initiates supplier requests.

There is no backend, synchronization, analytics or external AI service. Provider
links open official sites. The launched browser functions are local meter readings,
manual billing periods, estimate display, local backup import/export, generic
calendar files, and official-site handoff. Browser connection constraints and
future adapter acceptance are documented in `docs/browser-provider-support.md`.
Personal data and downloaded backups are never included in the offline cache.

The app-scoped service worker installs a complete versioned shell before offering
an update. Applying an update requires the user to handle any unsaved draft first.
Generic calendar files contain only a weekday, hour and meter-check reminder.
They contain no household data and require no calendar-generation service.

Deploy landing changes and generated app output together. After Pages completes,
check both URLs and the manifest/service worker scope. A rollback must revert only
the deployed static shell. It must keep the IndexedDB database, public backup
schema 1–4 import support, and downloadable backups intact. Never use a
service-worker update to clear household records. See
`docs/ttokttok-validation.md` for the separate physical iPhone Safari and Home
Screen checklist. Automated browser runs do not establish those device results.

This repository is configured to deploy via **GitHub Pages**.
The `update.yml` workflow runs weekly to regenerate the site with fresh data.

## How It Works (Data Preservation)
1.  **Incremental Updates**: `fetch_pubmed.py` only searches for papers from the **last 365 days**.
2.  **Smart Caching**: All paper data is stored in `data/publications_cache.json`.
    *   New papers are **added** to this file.
    *   **Existing papers are preserved.** This means any manual edits you make to themes or titles in the JSON file will **NOT** be overwritten by the weekly update.
3.  **Manual Override**: If you need to re-fetch *everything*, you can run `scripts/fetch_all_pubmed.py` locally.
