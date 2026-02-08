const editor = document.getElementById("editor");
const status = document.getElementById("status");

let lastKeyTime = null;
let recentDeltas = [];
let recentChars = [];
let burstTimer = null;

const BURST_WINDOW_MS = 1500;
const BURST_CHAR_THRESHOLD = 25;
const FAST_TYPING_MS = 40;

function sendEvent(payload) {
  fetch("/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

function flag(reason) {
  status.textContent = `⚠️ ${reason}`;
  status.style.color = "crimson";
  sendEvent({ type: "flag", reason });
}

function clearFlag() {
  status.textContent = "Typing verified";
  status.style.color = "#555";
}

// Block paste
editor.addEventListener("paste", e => {
  e.preventDefault();
  flag("Paste blocked");
});

// Block drag/drop
editor.addEventListener("drop", e => e.preventDefault());

// Typing capture + detection
editor.addEventListener("keydown", e => {
  const now = performance.now();
  const delta = lastKeyTime ? now - lastKeyTime : null;
  lastKeyTime = now;

  // Character insert
  if (e.key.length === 1) {
    recentChars.push(now);
    if (!burstTimer) {
      burstTimer = setTimeout(() => {
        recentChars = [];
        burstTimer = null;
      }, BURST_WINDOW_MS);
    }

    if (recentChars.length > BURST_CHAR_THRESHOLD) {
      flag("Unnatural typing burst detected");
      recentChars = [];
    }

    if (delta !== null) {
      recentDeltas.push(delta);
      if (recentDeltas.length > 10) recentDeltas.shift();

      const avg = recentDeltas.reduce((a, b) => a + b, 0) / recentDeltas.length;
      if (avg < FAST_TYPING_MS) {
        flag("Typing speed too uniform");
      }
    }

    sendEvent({
      type: "insert",
      char: e.key,
      delta_ms: delta
    });
  }

  // Deletion
  if (e.key === "Backspace") {
    sendEvent({
      type: "delete",
      delta_ms: delta
    });
  }

  if (status.textContent.startsWith("⚠️") === false) {
    clearFlag();
  }
});

// Focus loss detection
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    flag("Tab switch detected");
  } else {
    clearFlag();
  }
});
