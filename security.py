"""Security helpers: HTML sanitization, AI URL blocking, CSRF tokens."""

from __future__ import annotations

import re
import secrets
from html import escape as html_escape
from urllib.parse import urlparse

import bleach
from flask import session
from markupsafe import Markup

# ---------------------------------------------------------------------------
# AI blocklist — hostname fragments & path hints (lowercase matching)
# ---------------------------------------------------------------------------

AI_HOST_FRAGMENTS = frozenset({
    "openai.com", "chatgpt.com", "chat.openai.com", "api.openai.com",
    "platform.openai.com", "oaiusercontent.com",
    "anthropic.com", "claude.ai",
    "gemini.google.com", "bard.google.com", "generativeai.google",
    "ai.google.dev", "aistudio.google.com",
    "copilot.microsoft.com", "copilot.cloud.microsoft.com",
    "perplexity.ai", "poe.com", "character.ai", "character.com",
    "huggingface.co", "hf.co", "cohere.com", "cohere.ai", "ai21.com",
    "jasper.ai", "writesonic.com", "copy.ai", "rytr.me", "anyword.com",
    "hypotenuse.ai", "wordtune.com", "quillbot.com",
    "phind.com", "you.com", "grok.com", "x.ai", "meta.ai",
    "deepseek.com", "mistral.ai", "together.ai", "replicate.com",
    "cursor.com", "cursor.sh", "githubcopilot.com",
    "midjourney.com", "stability.ai", "leonardo.ai", "labs.openai.com",
    "gamma.app", "tome.app", "beautiful.ai",
    "simplified.com", "chatbase.co", "flowgpt.com", "forefront.ai",
    "pi.ai", "inflection.ai", "replika.ai", "novelai.net",
    "tabnine.com", "codeium.com", "sourcegraph.com", "continue.dev",
    "blackbox.ai", "openrouter.ai",
    "lmstudio.ai", "ollama.com", "localai.io", "groq.com",
    "fireworks.ai", "scale.ai", "labelbox.com",
})

# Host + path pairs for services that share a broad domain with non-AI pages.
AI_HOST_PATH_RULES = (
    ("amazon.com", ("/q", "/codewhisperer")),
    ("aws.amazon.com", ("/bedrock", "/q")),
    ("bing.com", ("/chat", "/copilot")),
    ("edgeservices.bing.com", ("/",)),
    ("google.com", ("/bard",)),
    ("microsoft.com", ("/copilot", "/ai")),
    ("notion.so", ("/ai", "/gpt")),
    ("grammarly.com", ("/go", "/genai", "/ai")),
)

AI_PATH_HINTS = frozenset({
    "/chatgpt", "/copilot", "/assistant", "/ai/", "/generate",
})

ALLOWED_HTML_TAGS = frozenset({
    "p", "br", "strong", "b", "em", "i", "u", "s", "strike", "del",
    "h1", "h2", "h3", "ul", "ol", "li", "blockquote", "hr", "div", "span",
})

ALLOWED_HTML_ATTRIBUTES: dict[str, list[str]] = {}

DANGEROUS_URL_RE = re.compile(
    r"^(?:javascript|data|vbscript|file|blob):",
    re.IGNORECASE,
)


def _normalize_host(hostname: str | None) -> str:
    if not hostname:
        return ""
    host = hostname.lower().strip(".")
    if host.startswith("www."):
        host = host[4:]
    return host


def is_ai_url(url: str | None) -> bool:
    """Return True if URL points to a known AI service."""
    if not url or not isinstance(url, str):
        return False
    url = url.strip()
    if not url or DANGEROUS_URL_RE.match(url):
        return True
    try:
        parsed = urlparse(url if "://" in url else f"https://{url}")
    except ValueError:
        return True
    host = _normalize_host(parsed.hostname)
    if not host:
        return False
    for fragment in AI_HOST_FRAGMENTS:
        if host == fragment or host.endswith(f".{fragment}"):
            return True
    path = (parsed.path or "").lower()
    for rule_host, path_prefixes in AI_HOST_PATH_RULES:
        if host == rule_host or host.endswith(f".{rule_host}"):
            for prefix in path_prefixes:
                if path == prefix or path.startswith(prefix.rstrip("/") + "/") or path.startswith(prefix):
                    return True
    for hint in AI_PATH_HINTS:
        if hint in path:
            return True
    return False


def sanitize_html(content: str | None) -> str:
    """Strip scripts, embeds, links, and AI-related markup from editor HTML."""
    if not content:
        return ""
    cleaned = bleach.clean(
        content,
        tags=list(ALLOWED_HTML_TAGS),
        attributes=ALLOWED_HTML_ATTRIBUTES,
        protocols=[],
        strip=True,
    )
    # Remove any residual href/src/data attributes bleach may have missed
    cleaned = re.sub(r"""\s(?:href|src|data-\w+|on\w+)\s*=\s*(['"])[^'"]*\1""", "", cleaned, flags=re.I)
    cleaned = re.sub(r"<a\b[^>]*>", "", cleaned, flags=re.I)
    cleaned = re.sub(r"</a>", "", cleaned, flags=re.I)
    return cleaned


def sanitized_markup(content: str | None) -> Markup:
    return Markup(sanitize_html(content))


def sanitize_title(title: str | None, max_length: int = 255) -> str:
    if not title:
        return ""
    title = bleach.clean(str(title), tags=[], strip=True)
    title = re.sub(r"\s+", " ", title).strip()
    return title[:max_length]


def html_to_plain_text(content: str | None) -> str:
    if not content:
        return ""
    return bleach.clean(content, tags=[], strip=True)


def plain_word_count(content: str | None) -> int:
    text = html_to_plain_text(content).strip()
    if not text:
        return 0
    return len(text.split())


def escape_pdf_text(text: str) -> str:
    return html_escape(text, quote=True)


def get_ai_blocklist_for_client() -> list[str]:
    return sorted(AI_HOST_FRAGMENTS)


# ---------------------------------------------------------------------------
# CSRF
# ---------------------------------------------------------------------------

CSRF_SESSION_KEY = "_csrf_token"


def get_csrf_token() -> str:
    token = session.get(CSRF_SESSION_KEY)
    if not token:
        token = secrets.token_urlsafe(32)
        session[CSRF_SESSION_KEY] = token
    return token


def validate_csrf_token(token: str | None) -> bool:
    if not token:
        return False
    expected = session.get(CSRF_SESSION_KEY)
    if not expected:
        return False
    return secrets.compare_digest(token, expected)
