// Page constants
const PAGE_WIDTH = 850;
const PAGE_HEIGHT = 1100;
const CONTENT_HEIGHT = PAGE_HEIGHT - 80; // 1020px usable

// Paste tracking configuration
const PASTE_THRESHOLD = 500; // Characters to flag as "large"
const PASTE_HISTORY_LIMIT = 50; // Keep last 50 pastes in history

// Paste tracking state
let pasteHistory = [];
let lastSelectionLength = 0;
let lastContentLength = 0;
let pasteStatsPanel = null;
let lastPasteProcessed = false; // Flag to prevent double-counting

// Handle file name editing
const fileNameEl = document.querySelector(".file-name");
fileNameEl.addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    e.preventDefault();
    this.blur();
  }
});

const editorContainer = document.getElementById("editor-container");
let editors = {}; // Maps page index to Quill instance
let currentPageIndex = 0;
let isUpdating = false;

// Create a Quill editor for a specific page
function createPageEditor(pageIndex) {
  const editorId = `editor-${pageIndex}`;

  if (editors[pageIndex]) {
    return editors[pageIndex];
  }

  const pageWrapper = document.querySelector(`[data-page="${pageIndex}"]`);
  if (!pageWrapper) return null;

  const editorDiv = pageWrapper.querySelector(".editor-page");

  const quill = new Quill(editorDiv, {
    theme: "snow",
    modules: {
      toolbar: [
        ["bold", "italic", "underline", "strike"],
        ["blockquote", "code-block"],
        [{ header: 1 }, { header: 2 }],
        [{ list: "ordered" }, { list: "bullet" }],
        [{ color: [] }, { background: [] }],
        ["link", "image"],
      ],
    },
    placeholder: pageIndex === 0 ? "Start typing..." : "",
  });

  editors[pageIndex] = quill;

  // Track paste events for this editor
  setupPasteTracking(quill, pageIndex);

  // Handle text changes
  quill.on("text-change", function (delta, oldDelta, source) {
    setTimeout(handlePageOverflow, 100);
    
    // Skip duplicate paste tracking if we already processed it
    if (lastPasteProcessed) {
      lastPasteProcessed = false;
      return;
    }
    
    // Track content changes
    if (source === "user") {
      const currentLength = quill.getLength();
      const previousLength = oldDelta ? oldDelta.length() : 0;
      const charAdded = currentLength - previousLength;
      
      // Detect if this might be a paste (only if not already processed)
      if (charAdded > PASTE_THRESHOLD && lastSelectionLength === 0) {
        trackPasteFromChange(pageIndex, charAdded, delta, oldDelta);
      }
    }
  });

  // Handle focus to update current page indicator
  quill.on("selection-change", function (range) {
    if (range) {
      updateCurrentPage(pageIndex);
      lastSelectionLength = range.length || 0;
    }
  });

  return quill;
}

// Setup paste event tracking for a Quill editor
function setupPasteTracking(quill, pageIndex) {
  const editorElement = quill.root;

  // Intercept paste from clipboard
  editorElement.addEventListener("paste", (e) => {
    e.preventDefault();

    const clipboardData = e.clipboardData || window.clipboardData;
    const pastedText = clipboardData.getData("text/plain");
    const pastedHtml = clipboardData.getData("text/html");
    const pastedFiles = clipboardData.files;
    
    const pasteData = {
      timestamp: new Date().toISOString(),
      pageIndex: pageIndex,
      type: "paste",
      charCount: pastedText.length,
      isLarge: pastedText.length > PASTE_THRESHOLD,
      hasImages: pastedFiles.length > 0,
      hasHtml: !!pastedHtml,
      wordCount: pastedText.split(/\s+/).filter(w => w.length > 0).length,
      lineCount: pastedText.split("\n").length,
      averageLineLength: Math.round(pastedText.length / pastedText.split("\n").length),
      contentPreview: pastedText.substring(0, 100) + (pastedText.length > 100 ? "..." : ""),
      detectedLanguage: detectLanguage(pastedText),
      hasTables: pastedHtml ? pastedHtml.includes("<table") : false,
      hasLinks: /https?:\/\/|www\./i.test(pastedText),
      hasCode: /```|<code|console\.|function |class |var |const |let /.test(pastedText),
    };

    // Log to history
    logPaste(pasteData);
    
    // Set flag to prevent duplicate tracking in text-change event
    lastPasteProcessed = true;

    // Insert the text into the editor
    quill.updateContents(new Delta().retain(quill.getSelection().index).insert(pastedText));

    // Show visual feedback if large
    if (pasteData.isLarge) {
      showPasteAlert(pasteData);
    }
  });
}

// Log paste event to history
function logPaste(pasteData) {
  pasteHistory.push(pasteData);
  
  // Keep history limited
  if (pasteHistory.length > PASTE_HISTORY_LIMIT) {
    pasteHistory.shift();
  }

  // Log to console with details
  console.group(
    `%c📋 PASTE DETECTED (${pasteData.charCount} chars)`,
    "color: #1a73e8; font-weight: bold; font-size: 12px;"
  );
  console.log("Timestamp:", pasteData.timestamp);
  console.log("Page:", pasteData.pageIndex);
  console.log("Characters:", pasteData.charCount);
  console.log("Words:", pasteData.wordCount);
  console.log("Lines:", pasteData.lineCount);
  console.log("Avg Line Length:", pasteData.averageLineLength);
  console.log("Has Images:", pasteData.hasImages);
  console.log("Has HTML Formatting:", pasteData.hasHtml);
  console.log("Has Links:", pasteData.hasLinks);
  console.log("Has Code:", pasteData.hasCode);
  console.log("Has Tables:", pasteData.hasTables);
  console.log("Detected Language:", pasteData.detectedLanguage);
  console.log("Preview:", pasteData.contentPreview);
  console.log("Full Data:", pasteData);
  console.groupEnd();

  // Update stats panel
  updatePasteStatsPanel();
}

// Detect likely language of pasted content
function detectLanguage(text) {
  const codePatterns = {
    javascript: /\b(function|const|let|var|async|await|=>|import|export)\b/g,
    python: /\b(def|class|import|from|async|await|lambda|with)\b/g,
    html: /<[^>]+>/g,
    css: /\{[^}]*:[^}]*;\}/g,
    json: /^\s*[{\[]/m,
    xml: /<\?xml|xmlns/,
  };

  let detected = [];
  for (const [lang, pattern] of Object.entries(codePatterns)) {
    const matches = text.match(pattern);
    if (matches && matches.length >= 2) {
      detected.push(lang);
    }
  }

  return detected.length > 0 ? detected.join(", ") : "plain text";
}

// Track paste from text-change event (fallback for programmatic pastes)
function trackPasteFromChange(pageIndex, charAdded, delta, oldDelta) {
  const pasteData = {
    timestamp: new Date().toISOString(),
    pageIndex: pageIndex,
    type: "paste_detected",
    charCount: charAdded,
    isLarge: charAdded > PASTE_THRESHOLD,
    detectionMethod: "content-change",
    deltaOps: delta.ops.length,
  };

  logPaste(pasteData);
}

// Show visual alert for large paste
function showPasteAlert(pasteData) {
  const alert = document.createElement("div");
  alert.className = "paste-alert";
  alert.innerHTML = `
    <div class="paste-alert-content">
      <span class="paste-alert-icon">⚠️</span>
      <div class="paste-alert-text">
        <strong>Large paste detected</strong>
        <small>${pasteData.charCount} characters, ${pasteData.wordCount} words</small>
      </div>
      <button class="paste-alert-close" onclick="this.parentElement.parentElement.remove()">✕</button>
    </div>
  `;
  document.body.appendChild(alert);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (alert.parentElement) {
      alert.remove();
    }
  }, 5000);
}

// Update and show paste statistics panel
function updatePasteStatsPanel() {
  if (!pasteStatsPanel) {
    pasteStatsPanel = document.createElement("div");
    pasteStatsPanel.id = "paste-stats-panel";
    pasteStatsPanel.className = "paste-stats-panel";
    pasteStatsPanel.innerHTML = '<button onclick="togglePasteStats()">📊 Paste Stats</button>';
    document.body.appendChild(pasteStatsPanel);
  }

  // Update the button to show count
  const btn = pasteStatsPanel.querySelector("button");
  const largeCount = pasteHistory.filter((p) => p.isLarge).length;
  btn.textContent = `📊 Pastes: ${pasteHistory.length} (${largeCount} large)`;
}

// Toggle paste history panel visibility
function togglePasteStats() {
  let panel = document.getElementById("paste-history-panel");
  
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "paste-history-panel";
    panel.className = "paste-history-panel";
    document.body.appendChild(panel);
  }

  if (panel.style.display === "none" || !panel.style.display) {
    panel.style.display = "block";
    renderPasteHistory(panel);
  } else {
    panel.style.display = "none";
  }
}

// Render paste history in panel
function renderPasteHistory(panel) {
  const html = `
    <div class="paste-history-header">
      <h3>Paste History (${pasteHistory.length})</h3>
      <button onclick="closePasteHistory()" class="close-btn">✕</button>
    </div>
    <div class="paste-history-list">
      ${pasteHistory
        .slice()
        .reverse()
        .map(
          (p, i) => `
        <div class="paste-item ${p.isLarge ? "large" : ""}">
          <div class="paste-item-header">
            <span class="paste-time">${new Date(p.timestamp).toLocaleTimeString()}</span>
            <span class="paste-badge">${p.charCount} chars</span>
            ${p.isLarge ? '<span class="paste-flag">⚠️ Large</span>' : ""}
          </div>
          <div class="paste-item-details">
            <small>Page ${p.pageIndex + 1} • ${p.wordCount} words • ${p.lineCount} lines</small>
            ${p.hasCode ? '<span class="paste-tag">Code</span>' : ""}
            ${p.hasLinks ? '<span class="paste-tag">Links</span>' : ""}
            ${p.hasHtml ? '<span class="paste-tag">Formatted</span>' : ""}
            ${p.hasImages ? '<span class="paste-tag">Images</span>' : ""}
          </div>
          <div class="paste-item-preview">${escapeHtml(p.contentPreview)}</div>
        </div>
      `
        )
        .join("")}
    </div>
  `;
  panel.innerHTML = html;
}

// Close paste history panel
function closePasteHistory() {
  const panel = document.getElementById("paste-history-panel");
  if (panel) {
    panel.style.display = "none";
  }
}

// Utility to escape HTML
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Handle content overflowing to next page
function handlePageOverflow() {
  if (isUpdating) return;
  isUpdating = true;

  const currentEditor = editors[currentPageIndex];
  if (!currentEditor) {
    isUpdating = false;
    return;
  }

  const editorDiv = currentEditor.root;
  const scrollHeight = editorDiv.scrollHeight;

  // If current page exceeds content height, move overflow to next page
  if (scrollHeight > CONTENT_HEIGHT) {
    moveOverflowToNextPage(currentPageIndex);
  }

  updatePageIndicator();
  isUpdating = false;
}

// Move overflow content to next page
function moveOverflowToNextPage(pageIndex) {
  const currentEditor = editors[pageIndex];
  const nextPageIndex = pageIndex + 1;

  // Get the contents of current editor
  const contents = currentEditor.getContents();
  const delta = contents.ops || [];

  // Create next page if needed
  if (!editors[nextPageIndex]) {
    createNewPage(nextPageIndex);
  }

  // Get next editor
  const nextEditor = editors[nextPageIndex];
  if (!nextEditor) return;

  // Try to fit content on current page by removing from end
  let found = false;
  let lastIndex = delta.length - 1;

  while (lastIndex > 0 && !found) {
    // Try removing content from the end
    const testDelta = { ops: delta.slice(0, lastIndex) };
    currentEditor.setContents(testDelta, "silent");

    if (currentEditor.root.scrollHeight <= CONTENT_HEIGHT) {
      found = true;
      // Move the rest to next page
      const overflowDelta = { ops: delta.slice(lastIndex) };
      const nextContents = nextEditor.getContents();

      // Prepend overflow to next page
      const combined = {
        ops: [...overflowDelta.ops, ...nextContents.ops],
      };
      nextEditor.setContents(combined, "silent");
      break;
    }
    lastIndex--;
  }
}

// Create a new page
function createNewPage(pageIndex) {
  const newPageWrapper = document.createElement("div");
  newPageWrapper.className = "page-wrapper";
  newPageWrapper.setAttribute("data-page", pageIndex);

  const editorPage = document.createElement("div");
  editorPage.className = "editor-page";
  editorPage.id = `editor-${pageIndex}`;

  newPageWrapper.appendChild(editorPage);
  editorContainer.appendChild(newPageWrapper);

  return createPageEditor(pageIndex);
}

// Update current page indicator
function updateCurrentPage(pageIndex) {
  if (pageIndex !== currentPageIndex) {
    currentPageIndex = pageIndex;
    document.getElementById("current-page").textContent = pageIndex + 1;
  }
}

// Update total pages indicator
function updatePageIndicator() {
  const totalPages = Object.keys(editors).length;
  document.getElementById("total-pages").textContent = totalPages;
}

// Handle container scroll to update page indicator
editorContainer.addEventListener("scroll", function () {
  const scrollTop = this.scrollTop;
  const pageIndex = Math.floor(scrollTop / PAGE_HEIGHT);
  updateCurrentPage(pageIndex);
});

// Initialize first page
createPageEditor(0);
updatePageIndicator();
