# Booky

Static browser app for turning either a CSV column of ISBN values or a pasted ISBN list into a Shopify-ready product CSV using the Google Books API.

## Requirements

- A modern browser with JavaScript enabled
- Internet access for Google Books API lookups
- Python 3.9 or newer is optional and only needed for the local launcher
- No third-party Python or Node packages are required

## Features

- Upload a CSV file from your machine
- Paste ISBN values directly as comma-separated or line-separated text
- Choose which column contains ISBN-13 values
- Build a Shopify product CSV with:
  - Core Shopify columns such as `Title`, `Description`, `Type`, and `Product image URL`
  - `Product image URL` for book cover imports
  - Product metafield columns for `Author`, `Publication Date`, `Publisher`, `Page Count`, `Translator`, and `Format`
- Preview the results in the browser with:
  - Search across all fields
  - Expand/collapse descriptions
  - Cover thumbnails in the `Product image URL` column
- Export the preview as a new CSV file
- Use a user-provided Google Books API key for the current browser tab only

## Host on GitHub Pages

Booky is ready to host as a static GitHub Pages site. It does not need a backend build step.

1. Push this folder to a GitHub repository.
2. In the repository settings, open **Pages**.
3. Set **Source** to **Deploy from a branch**.
4. Select the branch and `/root` folder.
5. Save and open the GitHub Pages URL after the first deployment finishes.

GitHub Pages serves these files directly:

- `index.html`
- `styles.css`
- `app.js`
- `.nojekyll`

The local launcher files can remain in the repository. GitHub Pages ignores them.

## API key security

Booky has no hardcoded API key. Each user enters their own Google Books API key in the settings modal.

The key is:

- Kept only in the current page's memory while the tab is open
- Not written to `localStorage`, `sessionStorage`, cookies, or the exported CSV
- Sent directly from the browser to `https://www.googleapis.com/books/v1/volumes`
- Cleared on reload, tab close, or navigation away from the page

Because GitHub Pages is static hosting, there is no private server that can hide a Google API key from the browser. For the safest setup, create a dedicated Google Books API key and restrict it in Google Cloud by HTTP referrer to your GitHub Pages origin, for example:

```text
https://your-github-user.github.io/your-repo/*
```

The page also includes a restrictive Content Security Policy and `no-referrer` policy to limit where scripts can run and where browser requests can connect.

## Run locally

### Windows

Double-click one of these files in the project folder:

- `Booky.vbs`
- `Booky.cmd`
- `booky.pyw`

### macOS

Double-click `Booky.command`.

If macOS blocks it the first time, run this once in Terminal from the project folder:

```bash
chmod +x Booky.command
```

### Terminal

Run from a terminal:

```powershell
python server.py
```

Then open `http://127.0.0.1:8000/` if your browser does not open automatically.

## Notes

- The app expects ISBN-13 values. It accepts digits with optional hyphens or spaces.
- Pasted input accepts commas, new lines, or a mix of both as separators.
- Google Books metadata varies by title. `Translator`, `Format`, page count, and cover art may be blank if Google does not return them.
- The exported CSV uses Shopify product column names and `product.metafields.custom.*` metafield headers.
- When running locally with `server.py`, stop the terminal process with `Ctrl+C`.
- Exported CSV contains only the enriched output columns shown in the preview.
