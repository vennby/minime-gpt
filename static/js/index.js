/**
 * MinimēGPT Writer Controller
 * Manages writing sessions with fullscreen lock and AI blocking
 */

document.addEventListener("DOMContentLoaded", () => {
  const project = window.MINIME_PROJECT || null;
  if (!project) return;

  // DOM Elements
  const editor = document.getElementById("editor");
  const projectTitle = document.getElementById("projectTitle");
  const topbar = document.getElementById("topbar");
  const statusIndicator = document.getElementById("statusIndicator");
  const metricsBar = document.getElementById("metricsBar");
  const lockOverlay = document.getElementById("lockOverlay");
  const startSessionBtn = document.getElementById("startSessionBtn");
  const endSessionBtn = document.getElementById("endSessionBtn");
  const completeProjectBtn = document.getElementById("completeProjectBtn");
  const warningPanel = document.getElementById("warningPanel");
  const warningMessage = document.getElementById("warningMessage");
  const wordCount = document.getElementById("wordCount");
  const charCount = document.getElementById("charCount");
  const sideToolbar = document.getElementById("sideToolbar");
  const darkModeToggle = document.getElementById("darkModeToggle");
  const toolbarButtons = document.querySelectorAll('[data-format]');

  // Session state
  const state = {
    active: false,
    locked: false,
    saveTimer: null,
  };

  // AI domains to block
  const AI_DOMAINS = [
    'openai.com', 'chat.openai.com', 'chatgpt.com',
    'claude.ai', 'claude.com',
    'bard.google.com', 'gemini.google.com',
    'copilot.microsoft.com',
    'perplexity.ai', 'poe.com', 'character.ai'
  ];

  // ==================== SESSION CONTROL ====================

  async function startSession() {
    state.active = true;
    state.locked = false;

    try {
      await document.documentElement.requestFullscreen();
    } catch (err) {
      console.error("Fullscreen denied:", err);
      state.active = false;
      showWarning("Fullscreen required. Please try again.");
    }
  }

  async function endSession() {
    state.active = false;
    state.locked = false;

    await saveDocument();

    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    }

    setTimeout(() => {
      window.location.href = '/dashboard';
    }, 200);
  }

  async function completeProject() {
    state.active = false;
    state.locked = false;

    await saveDocument();

    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    }

    // Export PDF and delete project
    setTimeout(async () => {
      try {
        const res = await fetch(`/api/projects/${project.id}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        if (res.ok) {
          const blob = await res.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${project.title}.pdf`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);

          // Redirect after download
          setTimeout(() => {
            window.location.href = '/dashboard';
          }, 500);
        }
      } catch (err) {
        console.error('Error completing project:', err);
        window.location.href = '/dashboard';
      }
    }, 200);
  }

  // ==================== FULLSCREEN STATE MACHINE ====================

  function onFullscreenChange() {
    const inFullscreen = !!document.fullscreenElement;

    if (!state.active) {
      // Session not active, normal view (preview mode)
      topbar.style.display = 'flex';
      sideToolbar.style.display = 'none';
      lockOverlay.hidden = true;
      metricsBar.hidden = true;
      editor.contentEditable = 'false';
      editor.classList.remove('editor-locked');
      editor.classList.add('editor-preview');
      return;
    }

    if (inFullscreen && !state.locked) {
      // Just entered fullscreen: LOCK IT
      state.locked = true;
      topbar.style.display = 'none';
      sideToolbar.style.display = 'flex';
      lockOverlay.hidden = true;
      metricsBar.hidden = false;
      editor.contentEditable = 'true';
      editor.classList.remove('editor-preview');
      editor.classList.add('editor-locked');
      editor.focus();
      updateMetrics();
    } else if (!inFullscreen && state.locked) {
      // Exiting fullscreen while locked: SHOW LOCK OVERLAY
      state.locked = false;
      lockOverlay.hidden = false;
      metricsBar.hidden = true;
      editor.contentEditable = 'false';
      editor.classList.remove('editor-locked');
      editor.classList.add('editor-preview');
      sideToolbar.style.display = 'none';
      showWarning('Fullscreen exited. You must end the session.');
    } else if (!inFullscreen && !state.locked) {
      // Normal exit after session ended
      topbar.style.display = 'flex';
      sideToolbar.style.display = 'none';
      lockOverlay.hidden = true;
      metricsBar.hidden = true;
      editor.contentEditable = 'false';
      editor.classList.remove('editor-locked');
      editor.classList.add('editor-preview');
    }
  }

  // ==================== AUTO-SAVE ====================

  async function saveDocument() {
    // Save with HTML formatting and indentation preserved
    const content = editor.innerHTML || '';
    const title = projectTitle.textContent || project.title;

    try {
      const res = await fetch(`/api/projects/${project.id}/autosave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, title })
      });

      if (res.ok) {
        statusIndicator.textContent = 'Saved';
        statusIndicator.classList.add('saved');
        setTimeout(() => {
          if (state.active) {
            statusIndicator.textContent = 'Writing...';
            statusIndicator.classList.remove('saved');
          }
        }, 1500);
      }
    } catch (err) {
      console.error("Save failed:", err);
    }
  }

  function debounceAutoSave() {
    if (state.saveTimer) clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => {
      if (state.active) saveDocument();
    }, 250);
  }

  // ==================== METRICS ====================

  function updateMetrics() {
    const text = editor.textContent || '';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    wordCount.textContent = words;
    charCount.textContent = text.length;
  }

  // ==================== AI BLOCKING ====================

  function isAIDomain(url) {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return AI_DOMAINS.some(d => hostname.includes(d));
    } catch {
      return false;
    }
  }

  function showWarning(msg) {
    warningMessage.textContent = msg;
    warningPanel.hidden = false;
    setTimeout(() => { warningPanel.hidden = true; }, 4000);
  }

  // ==================== TEXT FORMATTING ====================

  function applyFormat(command, value = null) {
    if (!state.active || !state.locked) return;
    
    // Ensure editor has focus
    editor.focus();
    
    // Execute the formatting command
    document.execCommand(command, false, value);
    
    // Trigger save
    debounceAutoSave();
  }

  // ==================== DARK MODE ====================

  function toggleDarkMode() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('darkMode', 'false');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('darkMode', 'true');
    }
  }

  // ==================== CONTEXT MENU BLOCKING ====================

  document.addEventListener('contextmenu', (e) => {
    if (state.active && state.locked) {
      e.preventDefault();
      showWarning('Right-click is blocked during writing sessions.');
    }
  });

  // ==================== DRAG & DROP BLOCKING ====================

  document.addEventListener('dragstart', (e) => {
    if (state.active && state.locked) {
      e.preventDefault();
      showWarning('Drag operations are blocked during writing sessions.');
    }
  });

  document.addEventListener('drop', (e) => {
    if (state.active && state.locked) {
      e.preventDefault();
      showWarning('Drop operations are blocked during writing sessions.');
    }
  });

  document.addEventListener('dragover', (e) => {
    if (state.active && state.locked) {
      e.preventDefault();
    }
  });

  // ==================== EVENT LISTENERS ====================

  startSessionBtn.addEventListener('click', startSession);
  endSessionBtn.addEventListener('click', endSession);
  completeProjectBtn.addEventListener('click', completeProject);

  // Dark mode toggle
  if (darkModeToggle) {
    darkModeToggle.addEventListener('click', toggleDarkMode);
  }

  // Formatting buttons
  toolbarButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const format = btn.dataset.format;
      
      if (format === 'bold') applyFormat('bold');
      else if (format === 'italic') applyFormat('italic');
      else if (format === 'underline') applyFormat('underline');
      else if (format === 'strikethrough') {
        document.execCommand('strikethrough', false, null);
      }
      else if (format === 'bulletList') applyFormat('insertUnorderedList');
      else if (format === 'numberedList') applyFormat('insertOrderedList');
      // Font size options
      else if (format === 'fontSize-small') document.execCommand('fontSize', false, '1');
      else if (format === 'fontSize-normal') document.execCommand('fontSize', false, '3');
      else if (format === 'fontSize-large') document.execCommand('fontSize', false, '5');
      // Text alignment options
      else if (format === 'alignLeft') applyFormat('justifyLeft');
      else if (format === 'alignCenter') applyFormat('justifyCenter');
      else if (format === 'alignRight') applyFormat('justifyRight');
    });
  });

  document.addEventListener('fullscreenchange', onFullscreenChange, false);

  editor.addEventListener('input', () => {
    if (state.active && state.locked) {
      updateMetrics();
      statusIndicator.textContent = 'Unsaved...';
      statusIndicator.classList.remove('saved');
      debounceAutoSave();
    }
  });

  // ==================== PASTE BLOCKING ====================

  editor.addEventListener('paste', (e) => {
    if (!state.active) return;
    e.preventDefault();
    showWarning('Pasting is blocked during writing sessions.');
  });

  // Also block paste on document level
  document.addEventListener('paste', (e) => {
    if (state.active) {
      e.preventDefault();
    }
  });

  // ==================== COPY BLOCKING ====================

  editor.addEventListener('copy', (e) => {
    if (state.active && state.locked) {
      e.preventDefault();
      showWarning('Copying is blocked during writing sessions.');
    }
  });

  editor.addEventListener('cut', (e) => {
    if (state.active && state.locked) {
      e.preventDefault();
      showWarning('Cut is blocked during writing sessions.');
    }
  });

  document.addEventListener('copy', (e) => {
    if (state.active && state.locked) {
      e.preventDefault();
    }
  });

  document.addEventListener('cut', (e) => {
    if (state.active && state.locked) {
      e.preventDefault();
    }
  });

  // ==================== SCREENSHOT BLOCKING ====================

  // Block PrintScreen key
  document.addEventListener('keydown', (e) => {
    if (!state.active || !state.locked) return;
    
    if (e.key === 'PrintScreen' || e.code === 'PrintScreen') {
      e.preventDefault();
      showWarning('Screenshots are blocked during writing sessions.');
    }
    
    // Block Shift+PrintScreen
    if ((e.shiftKey && e.key === 'PrintScreen') || (e.shiftKey && e.code === 'PrintScreen')) {
      e.preventDefault();
      showWarning('Screenshots are blocked during writing sessions.');
    }
    
    // Block Ctrl/Cmd+Shift+S (Save dialog, Mac screenshot)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 's') {
      e.preventDefault();
      showWarning('Screenshots are blocked during writing sessions.');
    }
  });

  // Block Ctrl+PrintScreen
  document.addEventListener('keyup', (e) => {
    if (!state.active || !state.locked) return;
    
    if (e.ctrlKey && e.key === 'PrintScreen') {
      e.preventDefault();
      showWarning('Screenshots are blocked during writing sessions.');
    }
  });

  // ==================== PAGE SAVE BLOCKING ====================

  document.addEventListener('keydown', (e) => {
    if (!state.active || !state.locked) return;
    
    // Block Ctrl+S / Cmd+S (Save page)
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      showWarning('Page save is blocked during writing sessions.');
    }
    
    // Block Escape key (often used in save dialogs)
    if (e.key === 'Escape') {
      e.preventDefault();
      showWarning('Use "End Session" button to exit.');
    }
    
    // Block Ctrl+P / Cmd+P (Print to PDF)
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
      e.preventDefault();
      showWarning('Printing is blocked during writing sessions.');
    }
  });

  // ==================== GENERIC SECURITY BLOCKING ====================

  document.addEventListener('click', (e) => {
    if (!state.active) return;
    const link = e.target.closest('a');
    if (link && isAIDomain(link.href)) {
      e.preventDefault();
      showWarning('AI domain access blocked.');
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (state.active && document.hidden) {
      showWarning('Tab switching detected.');
    }
  });

  // ==================== INIT ====================

  editor.contentEditable = 'false';
  editor.classList.add('editor-preview');
  sideToolbar.style.display = 'none';
  lockOverlay.hidden = true;
  metricsBar.hidden = true;

  console.log('Writer ready:', project.title);
});
