"""The page. Server-rendered HTML, Romanian, for someone who has never seen a
test report.

DESIGN CONSTRAINTS, all deliberate:
  * NO framework, NO CDN, NO external font, NO JavaScript. There is no guaranteed
    internet egress from this cluster, and a page that silently loses its styling
    when a CDN is unreachable is worse than a plain one. Everything is inline.
  * NO stack traces on the index. A wall of technical text is precisely what makes
    a report unreadable to the business; failure detail lives on the per-run page.
  * The page EXPLAINS ITSELF. It states, in prose, what a "regulă de business" is
    and what a red mark means, because the reader is assumed to have no context.
  * Pass/fail is never conveyed by colour alone — every marker carries a glyph and
    a word, so it survives a colour-blind reader and a black-and-white print.

Everything here is a pure function of already-loaded data, so the whole page can
be rendered and asserted on offline.
"""

from html import escape

from analysis import area_movement, failing_since, rule_key, totals_of, trend

CSS = """
:root{--bg:#f7f7f5;--card:#fff;--ink:#1b1b1a;--muted:#5f6360;--line:#e3e3df;
--ok:#1f7a45;--ok-bg:#e8f5ed;--bad:#a5271f;--bad-bg:#fbeceb;--warn:#8a5a00}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
line-height:1.55;font-size:16px}
.wrap{max-width:960px;margin:0 auto;padding:28px 20px 72px}
h1{font-size:1.65rem;margin:0 0 4px}
h2{font-size:1.15rem;margin:32px 0 10px}
h3{font-size:1rem;margin:0}
a{color:#1a4f8a}
.sub{color:var(--muted);margin:0 0 22px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;
padding:18px 20px;margin:0 0 16px}
.intro{background:#fffdf5;border-color:#ecdfae}
.intro p{margin:0 0 8px}
.intro p:last-child{margin:0}
.verdict{font-size:1.25rem;font-weight:600;margin:0 0 6px}
.verdict.ok{color:var(--ok)}
.verdict.bad{color:var(--bad)}
.meta{color:var(--muted);font-size:.88rem;margin:0}
.badge{display:inline-block;font-size:.78rem;padding:2px 8px;border-radius:999px;
border:1px solid var(--line);background:#f1f1ee;color:var(--muted);white-space:nowrap}
.badge.ok{background:var(--ok-bg);border-color:#bfe0cd;color:var(--ok)}
.badge.bad{background:var(--bad-bg);border-color:#eec8c5;color:var(--bad)}
.badge.warn{background:#fdf4e2;border-color:#ecdfae;color:var(--warn)}
.area{border:1px solid var(--line);border-radius:10px;background:var(--card);
margin:0 0 10px;overflow:hidden}
.area-head{display:flex;flex-wrap:wrap;gap:10px;align-items:baseline;
justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--line)}
.area-head.bad{background:var(--bad-bg)}
.rules{list-style:none;margin:0;padding:6px 18px 14px}
.rules li{padding:5px 0;border-bottom:1px dotted var(--line);
display:flex;gap:10px;align-items:flex-start}
.rules li:last-child{border-bottom:0}
.mark{font-weight:700;flex:0 0 auto;min-width:1.4em}
.mark.ok{color:var(--ok)}
.mark.bad{color:var(--bad)}
.mark.skip{color:var(--muted)}
.rule-text{flex:1 1 auto}
.since{display:block;color:var(--bad);font-size:.85rem}
details{margin:8px 18px 14px}
summary{cursor:pointer;color:var(--muted);font-size:.9rem}
.trend{display:flex;align-items:flex-end;gap:3px;height:110px;margin:10px 0 6px}
.bar{flex:1 1 0;min-width:4px;background:var(--ok);border-radius:2px 2px 0 0;
display:block}
.bar.bad{background:var(--bad)}
table{border-collapse:collapse;width:100%;font-size:.92rem}
th,td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--line)}
th{color:var(--muted);font-weight:600}
td.n,th.n{text-align:right}
code{background:#f1f1ee;padding:1px 5px;border-radius:4px;font-size:.86rem}
pre{background:#f1f1ee;padding:12px;border-radius:8px;overflow-x:auto;
font-size:.82rem;white-space:pre-wrap;word-break:break-word}
footer{color:var(--muted);font-size:.85rem;margin-top:36px}
"""

# The prose that makes the page self-explanatory. It is the reason a stakeholder
# can open this cold — do not delete it to "clean up" the layout.
INTRO = """
<div class="card intro">
<p><strong>Ce citiți aici.</strong> Fiecare rând de mai jos este o
<em>regulă de business</em> — o propoziție despre cum trebuie să se comporte
aplicația, scrisă de echipă în limbaj de business (de exemplu
„refuză a DOUA conversie a aceleiași proforme”). Fiecare regulă este verificată
automat, de la zero, la fiecare modificare a codului.</p>
<p><strong>Verde (✔) înseamnă că regula se respectă</strong> la ultima verificare.
<strong>Roșu (✘) înseamnă că nu se mai respectă</strong> — aplicația face acum
altceva decât s-a stabilit. La fiecare regulă roșie scrie și de când nu se mai
respectă, pentru că o regulă căzută ieri și una căzută de două săptămâni sunt
două probleme diferite.</p>
<p>Această pagină se actualizează singură la fiecare verificare și păstrează
istoricul, deci se poate compara cu ce era săptămâna trecută.</p>
</div>
"""


def _e(value):
    """Escape anything into HTML text."""
    return escape("" if value is None else str(value), quote=True)


def _page(title, body):
    return (
        "<!doctype html>\n"
        '<html lang="ro"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        "<title>%s</title><style>%s</style></head>"
        '<body><div class="wrap">%s</div></body></html>\n'
        % (_e(title), CSS, body)
    )


def _plural(count, one, many):
    return one if count == 1 else many


def _verdict(passed, failed):
    total = passed + failed
    if total == 0:
        return '<p class="verdict">Nicio regulă verificată în această rulare.</p>'
    if failed == 0:
        return (
            '<p class="verdict ok">✔ Toate cele %d reguli de business se respectă.</p>'
            % total
        )
    return (
        '<p class="verdict bad">✘ %d din %d reguli de business nu se mai respectă.</p>'
        % (failed, total)
    )


def _run_meta(run):
    bits = []
    when = run.get("receivedAt") or run.get("timestamp")
    if when:
        bits.append("Verificat: %s UTC" % _e(when.replace("T", " ").rstrip("Z")))
    if run.get("branch"):
        bits.append("ramura <code>%s</code>" % _e(run["branch"]))
    if run.get("commit"):
        bits.append("versiunea <code>%s</code>" % _e(run["commit"][:8]))
    line = " · ".join(bits)
    if run.get("runUrl"):
        line += ' · <a href="%s">jurnalul tehnic al verificării</a>' % _e(run["runUrl"])
    return '<p class="meta">%s</p>' % line


def _trend_block(points):
    """Bars, drawn with plain divs — no chart library, no SVG viewbox maths.

    Height is proportional to the share of rules that hold, so a run where
    everything holds is a full bar and a bad run is visibly shorter. A run with any
    failure is red, because "97% holding" is still a broken rule to whoever owns it.
    """
    if len(points) < 2:
        return ""
    bars = []
    for point in points:
        total = point["total"] or 1
        share = point["passed"] / total
        # Floor at 8% so a catastrophic run is still a visible bar, not a gap.
        height = max(8, round(share * 100))
        css = "bar bad" if point["failed"] else "bar"
        label = "%s — %d din %d reguli se respectă" % (
            point["at"].replace("T", " ").rstrip("Z"),
            point["passed"],
            point["total"],
        )
        bars.append(
            '<a class="%s" style="height:%d%%" href="/run/%s" title="%s"></a>'
            % (css, height, _e(point["id"]), _e(label))
        )
    first, last = points[0], points[-1]
    return (
        '<div class="card"><h3>Evoluție</h3>'
        '<p class="meta">Ultimele %d verificări, de la stânga (mai vechi) la dreapta '
        "(cea mai recentă). Bara roșie = verificare cu cel puțin o regulă încălcată.</p>"
        '<div class="trend">%s</div>'
        '<p class="meta">%s: %d din %d &nbsp;→&nbsp; %s: %d din %d</p></div>'
        % (
            len(points),
            "".join(bars),
            _e(first["at"][:10]),
            first["passed"],
            first["total"],
            _e(last["at"][:10]),
            last["passed"],
            last["total"],
        )
    )


def _movement_badge(movement):
    if not movement:
        return ""
    direction = movement.get("direction")
    delta = movement.get("delta", 0)
    if direction == "worse":
        return '<span class="badge bad">↑ %d %s față de verificarea anterioară</span>' % (
            delta,
            _plural(delta, "regulă căzută", "reguli căzute"),
        )
    if direction == "better":
        return '<span class="badge ok">↓ %d %s reparate</span>' % (
            -delta,
            _plural(-delta, "regulă", "reguli"),
        )
    if direction == "new":
        return '<span class="badge">zonă nouă</span>'
    return ""


def _since_text(info):
    if not info:
        return ""
    runs = info.get("runs", 1)
    when = (info.get("since") or "").replace("T", " ").rstrip("Z")
    prefix = "de cel puțin" if info.get("beyond") else "de"
    tail = " (din %s UTC)" % _e(when) if when else ""
    return "nu se mai respectă %s %d %s%s" % (
        prefix,
        runs,
        _plural(runs, "verificare", "verificări"),
        tail,
    )


def _area_block(area, since, movement, run_id):
    name = area.get("area") or ""
    passed = int(area.get("passed") or 0)
    failed = int(area.get("failed") or 0)
    skipped = int(area.get("skipped") or 0)
    total = passed + failed
    head_class = "area-head bad" if failed else "area-head"
    status = (
        '<span class="badge ok">%d din %d se respectă</span>' % (passed, total)
        if failed == 0
        else '<span class="badge bad">%d din %d nu se respectă</span>' % (failed, total)
    )
    parts = [
        '<section class="area"><div class="%s"><h3>%s</h3><div>%s %s</div></div>'
        % (head_class, _e(name), status, _movement_badge(movement))
    ]

    failing = [r for r in area.get("rules") or [] if r.get("status") == "failed"]
    holding = [r for r in area.get("rules") or [] if r.get("status") == "passed"]
    pending = [r for r in area.get("rules") or [] if r.get("status") == "skipped"]

    if failing:
        rows = []
        for rule in failing:
            info = since.get(rule_key(name, rule.get("title") or ""))
            note = _since_text(info)
            rows.append(
                '<li><span class="mark bad">✘</span><span class="rule-text">%s%s</span></li>'
                % (
                    _e(rule.get("title")),
                    '<span class="since">%s</span>' % note if note else "",
                )
            )
        parts.append('<ul class="rules">%s</ul>' % "".join(rows))

    if holding:
        rows = "".join(
            '<li><span class="mark ok">✔</span><span class="rule-text">%s</span></li>'
            % _e(rule.get("title"))
            for rule in holding
        )
        parts.append(
            "<details><summary>Vezi cele %d reguli care se respectă</summary>"
            '<ul class="rules">%s</ul></details>' % (len(holding), rows)
        )

    if pending:
        rows = "".join(
            '<li><span class="mark skip">–</span><span class="rule-text">%s</span></li>'
            % _e(rule.get("title"))
            for rule in pending
        )
        parts.append(
            "<details><summary>%d %s în așteptare (neverificate încă)</summary>"
            '<ul class="rules">%s</ul></details>'
            % (len(pending), _plural(len(pending), "regulă", "reguli"), rows)
        )

    if failed and run_id:
        parts.append(
            '<p class="meta" style="padding:0 18px 14px">'
            '<a href="/run/%s">Detalii tehnice pentru această verificare</a></p>'
            % _e(run_id)
        )
    parts.append("</section>")
    return "".join(parts)


def _history_table(runs, limit=15):
    rows = []
    for run in runs[:limit]:
        passed, failed, _ = totals_of(run)
        mark = (
            '<span class="badge ok">✔ toate</span>'
            if failed == 0
            else '<span class="badge bad">✘ %d</span>' % failed
        )
        rows.append(
            '<tr><td><a href="/run/%s">%s</a></td><td>%s</td>'
            '<td class="n">%d</td><td>%s</td></tr>'
            % (
                _e(run.get("id")),
                _e((run.get("receivedAt") or "").replace("T", " ").rstrip("Z")),
                _e(run.get("branch") or ""),
                passed + failed,
                mark,
            )
        )
    if not rows:
        return ""
    return (
        '<div class="card"><h3>Verificări recente</h3><table>'
        '<tr><th>Când (UTC)</th><th>Ramura</th><th class="n">Reguli</th>'
        "<th>Rezultat</th></tr>%s</table></div>" % "".join(rows)
    )


def render_app_section(app, runs):
    """One application's whole story: verdict, trend, areas, recent runs."""
    if not runs:
        return (
            '<div class="card"><h2>%s</h2>'
            '<p class="meta">Nicio verificare înregistrată încă.</p></div>' % _e(app)
        )
    latest = runs[0]
    passed, failed, skipped = totals_of(latest)
    since = failing_since(runs)
    movement = area_movement(runs)
    points = trend(runs)
    run_id = latest.get("id") or ""

    areas = sorted(
        latest.get("areas") or [],
        # Broken areas first — what needs acting on should never be scrolled to.
        key=lambda a: (0 if int(a.get("failed") or 0) else 1, a.get("area") or ""),
    )
    body = [
        '<div class="card"><h2 style="margin-top:0">%s</h2>%s%s%s</div>'
        % (
            _e(app),
            _verdict(passed, failed),
            _run_meta(latest),
            # Romanian agrees the noun AND the verb with the count — "1 reguli sunt"
            # is wrong in a page whose whole purpose is being readable by the business.
            '<p class="meta">%d %s în așteptare (scrise, dar dezactivate).</p>'
            % (skipped, _plural(skipped, "regulă este", "reguli sunt"))
            if skipped
            else "",
        ),
        _trend_block(points),
        "<h2>Pe zone de business</h2>",
    ]
    body.extend(_area_block(area, since, movement.get(area.get("area") or ""), run_id) for area in areas)
    body.append(_history_table(runs))
    return "".join(body)


def render_index(sections):
    """The living-documentation page. `sections` is [(app, runs-newest-first)]."""
    if not sections:
        inner = (
            INTRO
            + '<div class="card"><p>Nicio verificare înregistrată încă. Pagina se '
            "populează automat la următoarea rulare a testelor.</p></div>"
        )
        return _page("Reguli de business", inner)
    body = [
        "<h1>Regulile de business ale aplicației</h1>",
        '<p class="sub">Starea curentă a comportamentului aplicației, verificat '
        "automat la fiecare modificare a codului.</p>",
        INTRO,
    ]
    body.extend(render_app_section(app, runs) for app, runs in sections)
    body.append(
        "<footer>Raport generat automat de serviciul <code>test-reports</code>. "
        "Istoricul se păstrează 365 de zile.</footer>"
    )
    return _page("Reguli de business", "".join(body))


def render_run(run):
    """One specific verification, WITH the technical failure detail.

    This is the only page that shows a stack trace, and it is reached by an
    explicit click — the index stays readable for the people it is written for.
    """
    passed, failed, skipped = totals_of(run)
    body = [
        "<h1>Verificare din %s UTC</h1>"
        % _e((run.get("receivedAt") or "").replace("T", " ").rstrip("Z")),
        '<p class="sub"><a href="/">← înapoi la starea curentă</a></p>',
        '<div class="card">%s%s</div>' % (_verdict(passed, failed), _run_meta(run)),
    ]
    for area in sorted(
        run.get("areas") or [],
        key=lambda a: (0 if int(a.get("failed") or 0) else 1, a.get("area") or ""),
    ):
        name = area.get("area") or ""
        failing = [r for r in area.get("rules") or [] if r.get("status") == "failed"]
        if not failing:
            continue
        rows = []
        for rule in failing:
            detail = rule.get("message")
            rows.append(
                '<li><span class="mark bad">✘</span><span class="rule-text">%s'
                '<div class="meta"><code>%s</code></div>%s</span></li>'
                % (
                    _e(rule.get("title")),
                    _e(rule.get("file") or ""),
                    "<pre>%s</pre>" % _e(detail) if detail else "",
                )
            )
        body.append(
            '<section class="area"><div class="area-head bad"><h3>%s</h3>'
            '<span class="badge bad">%d nu se respectă</span></div>'
            '<ul class="rules">%s</ul></section>' % (_e(name), len(failing), "".join(rows))
        )
    if failed == 0:
        body.append(
            '<div class="card"><p>Toate regulile se respectau la această verificare. '
            "Nu există detalii tehnice de afișat.</p></div>"
        )
    if skipped:
        body.append(
            '<p class="meta">%d reguli erau în așteptare (dezactivate) la această '
            "verificare.</p>" % skipped
        )
    return _page("Verificare %s" % (run.get("id") or ""), "".join(body))
