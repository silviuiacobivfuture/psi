# shellcheck shell=bash
# notify-bridge's secret seeding procedure, run by SEB's engine (lib-seed-apps.sh) from
# seed-secrets.sh. Sourced twice: SEB_SEED_PHASE=load (definitions only), then =run.
#
# It WRITES NOTHING: notify-bridge declares no secrets of its own (secrets: []); the one key it
# reads, NOVU_SECRET_KEY, is the novu service's (apps/novu/estate), seeded there. The engine
# refuses a declaration without its procedure, so this one exists to say so.
[ "$SEB_SEED_PHASE" = run ] || return 0
