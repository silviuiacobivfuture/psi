# shellcheck shell=bash
# Sourced by every gate in .github/scripts/tests, as its SECOND line of code,
# straight after `set -euo pipefail`:
#
#     set -euo pipefail
#     . "$(dirname "${BASH_SOURCE[0]}")/lib/gate.sh"
#
# ── WHY ─────────────────────────────────────────────────────────────────────
#
# A gate that goes red without saying what failed cannot be judged. Measured on
# 2026-10-29: on the CI runner (ghcr.io/actions/actions-runner — no kubectl, a
# python3 without PyYAML) gitops-branch-stamp_test.sh printed "kubectl is not on
# PATH … so it cannot run" and exited 1. No FAIL line, no INCONCLUSIVE: the
# pre-push driver (scripts/gate-base.mjs) correctly had nothing to compare with
# the base, called it "inconclusive, so it counts as yours", and refused three
# deploy pushes in a row over a tool that was simply not installed.
#
# ── WHAT THIS GUARANTEES ────────────────────────────────────────────────────
#
# A gate that sources this file cannot exit non-zero silently. Every non-zero
# exit prints exactly one of:
#
#   INCONCLUSIVE: <gate>: <why>   — gate_inconclusive / gate_require: the gate
#                                   could not judge (a prerequisite is missing).
#                                   The drivers retry it and then report it as
#                                   "could not tell", never as a regression.
#   FAIL <what>                   — gate_abort, or the gate's own FAIL lines
#                                   followed by gate_finish <count>.
#   FAIL <gate>:<line>: …         — the ERR trap: a command died under `set -e`
#                                   before the gate named a check. It names the
#                                   line and the command, so the base can be
#                                   compared with it.
#   FAIL <gate>: stopped …        — the EXIT trap, for every other way out: a
#                                   bare `exit 1`, an unbound variable under
#                                   `set -u`, a syntax error. It names the last
#                                   command bash ran.
#
# The traps belong to this file. A gate registers clean-up with gate_on_exit,
# never its own `trap … EXIT`, which would silently replace the guarantee —
# gate-scripts-name-failures_test.sh refuses a gate that does.

set -E # the ERR trap must reach into functions and subshells too

_gate_name="$(basename "$0")"
_gate_named=0
_gate_cleanup=()

# gate_on_exit <shell text>: run it when the gate exits, whatever the reason.
gate_on_exit() { _gate_cleanup+=("$1"); }

# gate_inconclusive <why>: this run cannot judge the tree. Exits 1.
gate_inconclusive() {
  _gate_named=1
  echo "INCONCLUSIVE: $_gate_name: $1"
  exit 1
}

# gate_require <command> <what it is needed for>: INCONCLUSIVE when absent.
gate_require() {
  command -v "$1" >/dev/null 2>&1 \
    || gate_inconclusive "\`$1\` is not on PATH, and this gate needs it to $2 — the tree was not judged"
}

# gate_require_python_module <module> <what it is needed for>.
gate_require_python_module() {
  gate_require python3 "$2"
  python3 -c "import $1" >/dev/null 2>&1 \
    || gate_inconclusive "python3 has no \`$1\` module, and this gate needs it to $2 — the tree was not judged"
}

# gate_abort <what failed, and why>: a named failure that ends the gate now.
gate_abort() {
  _gate_named=1
  echo "  FAIL $1"
  exit 1
}

# gate_seb_tree <root>: prints SEB's tree. <root> itself when it is SEB's own root (it
# carries .sebroot); in an estate repository, what its one entry point finds
# (estate/seb-root.sh: SEB_ROOT, the installed bundle). Returns 1, printing nothing, when
# neither exists, so the caller refuses by name.
gate_seb_tree() {
  if [ -f "$1/.sebroot" ]; then printf '%s\n' "$1"; return 0; fi
  [ -r "$1/estate/seb-root.sh" ] || return 1
  # shellcheck source=/dev/null
  (. "$1/estate/seb-root.sh" && seb_root "$1")
}

# gate_finish <failed-count>: the gate's verdict. Every failure it counts has
# already printed its own FAIL line.
gate_finish() {
  if [ "$1" -gt 0 ]; then
    _gate_named=1
    exit 1
  fi
  exit 0
}

_gate_on_err() {
  # Only where `set -e` is live: a failure inside `set +e`, an `if` condition or
  # `a || b` is handled by the gate and bash does not stop for it.
  [[ $- == *e* ]] || return 0
  _gate_named=1
  echo "  FAIL $_gate_name:$2: \`$3\` (or the pipeline it ends) exited $1 — the gate stopped here before naming a check" >&2
}

_gate_on_exit() {
  local rc=$? cmd=$BASH_COMMAND
  if [ "$rc" -ne 0 ] && [ "$_gate_named" -eq 0 ]; then
    echo "  FAIL $_gate_name: stopped with exit $rc without naming a check (last command: \`$cmd\`)" >&2
  fi
  local c
  set +eu # a clean-up that fails must not change the verdict
  for c in "${_gate_cleanup[@]}"; do eval "$c"; done
  return "$rc"
}

trap '_gate_on_err $? $LINENO "$BASH_COMMAND"' ERR
trap _gate_on_exit EXIT
