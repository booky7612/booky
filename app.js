const state = {
  sourceRows: [],
  headers: [],
  enrichedRows: [],
  activeFilename: "enriched-books.csv",
};

const csvFileInput = document.getElementById("csvFile");
const isbnColumnSelect = document.getElementById("isbnColumn");
const exportFilenameInput = document.getElementById("exportFilename");
const apiKeyInput = document.getElementById("apiKey");
const settingsToggle = document.getElementById("settingsToggle");
const settingsModal = document.getElementById("settingsModal");
const settingsBackdrop = document.getElementById("settingsBackdrop");
const settingsClose = document.getElementById("settingsClose");
const processButton = document.getElementById("processButton");
const exportButton = document.getElementById("exportButton");
const loadPasteButton = document.getElementById("loadPasteButton");
const isbnPasteInput = document.getElementById("isbnPaste");
const fileSummary = document.getElementById("fileSummary");
const statusBanner = document.getElementById("statusBanner");
const previewMeta = document.getElementById("previewMeta");
const previewHead = document.getElementById("previewHead");
const previewBody = document.getElementById("previewBody");
const tableSearchInput = document.getElementById("tableSearch");
const uploadZone = document.querySelector(".upload-zone");
const columnHint = document.getElementById("columnHint");
const columnField = document.getElementById("columnField");

const AUTHOR_METAFIELD = "Author (product.metafields.custom.author)";
const PUBLICATION_DATE_METAFIELD = "Publication Date (product.metafields.custom.publication_date)";
const PUBLISHER_METAFIELD = "Publisher (product.metafields.custom.publisher)";
const PAGE_COUNT_METAFIELD = "Page Count (product.metafields.custom.page_count)";
const TRANSLATOR_METAFIELD = "Translator (product.metafields.custom.translator)";
const FORMAT_METAFIELD = "Format (product.metafields.custom.format)";

const OUTPUT_COLUMNS = [
  "Handle",
  "Title",
  "Body (HTML)",
  "Type",
  "Option1 Name",
  "Option1 Value",
  "Image Src",
  AUTHOR_METAFIELD,
  PUBLICATION_DATE_METAFIELD,
  PUBLISHER_METAFIELD,
  PAGE_COUNT_METAFIELD,
  TRANSLATOR_METAFIELD,
  FORMAT_METAFIELD,
];

const PREVIEW_COLUMN_LABELS = {
  "Body (HTML)": "Description",
  "Image Src": "Cover",
  [AUTHOR_METAFIELD]: "Author",
  [PUBLICATION_DATE_METAFIELD]: "Publication Date",
  [PUBLISHER_METAFIELD]: "Publisher",
  [PAGE_COUNT_METAFIELD]: "Page Count",
  [TRANSLATOR_METAFIELD]: "Translator",
  [FORMAT_METAFIELD]: "Format",
};

const REQUEST_DELAY_MS = 350;
const MAX_RETRIES = 4;
const openLibraryFormatCache = {};

clearLegacyStoredApiKey();
renderPreviewHeader();

csvFileInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) {
    loadCsvFile(file);
  }
});

loadPasteButton.addEventListener("click", () => {
  loadPastedIsbns(isbnPasteInput.value);
});

settingsToggle.addEventListener("click", () => {
  setSettingsOpen(true);
});

settingsBackdrop.addEventListener("click", () => {
  setSettingsOpen(false);
});

settingsClose.addEventListener("click", () => {
  setSettingsOpen(false);
});

tableSearchInput.addEventListener("input", () => {
  renderPreview(getFilteredRows());
});

["dragenter", "dragover"].forEach((eventName) => {
  uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadZone.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadZone.classList.remove("dragover");
  });
});

uploadZone.addEventListener("drop", (event) => {
  const [file] = event.dataTransfer.files;
  if (file) {
    csvFileInput.files = event.dataTransfer.files;
    loadCsvFile(file);
  }
});

processButton.addEventListener("click", async () => {
  const isbnColumn = isbnColumnSelect.value;
  const shouldUseSelectedColumn = !isbnColumnSelect.disabled;

  if (shouldUseSelectedColumn && !isbnColumn) {
    setStatus("Select the ISBN column before fetching data.", "warn");
    return;
  }

  processButton.disabled = true;
  exportButton.disabled = true;
  state.enrichedRows = [];
  renderPreview([]);

  const total = state.sourceRows.length;
  setStatus(`Looking up ${total} row${total === 1 ? "" : "s"} from Google Books...`, "info");

  const enrichedRows = [];
  let foundCount = 0;

  for (let index = 0; index < total; index += 1) {
    const row = state.sourceRows[index];
    const rawIsbn = shouldUseSelectedColumn ? row[isbnColumn] : row["ISBN Number"];
    const isbn = normalizeIsbn(rawIsbn);

    setStatus(`Processing row ${index + 1} of ${total}...`, "info");

    if (!isbn) {
      enrichedRows.push(buildEmptyRow(rawIsbn, "Missing or invalid ISBN-13."));
      continue;
    }

    const book = await fetchBookByIsbn(isbn);
    if (book.found) {
      foundCount += 1;
    }
    enrichedRows.push(book.row);
    renderPreview(filterRows(enrichedRows));

    if (index < total - 1) {
      await delay(REQUEST_DELAY_MS);
    }
  }

  state.enrichedRows = enrichedRows;
  exportButton.disabled = enrichedRows.length === 0;
  processButton.disabled = false;
  renderPreview(getFilteredRows());

  const missingCount = total - foundCount;
  setStatus(
    `Finished. Found metadata for ${foundCount} row${foundCount === 1 ? "" : "s"}; ${missingCount} row${missingCount === 1 ? "" : "s"} had partial or no results.`,
    missingCount > 0 ? "warn" : "info",
  );
});

exportButton.addEventListener("click", () => {
  if (!state.enrichedRows.length) {
    return;
  }

  const csv = serializeCsv([OUTPUT_COLUMNS].concat(state.enrichedRows.map((row) => OUTPUT_COLUMNS.map((key) => getValue(row[key], "")))));
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = sanitizeFilename(exportFilenameInput.value || state.activeFilename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

exportFilenameInput.addEventListener("input", () => {
  state.activeFilename = sanitizeFilename(exportFilenameInput.value || "enriched-books.csv");
});

async function loadCsvFile(file) {
  resetUi();

  try {
    const text = await file.text();
    const parsed = parseCsv(text);

    if (parsed.length < 2) {
      throw new Error("The CSV needs a header row and at least one data row.");
    }

    const headers = parsed[0].map((value, index) => {
      const headerValue = typeof value === "string" ? value.trim() : "";
      return headerValue || `Column ${index + 1}`;
    });
    const rows = parsed.slice(1)
      .filter((row) => row.some((cell) => String(getValue(cell, "")).trim() !== ""))
      .map((row) => Object.fromEntries(headers.map((header, index) => [header, getValue(row[index], "")])));

    if (!rows.length) {
      throw new Error("The CSV does not contain any non-empty data rows.");
    }

    state.headers = headers;
    state.sourceRows = rows;
    state.activeFilename = deriveExportFilename(file.name);
    exportFilenameInput.value = state.activeFilename;

    populateColumnSelect(headers);
    updateFileSummary(file.name, rows.length, headers.length);
    previewMeta.textContent = `Loaded ${rows.length} row${rows.length === 1 ? "" : "s"}. Choose an ISBN column to enrich the data.`;
    setStatus("CSV loaded. Select the ISBN column and fetch book data.", "info");
  } catch (error) {
    setStatus((error && error.message) || "Unable to parse the CSV file.", "warn");
    previewMeta.textContent = "No data loaded yet.";
    renderPreview([]);
  }
}

function populateColumnSelect(headers) {
  isbnColumnSelect.innerHTML = '<option value="">Select a column</option>';
  headers.forEach((header) => {
    const option = document.createElement("option");
    option.value = header;
    option.textContent = header;
    isbnColumnSelect.appendChild(option);
  });

  const autoMatch = headers.find((header) => /isbn/i.test(header));
  if (autoMatch) {
    isbnColumnSelect.value = autoMatch;
  }

  isbnColumnSelect.disabled = false;
  columnField.classList.remove("hidden");
  columnHint.textContent = "Required for CSV uploads.";
  processButton.disabled = false;
}

function updateFileSummary(filename, rowCount, columnCount) {
  fileSummary.classList.remove("hidden");
  fileSummary.textContent = `${filename} loaded with ${rowCount} row${rowCount === 1 ? "" : "s"} and ${columnCount} column${columnCount === 1 ? "" : "s"}.`;
}

function loadPastedIsbns(rawInput) {
  resetUi();

  const entries = rawInput
    .split(/[\n,]+/g)
    .map((value) => value.trim())
    .filter(Boolean);

  if (!entries.length) {
    setStatus("Paste at least one ISBN before loading.", "warn");
    return;
  }

  state.headers = ["ISBN Number"];
  state.sourceRows = entries.map((isbn) => ({ "ISBN Number": isbn }));
  state.activeFilename = "pasted-isbns-enriched.csv";
  exportFilenameInput.value = state.activeFilename;

  isbnColumnSelect.disabled = true;
  isbnColumnSelect.innerHTML = '<option value="">Using pasted ISBN input</option>';
  columnField.classList.add("hidden");
  processButton.disabled = false;
  fileSummary.classList.remove("hidden");
  fileSummary.textContent = `Loaded ${entries.length} pasted ISBN${entries.length === 1 ? "" : "s"}.`;
  columnHint.textContent = "Column selection is skipped for pasted ISBN input.";
  previewMeta.textContent = `Loaded ${entries.length} ISBN${entries.length === 1 ? "" : "s"} from pasted text. Fetch book data when ready.`;
  setStatus("Pasted ISBNs loaded. Fetch book data to preview the results.", "info");
}

function resetUi() {
  state.sourceRows = [];
  state.headers = [];
  state.enrichedRows = [];
  isbnColumnSelect.disabled = true;
  isbnColumnSelect.innerHTML = '<option value="">Select a column</option>';
  columnField.classList.add("hidden");
  processButton.disabled = true;
  exportButton.disabled = true;
  fileSummary.classList.add("hidden");
  tableSearchInput.value = "";
  columnHint.textContent = "Required only for CSV uploads.";
  renderPreview([]);
}

function setStatus(message, type) {
  statusBanner.textContent = message;
  statusBanner.className = `status-banner ${type}`;
}

function renderPreview(rows) {
  previewBody.innerHTML = "";
  const hasLoadedSource = state.sourceRows.length > 0;
  const activeQuery = tableSearchInput.value.trim();

  if (!rows.length) {
    let emptyMessage = "Upload a CSV to begin.";
    if (state.enrichedRows.length && activeQuery) {
      emptyMessage = "No matching results.";
    } else if (hasLoadedSource) {
      emptyMessage = "No enriched rows to display yet.";
    }

    previewBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="${OUTPUT_COLUMNS.length}">${emptyMessage}</td>
      </tr>
    `;
    previewMeta.textContent = buildPreviewMeta(0);
    return;
  }

  const fragment = document.createDocumentFragment();
  rows.forEach((row, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = OUTPUT_COLUMNS.map((column) => renderPreviewCell(column, row, index)).join("");
    fragment.appendChild(tr);
  });

  previewBody.appendChild(fragment);
  attachDescriptionToggles();
  previewMeta.textContent = buildPreviewMeta(rows.length);
}

function renderPreviewHeader() {
  previewHead.innerHTML = `<tr>${OUTPUT_COLUMNS.map((column) => {
    const label = getPreviewColumnLabel(column);
    const title = label === column ? "" : ` title="${escapeAttribute(column)}"`;
    return `<th${title}>${escapeHtml(label)}</th>`;
  }).join("")}</tr>`;
}

function getPreviewColumnLabel(column) {
  return PREVIEW_COLUMN_LABELS[column] || column;
}

function renderPreviewCell(column, row, index) {
  if (column === "Body (HTML)") {
    const descriptionId = `description-${index}`;
    const fullDescription = row[column] || "";
    const previewDescription = buildDescriptionPreview(fullDescription);
    return `
      <td class="description-cell">
        <div class="description-preview" data-expanded="false">
          <span id="${descriptionId}" class="description-text">${escapeHtml(previewDescription.preview)}</span>
          ${previewDescription.truncated ? `<button class="description-toggle" type="button" data-preview="${escapeAttribute(previewDescription.preview)}" data-full="${escapeAttribute(fullDescription)}" aria-controls="${descriptionId}" aria-expanded="false">Show more</button>` : ""}
        </div>
      </td>
    `;
  }

  if (column === "Image Src") {
    return `<td class="media-cell">${renderMediaCell(row[column], row["Title"])}</td>`;
  }

  return `<td>${escapeHtml(row[column])}</td>`;
}

function renderMediaCell(url, title) {
  if (!url) {
    return "";
  }

  const safeUrl = escapeAttribute(url);
  const safeTitle = escapeAttribute(title || "Book cover");
  return `
    <a class="cover-tile" href="${safeUrl}" target="_blank" rel="noreferrer">
      <img src="${safeUrl}" alt="${safeTitle}">
      <span>Open cover</span>
    </a>
  `;
}

async function fetchBookByIsbn(isbn) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(buildGoogleBooksUrl(isbn), buildRequestOptions());
      if (response.status === 429) {
        if (attempt < MAX_RETRIES) {
          await delay(getRetryDelayMs(attempt, response.headers.get("Retry-After")));
          continue;
        }

        return {
          found: false,
          row: buildEmptyRow(isbn, "Google Books rate limit reached (429). Add an API key or try again later."),
        };
      }

      if (!response.ok) {
        return {
          found: false,
          row: buildEmptyRow(isbn, `Request failed (${response.status}).`),
        };
      }

      const data = await response.json();
      const item = data && data.items && data.items[0];
      if (!item) {
        return {
          found: false,
          row: buildEmptyRow(isbn, "No Google Books result."),
        };
      }

      const volume = await fetchVolumeDetails(item);
      return await buildBookResult(isbn, volume);
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        await delay(getRetryDelayMs(attempt));
        continue;
      }

      return {
        found: false,
        row: buildEmptyRow(isbn, "Network error while contacting Google Books."),
      };
    }
  }

  return {
    found: false,
    row: buildEmptyRow(isbn, "Unknown lookup error."),
  };
}

async function fetchVolumeDetails(item) {
  if (!item || !item.id) {
    return item;
  }

  try {
    const response = await fetch(buildGoogleBooksVolumeUrl(item.id), buildRequestOptions());
    if (!response.ok) {
      return item;
    }

    const detailedItem = await response.json();
    return detailedItem && detailedItem.id ? detailedItem : item;
  } catch (error) {
    return item;
  }
}

async function buildBookResult(isbn, item) {
  const volumeInfo = item.volumeInfo || {};
  const identifiers = volumeInfo.industryIdentifiers || [];
  const isbn13Entry = identifiers.find((entry) => entry.type === "ISBN_13");
  const outputIsbn = (isbn13Entry && isbn13Entry.identifier) || isbn;
  const title = volumeInfo.title || `ISBN ${outputIsbn}`;
  const description = cleanDescription(volumeInfo.description);
  const author = Array.isArray(volumeInfo.authors) ? volumeInfo.authors.join(", ") : "";
  const publicationDate = formatPublicationDate(volumeInfo.publishedDate);
  const publisher = volumeInfo.publisher || "";
  const translator = extractTranslator(volumeInfo);
  const format = await resolveFormat(outputIsbn, volumeInfo);
  const coverImageUrl = buildConsistentCoverImageUrl(outputIsbn, volumeInfo.imageLinks || {});

  return {
    found: true,
    row: {
      "Handle": buildShopifyHandle(title, outputIsbn),
      "Title": title,
      "Body (HTML)": description,
      "Type": "Book",
      "Option1 Name": "Title",
      "Option1 Value": "Default Title",
      "Image Src": coverImageUrl,
      [AUTHOR_METAFIELD]: author,
      [PUBLICATION_DATE_METAFIELD]: publicationDate,
      [PUBLISHER_METAFIELD]: publisher,
      [PAGE_COUNT_METAFIELD]: volumeInfo.pageCount ? String(volumeInfo.pageCount) : "",
      [TRANSLATOR_METAFIELD]: translator,
      [FORMAT_METAFIELD]: format,
    },
  };
}

function buildEmptyRow(isbn, descriptionFallback) {
  const normalizedIsbn = normalizeIsbn(isbn);

  return {
    "Handle": buildShopifyHandle("", normalizedIsbn || isbn),
    "Title": normalizedIsbn ? `ISBN ${normalizedIsbn}` : "Book",
    "Body (HTML)": descriptionFallback || "",
    "Type": "Book",
    "Option1 Name": "Title",
    "Option1 Value": "Default Title",
    "Image Src": "",
    [AUTHOR_METAFIELD]: "",
    [PUBLICATION_DATE_METAFIELD]: "",
    [PUBLISHER_METAFIELD]: "",
    [PAGE_COUNT_METAFIELD]: "",
    [TRANSLATOR_METAFIELD]: "",
    [FORMAT_METAFIELD]: "",
  };
}

function normalizeIsbn(value) {
  const cleaned = String(getValue(value, ""))
    .trim()
    .replace(/[^0-9]/g, "");
  if (/^\d{13}$/.test(cleaned)) {
    return cleaned;
  }
  return "";
}

function buildShopifyHandle(title, isbn) {
  const source = String(title || isbn || "book")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const baseHandle = source || "book";
  const isbnSuffix = normalizeIsbn(isbn);
  if (isbnSuffix && !baseHandle.includes(isbnSuffix)) {
    return `${baseHandle}-${isbnSuffix}`;
  }

  return baseHandle;
}

function deriveExportFilename(filename) {
  const baseName = filename.replace(/\.csv$/i, "");
  return sanitizeFilename(`${baseName || "enriched-books"}-enriched.csv`);
}

function sanitizeFilename(filename) {
  const cleaned = String(filename || "enriched-books.csv")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-");
  return cleaned.toLowerCase().endsWith(".csv") ? cleaned : `${cleaned}.csv`;
}

function parseCsv(input) {
  const rows = [];
  let row = [];
  let value = "";
  let insideQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const nextChar = input[index + 1];

    if (insideQuotes) {
      if (char === '"' && nextChar === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        insideQuotes = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      insideQuotes = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (char === "\r") {
      continue;
    } else {
      value += char;
    }
  }

  if (value !== "" || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function serializeCsv(rows) {
  return rows
    .map((row) => row.map(escapeCsvValue).join(","))
    .join("\r\n");
}

function escapeCsvValue(value) {
  const stringValue = String(getValue(value, ""));
  if (/[",\r\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function escapeHtml(value) {
  return String(getValue(value, ""))
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function getValue(value, fallback) {
  return value === null || value === undefined ? fallback : value;
}

function clearLegacyStoredApiKey() {
  try {
    localStorage.removeItem("booky_google_books_api_key");
  } catch (error) {
    // Ignore local storage failures.
  }

  apiKeyInput.value = "";
}

function setSettingsOpen(isOpen) {
  settingsModal.classList.toggle("hidden", !isOpen);
  settingsModal.setAttribute("aria-hidden", isOpen ? "false" : "true");
  settingsToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
}

function buildGoogleBooksUrl(isbn) {
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", `isbn:${isbn}`);
  url.searchParams.set("projection", "full");
  url.searchParams.set("maxResults", "1");

  const apiKey = apiKeyInput.value.trim();
  if (apiKey) {
    url.searchParams.set("key", apiKey);
  }

  return url.toString();
}

function buildGoogleBooksVolumeUrl(volumeId) {
  const url = new URL(`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(volumeId)}`);
  url.searchParams.set("projection", "full");

  const apiKey = apiKeyInput.value.trim();
  if (apiKey) {
    url.searchParams.set("key", apiKey);
  }

  return url.toString();
}

function getRetryDelayMs(attempt, retryAfterHeader) {
  const retryAfterSeconds = Number(retryAfterHeader);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }

  return Math.min(2000 * Math.pow(2, attempt), 12000);
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function buildDescriptionPreview(description) {
  const fullText = cleanDescription(description);
  if (!fullText) {
    return { preview: "", truncated: false };
  }

  const words = fullText.split(/\s+/);
  if (words.length <= 30) {
    return { preview: fullText, truncated: false };
  }

  return {
    preview: `${words.slice(0, 30).join(" ")}...`,
    truncated: true,
  };
}

function getFilteredRows() {
  return filterRows(state.enrichedRows);
}

function filterRows(rows) {
  const query = tableSearchInput.value.trim().toLowerCase();
  if (!query) {
    return rows;
  }

  return rows.filter((row) => {
    return OUTPUT_COLUMNS.some((column) => {
      return String(getValue(row[column], "")).toLowerCase().includes(query);
    });
  });
}

function buildPreviewMeta(visibleCount) {
  const totalCount = state.enrichedRows.length;
  if (!totalCount) {
    return "No data loaded yet.";
  }

  if (!tableSearchInput.value.trim()) {
    return `Previewing ${visibleCount} enriched row${visibleCount === 1 ? "" : "s"}.`;
  }

  return `Showing ${visibleCount} of ${totalCount} enriched row${totalCount === 1 ? "" : "s"}.`;
}

function attachDescriptionToggles() {
  const toggles = previewBody.querySelectorAll(".description-toggle");
  toggles.forEach((button) => {
    button.addEventListener("click", () => {
      const container = button.closest(".description-preview");
      const text = container.querySelector(".description-text");
      const isExpanded = button.getAttribute("aria-expanded") === "true";

      if (isExpanded) {
        text.textContent = button.getAttribute("data-preview") || "";
        button.textContent = "Show more";
        button.setAttribute("aria-expanded", "false");
        container.setAttribute("data-expanded", "false");
      } else {
        text.textContent = button.getAttribute("data-full") || "";
        button.textContent = "Show less";
        button.setAttribute("aria-expanded", "true");
        container.setAttribute("data-expanded", "true");
      }
    });
  });
}

function extractTranslator(volumeInfo) {
  if (!Array.isArray(volumeInfo.authors) || !volumeInfo.authors.length) {
    return "";
  }

  const translatorNames = volumeInfo.authors.filter((name) => /translator/i.test(name));
  if (translatorNames.length) {
    return translatorNames.join(", ");
  }

  return "";
}

function getBestCoverImageUrl(imageLinks) {
  const candidates = [
    imageLinks.extraLarge,
    imageLinks.large,
    imageLinks.medium,
    imageLinks.small,
    imageLinks.thumbnail,
    imageLinks.smallThumbnail,
  ];

  const firstAvailable = candidates.find((url) => typeof url === "string" && url.trim() !== "");
  if (!firstAvailable) {
    return "";
  }

  return upgradeGoogleCoverUrl(firstAvailable);
}

function buildConsistentCoverImageUrl(isbn, imageLinks) {
  if (isbn) {
    return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg`;
  }

  return getBestCoverImageUrl(imageLinks);
}

function upgradeGoogleCoverUrl(url) {
  const normalizedUrl = String(url).replace("http://", "https://");

  try {
    const parsed = new URL(normalizedUrl);

    if (/books\.google\./i.test(parsed.hostname) || /googleusercontent\.com$/i.test(parsed.hostname)) {
      parsed.searchParams.delete("edge");

      if (parsed.searchParams.has("zoom")) {
        parsed.searchParams.set("zoom", "0");
      }

      if (parsed.searchParams.has("fife")) {
        parsed.searchParams.set("fife", "w800-h1200");
      }

      if (!parsed.searchParams.has("img")) {
        parsed.searchParams.set("img", "1");
      }

      return parsed.toString();
    }
  } catch (error) {
    return normalizedUrl;
  }

  return normalizedUrl;
}

async function resolveFormat(isbn, volumeInfo) {
  const openLibraryFormat = await fetchOpenLibraryFormat(isbn);
  if (openLibraryFormat) {
    return openLibraryFormat;
  }

  return inferFormat(volumeInfo);
}

async function fetchOpenLibraryFormat(isbn) {
  if (!isbn) {
    return "";
  }

  if (Object.prototype.hasOwnProperty.call(openLibraryFormatCache, isbn)) {
    return openLibraryFormatCache[isbn];
  }

  try {
    const url = new URL("https://openlibrary.org/api/books");
    url.searchParams.set("bibkeys", `ISBN:${isbn}`);
    url.searchParams.set("jscmd", "details");
    url.searchParams.set("format", "json");

    const response = await fetch(url.toString(), buildRequestOptions());
    if (!response.ok) {
      openLibraryFormatCache[isbn] = "";
      return "";
    }

    const data = await response.json();
    const entry = data && data[`ISBN:${isbn}`];
    const details = entry && entry.details;
    const physicalFormat = normalizeFormatValue(details && details.physical_format);

    openLibraryFormatCache[isbn] = physicalFormat;
    return physicalFormat;
  } catch (error) {
    openLibraryFormatCache[isbn] = "";
    return "";
  }
}

function buildRequestOptions() {
  return {
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
  };
}

function inferFormat(volumeInfo) {
  const candidates = [
    volumeInfo.subtitle,
    volumeInfo.title,
    volumeInfo.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\bpaperback\b/.test(candidates)) {
    return "Paperback";
  }
  if (/\bhardback\b/.test(candidates) || /\bhardcover\b/.test(candidates)) {
    return "Hardback";
  }

  return "";
}

function normalizeFormatValue(value) {
  const text = String(getValue(value, "")).trim().toLowerCase();
  if (!text) {
    return "";
  }

  if (text.includes("paperback")) {
    return "Paperback";
  }
  if (text.includes("hardback") || text.includes("hardcover")) {
    return "Hardback";
  }

  return "";
}

function cleanDescription(value) {
  const rawText = String(getValue(value, ""));
  if (!rawText) {
    return "";
  }

  const withoutTags = rawText
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/p\s*>/gi, "\n\n")
    .replace(/<[^>]*>/g, " ");

  return decodeHtmlEntities(withoutTags)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function decodeHtmlEntities(text) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

function formatPublicationDate(value) {
  const raw = String(getValue(value, "")).trim();
  if (!raw) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-").map((part) => Number(part));
    const date = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
    }
  }

  if (/^\d{4}-\d{2}$/.test(raw)) {
    const [year, month] = raw.split("-").map((part) => Number(part));
    const date = new Date(Date.UTC(year, month - 1, 1));
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
    }
  }

  return raw;
}
