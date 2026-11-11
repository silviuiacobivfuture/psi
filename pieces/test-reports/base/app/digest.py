"""The weekly #tests digest, computed here rather than in the CronJob's shell.

WHY THE LOGIC LIVES IN PYTHON AND NOT IN THE JOB
    The CronJob that posts this (../../base/weekly-digest.yaml) is a `curl | curl`
    pipe on purpose. Everything it would otherwise have to do — scan a year of
    stored runs, compare against the same week last week, agree the Romanian noun
    with the count — is work this service already has the data and the helpers for,
    and shell is the worst possible place to do it. Keeping it here also means the
    offline harness (../../selftest/run.sh) exercises the REAL digest text against
    REAL stored runs, with no cluster and no Talk.

    It rides the same deploy path as everything else in base/app/: kustomize
    rehashes the ConfigMap name on any edit, which rolls the pod. There is no
    separate image and nothing to bump.

THE NOTIFICATION PRINCIPLE (infrastructure/hetzner/TEST-VISIBILITY-PLAN.md §1)
    A notification carries a SUMMARY AND A LINK. It never carries the payload. So
    this returns counts, movement and a URL — never a rule title, never a failure
    message, never a stack trace. "Which rules" is what the page answers, and the
    page is one click away. A digest that pasted three failing rule names into chat
    would be unreadable within a month and would leak test detail into a room that
    is not gated the way the page is.

PURE
    weekly() takes already-loaded envelopes and returns plain data. No filesystem,
    no HTTP, no clock of its own (the caller passes `now`), so it is trivially
    asserted offline.
"""

from datetime import datetime, timedelta, timezone

# Matches the stem `store.py` writes: <YYYYmmddTHHMMSSZ>-<short-sha>.
_STEM_FORMAT = "%Y%m%dT%H%M%SZ"
# Matches `receivedAt`, the service's own receipt stamp.
_ISO_FORMAT = "%Y-%m-%dT%H:%M:%SZ"


def _plural(count, one, few, many):
    """Romanian noun agreement, which has THREE forms, not two.

        1        -> "o regulă"        (singular)
        2..19    -> "5 reguli"        (plural, bare)
        20+      -> "2773 de reguli"  (plural, with the particle "de")

    and the form is decided by the LAST TWO DIGITS, so 118 takes the bare plural
    ("118 reguli") while 120 takes "de" ("120 de reguli").

    Not cosmetic. This text is read by the business side, and "1 reguli" or
    "2773 reguli" both read as machine output — which is exactly the impression
    this whole surface exists to avoid.
    """
    if count == 1:
        return one
    # ZERO is special-cased rather than folded into the modulo: `0 % 100 == 0`
    # would take the "de" branch and produce "0 de reguli", while 100 — which has
    # the SAME remainder — genuinely needs it ("100 de reguli"). One `== 0` test
    # keeps both right.
    if count == 0:
        return few
    return few if 1 <= count % 100 <= 19 else many


def run_time(envelope):
    """When this run was recorded, as a UTC datetime, or None.

    The STEM is preferred over any field the sender supplied: this service wrote
    the filename itself, so a CI runner with a wrong clock cannot backdate or
    fast-forward its way into (or out of) the weekly window.
    """
    stem = envelope.get("stem") or ""
    head = stem.split("-", 1)[0]
    for value, fmt in ((head, _STEM_FORMAT), (envelope.get("receivedAt"), _ISO_FORMAT)):
        if not value:
            continue
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            continue
    return None


def _failing(envelope):
    totals = envelope.get("totals") or {}
    return int(totals.get("failed") or 0)


def _checked(envelope):
    totals = envelope.get("totals") or {}
    return int(totals.get("passed") or 0) + int(totals.get("failed") or 0)


def app_summary(app, runs, now, window_days=7):
    """One application's week. `runs` is newest-first, as store.history returns."""
    if not runs:
        return {
            "app": app,
            "runs": 0,
            "stale": True,
            "ageDays": None,
            "checked": 0,
            "failing": 0,
            "areasBroken": 0,
            "delta": 0,
        }

    cutoff = now - timedelta(days=window_days)
    latest = runs[0]
    latest_at = run_time(latest)
    in_window = [r for r in runs if (run_time(r) or datetime.min.replace(tzinfo=timezone.utc)) >= cutoff]

    # The comparison point is the OLDEST run still inside the window — i.e. "how did
    # this look a week ago". When the window holds a single run there is nothing to
    # compare against and the delta is 0 rather than an invented movement.
    reference = in_window[-1] if len(in_window) > 1 else None

    return {
        "app": app,
        "runs": len(in_window),
        # STALE means nothing was recorded this week. It is a WARNING, never a
        # failure: these workflows are path-filtered, so a genuinely quiet week is
        # normal. doctor.sh is what escalates a month of silence to a failure.
        "stale": not in_window,
        "ageDays": None if latest_at is None else max(0, (now - latest_at).days),
        "checked": _checked(latest),
        "failing": _failing(latest),
        "areasBroken": sum(1 for a in latest.get("areas") or [] if int(a.get("failed") or 0)),
        "delta": _failing(latest) - _failing(reference) if reference else 0,
    }


def _app_line(summary):
    app = summary["app"]
    if summary["runs"] == 0:
        if summary["ageDays"] is None:
            return "%s — nicio verificare înregistrată" % app
        return "%s — nicio verificare în ultimele 7 zile (ultima acum %d %s)" % (
            app,
            summary["ageDays"],
            _plural(summary["ageDays"], "zi", "zile", "de zile"),
        )

    checks = "%d %s" % (
        summary["runs"],
        _plural(summary["runs"], "verificare", "verificări", "de verificări"),
    )
    if summary["failing"] == 0:
        return "%s — toate cele %d %s se respectă (%s)" % (
            app,
            summary["checked"],
            _plural(summary["checked"], "regulă", "reguli", "de reguli"),
            checks,
        )

    movement = ""
    if summary["delta"] > 0:
        movement = ", cu %d în plus față de acum o săptămână" % summary["delta"]
    elif summary["delta"] < 0:
        movement = ", cu %d mai puține decât acum o săptămână" % -summary["delta"]
    return "%s — %d din %d %s nu se respectă%s, în %d %s (%s)" % (
        app,
        summary["failing"],
        summary["checked"],
        _plural(summary["checked"], "regulă", "reguli", "de reguli"),
        movement,
        summary["areasBroken"],
        _plural(summary["areasBroken"], "zonă de business", "zone de business", "de zone de business"),
        checks,
    )


def weekly(sections, now, base_url, env_name="dev", window_days=7):
    """The whole digest: `{severity, message, detail, summaries}`.

    `sections` is [(app, runs-newest-first)] — the same shape render_index takes,
    so the digest and the page can never disagree about what was stored.

    `severity` follows the talk-webhook vocabulary used by health-digest:
      fail — at least one business rule is not holding right now
      warn — everything that ran is green, but some app went a week without running
      ok   — green and fresh. POSTED ANYWAY, deliberately: a digest that only
             speaks when something is broken is indistinguishable from a digest
             that has stopped working, and a quiet Monday would then be silently
             ambiguous. The green heartbeat IS the liveness proof, exactly as
             gitops/platform/health-digest reasons for #infra.
    """
    summaries = [app_summary(app, runs, now, window_days) for app, runs in sections]

    if not summaries:
        return {
            "severity": "warn",
            "message": "sumar săptămânal (%s): serviciul nu are nicio verificare stocată" % env_name,
            "detail": "Pagina: %s" % base_url,
            "summaries": [],
        }

    failing = sum(s["failing"] for s in summaries)
    checked = sum(s["checked"] for s in summaries)
    runs = sum(s["runs"] for s in summaries)
    stale = [s["app"] for s in summaries if s["stale"]]

    if failing:
        severity = "fail"
        headline = "%d din %d %s de business nu se respectă" % (
            failing,
            checked,
            _plural(checked, "regulă", "reguli", "de reguli"),
        )
    elif stale:
        severity = "warn"
        headline = "toate cele %d %s verificate se respectă; %s fără verificări" % (
            checked,
            _plural(checked, "regulă", "reguli", "de reguli"),
            ", ".join(stale),
        )
    else:
        severity = "ok"
        headline = "toate cele %d %s de business se respectă" % (
            checked,
            _plural(checked, "regulă", "reguli", "de reguli"),
        )

    message = "sumar săptămânal (%s): %s — %d %s în %d %s" % (
        env_name,
        headline,
        runs,
        _plural(runs, "verificare", "verificări", "de verificări"),
        len(summaries),
        _plural(len(summaries), "aplicație", "aplicații", "de aplicații"),
    )

    # SUMMARY PLUS LINK. Per-app counts and the URL — never a rule, never a trace.
    detail = "\n".join([_app_line(s) for s in summaries] + ["", "Detalii: %s" % base_url])

    return {"severity": severity, "message": message, "detail": detail, "summaries": summaries}
