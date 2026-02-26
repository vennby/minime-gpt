// Page constants
const PAGE_WIDTH = 850;
const PAGE_HEIGHT = 1100;
const CONTENT_HEIGHT = PAGE_HEIGHT - 80; // 1020px usable

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

  // Handle text changes
  quill.on("text-change", function () {
    setTimeout(handlePageOverflow, 100);
  });

  // Handle focus to update current page indicator
  quill.on("selection-change", function (range) {
    if (range) {
      updateCurrentPage(pageIndex);
    }
  });

  return quill;
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
