"""Derive the things a stakeholder actually asks, from stored run history.

Three questions, three functions:

  1. "Since when has this been broken?"  -> failing_since()
     A red mark with no age is useless. "Failing since 3 runs ago" is the whole
     difference between "someone just broke it" and "we have been shipping around
     this for a week".

  2. "Did anything get worse?"          -> area_movement()
     Comparing the latest run to the one before it is the only movement signal a
     non-technical reader needs: this area regressed, that one recovered.

  3. "Is it getting better over time?"  -> trend()
     Rules-holding per run, most recent last, ready to draw as bars.

All three are PURE: they take already-loaded envelopes and return plain data. No
filesystem, no HTTP, no rendering — so they are trivially testable offline, which
is how the page was verified before it ever ran on the cluster.
"""

# A rule is identified by (area, title). The title IS the business rule as
# written by whoever wrote the test, so a renamed rule reads as a new rule — which
# is correct: the sentence being asserted changed. The tab separator keeps the two
# fields from running together: a plain concatenation would make ("ab", "c") and
# ("a", "bc") the same key, i.e. one rule's history silently attributed to another.


def rule_key(area, title):
    return "%s\t%s" % (area, title)


def _rules_by_key(envelope):
    """{rule_key: status} for one run."""
    out = {}
    for area in envelope.get("areas") or []:
        name = area.get("area") or ""
        for rule in area.get("rules") or []:
            out[rule_key(name, rule.get("title") or "")] = rule.get("status")
    return out


def _area_failures(envelope):
    """{area name: failed count} for one run."""
    return {
        (a.get("area") or ""): int(a.get("failed") or 0)
        for a in envelope.get("areas") or []
    }


def failing_since(history):
    """For every rule failing in the newest run, how long it has been failing.

    `history` is newest-first. Returns {rule_key: {"runs": int, "since": str|None,
    "beyond": bool}} where:
      * runs   — consecutive runs (including the newest) in which it has failed
      * since  — the timestamp of the OLDEST of those runs, or None if unknown
      * beyond — True when the streak reaches the end of the scanned window, i.e.
                 it has been failing for AT LEAST `runs` runs and probably longer.
                 Rendering that honestly ("de cel puțin N rulări") matters: the
                 alternative is a confident number that quietly caps at the scan
                 limit and understates a long-standing regression.
    """
    if not history:
        return {}
    latest = history[0]
    statuses = [_rules_by_key(run) for run in history]
    out = {}
    for key, status in statuses[0].items():
        if status != "failed":
            continue
        runs = 1
        since = latest.get("receivedAt") or latest.get("timestamp")
        beyond = True
        for index in range(1, len(statuses)):
            previous = statuses[index].get(key)
            if previous == "failed":
                runs += 1
                since = history[index].get("receivedAt") or history[index].get("timestamp")
                continue
            if previous is None:
                # The rule did not exist in that run (a new test, or a suite that
                # never ran). The streak ends here and the age IS known.
                beyond = False
                break
            beyond = False  # it was passing (or skipped) then — a real boundary
            break
        else:
            # Ran off the end of the scanned window without finding a boundary.
            beyond = True
        out[key] = {"runs": runs, "since": since, "beyond": beyond}
    return out


def area_movement(history):
    """Per-area change between the newest run and the one before it.

    Returns {area: {"delta": int, "direction": "worse"|"better"|"same"|"new"}},
    where delta is the change in FAILING rules (positive = more failures).
    """
    if not history:
        return {}
    current = _area_failures(history[0])
    if len(history) < 2:
        return {area: {"delta": 0, "direction": "new"} for area in current}
    previous = _area_failures(history[1])
    out = {}
    for area, failed in current.items():
        if area not in previous:
            out[area] = {"delta": 0, "direction": "new"}
            continue
        delta = failed - previous[area]
        if delta > 0:
            direction = "worse"
        elif delta < 0:
            direction = "better"
        else:
            direction = "same"
        out[area] = {"delta": delta, "direction": direction}
    return out


def trend(history, limit=20):
    """Rules-holding per run, OLDEST FIRST so it reads left-to-right as time.

    Each point: {"id", "passed", "failed", "total", "at", "commit"}.
    """
    points = []
    for run in list(history[:limit])[::-1]:
        totals = run.get("totals") or {}
        passed = int(totals.get("passed") or 0)
        failed = int(totals.get("failed") or 0)
        points.append(
            {
                "id": run.get("id") or "",
                "passed": passed,
                "failed": failed,
                "total": passed + failed,
                "at": run.get("receivedAt") or run.get("timestamp") or "",
                "commit": (run.get("commit") or "")[:8],
            }
        )
    return points


def totals_of(envelope):
    """(passed, failed, skipped) for one run, defaulting safely."""
    totals = envelope.get("totals") or {}
    return (
        int(totals.get("passed") or 0),
        int(totals.get("failed") or 0),
        int(totals.get("skipped") or 0),
    )
