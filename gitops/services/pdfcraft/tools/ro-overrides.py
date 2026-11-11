#!/usr/bin/env python3
"""Validate the Romanian map, and generate nginx sub_filter rules from it — never hand-written.

    python3 gitops/services/pdfcraft/tools/ro-overrides.py          # write
    python3 gitops/services/pdfcraft/tools/ro-overrides.py --check  # validate + drift check

We never modify upstream PDFCraft; our nginx front translates what it serves,
from ONE map, pieces/pdfcraft/base/ro-overrides.json (the SEB piece pdfcraft):

  "chunks"    {"<as upstream writes it>": "<Romanian>"} — the Chinese upstream
              hardcodes in its JavaScript (the Workflow templates, the node
              counter), matched as SUBSTRINGS of the JS chunks. Generated here
              into base/ro-overrides.conf, which nginx.conf includes in the
              chunks location.
  "texts"     {"<English>": "<Romanian>"} — every tool's name and description,
              the category descriptions: matched as WHOLE strings by base/ro.js.
  "messages"  {"<leaf key>": {"<English>": "<Romanian>"}} — catalogue messages
              upstream's ro.json lacks or leaves English, matched by key AND
              English by base/ro.js.

"texts" and "messages" have no generated file: nginx refuses more than 255
sub_filter patterns in one location, far fewer than they need, so base/ro.js
(njs) reads them from the map itself. They are still VALIDATED here, so a bad
entry fails in the drift test and never in a browser.

Each "chunks" key is emitted in BOTH spellings a minifier may produce: raw
UTF-8, and with every non-ASCII character as \\uXXXX (the Romanian value then in
the same escaped form, so the JS stays valid whatever the file's encoding).

REFUSED:
  - a "chunks" key or value holding a quote, backtick, backslash, `$` (nginx
    would read a variable) or a newline — any could end a JS string early;
  - a "chunks" key that is a substring of another key — two patterns
    overlapping on the same text make the result depend on nginx's match order;
  - a "texts"/"messages" entry that is empty or not a string, left equal to its
    English, longer than base/ro.js looks at (TEXT_MAX), or whose Romanian
    drops or invents a {placeholder} of the English.

GRACEFUL BY DESIGN: if upstream changes a string, its entry simply matches
nothing and that text stays untranslated. Nothing breaks.
"""
import json
import os
import re
import sys
from pathlib import Path

# RO_OVERRIDES_BASE points the generator at another directory — how its test
# proves the refusals without touching the real map.
BASE = Path(os.environ.get("RO_OVERRIDES_BASE") or Path(__file__).resolve().parents[4] / "pieces" / "pdfcraft" / "base")
MAP = BASE / "ro-overrides.json"
OUT = BASE / "ro-overrides.conf"
FORBIDDEN = ['"', "'", "`", "\\", "$", "\n", "\r"]
# base/ro.js looks at string literals up to LONGEST = 700 characters as they
# are written, escapes included; 400 unescaped leaves room for every escape.
TEXT_MAX = 400
PLACEHOLDER = re.compile(r"\{(\w+)")


def escaped(text: str) -> str:
    """Every non-ASCII character as \\uXXXX (UTF-16 code units, as JS writes it)."""
    out = []
    for ch in text:
        if ord(ch) < 128:
            out.append(ch)
        elif ord(ch) > 0xFFFF:
            v = ord(ch) - 0x10000
            out.append("\\u%04x\\u%04x" % (0xD800 + (v >> 10), 0xDC00 + (v & 0x3FF)))
        else:
            out.append("\\u%04x" % ord(ch))
    return "".join(out)


def nginx_quote(text: str) -> str:
    """Single-quoted nginx string; backslashes doubled so `\\u5408` stays literal."""
    return "'" + text.replace("\\", "\\\\") + "'"


def check_texts(where: str, data: object, problems: list) -> None:
    """{"<English>": "<Romanian>"}: whole strings, translated, placeholders kept."""
    if not isinstance(data, dict) or not data:
        problems.append(f"{where}: must be a non-empty JSON object")
        return
    for en, ro in data.items():
        if not isinstance(ro, str) or not en.strip() or not ro.strip():
            problems.append(f"{where}: empty or non-string entry: {en!r}")
            continue
        if ro == en:
            problems.append(f"{where}: {en!r} is left in English")
        if len(en) > TEXT_MAX or len(ro) > TEXT_MAX:
            problems.append(f"{where}: {en[:40]!r}… is longer than {TEXT_MAX} characters")
        if sorted(PLACEHOLDER.findall(en)) != sorted(PLACEHOLDER.findall(ro)):
            problems.append(f"{where}: {en!r} and its Romanian differ in {{placeholders}}")


def load() -> dict:
    whole = json.loads(MAP.read_text(encoding="utf-8"))
    if not isinstance(whole, dict) or sorted(whole) != ["chunks", "messages", "texts"]:
        sys.exit(f"{MAP}: must be an object of exactly: chunks, texts, messages")
    problems = []
    check_texts("texts", whole["texts"], problems)
    messages = whole["messages"]
    if not isinstance(messages, dict) or not messages:
        problems.append("messages: must be a non-empty JSON object")
    else:
        for key, entries in messages.items():
            check_texts(f"messages.{key}", entries, problems)
    data = whole["chunks"]
    if not isinstance(data, dict) or not data:
        problems.append("chunks: must be a non-empty JSON object")
        data = {}
    for key, value in data.items():
        if not isinstance(value, str) or not key.strip() or not value.strip():
            problems.append(f"chunks: empty or non-string entry: {key!r}")
            continue
        for text, what in ((key, "key"), (value, "value")):
            bad = [c for c in FORBIDDEN if c in text]
            if bad:
                problems.append(f"chunks: {what} {text!r} holds {bad!r}")
    keys = list(data)
    for a in keys:
        for b in keys:
            if a != b and a in b:
                problems.append(f"chunks: key {a!r} is inside key {b!r} — overlapping patterns")
    if problems:
        sys.exit("ro-overrides.json REFUSED:\n  " + "\n  ".join(problems))
    return data


def render(data: dict) -> str:
    lines = [
        "# GENERATED by gitops/services/pdfcraft/tools/ro-overrides.py from",
        "# ro-overrides.json — do not edit. Included by nginx.conf in the location",
        "# that serves upstream's JS chunks.",
    ]
    for key, value in data.items():
        lines.append(f"sub_filter {nginx_quote(key)} {nginx_quote(value)};")
        if escaped(key) != key:
            lines.append(f"sub_filter {nginx_quote(escaped(key))} {nginx_quote(escaped(value))};")
    return "\n".join(lines) + "\n"


def main() -> int:
    text = render(load())
    if "--check" in sys.argv[1:]:
        current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if current != text:
            print(f"DRIFT: {OUT} differs from what {MAP.name} generates — run {Path(__file__).name}", file=sys.stderr)
            return 1
        print(f"ro-overrides: {OUT.name} is current ({text.count(chr(10)) - 3} rules)")
        return 0
    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT} ({text.count(chr(10)) - 3} rules)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
