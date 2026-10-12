"""Backend view of the shared i18n files (frontend/messages/*.json + locales.json).

The frontend owns them; there is no second copy of any translation or language list.
Docker builds mount the same folder at /app/i18n (see docker-compose `additional_contexts`).
"""

import json
from functools import lru_cache
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]  # backend/ (or /app in the container)
I18N_DIR = next(
    p for p in (_ROOT / "i18n", _ROOT.parent / "frontend" / "messages") if p.is_dir()
)

LOCALES: tuple[str, ...] = tuple(
    o["code"] for o in json.loads((I18N_DIR / "locales.json").read_text("utf-8"))
)
DEFAULT_LOCALE = "en"

# Single source of truth for the app name: messages/brand.json (also read by the frontend).
BRAND: dict[str, str] = json.loads((I18N_DIR / "brand.json").read_text("utf-8"))


@lru_cache
def _messages(lang: str) -> dict:
    raw = (I18N_DIR / f"{lang}.json").read_text("utf-8")
    return json.loads(raw.replace("{brand}", BRAND["name"]))


def _lookup(lang: str, key: str) -> str | None:
    node = _messages(lang)
    for part in key.split("."):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node if isinstance(node, str) else None


def resolve_locale(lang: str) -> str:
    return lang if lang in LOCALES else DEFAULT_LOCALE


def t(lang: str, key: str) -> str:
    """Translate a dotted message key, falling back to English."""
    found = _lookup(resolve_locale(lang), key) or _lookup(DEFAULT_LOCALE, key)
    if found is None:
        raise KeyError(f"Missing i18n key: {key}")
    return found
