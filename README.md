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
This repository is configured to deploy via **GitHub Pages**.
The `update.yml` workflow runs weekly to regenerate the site with fresh data.

## How It Works (Data Preservation)
1.  **Incremental Updates**: `fetch_pubmed.py` only searches for papers from the **last 365 days**.
2.  **Smart Caching**: All paper data is stored in `data/publications_cache.json`.
    *   New papers are **added** to this file.
    *   **Existing papers are preserved.** This means any manual edits you make to themes or titles in the JSON file will **NOT** be overwritten by the weekly update.
3.  **Manual Override**: If you need to re-fetch *everything*, you can run `scripts/fetch_all_pubmed.py` locally.
