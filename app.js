const state = {
  sourceRows: [],
  headers: [],
  enrichedRows: [],
  activeFilename: "enriched-books.csv",
  scannedIsbns: [],
  scannerStream: null,
  scannerDetector: null,
  scannerZxingControls: null,
  scannerFrameId: 0,
  scannerIsDetecting: false,
  scannerLastValue: "",
  scannerLastScanAt: 0,
  scannerOpenRequestId: 0,
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
const scanButton = document.getElementById("scanButton");
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
const scannerModal = document.getElementById("scannerModal");
const scannerBackdrop = document.getElementById("scannerBackdrop");
const scannerClose = document.getElementById("scannerClose");
const scannerVideo = document.getElementById("scannerVideo");
const scannerStatus = document.getElementById("scannerStatus");
const scannerList = document.getElementById("scannerList");
const scannerCount = document.getElementById("scannerCount");
const useScannedButton = document.getElementById("useScannedButton");
const clearScannedButton = document.getElementById("clearScannedButton");

const AUTHOR_METAFIELD = "Author (product.metafields.custom.author)";
const PUBLICATION_DATE_METAFIELD = "Publication Date (product.metafields.custom.publication_date)";
const PUBLISHER_METAFIELD = "Publisher (product.metafields.custom.publisher)";
const PAGE_COUNT_METAFIELD = "Page Count (product.metafields.custom.page_count)";
const DIMENSIONS_METAFIELD = "Dimensions (product.metafields.custom.dimensions)";
const TRANSLATOR_METAFIELD = "Translator (product.metafields.custom.translator)";
const FORMAT_METAFIELD = "Format (product.metafields.custom.format)";

const OUTPUT_COLUMNS = [
  "Title",
  "Body (HTML)",
  AUTHOR_METAFIELD,
  "Image Src",
  PUBLISHER_METAFIELD,
  "Type",
  PUBLICATION_DATE_METAFIELD,
  PAGE_COUNT_METAFIELD,
  DIMENSIONS_METAFIELD,
  TRANSLATOR_METAFIELD,
  FORMAT_METAFIELD,
  "Option1 Name",
  "Option1 Value",
  "Handle",
];

const PREVIEW_COLUMN_LABELS = {
  "Body (HTML)": "Description",
  "Image Src": "Cover",
  "Option1 Name": "Option Name",
  "Option1 Value": "Option Value",
  [AUTHOR_METAFIELD]: "Author",
  [PUBLICATION_DATE_METAFIELD]: "Publication Date",
  [PUBLISHER_METAFIELD]: "Publisher",
  [PAGE_COUNT_METAFIELD]: "Page Count",
  [DIMENSIONS_METAFIELD]: "Dimensions",
  [TRANSLATOR_METAFIELD]: "Translator",
  [FORMAT_METAFIELD]: "Format",
};

const REQUEST_DELAY_MS = 350;
const MAX_RETRIES = 4;
const SCANNER_DUPLICATE_DELAY_MS = 1600;
const openLibraryMetadataCache = {};

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

scanButton.addEventListener("click", () => {
  openScanner();
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

scannerBackdrop.addEventListener("click", () => {
  closeScanner();
});

scannerClose.addEventListener("click", () => {
  closeScanner();
});

useScannedButton.addEventListener("click", () => {
  useScannedIsbns();
});

clearScannedButton.addEventListener("click", () => {
  state.scannedIsbns = [];
  renderScannedIsbns();
  setScannerStatus("Ready to scan another book barcode.");
});

scannerList.addEventListener("click", (event) => {
  const button = event.target.closest(".remove-scan");
  if (!button) {
    return;
  }

  const isbn = button.dataset.isbn;
  state.scannedIsbns = state.scannedIsbns.filter((value) => value !== isbn);
  renderScannedIsbns();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !scannerModal.classList.contains("hidden")) {
    closeScanner();
  }
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

async function openScanner() {
  if (!scannerModal.classList.contains("hidden") && state.scannerStream) {
    return;
  }

  const requestId = state.scannerOpenRequestId + 1;
  state.scannerOpenRequestId = requestId;
  scannerModal.classList.remove("hidden");
  scannerModal.setAttribute("aria-hidden", "false");
  renderScannedIsbns();
  setScannerStatus("Starting camera...");

  if (!window.isSecureContext) {
    setScannerStatus("Camera access requires HTTPS. Open the GitHub Pages HTTPS URL and try again.");
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setScannerStatus("This browser does not support camera access.");
    return;
  }

  try {
    const canUseNativeScanner = await canUseNativeBarcodeDetector();
    if (requestId !== state.scannerOpenRequestId || scannerModal.classList.contains("hidden")) {
      return;
    }

    if (canUseNativeScanner) {
      await startNativeScanner(requestId);
      return;
    }

    if (window.ZXingBrowser && window.ZXingBrowser.BrowserMultiFormatOneDReader) {
      await startZxingScanner(requestId);
      return;
    }

    setScannerStatus("This browser does not support barcode scanning. Paste ISBNs manually or try another browser.");
  } catch (error) {
    stopScannerStream();
    setScannerStatus(getScannerErrorMessage(error));
  }
}

async function canUseNativeBarcodeDetector() {
  if (!("BarcodeDetector" in window)) {
    return false;
  }

  const supportedFormats = typeof window.BarcodeDetector.getSupportedFormats === "function"
    ? await window.BarcodeDetector.getSupportedFormats()
    : ["ean_13"];

  return !Array.isArray(supportedFormats) || !supportedFormats.length || supportedFormats.includes("ean_13");
}

async function startNativeScanner(requestId) {
  state.scannerDetector = new window.BarcodeDetector({ formats: ["ean_13"] });
  state.scannerStream = await getScannerStream();

  if (requestId !== state.scannerOpenRequestId || scannerModal.classList.contains("hidden")) {
    stopScannerStream();
    return;
  }

  scannerVideo.srcObject = state.scannerStream;
  await scannerVideo.play();

  if (requestId !== state.scannerOpenRequestId || scannerModal.classList.contains("hidden")) {
    stopScannerStream();
    return;
  }

  setScannerStatus("Point the camera at a book barcode. Keep scanning to build the list.");
  scanBarcodeFrame();
}

async function startZxingScanner(requestId) {
  const reader = new window.ZXingBrowser.BrowserMultiFormatOneDReader(undefined, {
    delayBetweenScanAttempts: 250,
    delayBetweenScanSuccess: 900,
  });
  const constraints = {
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  };

  const handleDecode = (result, error) => {
    if (result) {
      handleScannedBarcodeValue(getZxingResultText(result));
    } else if (error && isFatalZxingError(error)) {
      setScannerStatus("Scanner paused after a camera read error. Close and reopen the scanner to try again.");
    }
  };

  try {
    state.scannerZxingControls = await reader.decodeFromConstraints(constraints, scannerVideo, handleDecode);
  } catch (error) {
    state.scannerZxingControls = await reader.decodeFromConstraints({ audio: false, video: true }, scannerVideo, handleDecode);
  }

  if (requestId !== state.scannerOpenRequestId || scannerModal.classList.contains("hidden")) {
    stopScannerStream();
    return;
  }

  state.scannerStream = scannerVideo.srcObject;
  setScannerStatus("Point the camera at a book barcode. Keep scanning to build the list.");
}

async function getScannerStream() {
  const preferredConstraints = {
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  };

  try {
    return await navigator.mediaDevices.getUserMedia(preferredConstraints);
  } catch (error) {
    return navigator.mediaDevices.getUserMedia({ audio: false, video: true });
  }
}

function scanBarcodeFrame() {
  if (scannerModal.classList.contains("hidden") || !state.scannerDetector || !scannerVideo.srcObject) {
    return;
  }

  if (!state.scannerIsDetecting && scannerVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    state.scannerIsDetecting = true;
    state.scannerDetector.detect(scannerVideo)
      .then(handleBarcodeDetections)
      .catch(() => {
        setScannerStatus("Scanner paused after a camera read error. Close and reopen the scanner to try again.");
      })
      .finally(() => {
        state.scannerIsDetecting = false;
      });
  }

  state.scannerFrameId = window.requestAnimationFrame(scanBarcodeFrame);
}

function handleBarcodeDetections(detections) {
  if (!Array.isArray(detections) || !detections.length) {
    return;
  }

  const rawValue = detections
    .map((detection) => detection && detection.rawValue)
    .find(Boolean);
  handleScannedBarcodeValue(rawValue);
}

function handleScannedBarcodeValue(rawValue) {
  const isbn = normalizeScannedIsbn(rawValue);

  if (!isbn) {
    if (rawValue && rawValue !== state.scannerLastValue) {
      state.scannerLastValue = rawValue;
      setScannerStatus("Detected a barcode, but it was not an ISBN-13 book barcode.");
    }
    return;
  }

  const now = Date.now();
  const repeatedTooSoon = isbn === state.scannerLastValue && now - state.scannerLastScanAt < SCANNER_DUPLICATE_DELAY_MS;
  state.scannerLastValue = isbn;
  state.scannerLastScanAt = now;

  if (repeatedTooSoon) {
    return;
  }

  if (state.scannedIsbns.includes(isbn)) {
    setScannerStatus(`ISBN ${isbn} is already in the scanned list.`);
    return;
  }

  state.scannedIsbns.push(isbn);
  renderScannedIsbns();
  setScannerStatus(`Scanned ISBN ${isbn}. Scan another barcode or use the list.`);
}

function getZxingResultText(result) {
  if (!result) {
    return "";
  }

  if (typeof result.getText === "function") {
    return result.getText();
  }

  return result.text || "";
}

function isFatalZxingError(error) {
  const name = error && (error.name || error.constructor && error.constructor.name);
  return Boolean(name && !/NotFound|Checksum|Format/i.test(name));
}

function normalizeScannedIsbn(value) {
  const isbn = normalizeIsbn(value);
  if (!isbn || !/^97[89]/.test(isbn) || !hasValidIsbn13Checksum(isbn)) {
    return "";
  }

  return isbn;
}

function hasValidIsbn13Checksum(isbn) {
  if (!/^\d{13}$/.test(isbn)) {
    return false;
  }

  const sum = isbn
    .slice(0, 12)
    .split("")
    .reduce((total, digit, index) => {
      return total + Number(digit) * (index % 2 === 0 ? 1 : 3);
    }, 0);
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === Number(isbn[12]);
}

function renderScannedIsbns() {
  scannerCount.textContent = String(state.scannedIsbns.length);
  useScannedButton.disabled = state.scannedIsbns.length === 0;
  clearScannedButton.disabled = state.scannedIsbns.length === 0;
  scannerList.innerHTML = state.scannedIsbns.map((isbn) => {
    return `
      <li>
        <span>${escapeHtml(isbn)}</span>
        <button class="remove-scan" type="button" data-isbn="${escapeAttribute(isbn)}" aria-label="Remove ISBN ${escapeAttribute(isbn)}">x</button>
      </li>
    `;
  }).join("");
}

function useScannedIsbns() {
  if (!state.scannedIsbns.length) {
    return;
  }

  const existingIsbns = isbnPasteInput.value
    .split(/[\n,]+/g)
    .map(normalizeIsbn)
    .filter(Boolean);
  const mergedIsbns = Array.from(new Set(existingIsbns.concat(state.scannedIsbns)));
  isbnPasteInput.value = mergedIsbns.join("\n");
  closeScanner();
  loadPastedIsbns(isbnPasteInput.value);
}

function closeScanner() {
  state.scannerOpenRequestId += 1;
  scannerModal.classList.add("hidden");
  scannerModal.setAttribute("aria-hidden", "true");
  stopScannerStream();
}

function stopScannerStream() {
  if (state.scannerFrameId) {
    window.cancelAnimationFrame(state.scannerFrameId);
    state.scannerFrameId = 0;
  }

  if (state.scannerZxingControls && typeof state.scannerZxingControls.stop === "function") {
    state.scannerZxingControls.stop();
  }

  if (state.scannerStream) {
    state.scannerStream.getTracks().forEach((track) => track.stop());
  }

  state.scannerStream = null;
  state.scannerDetector = null;
  state.scannerZxingControls = null;
  state.scannerIsDetecting = false;
  state.scannerLastValue = "";
  state.scannerLastScanAt = 0;
  scannerVideo.pause();
  scannerVideo.srcObject = null;
  setScannerStatus("Camera is not running.");
}

function setScannerStatus(message) {
  scannerStatus.textContent = message;
}

function getScannerErrorMessage(error) {
  if (error && error.name === "NotAllowedError") {
    return "Camera permission was blocked. Allow camera access in the browser and try again.";
  }

  if (error && error.name === "NotFoundError") {
    return "No camera was found on this device.";
  }

  if (error && error.name === "NotReadableError") {
    return "The camera is already in use by another app or browser tab.";
  }

  return "Unable to start the camera scanner.";
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
    const rowId = ensureRowId(row);
    tr.dataset.rowId = rowId;
    tr.innerHTML = OUTPUT_COLUMNS.map((column) => renderPreviewCell(column, row, index)).join("");
    fragment.appendChild(tr);
  });

  previewBody.appendChild(fragment);
  attachDescriptionToggles();
  attachCoverFallbacks();
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
    return `<td class="media-cell">${renderMediaCell(row[column], row["Title"], row["Cover Fallback URL"])}</td>`;
  }

  return `<td>${escapeHtml(row[column])}</td>`;
}

function renderMediaCell(url, title, fallbackUrl) {
  if (!url) {
    return "";
  }

  const safeUrl = escapeAttribute(url);
  const safeFallbackUrl = fallbackUrl ? escapeAttribute(fallbackUrl) : "";
  const safeTitle = escapeAttribute(title || "Book cover");
  const fallbackAttribute = safeFallbackUrl ? ` data-fallback-src="${safeFallbackUrl}"` : "";

  return `
    <a class="cover-tile" href="${safeUrl}" target="_blank" rel="noreferrer">
      <img src="${safeUrl}" alt="${safeTitle}"${fallbackAttribute}>
      <span>Open cover</span>
    </a>
  `;
}

function attachCoverFallbacks() {
  const coverImages = previewBody.querySelectorAll("img[data-fallback-src]");
  coverImages.forEach((image) => {
    image.addEventListener("error", () => {
      const fallbackSrc = image.getAttribute("data-fallback-src");
      if (!fallbackSrc || image.src === fallbackSrc) {
        return;
      }

      image.removeAttribute("data-fallback-src");
      image.src = fallbackSrc;

      const link = image.closest("a");
      if (link) {
        link.href = fallbackSrc;
      }

      const tableRow = image.closest("tr");
      const row = tableRow ? findEnrichedRowById(tableRow.dataset.rowId) : null;
      if (row) {
        row["Image Src"] = fallbackSrc;
        row["Cover Fallback URL"] = "";
      }
    }, { once: true });
  });
}

function ensureRowId(row) {
  if (!row.__bookyRowId) {
    row.__bookyRowId = `row-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  return row.__bookyRowId;
}

function findEnrichedRowById(rowId) {
  if (!rowId) {
    return null;
  }

  return state.enrichedRows.find((row) => row.__bookyRowId === rowId) || null;
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
  const openLibraryMetadata = await fetchOpenLibraryMetadata(outputIsbn);
  const title = volumeInfo.title || `ISBN ${outputIsbn}`;
  const description = cleanDescription(volumeInfo.description);
  const author = Array.isArray(volumeInfo.authors) ? volumeInfo.authors.join(", ") : "";
  const publicationDate = formatPublicationDate(volumeInfo.publishedDate);
  const publisher = normalizePublisherValue(volumeInfo.publisher) || openLibraryMetadata.publisher;
  const translator = extractTranslator(volumeInfo);
  const format = resolveFormat(volumeInfo, openLibraryMetadata);
  const bookSize = formatBookSize(volumeInfo.dimensions);
  const coverImageUrls = buildCoverImageUrls(outputIsbn, volumeInfo.imageLinks || {});

  return {
    found: true,
    row: {
      "Handle": buildShopifyHandle(title, outputIsbn),
      "Title": title,
      "Body (HTML)": description,
      "Type": "Book",
      "Option1 Name": "Title",
      "Option1 Value": "Default Title",
      "Image Src": coverImageUrls.primary,
      "Cover Fallback URL": coverImageUrls.fallback,
      [AUTHOR_METAFIELD]: author,
      [PUBLICATION_DATE_METAFIELD]: publicationDate,
      [PUBLISHER_METAFIELD]: publisher,
      [PAGE_COUNT_METAFIELD]: volumeInfo.pageCount ? String(volumeInfo.pageCount) : "",
      [DIMENSIONS_METAFIELD]: bookSize,
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
    "Cover Fallback URL": "",
    [AUTHOR_METAFIELD]: "",
    [PUBLICATION_DATE_METAFIELD]: "",
    [PUBLISHER_METAFIELD]: "",
    [PAGE_COUNT_METAFIELD]: "",
    [DIMENSIONS_METAFIELD]: "",
    [TRANSLATOR_METAFIELD]: "",
    [FORMAT_METAFIELD]: "",
  };
}

function formatBookSize(dimensions) {
  if (!dimensions || typeof dimensions !== "object") {
    return "";
  }

  const parts = [
    ["H", dimensions.height],
    ["W", dimensions.width],
    ["T", dimensions.thickness],
  ]
    .map(([label, value]) => {
      const dimension = normalizeDimensionValue(value);
      return dimension ? `${label} ${dimension}` : "";
    })
    .filter(Boolean);

  return parts.join(" x ");
}

function normalizeDimensionValue(value) {
  const dimension = String(getValue(value, ""))
    .replace(/\s+/g, " ")
    .trim();

  return dimension;
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

function buildCoverImageUrls(isbn, imageLinks) {
  const googleCoverUrl = getBestCoverImageUrl(imageLinks);
  const openLibraryCoverUrl = getOpenLibraryCoverImageUrl(isbn);

  return {
    primary: googleCoverUrl || openLibraryCoverUrl,
    fallback: googleCoverUrl ? openLibraryCoverUrl : "",
  };
}

function getOpenLibraryCoverImageUrl(isbn) {
  if (isbn) {
    return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg`;
  }

  return "";
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

function resolveFormat(volumeInfo, openLibraryMetadata) {
  if (openLibraryMetadata && openLibraryMetadata.format) {
    return openLibraryMetadata.format;
  }

  return inferFormat(volumeInfo);
}

async function fetchOpenLibraryMetadata(isbn) {
  const emptyMetadata = { format: "", publisher: "" };

  if (!isbn) {
    return emptyMetadata;
  }

  if (Object.prototype.hasOwnProperty.call(openLibraryMetadataCache, isbn)) {
    return openLibraryMetadataCache[isbn];
  }

  try {
    const url = new URL("https://openlibrary.org/api/books");
    url.searchParams.set("bibkeys", `ISBN:${isbn}`);
    url.searchParams.set("jscmd", "details");
    url.searchParams.set("format", "json");

    const response = await fetch(url.toString(), buildRequestOptions());
    if (!response.ok) {
      openLibraryMetadataCache[isbn] = emptyMetadata;
      return emptyMetadata;
    }

    const data = await response.json();
    const entry = data && data[`ISBN:${isbn}`];
    const details = entry && entry.details;
    const metadata = {
      format: normalizeFormatValue(details && details.physical_format),
      publisher: normalizeOpenLibraryPublisher(details && details.publishers),
    };

    openLibraryMetadataCache[isbn] = metadata;
    return metadata;
  } catch (error) {
    openLibraryMetadataCache[isbn] = emptyMetadata;
    return emptyMetadata;
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

  return normalizeFormatValue(candidates);
}

function normalizeFormatValue(value) {
  const text = String(getValue(value, "")).trim().toLowerCase();
  if (!text) {
    return "";
  }

  if (/\bmass[-\s]?market\b/.test(text) && /\bpaperback\b/.test(text)) {
    return "Mass Market Paperback";
  }
  if (/\btrade\b/.test(text) && /\bpaperback\b/.test(text)) {
    return "Trade Paperback";
  }
  if (/\bpaperback\b/.test(text) || /\bsoftcover\b/.test(text) || /\bsoft cover\b/.test(text)) {
    return "Paperback";
  }
  if (/\bhardback\b/.test(text) || /\bhardcover\b/.test(text) || /\bhard cover\b/.test(text) || /\blibrary binding\b/.test(text)) {
    return "Hardcover";
  }
  if (/\bboard book\b/.test(text)) {
    return "Board Book";
  }
  if (/\bleather(?:ette)?\b/.test(text)) {
    return "Leather Bound";
  }
  if (/\bspiral[-\s]?bound\b/.test(text)) {
    return "Spiral Bound";
  }
  if (/\bloose[-\s]?leaf\b/.test(text)) {
    return "Loose Leaf";
  }
  if (/\baudio(?:book)?\b/.test(text) || /\bcd\b/.test(text)) {
    return "Audiobook";
  }
  if (/\be[-\s]?book\b/.test(text) || /\bkindle\b/.test(text) || /\bdigital\b/.test(text)) {
    return "Ebook";
  }

  return "";
}

function normalizePublisherValue(value) {
  const publisher = String(getValue(value, ""))
    .replace(/\s+/g, " ")
    .trim();

  if (!publisher) {
    return "";
  }

  return publisher;
}

function normalizeOpenLibraryPublisher(value) {
  const publishers = Array.isArray(value) ? value : [value];
  const normalized = publishers
    .map((publisher) => {
      if (publisher && typeof publisher === "object") {
        return normalizePublisherValue(publisher.name);
      }

      return normalizePublisherValue(publisher);
    })
    .filter(Boolean);

  return Array.from(new Set(normalized)).join(", ");
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
