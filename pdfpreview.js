// pdfpreview.js — V38
// (c) 2026 Peter Birchley. All rights reserved.
//
// Multi-page PDF preview engine. The report preview modal (report.js) used to
// show the PDF in a single <iframe src="blob:...">, which on iOS WebKit only
// ever renders PAGE 1 — hence the old "showing page 1 of N, share to see the
// rest" note. This module renders EVERY page of the blob to its own <canvas>,
// stacked in a scrollable column, so the whole report is visible inline.
//
// HOW IT LOADS (the important bit for the storage budget):
//   - PDF.js (Mozilla, Apache-2.0) is vendored in the repo as TWO files,
//     pdfjs.min.js + pdfjs.worker.min.js (~1.5 MB total), but they are NOT in
//     index.html's <script> chain and NOT in sw.js's ASSETS precache list. They
//     are fetched LAZILY from our own origin on the FIRST report preview only.
//   - Because the fetch is same-origin, the existing service-worker fetch
//     handler auto-caches both files into Cache Storage as they download. Every
//     later preview reads them from that cache and works fully offline.
//   - Cache Storage is a SEPARATE bucket from localStorage. PDF.js lands
//     alongside the app's own cached code (hundreds of MB available on iOS) and
//     never touches the ~5 MB localStorage DATA budget. Zero impact on sessions.
//   - First preview therefore needs a connection ONCE; offline-first previews
//     work after that. If PDF.js can't be loaded (offline + not yet cached),
//     the caller falls back to the old single-page iframe — never worse than
//     before. See pdfPreviewEngineReady() / loadPdfJsEngine().

// Same-origin paths (relative to the app root, like every other asset).
const PDFJS_LIB_SRC = './pdfjs.min.js';
const PDFJS_WORKER_SRC = './pdfjs.worker.min.js';

// One-shot load promise so concurrent/repeat previews share a single fetch.
let _pdfjsLoadPromise = null;

// True once the global pdfjsLib is present and its worker path is configured.
function pdfPreviewEngineReady() {
  return typeof pdfjsLib !== 'undefined'
    && pdfjsLib
    && pdfjsLib.GlobalWorkerOptions
    && !!pdfjsLib.GlobalWorkerOptions.workerSrc;
}

// Inject the PDF.js library <script> once. Resolves when pdfjsLib is live and
// its worker is pointed at our same-origin worker file (so the SW caches it
// too). Rejects if the script can't load (e.g. first-ever preview offline).
function loadPdfJsEngine() {
  if (pdfPreviewEngineReady()) return Promise.resolve(true);
  if (_pdfjsLoadPromise) return _pdfjsLoadPromise;

  _pdfjsLoadPromise = new Promise((resolve, reject) => {
    // If a prior partial attempt already injected the tag, don't double-add.
    const existing = document.querySelector('script[data-pdfjs="1"]');
    if (existing && typeof pdfjsLib !== 'undefined') {
      configureWorker();
      resolve(true);
      return;
    }
    const s = document.createElement('script');
    s.src = PDFJS_LIB_SRC;
    s.async = true;
    s.setAttribute('data-pdfjs', '1');
    s.onload = () => {
      if (typeof pdfjsLib === 'undefined') {
        // Loaded but didn't expose the global — treat as a failure so the
        // caller falls back to the iframe rather than hanging.
        _pdfjsLoadPromise = null;
        reject(new Error('pdfjsLib global missing after load'));
        return;
      }
      configureWorker();
      resolve(true);
    };
    s.onerror = () => {
      // Allow a later retry (e.g. once back online).
      _pdfjsLoadPromise = null;
      if (s.parentNode) s.parentNode.removeChild(s);
      reject(new Error('PDF.js failed to load'));
    };
    document.head.appendChild(s);
  });
  return _pdfjsLoadPromise;

  function configureWorker() {
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
    } catch (e) { /* non-fatal; render will surface any real problem */ }
  }
}

// Render every page of a PDF blob into `container` as stacked <canvas> nodes.
// Each canvas is sized to the container width (DPR-capped at 2× for memory),
// pages render sequentially to keep peak memory low on iOS. Returns the page
// count. Throws if PDF.js isn't ready or the document can't be parsed — the
// caller catches and falls back to the iframe.
async function renderPdfPagesToContainer(blob, container) {
  if (!pdfPreviewEngineReady()) throw new Error('PDF.js engine not ready');
  container.innerHTML = '';

  const buf = await blob.arrayBuffer();
  const task = pdfjsLib.getDocument({ data: buf });
  const pdf = await task.promise;
  const pageCount = pdf.numPages;

  // Available CSS width for a page (container minus its own padding).
  const cs = (typeof getComputedStyle === 'function') ? getComputedStyle(container) : null;
  const padL = cs ? parseFloat(cs.paddingLeft) || 0 : 0;
  const padR = cs ? parseFloat(cs.paddingRight) || 0 : 0;
  const cssWidth = Math.max(180, (container.clientWidth || 320) - padL - padR);
  const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);

  for (let n = 1; n <= pageCount; n++) {
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const scale = cssWidth / base.width;
    const viewport = page.getViewport({ scale: scale * dpr });

    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-page-canvas';
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    // CSS size = logical page width; the backing store is DPR-scaled for sharpness.
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = Math.floor(viewport.height / dpr) + 'px';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    // Free page resources as we go (iOS memory).
    if (typeof page.cleanup === 'function') { try { page.cleanup(); } catch (e) {} }
  }

  // Release the document.
  if (typeof pdf.cleanup === 'function') { try { pdf.cleanup(); } catch (e) {} }
  if (typeof pdf.destroy === 'function') { try { pdf.destroy(); } catch (e) {} }

  return pageCount;
}
