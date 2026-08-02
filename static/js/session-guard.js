/**
 * MinimēGPT session guard — blocks AI services and external threats during writing.
 * Loaded before index.js; exposes MinimeSessionGuard API.
 */
(function (global) {
  "use strict";

  const DANGEROUS_TAGS = new Set([
    "SCRIPT", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "FORM",
    "INPUT", "BUTTON", "TEXTAREA", "SELECT", "APPLET", "FRAME",
    "FRAMESET", "BASE", "SVG", "MATH",
  ]);

  const DANGEROUS_PROTOCOL = /^(javascript|data|vbscript|file|blob):/i;

  let aiPatterns = [];
  let active = false;
  let locked = false;
  let onViolation = null;

  function setConfig(config) {
    aiPatterns = Array.isArray(config?.aiPatterns) ? config.aiPatterns : [];
  }

  function setActive(isActive, isLocked) {
    active = !!isActive;
    locked = !!isLocked;
  }

  function setViolationHandler(fn) {
    onViolation = typeof fn === "function" ? fn : null;
  }

  function warn(message) {
    if (onViolation) onViolation(message);
  }

  function normalizeHost(hostname) {
    if (!hostname) return "";
    let host = hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    return host;
  }

  function isAiUrl(url) {
    if (!url || typeof url !== "string") return false;
    const trimmed = url.trim();
    if (!trimmed || DANGEROUS_PROTOCOL.test(trimmed)) return true;
    try {
      const parsed = new URL(trimmed, global.location.origin);
      const host = normalizeHost(parsed.hostname);
      for (const fragment of aiPatterns) {
        const f = fragment.toLowerCase();
        if (host === f || host.endsWith("." + f)) return true;
      }
      const path = (parsed.pathname || "").toLowerCase();
      if (
        path.includes("/chatgpt") ||
        path.includes("/copilot") ||
        path.includes("/assistant") ||
        path.includes("/ai/")
      ) {
        return true;
      }
    } catch {
      return true;
    }
    return false;
  }

  function isExternalUrl(url) {
    if (!url || typeof url !== "string") return false;
    if (DANGEROUS_PROTOCOL.test(url.trim())) return true;
    try {
      const parsed = new URL(url, global.location.origin);
      return parsed.origin !== global.location.origin;
    } catch {
      return true;
    }
  }

  function isBlockedRequest(url) {
    if (!active || !locked) return false;
    if (isAiUrl(url)) return true;
    if (isExternalUrl(url)) return true;
    return false;
  }

  function purgeEditor(root) {
    if (!root) return false;
    let changed = false;

    root.querySelectorAll("*").forEach((el) => {
      if (DANGEROUS_TAGS.has(el.tagName)) {
        el.remove();
        changed = true;
        return;
      }
      [...el.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = attr.value || "";
        if (name.startsWith("on") || name === "style" || name.startsWith("data-")) {
          el.removeAttribute(attr.name);
          changed = true;
        }
        if ((name === "href" || name === "src" || name === "xlink:href") &&
            (DANGEROUS_PROTOCOL.test(value) || isAiUrl(value))) {
          el.removeAttribute(attr.name);
          changed = true;
        }
      });
      if (el.tagName === "A") {
        const href = el.getAttribute("href");
        if (!href || isAiUrl(href) || (active && locked)) {
          const text = document.createTextNode(el.textContent || "");
          el.replaceWith(text);
          changed = true;
        }
      }
    });
    return changed;
  }

  function blockExecCommand(command) {
    const blocked = new Set(["createlink", "inserthtml", "insertimage", "insertiframe"]);
    const cmd = String(command || "").toLowerCase();
    if (blocked.has(cmd)) {
      warn("That action is blocked during writing sessions.");
      return true;
    }
    return false;
  }

  function installHooks() {
    const originalFetch = global.fetch.bind(global);
    global.fetch = function (input, init) {
      const url = typeof input === "string" ? input : input?.url;
      if (isBlockedRequest(url)) {
        warn("External network requests are blocked during writing sessions.");
        return Promise.reject(new Error("blocked"));
      }
      return originalFetch(input, init);
    };

    const originalOpen = global.open.bind(global);
    global.open = function (url, ...rest) {
      if (active && locked) {
        warn("Opening new windows is blocked during writing sessions.");
        return null;
      }
      if (url && isAiUrl(url)) {
        warn("AI services are blocked.");
        return null;
      }
      return originalOpen(url, ...rest);
    };

    const XHR = global.XMLHttpRequest;
    if (XHR) {
      const originalSend = XHR.prototype.send;
      const originalOpenXHR = XHR.prototype.open;
      XHR.prototype.open = function (method, url, ...rest) {
        this._minimeUrl = url;
        return originalOpenXHR.call(this, method, url, ...rest);
      };
      XHR.prototype.send = function (...args) {
        if (isBlockedRequest(this._minimeUrl)) {
          warn("External network requests are blocked during writing sessions.");
          return;
        }
        return originalSend.apply(this, args);
      };
    }

    if (global.navigator?.sendBeacon) {
      const originalBeacon = global.navigator.sendBeacon.bind(global.navigator);
      global.navigator.sendBeacon = function (url, data) {
        if (isBlockedRequest(url)) {
          warn("External network requests are blocked during writing sessions.");
          return false;
        }
        return originalBeacon(url, data);
      };
    }

    const originalExecCommand = document.execCommand.bind(document);
    document.execCommand = function (command, ...args) {
      if (active && locked && blockExecCommand(command)) {
        return false;
      }
      return originalExecCommand(command, ...args);
    };
  }

  installHooks();

  global.MinimeSessionGuard = {
    setConfig,
    setActive,
    setViolationHandler,
    isAiUrl,
    isExternalUrl,
    isBlockedRequest,
    purgeEditor,
  };
})(window);
