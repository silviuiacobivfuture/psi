#!/usr/bin/env python3
"""
psi's colours on the webmail, generated from Roundcube's own Elastic stylesheet.

    python3 webmail-theme.py <elastic styles.min.css> > webmail.generated.css

WHY GENERATED. Elastic compiles its palette into fixed colours (no CSS variables), so a short
hand-written override only repaints the panels it happens to name and leaves the rest in Elastic's
blue-slate: that mix (psi's brown on some panels, slate on others, blue here and there) is what the
owner saw on 2026-11-12. This script walks EVERY rule of the skin's stylesheet, light and dark, and
re-emits only the colour declarations, moved into psi's palette:

  - Elastic's blue accent becomes psi's gold: the accent (`primary`) for fills and borders, the
    link colour for text, a soft gold for the pale tints. Dark-mode rules take the Night values.
  - Elastic's cool greys and slates keep their LIGHTNESS (so every contrast Elastic shipped with is
    kept) and take psi's warm neutral hue at psi's low chroma. White panels become psi's card.
  - Reds, greens and yellows (errors, success, warnings, flags) are left exactly as Elastic has them.

Layout, sizes and behaviour stay Elastic's: nothing here but colour. The hand-written part
(webmail.overrides.css: fonts, the logo, labels that must not be cut, the message frame) is appended
after the generated rules. Tokens: psi's sign-in (gitops/platform/authentik/estate/recomex.css,
generated from brand/signin-theme.json): Psizone Gold (light), Psizone Night (dark).

Re-run whenever the Roundcube image changes (the input's sha256 is written into the output header):
  kubectl -n stalwart exec deploy/webmail -c roundcube -- cat /var/www/html/skins/elastic/styles/styles.min.css > /tmp/elastic.css
  python3 webmail-theme.py /tmp/elastic.css > webmail.generated.css
"""

import hashlib
import math
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent

# psi's tokens (recomex.css). Light = Psizone Gold, dark = Psizone Night.
TOKENS = {
    "light": {"primary": "#A97B24", "link": "#86650F", "card": "#FAF6EE"},
    "dark": {"primary": "#C2983F", "link": "#D2AA50", "card": "#15120C"},
}
WARM_HUE = 82.0  # psi's neutrals (#F4EEE2, #ECE3D1, #15120C, #1E1A12) sit at about 80-85 degrees
NEUTRAL_CHROMA = 0.014
ACCENT_HUE = 78.0  # psi's gold (#A97B24)


# ---- colour maths (sRGB <-> OKLCH) ----
def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _gam(c):
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def to_oklch(rgb):
    r, g, b = (_lin(v / 255) for v in rgb)
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l, m, s = (math.copysign(abs(v) ** (1 / 3), v) for v in (l, m, s))
    L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return L, math.hypot(a, bb), math.degrees(math.atan2(bb, a)) % 360


def _from_oklch(L, C, h):
    a, b = C * math.cos(math.radians(h)), C * math.sin(math.radians(h))
    l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return r, g, bl


def from_oklch(L, C, h):
    """OKLCH to sRGB, lowering chroma until the colour fits the gamut."""
    L = min(max(L, 0.0), 1.0)
    while True:
        rgb = _from_oklch(L, C, h)
        if all(-1e-4 <= v <= 1 + 1e-4 for v in rgb) or C < 1e-3:
            return tuple(round(min(max(_gam(min(max(v, 0), 1)), 0), 1) * 255) for v in rgb)
        C *= 0.95


def parse_hex(h):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def fmt(rgb, alpha=None):
    if alpha is None:
        return "#%02x%02x%02x" % rgb
    return "rgba(%d,%d,%d,%s)" % (*rgb, alpha)


# ---- the mapping ----
def is_blue(C, h):
    return C >= 0.05 and 190 <= h <= 265


def is_cool_neutral(C, h):
    return C < 0.05 and (C < 0.012 or 160 <= h <= 280)


def remap(rgb, alpha, prop, dark):
    L, C, h = to_oklch(rgb)
    t = TOKENS["dark" if dark else "light"]
    if is_blue(C, h):
        if L > 0.88:  # Elastic's pale blue tints (selected rows, hovers): a soft gold
            return fmt(from_oklch(L, 0.035, ACCENT_HUE), alpha)
        if L < 0.45:  # deep blues (pressed states, mobile headers): a deep gold
            return fmt(from_oklch(L, 0.09, ACCENT_HUE), alpha)
        if alpha is not None:
            return fmt(parse_hex(t["primary"]), alpha)
        return t["link"] if prop == "color" else t["primary"]
    if is_cool_neutral(C, h):
        if L > 0.995:  # white: text on accents stays white; panels become psi's card
            if prop == "color" or alpha is not None:
                return None
            return t["card"] if not dark else None
        if L < 0.005:
            return None  # black (shadows, overlays)
        return fmt(from_oklch(L, min(NEUTRAL_CHROMA, NEUTRAL_CHROMA * (1 - abs(L - 0.55))), WARM_HUE), alpha)
    return None  # reds, greens, yellows: Elastic's own


COLOUR = re.compile(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)")


def map_value(value, prop, dark):
    changed = False

    def sub(m):
        nonlocal changed
        s = m.group(0)
        if s.startswith("#"):
            rgb, alpha = parse_hex(s), None
        else:
            parts = [p.strip() for p in s[s.index("(") + 1 : -1].split(",")]
            rgb, alpha = tuple(int(p) for p in parts[:3]), (parts[3] if len(parts) == 4 else None)
        out = remap(rgb, alpha, prop, dark)
        if out is None:
            return s
        changed = True
        return out

    new = COLOUR.sub(sub, value)
    return new if changed else None


COLOUR_PROPS = re.compile(r"^(color|background|background-color|border(-top|-right|-bottom|-left)?(-color)?|outline(-color)?|box-shadow|fill|stroke|text-decoration-color|caret-color)$")


def split_blocks(css, start=0):
    """Yield (prelude, body) at one nesting level of minified CSS."""
    i, n = start, len(css)
    while i < n:
        j = css.find("{", i)
        if j < 0:
            return
        prelude = css[i:j].strip()
        depth, k = 1, j + 1
        while k < n and depth:
            if css[k] == "{":
                depth += 1
            elif css[k] == "}":
                depth -= 1
            k += 1
        yield prelude, css[j + 1 : k - 1]
        i = k


def walk(css):
    out = []
    for prelude, body in split_blocks(css):
        if prelude.startswith("@media") or prelude.startswith("@supports"):
            inner = walk(body)
            if inner:
                out.append(prelude + "{" + "".join(inner) + "}")
            continue
        if prelude.startswith("@"):
            continue  # @font-face, @keyframes: nothing to recolour
        decls = []
        for decl in body.split(";"):
            if ":" not in decl:
                continue
            prop, value = decl.split(":", 1)
            prop = prop.strip().lower()
            if not COLOUR_PROPS.match(prop):
                continue
            dark = "dark-mode" in prelude
            new = map_value(value, prop, dark)
            if new is not None:
                decls.append(prop + ":" + new.strip())
        if decls:
            out.append(prelude + "{" + ";".join(decls) + "}\n")
    return out


def main():
    src = pathlib.Path(sys.argv[1]).read_bytes()
    css = re.sub(r"/\*.*?\*/", "", src.decode("utf-8"), flags=re.S)
    rules = walk(css)
    overrides = (HERE / "webmail.overrides.css").read_text()
    sys.stdout.write(
        "/* GENERATED by webmail-theme.py from Roundcube Elastic styles.min.css "
        f"(sha256 {hashlib.sha256(src).hexdigest()[:16]}). Do not edit by hand: edit webmail.overrides.css "
        "or the script, then re-run it. */\n"
    )
    # psi's faces, as on the sign-in (an @import must come before every rule).
    sys.stdout.write('@import url("https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..600&family=Manrope:wght@400..800&display=swap");\n')
    sys.stdout.write("".join(rules))
    sys.stdout.write("\n/* ---- webmail.overrides.css ---- */\n")
    sys.stdout.write(overrides)


if __name__ == "__main__":
    main()
