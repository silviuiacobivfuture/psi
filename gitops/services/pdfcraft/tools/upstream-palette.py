#!/usr/bin/env python3
"""Record which Tailwind palette colours the pinned PDFCraft build uses.

    python3 gitops/services/pdfcraft/tools/upstream-palette.py <dir with their _next/static/css>

Upstream's Tailwind v4 build compiles every palette utility — `text-zinc-600`,
`hover:bg-blue-50`, `dark:text-zinc-200`, gradients, fills — to
`var(--color-<family>-<shade>)`, and its theme layer defines only the variables
the build actually uses. This writes those definitions, as OKLCH, to
pieces/pdfcraft/base/upstream-palette.json. packages/rmx-ui/scripts/pdfcraft-theme.mjs maps each
one onto the estate role nearest in lightness, per theme, so their hard-coded
colours follow the estate's themes without a single class selector.

Run it when the pinned image changes (RUNBOOK: "PDFCraft upgrade"), then
regenerate the stylesheet. A variable a new build adds and this list lacks keeps
upstream's own colour until then — a colour is off, nothing breaks.

To get the CSS out of the pinned image:
    podman create --name pdfcss <image>; podman cp pdfcss:/website/pdfcraft/_next/static/css ./css; podman rm pdfcss
"""
import json
import os
import re
import sys
from pathlib import Path

OUT = Path(
    os.environ.get("UPSTREAM_PALETTE_OUT")
    or Path(__file__).resolve().parents[4] / "pieces" / "pdfcraft" / "base" / "upstream-palette.json"
)
FAMILIES = (
    "slate gray zinc neutral stone red orange amber yellow lime green emerald teal "
    "cyan sky blue indigo violet purple fuchsia pink rose"
).split()
DEF = re.compile(r"--color-([a-z]+(?:-\d{2,3})?):\s*(oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)|#[0-9a-fA-F]{3,8})")


def main() -> int:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    css = "".join(p.read_text(encoding="utf-8") for p in sorted(Path(sys.argv[1]).glob("*.css")))
    if not css:
        sys.exit(f"no *.css in {sys.argv[1]}")
    palette = {}
    for name, literal, l, c, h in DEF.findall(css):
        family = name.rsplit("-", 1)[0] if "-" in name else name
        if name in ("white", "black"):
            palette[name] = [1.0, 0.0, 0.0] if name == "white" else [0.0, 0.0, 0.0]
        elif family in FAMILIES and l:
            palette[name] = [round(float(l) / 100, 4), float(c), float(h)]
    if not palette:
        sys.exit("found no palette variables — has the build changed shape?")
    # One colour per line, so an upgrade's diff reads as a list of colours.
    rows = [f"\t{json.dumps(k)}: {json.dumps(v)}" for k, v in sorted(palette.items())]
    OUT.write_text("{\n" + ",\n".join(rows) + "\n}\n", encoding="utf-8")
    print(f"wrote {OUT} ({len(palette)} colours)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
