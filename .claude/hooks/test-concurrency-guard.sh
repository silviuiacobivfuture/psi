#!/usr/bin/env python3
"""PreToolUse hook: keep a test run from killing the workstation.

Test Execution Discipline (see CLAUDE.md). Two failure modes, both denied here:

  1. WHOLE-SUITE RUNS. Vitest 2.x defaults maxWorkers to the CPU count (24 on this
     box) and nx.json sets parallel:3, so a full-monorepo run is ~72 worker
     processes against ~12 GB free RAM. A project that does not cap its workers inherits the unbounded default.
  2. OVERLAPPING RUNS. The workstation is shared with the developer's own terminals
     and other agents. A second suite next to a running one contends for the same
     RAM even when both are capped.

BLOCKING, unlike the ast-grep hook next door — that nudges a style preference,
this prevents an OOM that takes down the developer's session.

WHY PYTHON, NOT SH: the first version grepped the raw JSON payload and denied its
own `git commit -m "...<banned name>..."` — any command that merely MENTIONED a
banned string was blocked, including the commit that introduced this file.
Deciding this correctly needs the command parsed out of the JSON and its
quoted/heredoc text removed, which is not sh's strong suit.

Escape hatch for a genuine exception: TEST_GUARD_BYPASS=1 in the ENVIRONMENT OF
THE AGENT (not inline on a command — an inline assignment sets the variable for
that command's process, never for this hook, which the harness spawns separately).

Wired in .claude/settings.json as a PreToolUse hook on the Bash tool.
"""

import json
import os
import re
import subprocess
import sys

# Assembled rather than written literally so this file can be edited and committed
# without the guard matching its own source — the exact bug that forced the
# rewrite. Keep it this way.
_ALL = "all"
_COV = "coverage"


def deny(reason: str) -> None:
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason,
    }}))
    sys.exit(0)


def strip_literals(cmd: str) -> str:
    """Blank heredoc bodies and quoted strings.

    A commit message, an echo, or a `cat <<EOF` block can contain any of these
    command names as prose. Only text that could actually EXECUTE should be
    matched, so literal payloads are blanked (not removed — offsets stay stable).
    """
    for m in re.finditer(r"<<-?\s*['\"]?(\w+)['\"]?", cmd):
        tag = m.group(1)
        end = re.search(rf"^\s*{re.escape(tag)}\s*$", cmd[m.end():], re.MULTILINE)
        stop = m.end() + (end.start() if end else len(cmd) - m.end())
        cmd = cmd[:m.end()] + " " * (stop - m.end()) + cmd[stop:]
    cmd = re.sub(r"'[^']*'", "''", cmd)
    cmd = re.sub(r'"[^"]*"', '""', cmd)
    return cmd


def main() -> None:
    if os.environ.get("TEST_GUARD_BYPASS"):
        return
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return  # unparseable input must never block a call
    if payload.get("tool_name") != "Bash":
        return
    raw = (payload.get("tool_input") or {}).get("command") or ""
    cmd = strip_literals(raw)

    pm = r"(?:pnpm|npm|yarn)"
    scoped = re.search(r"--package|--filter|(?:^|\s)-F(?:\s|=)", cmd)

    # --- 1. whole-suite invocations ---------------------------------------
    if re.search(rf"(?:^|[\s;&|]){pm}\s+(?:run\s+)?test:(?:{_ALL}|{_COV})\b", cmd):
        deny("BLOCKED by Test Execution Discipline (CLAUDE.md): whole-suite runs "
             "exhaust this workstation — vitest defaults to 24 workers per project "
             "and nx runs 3 projects at once, against ~12 GB free RAM. Run a SCOPED, "
             "CAPPED suite instead: pnpm --filter <project> test -- --maxWorkers=4")

    if re.search(r"\brun-many\b", cmd) and re.search(r"(?:-t|--target)[=\s]+\S*test", cmd):
        deny("BLOCKED by Test Execution Discipline (CLAUDE.md): nx run-many with a "
             "test target runs every project. Target one: "
             "pnpm exec nx run <project>:test --parallel=1")

    bare_root = (re.search(rf"(?:^|[\s;&|]){pm}\s+(?:run\s+)?test(?:\s|$)", cmd)
                 or re.search(r"(?:^|[\s;&|])node\s+test/run-tests\.js", cmd))
    if bare_root and not scoped:
        deny("BLOCKED by Test Execution Discipline (CLAUDE.md): a bare root test run "
             "executes every package. Scope it: pnpm test --package <pkg>, or "
             "pnpm --filter <project> test -- --maxWorkers=4")

    # --- 2. a suite is already in flight -----------------------------------
    # "In flight" means in flight IN THIS REPO. The workstation runs several
    # Claude sessions against different repositories at once; a build or test
    # in an unrelated repo (e.g. a sibling checkout under ~/Documents/projects)
    # must never block a call here. Attribution is by the candidate process's
    # own cwd (/proc/<pid>/cwd), falling back to the repo root appearing in its
    # command line only when the cwd cannot be read. Anything that cannot be
    # attributed to this repo is NOT counted — fail open, same as when pgrep
    # itself is missing.
    looks_like_test = re.search(
        rf"\bvitest\b|\bjest\b|:test\b|(?:^|[\s;&|])(?:{pm}|npx)\s+.*\btest\b", cmd)
    if not looks_like_test:
        return
    # Wrapped in test-slot.sh: that script admits the run into a memory-capped
    # slot sized from free RAM, so concurrent capped suites are safe and the
    # in-flight check below does not apply. The bans above still did.
    if re.search(r"(?:^|[\s;&|/])test-slot\.sh(?:\s|$)", cmd):
        return
    try:
        out = subprocess.run(["pgrep", "-af", r"vitest|jest|nx.*run-many"],
                             capture_output=True, text=True, timeout=5).stdout
    except Exception:
        return  # pgrep missing/slow must never block a call

    repo_root = os.path.realpath(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

    def _in_this_repo(line: str) -> bool:
        parts = line.split(None, 1)
        if not parts:
            return False
        pid, cmdline = parts[0], (parts[1] if len(parts) > 1 else "")
        try:
            cwd = os.path.realpath(os.readlink(f"/proc/{pid}/cwd"))
        except Exception:
            cwd = None  # dead or unreadable pid: fall through to the cmdline check
        if cwd is not None:
            return cwd == repo_root or cwd.startswith(repo_root + os.sep)
        return repo_root in cmdline

    running = [ln for ln in out.splitlines()
               if "test-concurrency-guard" not in ln and "pgrep" not in ln
               and _in_this_repo(ln)]
    if running:
        deny("BLOCKED by Test Execution Discipline (CLAUDE.md): another test suite is "
             "ALREADY RUNNING on this workstation, possibly in the developer's own "
             "terminal. Starting a second contends for the same RAM even when both "
             "are capped. Run it through the slot wrapper instead, which caps its "
             "memory and admits it when a slot is free: "
             ".claude/hooks/test-slot.sh -- <your test command>. In flight: "
             + "; ".join(running[:3])[:300])


if __name__ == "__main__":
    main()
