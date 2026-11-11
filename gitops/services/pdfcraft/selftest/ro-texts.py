#!/usr/bin/env python3
"""Upstream's English, served in Romanian by base/ro.js — checked over HTTP against the
real image. Run by routing.sh; one line per case, exit 1 on any failure.

    ro-texts.py <base-url> <upstream-dir> <map.json> <chunk-path>...

<upstream-dir> holds upstream's own copies of the files compared byte for byte
(ro/tools/index.txt, ro/tools/edit-pdf/index.txt, ro/tools/edit-pdf/index.html),
taken out of the image by routing.sh. <chunk-path>s are the served chunks that
hold the tool catalogue, discovered in the image by routing.sh.

  R1  /ro/tools/ — no English tool name or description in any spelling a page
      gives it (text, attribute, inline payload), and every Romanian name present
  R2  /ro/tools/index.txt (the payload their router fetches) — the same
  R3  a tool page: h1, <title>, description and its payload are Romanian
  R4  the payload's TEXT ROWS are byte-identical to upstream's, and the rows
      follow one another exactly as upstream's do (a wrong length would shift them)
  R5  the same, for the payload a page carries inline (self.__next_f.push)
  R6  the chunks: no `key:"<English>"` literal left, every one still parses (node)
  R7  a page and a chunk are still gzipped for a client that asks, and carry no
      stale Content-Length or upstream ETag
  R8  a browser holding upstream's ETag is not told "304, still current"
  R9  a mapped message is Romanian under its own key ("selectOdd") and the same
      English under another key is left alone
"""
import gzip
import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

base, updir, mapfile = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
chunks = sys.argv[4:]
MAP = json.loads(mapfile.read_text(encoding="utf-8"))
TEXTS = MAP["texts"]
passed = failed = 0


def check(label: str, cond: bool, why: str = "") -> None:
    global passed, failed
    if cond:
        passed += 1
        print(f"  ok   {label}")
    else:
        failed += 1
        print(f"  FAIL {label}\n       {why[:600]}")


def get(path: str, headers: dict | None = None) -> tuple[int, dict, bytes]:
    req = urllib.request.Request(base + path, headers=headers or {})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read()
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read()


def spellings(en: str) -> list[str]:
    """Every spelling a page gives a string: JSON, JSON inside a JS string, markup."""
    j = json.dumps(en, ensure_ascii=False)
    h = en.replace("&", "&amp;").replace('"', "&quot;").replace("'", "&#x27;")
    return [j, json.dumps(j, ensure_ascii=False)[1:-1], f">{h}<", f'="{h}"']


def english_left(text: str, english) -> list[str]:
    return [en for en in english if any(s in text for s in spellings(en))]


def text_rows(b: bytes) -> list[bytes]:
    out = []
    for m in re.finditer(rb"(?:^|\n)([0-9a-f]*):T([0-9a-f]+),", b):
        out.append(b[m.end() : m.end() + int(m.group(2), 16)])
    return out


def row_ids(b: bytes) -> list[tuple[bytes, str]]:
    """The rows exactly as React reads them: a text row by its declared length."""
    ids, pos = [], 0
    while pos < len(b):
        m = re.match(rb"([0-9a-f]*):T([0-9a-f]+),", b[pos : pos + 32])
        if m:
            ids.append((m.group(1), "T"))
            pos += m.end() + int(m.group(2), 16)
            continue
        nl = b.find(b"\n", pos)
        if nl < 0:
            ids.append((b[pos : pos + 12], "tail"))
            break
        ids.append((b[pos : b.find(b":", pos)], "row"))
        pos = nl + 1
    return ids


def inline_stream(html: str) -> bytes:
    pieces = re.findall(r'<script>self\.__next_f\.push\(\[1,(".*?")\]\)</script>', html, flags=re.S)
    return "".join(json.loads(p) for p in pieces).encode()


tools = TEXTS

# R1, R2 — the tools index
_, _, page = get("/ro/tools/")
page_s = page.decode()
left = english_left(page_s, tools)
check("R1 /ro/tools/ holds no English tool name or description", not left, f"{len(left)} left: {left[:6]}")
# Every English upstream's own payload of this page carries arrives as its Romanian.
upstream_en = english_left((updir / "ro/tools/index.txt").read_text(encoding="utf-8"), tools)
missing = [tools[en] for en in upstream_en if not any(s in page_s for s in spellings(tools[en]))]
check(
    f"R1 /ro/tools/ carries the Romanian of all {len(upstream_en)} English strings upstream's does",
    len(upstream_en) > 200 and not missing,
    f"{len(missing)} absent: {missing[:6]}",
)
_, _, payload = get("/ro/tools/index.txt")
left = english_left(payload.decode(), tools)
check("R2 /ro/tools/index.txt holds no English tool name or description", not left, f"{len(left)} left: {left[:6]}")

# R3 — one tool page
_, _, tp = get("/ro/tools/edit-pdf/")
tps = tp.decode()
h1 = re.search(r'itemProp="name">([^<]*)</h1>', tps)
title = re.search(r"<title>([^<]*)</title>", tps)
want = TEXTS["Edit PDF"]
check("R3 the tool page's h1 is Romanian", bool(h1) and h1.group(1) == want, h1.group(1) if h1 else "no h1")
check("R3 the tool page's <title> is Romanian", bool(title) and title.group(1) == f"{want} | PDF Studio", title.group(1) if title else "no title")
desc = TEXTS["Directly edit PDF text and images online. Click paragraphs to edit in-place with live reflow, replace images, and find & replace across documents."]
check("R3 the tool page's description is Romanian", desc.replace("&", "&amp;") in tps, "description absent")

# R4, R5 — text rows untouched, rows in step
for rel in ("ro/tools/index.txt", "ro/tools/edit-pdf/index.txt"):
    ours = get("/" + rel)[2]
    theirs = (updir / rel).read_bytes()
    check(f"R4 /{rel}: its text rows are byte-identical to upstream's", text_rows(ours) == text_rows(theirs), f"{len(text_rows(ours))} vs {len(text_rows(theirs))}")
    check(f"R4 /{rel}: its rows follow one another as upstream's do", row_ids(ours) == row_ids(theirs), f"{len(row_ids(ours))} vs {len(row_ids(theirs))} rows")
theirs_html = (updir / "ro/tools/edit-pdf/index.html").read_text(encoding="utf-8")
ours_stream, theirs_stream = inline_stream(tps), inline_stream(theirs_html)
check("R5 the inline payload's text rows are byte-identical to upstream's", text_rows(ours_stream) == text_rows(theirs_stream) and len(text_rows(theirs_stream)) > 0, "differ")
check("R5 the inline payload's rows follow one another as upstream's do", row_ids(ours_stream) == row_ids(theirs_stream), f"{len(row_ids(ours_stream))} vs {len(row_ids(theirs_stream))}")
check("R5 the inline payload changed at all (it is translated)", ours_stream != theirs_stream, "identical to upstream's")

# R6 — chunks
for c in chunks:
    _, _, js = get(c)
    s = js.decode()
    keyed = [en for en in tools if re.search(r"[\w$]:" + re.escape(json.dumps(en)), s)]
    check(f"R6 {c}: no key:\"<English>\" literal left", not keyed, f"{len(keyed)}: {keyed[:5]}")
    r = subprocess.run(["node", "--check", "--input-type=commonjs"], input=s, capture_output=True, text=True)
    check(f"R6 {c}: still parses as JavaScript", r.returncode == 0, r.stderr)

# R7 — compression and headers
for path in ("/ro/tools/", "/ro/tools/index.txt") + tuple(chunks[:1]):
    st, h, b = get(path, {"Accept-Encoding": "gzip"})
    body = gzip.decompress(b) if h.get("content-encoding") == "gzip" else b
    check(
        f"R7 {path}: gzipped, no stale Content-Length or upstream ETag",
        st == 200 and h.get("content-encoding") == "gzip" and "etag" not in h and int(h.get("content-length", len(b))) == len(b),
        json.dumps(h),
    )
    check(f"R7 {path}: the gzipped body is the translated one", "Editare PDF" in body.decode(), "untranslated")

# R8 — no 304 for upstream's validator
st, h, b = get("/ro/tools/", {"If-None-Match": "*", "If-Modified-Since": "Thu, 01 Jan 2099 00:00:00 GMT"})
check("R8 a conditional request is answered in full, in Romanian", st == 200 and TEXTS["Edit PDF"] in b.decode(), f"status {st}")

# R9 — a message by its key
_, _, ep = get("/ro/tools/extract-pages/index.txt")
eps = ep.decode()
check("R9 tools.extractPages.selectOdd is Romanian", '"selectOdd":"Impare"' in eps and '"selectOdd":"Odd"' not in eps, re.findall(r'"selectOdd":"[^"]*"', eps).__str__())
check("R9 the namespace upstream already translated is left alone", '"selectOdd":"Doar pagini impare"' in eps, "changed")

print(f"\nro-texts.py: {passed} passed, {failed} failed")
sys.exit(0 if failed == 0 else 1)
