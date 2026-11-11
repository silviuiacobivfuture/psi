#!/usr/bin/env bash
# test-slot — run one test command in a memory-capped slot, so several suites can
# run at once without the workstation going down.
#
#   .claude/hooks/test-slot.sh -- pnpm exec vitest run <file> --maxWorkers=2
#   .claude/hooks/test-slot.sh --main -- pnpm preflight --push --no-merge   # main's batch
#
# WHY. The rule used to be "one suite at a time on the whole machine". With ten
# agents working, someone always had a capped suite running, so everyone else —
# including the batch push — waited indefinitely (measured 2026-10-28). The real
# limit is RAM, not the count: 62 GB here, a capped suite uses ~2–4 GB. So:
#   - every run is put in its own cgroup scope with a HARD memory ceiling
#     (MemoryMax, no swap). A runaway suite is OOM-killed alone, never the box;
#   - concurrency is admitted by SLOTS sized from MemAvailable: (available − 10 GB
#     headroom) / 5 GB, between 1 and 5. A slot is an flock, released on exit;
#   - main's batch preflight has its own slot (--main, 14 GB), never queued behind
#     helpers.
# The PreToolUse guard (test-concurrency-guard.sh) lets a command wrapped in this
# script through; the whole-suite bans still apply to what it wraps.
set -euo pipefail

DIR=/tmp/estate-test-slots
mkdir -p "$DIR"
MAIN=0
if [ "${1:-}" = "--main" ]; then MAIN=1; shift; fi
if [ "${1:-}" = "--" ]; then shift; fi
[ $# -gt 0 ] || { echo "usage: test-slot.sh [--main] -- <command…>" >&2; exit 2; }

avail_gb() { awk '/^MemAvailable:/ { print int($2 / 1048576) }' /proc/meminfo; }
slots() {
  local n=$(( ($(avail_gb) - 10) / 5 ))
  [ "$n" -lt 1 ] && n=1
  [ "$n" -gt 5 ] && n=5
  echo "$n"
}

if [ "$MAIN" = 1 ]; then
  MEM="${TEST_SLOT_MEM:-14G}" CPU="${TEST_SLOT_CPU:-1200%}"
  exec {fd}>"$DIR/main"
  flock "$fd"
  slot=main
else
  MEM="${TEST_SLOT_MEM:-5G}" CPU="${TEST_SLOT_CPU:-400%}"
  slot=""
  waited=0
  while [ -z "$slot" ]; do
    for i in $(seq 1 "$(slots)"); do
      exec {fd}>"$DIR/slot-$i"
      if flock -n "$fd"; then slot="$i"; break; fi
      exec {fd}>&-
    done
    if [ -z "$slot" ]; then
      [ "$waited" = 0 ] && echo "test-slot: all $(slots) slots busy — waiting" >&2
      waited=1
      sleep 5
    fi
  done
fi

echo "test-slot: slot $slot, MemoryMax=$MEM, CPUQuota=$CPU" >&2
# The scope runs the command in this shell's cwd and environment; the flock is
# held by this shell until the command exits.
systemd-run --user --scope --quiet --collect \
  -p MemoryMax="$MEM" -p MemorySwapMax=0 -p CPUQuota="$CPU" -- "$@"
