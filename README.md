# Booky

Static browser app for turning either a CSV column of ISBN values or a pasted ISBN list into a Shopify-ready product CSV using the Google Books API.

## Requirements

- A modern browser with JavaScript enabled
- Internet access for Google Books API lookups
- Python 3.9 or newer is optional and only needed for the local launcher
- No third-party Python or Node packages are required. A local ZXing browser bundle is included for barcode scanning.

## Features

- Upload a CSV file from your machine
- Paste ISBN values directly as comma-separated or line-separated text
- Scan ISBN barcodes with a device camera
- Choose which column contains ISBN-13 values
- Build a Shopify product CSV with:
  - Core Shopify columns such as `Title`, `Body (HTML)`, `Type`, `Option1 Name`, `Option1 Value`, `Image Src`, and `Handle`
  - `Image Src` for book cover imports
  - Product metafield columns for `Author`, `Publication Date`, `Publisher`, `Page Count`, `Dimensions`, `Translator`, and `Format`
- Preview the results in the browser with:
  - Search across all fields
  - Expand/collapse descriptions
  - Cover thumbnails in the `Image Src` column
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
- `vendor/zxing-browser.min.js`
- `.nojekyll`

The local launcher files can remain in the repository. GitHub Pages ignores them.

## Host as a web service

Static hosting is the best fit for Booky. If a platform such as Render, Railway,
or Fly treats the project as a Python web service, use this start command:

```bash
python server.py
```

The server reads the platform-provided `PORT` environment variable and binds to
`0.0.0.0` during hosted deployments so external health checks can reach it. For
local runs without `PORT`, it still serves on `127.0.0.1:8000` and opens the
browser automatically.

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
- Barcode scanning uses the device camera over HTTPS and prefers the rear camera when the browser exposes one. It scans EAN-13 book barcodes, validates `978` or `979` ISBN-13 values, and adds unique scans to the ISBN list before metadata lookup.
- The scanner uses the browser's native `BarcodeDetector` API when available and falls back to the local ZXing bundle for browsers such as Safari on iPhone and iPad.
- Google Books metadata varies by title. `Translator`, `Format`, dimensions, page count, and cover art may be blank if Google does not return them.
- Cover exports prefer Open Library cover IDs when metadata confirms a cover exists, then fall back to Google Books image URLs without rewriting Google image sizing parameters. The browser preview also tries remaining candidate images if the primary cover fails to load.
- If the browser preview successfully switches a broken cover to its fallback image, the exported `Image Src` is updated to that working fallback URL.
- Format uses Open Library edition metadata when available, then falls back to binding words found in Google Books title, subtitle, or description text.
- The exported CSV uses Shopify product column names and `product.metafields.custom.*` metafield headers.
- Every exported row includes `Option1 Name` as `Title` and `Option1 Value` as `Default Title`, which keeps Shopify's product option import requirements satisfied for books with no real variants.
- Create the product metafields in Shopify before importing this CSV. The exported metadata values are plain text, so `single line text` metafields are the safest default for Author, Publication Date, Publisher, Page Count, Dimensions, Translator, and Format.
- The export intentionally omits commerce fields such as price, inventory, tax, and publication status. The `Vendor` column is populated from the author name so Shopify can import the author as the product vendor. Review imported products before publishing or selling them.
- When Google Books returns dimensions, the export stores them in `Dimensions (product.metafields.custom.dimensions)`.
- When running locally with `server.py`, stop the terminal process with `Ctrl+C`.
- Exported CSV contains only the enriched output columns shown in the preview.
